# โมดูล 9: Point — ระบบแต้ม (Loyalty Engine กลาง)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)

> scope = **TENANT** — แต้มเป็นกระเป๋าเดียวต่อ (tenant, member) ใช้ข้ามทุกกิจการ/หน่วยของร้าน (จุดขายของ SHARK)
> ledger **append-only** — ห้าม UPDATE ยอด, ทุกความเคลื่อนไหวคือแถวใหม่, ยอดคงเหลือ = `SUM(delta)` (มี cached balance ที่ reconcile ได้)
> `unitId?` เป็นแค่ **tag ที่มา** บน ledger เพื่อรายงาน — ไม่ใช่ scope ข้อมูล (ดู `BLUEPRINT_BUSINESS_UNITS.md` ข้อ 1 คำเตือน ⚠️)
> ยึด contract 2.2: **โมดูลอื่นห้ามคำนวณแต้มเอง** — ยิง event เข้ามาให้ Point คิด

---

## 1. ภาพรวม + ขอบเขต

### ทำอะไร (v1)
- **PointRule**: กติกาสะสม "ทุก X บาท = Y แต้ม" ระดับ tenant, override ต่อ sourceModule/ต่อ unit ได้, multiplier ช่วงโปรโมชัน + multiplier ตาม tier (อ่านจาก Member)
- **Ledger append-only** 5 ชนิด: EARN / BURN / ADJUST / EXPIRE / REVERSAL — ตรวจสอบย้อนหลังได้ทุกแต้ม
- **Balance**: cached ต่อ member (อ่านเร็ว) + reconcile กับ SUM ledger รายคืน
- **หมดอายุ**: นโยบายต่อร้าน (ไม่หมด / ปีปฏิทิน / rolling N เดือน), lot-based FIFO, cron expire + แจ้งเตือนก่อนหมด
- **Earn อัตโนมัติ** จาก POS event ตาม contract 2.1/2.2 พร้อม **idempotency key** กันยิงซ้ำ
- **Burn** ตอนแลก Reward (07) หรือใช้เป็นส่วนลดใน POS (แต้ม→บาท ตามเรตที่ร้านตั้ง)
- **Adjust โดย staff** ต้องมี reason + AuditLog
- **Reverse**: ยกเลิกใบเสร็จ/refund → reverse แต้มที่ earn จากบิลนั้น (และคืนแต้มที่ burn เป็นส่วนลดในบิลนั้น)
- **กัน race**: จ่าย/ตัดแต้มพร้อมกันหลายเครื่อง — row lock ต่อ member, ห้าม balance ติดลบจาก burn
- **Liability report**: มูลค่าแต้มคงค้าง (แต้มที่ยังไม่ถูกใช้ × มูลค่าต่อแต้ม) — เจ้าของร้านเห็นภาระหนี้แต้ม
- **Rule preview simulator**: ร้านทดสอบกติกาก่อนเปิดใช้ (ใส่ยอด/โมดูล/หน่วย/tier/วันที่ → เห็นแต้มที่จะได้ + rule ไหน match)

### ไม่ทำใน v1 (🔜)
- โอนแต้มระหว่างลูกค้า, ซื้อแต้ม, แต้มหลายสกุล (เช่น แต้มปกติ+แต้มโปร แยกกระเป๋า)
- Earn จาก action ไม่ใช่เงิน (เช็คอิน, รีวิว, วันเกิด bonus อัตโนมัติ) — v1 ใช้ ADJUST มือ/import
- แลกแต้มข้าม tenant (แพลตฟอร์ม coalition)
- อัตราแต้มแบบขั้นบันได (tiered per-transaction เช่น 1,000 แรก x1, ส่วนเกิน x2)

### หลักการเหล็ก (สรุปสำหรับ implementer)
1. `PointLedger` ไม่มี UPDATE/DELETE — แก้ผิด = แถว ADJUST/REVERSAL ใหม่อ้างแถวเดิม
2. ทุก mutation ผ่าน **PointService จุดเดียว** (`point.earn|burn|adjust|reverse|expire`) — ห้าม insert ledger ตรงจากโมดูลอื่น
3. ทุก mutation มี `idempotencyKey` unique ต่อ tenant — ยิงซ้ำได้ผลเดิม (คืน response เดิม ไม่เกิดแถวใหม่)
4. Concurrency: lock แถว `PointBalance` (SELECT ... FOR UPDATE) ก่อนเขียน ledger เสมอ — serialize ต่อ member
5. แต้มเป็น `Int` เสมอ (ไม่มีเศษแต้ม), เงินเป็น `Int` สตางค์

---

## 2. Persona & User Stories

| Persona | Stories |
|---|---|
| **Owner** | ฉันตั้งกติกา "ทุก 100 บาท = 1 แต้ม" ครั้งเดียวใช้ทุกกิจการ แต่ให้ร้านอาหารสาขาใหม่ x2 ช่วงเปิดตัวได้ · ฉันต้องรู้ว่าแต้มคงค้างทั้งระบบคิดเป็นเงินเท่าไร (ภาระหนี้) และเดือนนี้ earn/burn เท่าไร · ฉันอยากทดลองกติกาใหม่ก่อนเปิดจริงว่าลูกค้าบิล 1,850 บาทจะได้กี่แต้ม |
| **Manager** | ฉันเห็นรายงานแต้มที่เกิดจากหน่วยของฉัน · ฉันปรับแต้มชดเชยลูกค้าได้ (ในวงเงินที่ owner ตั้ง) พร้อมเหตุผล |
| **Staff (แคชเชียร์)** | ปิดบิลแล้วแต้มเข้าอัตโนมัติ ไม่ต้องกดอะไร — ใบเสร็จ/จอแสดง "ได้รับ 18 แต้ม, สะสม 342" · ลูกค้าขอใช้แต้มเป็นส่วนลด → ฉันใส่จำนวนแต้ม ระบบตีเป็นบาทให้ · เน็ตกระตุกกดซ้ำ แต้มต้องไม่เข้า 2 รอบ |
| **Customer** | ฉันเห็นแต้มคงเหลือ + ประวัติ earn/burn + แต้มก้อนไหนจะหมดอายุเมื่อไร · ได้แจ้งเตือนก่อนแต้มหมดอายุ 30 วัน · ซื้อที่โรงแรม A ใช้แต้มที่ร้านอาหาร B ขององค์กรเดียวกันได้ |
| **Platform Admin** | metrics รวม (จำนวน tenant ที่เปิด Point, ปริมาณ ledger) — ไม่เห็นรายลูกค้า |

---

## 3. ฟังก์ชันทั้งหมด

### 3.1 PointRule — กติกาสะสม
- ✅ **Base rule** ระดับ tenant: `ทุก spendSatang → earnPoints แต้ม` (เช่น 10000 สตางค์ = 1 แต้ม), ปัดเศษ FLOOR จากยอดสุทธิทั้งบิล (config ปัดต่อบิล ไม่ใช่ต่อบรรทัด)
- ✅ **Override / จำกัดขอบเขต**: rule ระบุ `sourceModule?` (POS/RESTAURANT/HOTEL/BOOKING/TICKET) และ/หรือ `unitIds?` — rule ที่เจาะจงกว่าชนะ (ลำดับเลือก rule ดู 7.1)
- ✅ **Multiplier campaign**: rule type=MULTIPLIER คูณแต้มจาก base (x2, x1.5 — ผลลัพธ์ FLOOR) มีช่วงเวลา `startsAt/endsAt`, จำกัด module/unit ได้, ซ้อนกันได้สูงสุดตาม `stacking` policy (default: เลือกตัวคูณสูงสุดตัวเดียว ไม่คูณทบ)
- ✅ **Tier multiplier**: อ่าน `MemberTier.pointMultiplier` จากโมดูล Member มาคูณเพิ่ม (คูณหลัง campaign, FLOOR ครั้งสุดท้าย)
- ✅ เงื่อนไขเสริมต่อ rule: `minSpendSatang?` (บิลขั้นต่ำ), `maxPointsPerTxn?` (เพดานต่อบิล), `excludeDiscountedByPoints` (ยอดที่จ่ายด้วยแต้ม/voucher ไม่เกิดแต้ม — default true, กัน loop แต้มปั๊มแต้ม)
- ✅ สถานะ rule: DRAFT / ACTIVE / PAUSED / ARCHIVED — แก้ rule ACTIVE ไม่ได้ (ต้อง duplicate เป็น DRAFT แล้วสลับ) เพื่อให้ ledger อ้าง rule snapshot ที่ไม่เปลี่ยน
- ✅ **Simulator**: input `{ amountSatang, sourceModule, unitId?, tierId?, at? }` → output `{ points, baseRule, multipliersApplied[], steps[] }` — ใช้ได้กับ rule DRAFT (ทดสอบก่อนเปิด)
- 🔜 Rule ต่อหมวดสินค้า/รายการ (line-level), earn ขั้นบันได, bonus วันเกิด/วันพิเศษอัตโนมัติ

### 3.2 Ledger & Balance
- ✅ `PointLedger` append-only — ชนิด: `EARN`(+) `BURN`(−) `ADJUST`(±) `EXPIRE`(−) `REVERSAL`(±กลับทางแถวอ้างอิง)
- ✅ ทุกแถว: memberId, unitId? (ที่มา — null ได้เฉพาะ ADJUST/EXPIRE/merge), delta, reason, refType/refId (เอกสารต้นทาง), ruleId? (EARN), idempotencyKey, actor, expiresAt (EARN lot), lotRemaining (EARN lot)
- ✅ **Lot-based FIFO**: แถว EARN = 1 lot มี `lotRemaining` เริ่ม = delta; BURN/EXPIRE ตัดจาก lot เก่าสุด (ตาม expiresAt แล้ว createdAt) ผ่านตาราง `PointLotConsumption` → ตอบได้เสมอว่า "แต้มก้อนไหนถูกใช้/หมดอายุ" และ "จะหมดอายุเท่าไรเมื่อไหร่"
  - หมายเหตุ: `lotRemaining` เป็น field เดียวที่ UPDATE ได้ (bookkeeping ภายใน lot — **delta ไม่เคยแก้** จึงยังถือว่า ledger append-only เชิงมูลค่า; SUM(delta) ต้องเท่าเดิมเสมอ)
- ✅ `PointBalance` (cached ต่อ member): balance, lifetimeEarned/Burned/Expired, version — **source of truth คือ SUM(ledger.delta)**; cron reconcile รายคืน: ต่างกัน → แก้ cache ตาม SUM + แจ้ง alert (ห้ามแก้ ledger)
- ✅ Balance **ห้ามติดลบจาก BURN** (ตรวจใน lock) — ยกเว้น REVERSAL/ADJUST ทำให้ติดลบได้ (เช่น reverse earn ที่แต้มถูกใช้ไปแล้ว) → flag `negativeSince` บน balance, การ earn ครั้งถัดไปหักกลบอัตโนมัติ (ผ่าน lot กลไกปกติ — balance ลบคือ lot หนี้)

### 3.3 Earn อัตโนมัติ
- ✅ POS ปิดบิล → ยิง `point.earn` (contract 2.2 — payload เต็มดู 8.1) → Point เลือก rule + คูณ tier → เขียน EARN → คืน `{ points, balance }` ให้ POS พิมพ์ลงใบเสร็จ
- ✅ `idempotencyKey = "{refType}:{refId}:earn"` — POS retry/duplicate ยิงซ้ำ → คืนผลเดิม ไม่เกิดแถวใหม่
- ✅ เงื่อนไขไม่ earn: member=null (guest), member BLOCKED/ANONYMIZED, ยอดหลังหักส่วนลดจากแต้ม/voucher = 0, ไม่มี rule ACTIVE ที่ match → คืน `{ points: 0, reason }` (POS ไม่ต้อง handle พิเศษ)
- ✅ Earn ย้อนหลัง (ลูกค้าลืมแจ้งสมาชิกตอนจ่าย): staff แนบ member เข้า sale ภายใน N วัน (default 7, config) → POS ยิง earn ด้วย refId เดิม (idempotency ยังกันซ้ำถ้าเคย earn แล้ว)

### 3.4 Burn
- ✅ **แลก Reward (07)**: Reward เรียก `point.burn({ ..., refType:'RewardRedemption' })` — Point ตรวจ balance พอ + member ACTIVE ใน lock เดียว
- ✅ **ใช้เป็นส่วนลดใน POS**: ร้านตั้ง `burnRateSatangPerPoint` (เช่น 1 แต้ม = 25 สตางค์) + ขั้นต่ำ/เพดานต่อบิล (% ของยอด) — POS validate ผ่าน `point.quoteBurn` ก่อน แล้ว `point.burn` ตอน commit บิล (อยู่ใน flow createSale — ดู 7.2)
- ✅ Burn ตัด lot FIFO (ใกล้หมดอายุก่อน) — ลูกค้าได้ประโยชน์สูงสุด
- ✅ ยกเลิกการแลก (reward ยกเลิก/บิล void) → REVERSAL คืนแต้มเข้า **lot ใหม่** อายุ = อายุคงเหลือของ lot เดิมที่ถูกตัด (ไม่ใช่นับหนึ่งใหม่ — กันปั๊มอายุ)
- 🔜 Burn แบบ partial-refund เฉพาะบรรทัด (v1: reverse ทั้งบิลเท่านั้น)

### 3.5 Adjust (staff)
- ✅ บวก/ลบมือ พร้อม **reason บังคับ** (dropdown: ชดเชยบริการ / แก้ยอดผิด / โปรโมชันพิเศษ / ยอดยกมา(import) / PDPA_ERASURE / อื่นๆ+ข้อความ) → AuditLog เสมอ
- ✅ วงเงินต่อครั้ง per role: OWNER ไม่จำกัด, MANAGER/STAFF ตาม `PointSettings.adjustLimits` (default MANAGER 5,000 แต้ม, STAFF 0=ห้าม) — เกินวงเงิน → สร้างคำขอค้างให้ OWNER อนุมัติ 🔜 (v1: block แล้วให้คนมีสิทธิ์ทำ)
- ✅ ADJUST บวก = สร้าง lot ใหม่ (อายุตาม policy ปกติ), ADJUST ลบ = ตัด lot FIFO เหมือน burn

### 3.6 หมดอายุ
- ✅ นโยบาย (PointSettings): `NONE` (ไม่หมด) / `CALENDAR_YEAR` (หมดสิ้นปี — earn ปีนี้หมด 31 ธ.ค. +`graceMonths` config เช่น หมดสิ้นปีถัดไป) / `ROLLING_MONTHS` (หมด N เดือนหลัง earn, default 12)
- ✅ ทุก EARN lot ประทับ `expiresAt` ตอนเกิด (ตาม policy ณ ขณะนั้น — เปลี่ยน policy ไม่มีผลย้อนหลังกับ lot เดิม, มีปุ่ม "ขยายอายุ lot เดิมทั้งหมด" แยกต่างหากพร้อม confirm)
- ✅ **Cron expire รายวัน** (03:30 เวลาร้าน): หา lot `expiresAt <= now && lotRemaining > 0` → เขียน EXPIRE (delta = −lotRemaining, ตัด lot นั้น) — ทำเป็น batch ต่อ member ใน lock, idempotencyKey=`expire:{lotId}` กันรันซ้ำ
- ✅ **แจ้งเตือนก่อนหมด**: cron เดียวกัน notify ลูกค้าที่มี lot จะหมดใน 30 วัน (และซ้ำที่ 7 วัน) — รวมยอดเป็นข้อความเดียว "แต้ม 120 จะหมดอายุ 31 ม.ค." ผ่าน notify (2.5), 1 ครั้ง/threshold/รอบ (กัน spam ด้วยตาราง `PointExpiryNotice`)
- ✅ Storefront แสดง "แต้มใกล้หมดอายุ" (ก้อน+วันที่) จาก lot query

### 3.7 Reverse (ยกเลิกใบเสร็จ)
- ✅ POS void/refund บิล → ยิง `point.reverse({ refType, refId, reason })` → Point หา ledger ทุกแถวของ ref นั้น:
  - EARN → REVERSAL delta ลบเท่า earn (ตัดจาก lot ของ earn นั้นก่อน — ถ้า lot ถูกใช้ไปแล้วบางส่วน → ตัดที่เหลือ + ส่วนเกินไปตัด lot อื่น/ติดลบ)
  - BURN (แต้มที่ใช้เป็นส่วนลดในบิลนั้น) → REVERSAL คืนแต้ม (lot ใหม่ อายุ = คงเหลือเดิม)
- ✅ idempotencyKey=`{refType}:{refId}:reverse` — void ซ้ำไม่ reverse ซ้ำ · reverse บิลที่ไม่เคย earn → no-op สำเร็จ
- ✅ Partial refund: POS ส่ง `amountSatang` ที่คืน → reverse ตามสัดส่วน FLOOR (v1 รองรับสัดส่วนยอด ไม่ใช่รายบรรทัด)

### 3.8 Merge (จากโมดูล Member 7.3)
- ✅ `point.transferOnMerge({ sourceMemberId, targetMemberId })`: ย้าย **lot ที่เหลือ** ของ source → เขียน ADJUST(−) ฝั่ง source + ADJUST(+) ฝั่ง target ต่อ lot (คงอายุ lot เดิม), reason=MERGE, ref=MemberMergeLog — SUM ทั้ง tenant ไม่เปลี่ยน

### 3.9 รายงาน + Liability — ดูหัวข้อ 10
### 3.10 Simulator UI — ดูหัวข้อ 6

---

## 4. Data Model (Prisma)

```prisma
// ───────────────────────── enums ─────────────────────────
enum PointEntryType { EARN BURN ADJUST EXPIRE REVERSAL }
enum PointRuleType { BASE MULTIPLIER }
enum PointRuleStatus { DRAFT ACTIVE PAUSED ARCHIVED }
enum PointExpiryMode { NONE CALENDAR_YEAR ROLLING_MONTHS }
enum PointSourceModule { POS RESTAURANT HOTEL BOOKING TICKET }  // ตรง sourceModule ของ contract 2.1
enum PointActorType { SYSTEM STAFF CUSTOMER }

// ───────────────────────── settings (singleton ต่อ tenant) ─────────────────────────
model PointSettings {
  tenantId               String          @id
  enabled                Boolean         @default(true)
  expiryMode             PointExpiryMode @default(ROLLING_MONTHS)
  expiryMonths           Int             @default(12)   // ROLLING_MONTHS
  expiryGraceMonths      Int             @default(0)    // CALENDAR_YEAR: +N เดือนหลังสิ้นปี
  notifyDaysBefore       Json            @default("[30,7]")
  burnRateSatangPerPoint Int             @default(25)   // 1 แต้ม = 0.25 บาท ตอนใช้เป็นส่วนลด
  minBurnPoints          Int             @default(100)  // ขั้นต่ำต่อครั้ง
  maxBurnPercentOfBill   Int             @default(50)   // เพดาน % ของยอดบิล
  pointValueSatang       Int             @default(25)   // มูลค่าต่อแต้มสำหรับ liability report (มัก = burnRate)
  earnAttachWindowDays   Int             @default(7)    // แนบ member ย้อนหลังได้กี่วัน
  adjustLimits           Json            @default("{\"MANAGER\":5000,\"STAFF\":0}")
  updatedAt              DateTime        @updatedAt
}

// ───────────────────────── rules ─────────────────────────
model PointRule {
  id               String           @id @default(cuid())
  tenantId         String
  type             PointRuleType
  name             String                        // "กติกาหลัก", "x2 เปิดสาขาใหม่"
  status           PointRuleStatus  @default(DRAFT)
  // BASE: ทุก spendSatang → earnPoints (FLOOR ต่อบิล)
  spendSatang      Int?                          // เช่น 10000 (=100 บาท)
  earnPoints       Int?                          // เช่น 1
  // MULTIPLIER: คูณผลของ BASE
  multiplier       Decimal?         @db.Decimal(4, 2)  // 2.00, 1.50
  // ขอบเขต (null/ว่าง = ทุกอย่าง) — เจาะจงกว่าชนะ
  sourceModules    Json             @default("[]")     // ["RESTAURANT"] ว่าง = ทุก module
  unitIds          Json             @default("[]")     // ["unit_a"] ว่าง = ทุก unit  ← config เฉยๆ ไม่ใช่ scope
  // เงื่อนไข
  minSpendSatang   Int              @default(0)
  maxPointsPerTxn  Int?
  startsAt         DateTime?                     // ช่วงโปร (MULTIPLIER เป็นหลัก)
  endsAt           DateTime?
  priority         Int              @default(0)  // ใช้ตัดสินเมื่อเจาะจงเท่ากัน (มาก = ชนะ)
  activatedAt      DateTime?
  archivedAt       DateTime?
  createdBy        String
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  ledgerEntries    PointLedger[]
  @@index([tenantId, status, type])
  @@index([tenantId, startsAt, endsAt])
}

// ───────────────────────── ledger (append-only) ─────────────────────────
model PointLedger {
  id             String          @id @default(cuid())
  tenantId       String
  memberId       String          // CustomerProfile.id (โมดูล 06)
  unitId         String?         // tag ที่มาของธุรกรรม — null: adjust กลาง/merge/expire
  type           PointEntryType
  delta          Int             // + หรือ − · ห้ามแก้ตลอดกาล · SUM(delta) ต่อ member = ยอดจริง
  reason         String          // human-readable เช่น "ซื้อสินค้า ใบเสร็จ R2-00045"
  refType        String?         // 'PosSale' | 'RewardRedemption' | 'MemberMergeLog' | 'ImportJob' | ...
  refId          String?
  ruleId         String?         // EARN: rule ที่ใช้คิด
  rule           PointRule?      @relation(fields: [ruleId], references: [id])
  calcMeta       Json?           // snapshot การคำนวณ { base, multipliers:[{ruleId,x}], tierX, floorFrom }
  idempotencyKey String          // "{refType}:{refId}:earn" ฯลฯ — บังคับทุกแถว
  // ---- lot (เฉพาะแถว delta > 0: EARN, ADJUST+, REVERSAL+)
  expiresAt      DateTime?       // null = ไม่หมดอายุ
  lotRemaining   Int?            // เริ่ม = delta, ลดจาก consumption — field bookkeeping เดียวที่ UPDATE ได้
  // ---- reversal
  reversesId     String?         // REVERSAL ชี้แถวที่ถูกกลับ
  reverses       PointLedger?    @relation("Reversal", fields: [reversesId], references: [id])
  reversedBy     PointLedger[]   @relation("Reversal")
  // ---- actor
  actorType      PointActorType  @default(SYSTEM)
  actorUserId    String?         // STAFF: userId · CUSTOMER: userId ลูกค้า
  createdAt      DateTime        @default(now())

  consumptions    PointLotConsumption[] @relation("Lot")        // lot นี้ถูกตัดโดยใคร
  consumedEntries PointLotConsumption[] @relation("Consumer")   // แถว −นี้ ตัด lot ไหนบ้าง

  @@unique([tenantId, idempotencyKey])                 // ← หัวใจกันยิงซ้ำ
  @@index([tenantId, memberId, createdAt(sort: Desc)])
  @@index([tenantId, refType, refId])                  // reverse lookup
  @@index([tenantId, expiresAt])                       // cron expire (where lotRemaining > 0)
  @@index([tenantId, unitId, createdAt])               // รายงานต่อหน่วย
  @@index([tenantId, type, createdAt])
}

model PointLotConsumption {       // แถวลบตัด lot ไหนเท่าไร (FIFO trace)
  id           String      @id @default(cuid())
  tenantId     String
  lotId        String      // แถว EARN/ADJUST+ (lot)
  consumerId   String      // แถว BURN/EXPIRE/ADJUST−/REVERSAL−
  points       Int         // > 0
  lot          PointLedger @relation("Lot", fields: [lotId], references: [id])
  consumer     PointLedger @relation("Consumer", fields: [consumerId], references: [id])
  createdAt    DateTime    @default(now())
  @@index([tenantId, lotId])
  @@index([tenantId, consumerId])
}

// ───────────────────────── cached balance ─────────────────────────
model PointBalance {
  tenantId        String
  memberId        String
  balance         Int      @default(0)   // ต้อง = SUM(ledger.delta) เสมอ — reconcile รายคืน
  lifetimeEarned  Int      @default(0)
  lifetimeBurned  Int      @default(0)   // เก็บเป็นบวก
  lifetimeExpired Int      @default(0)
  negativeSince   DateTime?              // balance < 0 ตั้งแต่เมื่อไร (จาก reverse)
  lastEntryAt     DateTime?
  updatedAt       DateTime @updatedAt
  @@id([tenantId, memberId])
  @@index([tenantId, balance])           // liability + top holders
}

// ───────────────────────── expiry notice (กันเตือนซ้ำ) ─────────────────────────
model PointExpiryNotice {
  id          String   @id @default(cuid())
  tenantId    String
  memberId    String
  expiresAt   DateTime // งวดที่เตือน (จัดกลุ่มตามวันหมด)
  daysBefore  Int      // 30 หรือ 7
  points      Int
  sentAt      DateTime @default(now())
  @@unique([tenantId, memberId, expiresAt, daysBefore])
}

// ───────────────────────── reconcile log ─────────────────────────
model PointReconcileRun {
  id           String   @id @default(cuid())
  tenantId     String
  checkedCount Int
  mismatchCount Int
  mismatches   Json     // [{memberId, cached, actual}] — แก้ cache ตาม actual แล้ว
  ranAt        DateTime @default(now())
  @@index([tenantId, ranAt])
}
```

**Invariants (ต้อง hold ตลอดเวลา — ใส่ในเทส)**
1. `PointBalance.balance == SUM(PointLedger.delta)` ต่อ (tenantId, memberId)
2. ต่อ lot: `lotRemaining == delta − SUM(PointLotConsumption.points where lotId)` และ `0 ≤ lotRemaining ≤ delta`
3. แถว delta<0: `|delta| == SUM(consumption.points)` (ยกเว้นส่วนที่ทำให้ balance ติดลบจาก REVERSAL — ส่วนเกินไม่มี lot รองรับ บันทึกใน calcMeta)
4. ไม่มีแถวไหนถูก UPDATE ยกเว้น `lotRemaining` · ไม่มี DELETE เลย

---

## 5. API Endpoints

> tenant-scoped ทั้งหมด (ไม่มี `/api/u/` prefix) · mutation ทุกเส้นรับ/สร้าง idempotencyKey · แตะแต้ม → AuditLog

### 5.1 Service contracts (internal — โมดูลอื่นเรียก, ไม่ expose HTTP ตรง)
```ts
// ตาม _CONVENTIONS 2.2 **v2** — ข้อเสนอทั้ง 4 ของไฟล์นี้ได้รับ approve เป็นทางการแล้ว (RESOLUTIONS D5)
// idempotencyKey บังคับทุก mutation · ทุก mutation รับ tx?: PrismaTransactionClient (optional — join tx ผู้เรียก)
point.earn({ tenantId, memberId, unitId, amountSatang, sourceModule, refType, refId,
             idempotencyKey, occurredAt?, tx? })
  → { points: number, balance: number, ruleId?: string, reason?: 'NO_RULE'|'MEMBER_BLOCKED'|'ZERO_AMOUNT' }

point.quoteBurn({ tenantId, memberId, points, billAmountSatang })
  → { valid: boolean, discountSatang: number, reason?: 'INSUFFICIENT'|'BELOW_MIN'|'OVER_CAP'|'MEMBER_BLOCKED' }

point.burn({ tenantId, memberId, unitId, points, refType, refId, idempotencyKey, reason, tx? })
  → { discountSatang?: number, balance: number }        // throw ถ้า balance ไม่พอ (ตรวจใน lock) · points = จำนวนบวกเสมอ

point.adjust({ tenantId, memberId, unitId?, delta, reason, refType?, refId?, idempotencyKey, actorUserId, tx? })
  → { balance }

point.reverse({ tenantId, refType, refId, reason, amountSatang? /* partial */, idempotencyKey, tx? })
  → { reversedPoints, restoredPoints, balance }

point.getBalance({ tenantId, memberId })
  → { balance, expiringSoon: [{ points, expiresAt }] }

point.transferOnMerge({ tenantId, sourceMemberId, targetMemberId, actorUserId, idempotencyKey, tx? })
  → { movedPoints }

point.simulate({ tenantId, amountSatang, sourceModule, unitId?, tierId?, at?, includeDraftRuleId? })
  → { points, steps: [...] }        // read-only ไม่เขียนอะไร
```

**พฤติกรรม `tx?` (จุดที่ 07-reward ต้องการ — QC2-M1):** ถ้าได้รับ `tx` → join transaction ของผู้เรียก (ไม่เปิด tx ซ้อน) แต่ยังคง `SELECT ... FOR UPDATE` แถว `PointBalance` ภายใน tx นั้นเสมอ · ⚠️ ผู้เรียกที่ถือ lock อื่นอยู่ก่อน (เช่น Reward lock แถว Reward ก่อน burn) ต้องกำหนดลำดับ lock ตายตัวฝั่งตัวเอง: **lock เอกสารตัวเองก่อน → PointBalance ทีหลังเสมอ** (กัน deadlock)

### 5.2 Dashboard (staff)
| Method | Path | Body/Query หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/point/settings` · PATCH | นโยบาย expiry/burn rate/limits — PATCH เขียน AuditLog | point.settings (PATCH) / point.read (GET) |
| GET | `/api/point/rules` | filter status/type | point.read |
| POST | `/api/point/rules` | สร้าง DRAFT | point.rule.manage |
| PATCH | `/api/point/rules/[id]` | แก้ได้เฉพาะ DRAFT/PAUSED (ACTIVE → 409 ให้ duplicate) | point.rule.manage |
| POST | `/api/point/rules/[id]/activate` `/pause` `/archive` | เปลี่ยนสถานะ + validate ชนกัน (BASE ACTIVE ที่ scope ทับกัน → เตือน) | point.rule.manage |
| POST | `/api/point/rules/[id]/duplicate` | clone เป็น DRAFT | point.rule.manage |
| POST | `/api/point/simulate` | payload ตาม point.simulate — ใช้ใน simulator UI | point.read |
| GET | `/api/point/members/[memberId]/ledger` | ประวัติ + filter type/unit/ช่วงเวลา, cursor | point.read |
| GET | `/api/point/members/[memberId]/lots` | lot คงเหลือ + วันหมดอายุ | point.read |
| POST | `/api/point/members/[memberId]/adjust` | `{ delta, reason, unitId? }` — ตรวจ adjustLimits ตาม role | point.adjust |
| GET | `/api/point/ledger` | ledger รวมทั้งร้าน (filter member/type/unit/rule/ช่วง) — audit view | point.read |
| GET | `/api/point/reports/liability` | ดู 10 | point.report |
| GET | `/api/point/reports/summary` | earn/burn/expire ต่อช่วง ต่อ unit ต่อ rule | point.report |
| POST | `/api/point/expiry/extend` | `{ months, confirm }` ขยายอายุ lot คงเหลือทั้งฐาน (ใช้ตอนเปลี่ยน policy) | point.settings (OWNER) |

### 5.3 Storefront (customer)
| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/api/store/point/balance` | balance + expiringSoon (ใช้ในหน้า `/member`) |
| GET | `/api/store/point/ledger` | ประวัติของตัวเอง (แถว visibleToCustomer — ADJUST โชว์ reason แบบ generic) |
| GET | `/api/store/point/lots` | ก้อนแต้ม + วันหมดอายุ |

### 5.4 Cron (internal, header `X-Cron-Secret`)
| Path | งาน |
|---|---|
| POST `/api/cron/point/expire` | expire lot ครบกำหนด (batch, idempotent) — รายวัน 03:30 เวลาร้าน |
| POST `/api/cron/point/expiry-notify` | แจ้งเตือน 30/7 วันก่อนหมด (กันซ้ำด้วย PointExpiryNotice) |
| POST `/api/cron/point/reconcile` | เทียบ cached balance กับ SUM — รายคืน + log PointReconcileRun |

---

## 6. UI Screens

### 6.1 Dashboard `(app)` — อยู่ในโซน tenant-level "สมาชิก/แต้ม" ของ sidebar
| หน้า | เนื้อหา | Mobile |
|---|---|---|
| `/app/point` | ภาพรวม: การ์ด KPI (แต้มคงค้างรวม + มูลค่าบาท, earn/burn/expire 30 วัน, สมาชิกถือแต้ม), กราฟ earn vs burn รายเดือน, แต้มจะหมดอายุใน 30/60/90 วัน (bucket), ตาราง earn ต่อหน่วย (unitId tag) | การ์ด stack |
| `/app/point/rules` | รายการ rule แยก BASE/MULTIPLIER: ชื่อ, scope (module/unit chips), อัตรา, ช่วงเวลา, สถานะ badge — ปุ่มสร้าง/duplicate/activate/pause · แถบเตือนถ้าไม่มี BASE ACTIVE ("ตอนนี้ลูกค้าไม่ได้แต้ม") | list card |
| `/app/point/rules/[id]` | ฟอร์ม rule + **panel simulator ข้างกัน**: ใส่ยอดบิล + module + unit + tier + วันที่ → เห็นผลสด step-by-step ("1,850฿ → base 18 แต้ม → x2 โปรเปิดสาขา → x1.5 Gold → FLOOR = 54") — ทดสอบ DRAFT ได้ก่อน activate | simulator เป็น bottom-sheet |
| `/app/point/ledger` | ตาราง ledger ทั้งร้าน: filter member/type/unit/rule/วันที่, แถวคลิก → drawer รายละเอียด (calcMeta, consumption trace, ลิงก์เอกสารต้นทาง+โปรไฟล์สมาชิก) | ตาราง → card |
| `/app/point/settings` | นโยบายหมดอายุ (radio 3 แบบ + N เดือน + วันแจ้งเตือน), burn rate + ขั้นต่ำ/เพดาน, มูลค่าแต้ม (liability), adjust limits ต่อ role — ทุกช่องมีคำอธิบาย + ตัวอย่างคำนวณสด | — |
| `/app/point/reports` | Liability + summary (ดู 10) + export CSV | การ์ดสรุป |
| ในโปรไฟล์สมาชิก (`/app/members/[id]` tab "แต้ม") | balance ใหญ่, lot คงเหลือ+วันหมด, ledger ของคน, ปุ่ม "ปรับแต้ม" → modal (delta, reason dropdown บังคับ, unitId ปัจจุบันติดอัตโนมัติ, preview balance ใหม่) | — |
| ใน POS (จอขาย — spec ฝั่ง 14-pos.md) | หลังเลือกสมาชิก: badge แต้มคงเหลือ, ปุ่ม "ใช้แต้ม" → modal ใส่แต้ม (quoteBurn live: "300 แต้ม = ส่วนลด 75฿"), หลังปิดบิล: "ได้รับ 18 แต้ม" บนจอ+ใบเสร็จ | — |

### 6.2 Storefront `(store)`
| หน้า | เนื้อหา |
|---|---|
| ใน `/member` (หน้าหลักสมาชิก — โมดูล 06) | แต้มคงเหลือตัวใหญ่ + "จะหมดอายุ 120 แต้ม ภายใน 31 ม.ค." + ลิงก์ประวัติ |
| `/member/points` | ประวัติ earn/burn/expire (การ์ดรายแถว: ไอคอน type, ชื่อร้าน/หน่วย, ±แต้ม, วันที่) + section "ก้อนแต้มของฉัน" (lot + countdown วันหมด) |
- i18n TH/EN, B&W minimal, empty state ("ยังไม่มีแต้ม เริ่มสะสมได้ที่ร้าน"), loading/error ครบ

---

## 7. Business Flows

### 7.1 เลือก rule + คำนวณ earn (ใน `point.earn`)
1. โหลด rule ACTIVE ทั้งหมดของ tenant ที่ match เวลา `occurredAt`
2. **เลือก BASE 1 ตัว**: กรอง rule ที่ scope ครอบ (sourceModules ว่างหรือมี module นี้ และ unitIds ว่างหรือมี unit นี้ และยอด ≥ minSpend) → เรียงตาม "ความเจาะจง" (ระบุทั้ง module+unit > ระบุ unit > ระบุ module > global) → เสมอกันใช้ priority มาก → เสมออีกใช้ตัวใหม่สุด → ไม่มีเลย = `{points:0, reason:'NO_RULE'}`
3. base = `FLOOR(amount / spendSatang) × earnPoints`, cap ด้วย maxPointsPerTxn
4. **MULTIPLIER**: จาก rule MULTIPLIER ที่ match (scope+ช่วงเวลา) เลือก**ตัวคูณสูงสุดตัวเดียว** (v1 ไม่คูณทบ) → `pts = FLOOR(base × m)`
5. **Tier**: อ่าน `pointMultiplier` ของ tier สมาชิก (จาก Member read-only) → `pts = FLOOR(pts × tierX)`
6. เขียน EARN + calcMeta (ทุก step เก็บเป็นหลักฐาน) — simulator ใช้ logic ฟังก์ชันเดียวกันเป๊ะ (shared pure function `computeEarn()` — กัน sim กับของจริงไม่ตรง)

### 7.2 Earn/Burn ในบิล POS (contract 2.1 + 2.2 ทำงานร่วม)
```
POS createSale (transaction ฝั่ง POS)
 ├─ 1. ลูกค้าขอใช้แต้ม → point.quoteBurn (นอก txn, แสดงตัวเลข)
 ├─ 2. commit บิล: คำนวณ total หลังหักส่วนลดแต้ม
 ├─ 3. point.burn(idem="{Sale}:{id}:burn")           → ได้ discount จริง (lock member)
 ├─ 4. account.post / พิมพ์ใบเสร็จ
 └─ 5. point.earn(idem="{Sale}:{id}:earn",
        amount = total − ส่วนที่จ่ายด้วยแต้ม/voucher)  → points ลงใบเสร็จ
```
- ขั้น 3 fail (แต้มไม่พอ — มีคนใช้ตัดหน้าอีกเครื่อง) → POS แจ้งแคชเชียร์ ตัดส่วนลดออก ทำบิลต่อได้ (burn เป็น optional step)
- ขั้น 5 fail (Point ล่ม) → **บิลไม่ rollback** (เงินสำคัญกว่าแต้ม) — POS เก็บ outbox event retry จนสำเร็จ (idempotency ทำให้ retry ปลอดภัย) ⇒ เสนอเป็นกติกาใน contract (ดู 8)
- ลูกค้า guest (ไม่มี member) → ข้าม 1,3,5 ทั้งหมด

### 7.3 กัน race (2 เครื่องจ่าย/ตัดแต้มพร้อมกัน)
1. ทุก mutation เริ่ม transaction (หรือ **join `tx?` ของผู้เรียก — ไม่เปิด tx ซ้อน** ตาม 2.2 v2) → `SELECT ... FOR UPDATE` แถว `PointBalance` (สร้างแถวถ้ายังไม่มีด้วย upsert ก่อน lock) — **serialize ทุกอย่างต่อ member**
2. ใน lock: ตรวจ idempotencyKey (มีแล้ว → คืนผลเดิม ออกเลย) → ตรวจเงื่อนไข (balance พอ, member ACTIVE) → เขียน ledger + consumption + update lotRemaining + update balance → commit
3. Deadlock ไม่เกิดเพราะ lock ทีละ 1 แถวเสมอ — ยกเว้น transferOnMerge lock 2 member: เรียง lock ตาม memberId (lexicographic) เสมอ
4. Timeout lock 5s → คืน 409 RETRYABLE ให้ client retry (POS retry อัตโนมัติ 3 ครั้ง)

### 7.4 Void ใบเสร็จ → reverse
1. POS void → `point.reverse({refType:'PosSale', refId, reason:'VOID'})`
2. หา ledger ของ ref: earn 54 แต้ม (ลูกค้าใช้ไปแล้ว 30 จาก lot นี้) → REVERSAL −54: ตัด lotRemaining 24 ที่เหลือ + อีก 30 ตัด lot อื่น (FIFO) — ถ้าไม่มี lot เหลือเลย → balance ติดลบ + `negativeSince`
3. บิลนั้นมี burn 300 แต้ม (ส่วนลด 75฿) → REVERSAL +300 (lot ใหม่ อายุ=คงเหลือของ lot ที่เคยถูกตัด, ตัวเงิน 75฿ ฝั่ง POS จัดการใน refund)
4. activity.log ทั้งสองแถว → ลูกค้าเห็น "คืนแต้มจากการยกเลิกใบเสร็จ" ใน timeline

### 7.5 Expire + แจ้งเตือน
1. Cron 03:30: query lot `expiresAt <= now, lotRemaining > 0` (index) → group ตาม member → ต่อ member: lock → เขียน EXPIRE ต่อ lot (idem=`expire:{lotId}`) → update balance — batch 200 member/รอบ, loop จนหมด
2. Cron notify: lot ที่จะหมดใน ≤30 วัน (แล้วยังไม่เคยส่ง notice 30) และ ≤7 วัน → รวมยอดต่อ member ต่อวันหมด → `notify(template:'points_expiring')` → บันทึก PointExpiryNotice
3. นโยบาย NONE → cron no-op · เปลี่ยนนโยบายกลางทาง → lot ใหม่ใช้ policy ใหม่, lot เก่าคงเดิม (มีเครื่องมือ extend แยก)

### 7.6 Reconcile รายคืน
ต่อ tenant: เทียบ `PointBalance.balance` กับ `SUM(delta)` (query aggregate ทีเดียว join) → mismatch: แก้ cache ตาม SUM + เก็บ PointReconcileRun + ถ้า mismatch > 0 ส่ง alert ไปที่ ops (แปลว่ามีบั๊ก — cache ไม่ควรเพี้ยนถ้า mutation ผ่าน service เดียวจริง) · ตรวจ invariant lot (ข้อ 4) แบบสุ่ม 1% ต่อคืน

---

## 8. Integration (contract ข้อ 2 v2 — ข้อเสนอทั้ง 4 ได้รับ approve แล้ว)

| จุด | รายละเอียด |
|---|---|
| 8.1 POS → Point (2.1+2.2 v2) | createSale ขั้นตอนที่ POS "คิดแต้ม (ยิง event เข้า Point)" = เรียก `point.earn` ตาม 7.2 — response `pointEarned` ของ createSale มาจากค่าที่ Point คืน ห้าม POS คำนวณเอง · **"ใช้แต้มเป็นส่วนลด" ใน POS = MVP ✅ ยืนยันตรงกันแล้ว (RESOLUTIONS D5)** — ลำดับใน createSale: quoteBurn/burn ก่อน total → earn จากยอดจ่ายจริงเป็น post-commit outbox, `pointEarned` nullable |
| 8.2 Reward → Point | แลกรางวัล: `point.burn(refType:'RewardRedemption')` · ยกเลิกการแลก/คืนแต้ม: `point.reverse` (**ห้ามใช้ adjust แทน** — reverse คงอายุ lot เดิม) |
| 8.3 Member → Point | tier `pointMultiplier` (read) · merge: `point.transferOnMerge` · anonymize: `point.adjust(reason:'PDPA_ERASURE')` ตัดแต้มคงเหลือ |
| 8.4 Point → Member | ทุก mutation ยิง `activity.log` (**contract 2.7 — approve แล้ว**) type POINT_EARN/BURN/ADJUST/EXPIRE — Point เป็น producer บังคับตามตาราง RESOLUTIONS D6 |
| 8.5 Point → Notify (2.5) | template: `points_earned` (optional, default ปิด — กัน spam), `points_expiring`, `points_adjusted` |
| 8.6 Point ↮ Account | v1 **ไม่ post บัญชี** อัตโนมัติ — liability report เป็นรายงานฝั่ง Point; 🔜 ตั้งค่าให้ post provision หนี้แต้มเข้า Account (2.4) รายเดือน |

### ข้อเสนอแก้/เพิ่ม _CONVENTIONS — ✅ **APPROVED ทั้ง 4 ข้อ** (QC2 verdict + RESOLUTIONS D5 — สะท้อนใน _CONVENTIONS 2.2 v2 แล้ว)
1. **[2.2 v2] ✅** `idempotencyKey` **บังคับทุก mutation** + `point.reverse / quoteBurn / getBalance / simulate / transferOnMerge` เป็น contract ทางการ — field ต่อ event ชัดเจน: `earn: amountSatang` / `burn: points` (บวก) / `adjust: delta` · ทุก mutation รับ `tx?` (ดู 5.1)
2. **[2.1 v2] ✅** ลำดับใน createSale: **burn ก่อนคิด total → earn จากยอดจ่ายจริง** (`total − ส่วนที่จ่ายด้วยแต้ม/voucher`) และ **earn fail ไม่ rollback บิล** — POS เก็บ outbox retry (at-least-once + idempotency = exactly-once effect) · `pointEarned` ใน response createSale เป็น **nullable** + ใบเสร็จมีข้อความ fallback ("แต้มจะเข้าภายใน 24 ชม.")
3. **[2.7] ✅** `activity.log(...)` — timeline กลางของ Member (นิยามในไฟล์ 06 ข้อ 5.6) พร้อมตาราง producer บังคับใน RESOLUTIONS D6
4. **[2.6b] ✅** `member.findOrCreate(...)` + `member.sendOtp/verifyOtp` — auto-create/verify มาตรฐาน (นิยามในไฟล์ 06)

---

## 9. Permissions (tenant-scoped — ตรวจ 3 มิติ; adjust หน้างานให้ tag unitId ปัจจุบันลง ledger ตาม BLUEPRINT_BUSINESS_UNITS ข้อ 3)

| Action key | OWNER | MANAGER | STAFF | หมายเหตุ |
|---|---|---|---|---|
| point.read | ✅ | ✅ | ✅ (ดู balance/ledger ลูกค้าตอนขาย) | |
| point.rule.manage | ✅ | ❌ | ❌ | สร้าง/activate rule = นโยบายเงิน |
| point.settings | ✅ | ❌ | ❌ | expiry/burn rate/มูลค่าแต้ม |
| point.adjust | ✅ (ไม่จำกัด) | ✅ (≤ adjustLimits.MANAGER) | ⚙️ (default 0 = ห้าม) | reason บังคับ + AuditLog |
| point.report | ✅ | ✅ (เห็นทุกหน่วย — ตัวเลขแต้มเป็น tenant-level; drill-down unit ตาม unitAccess) | ❌ | |
| earn/burn ผ่านธุรกรรม | — | — | — | ไม่ใช่สิทธิ์คน — เกิดจาก service contract อัตโนมัติ; staff ทำผ่านสิทธิ์ของโมดูลต้นทาง (pos.sale ฯลฯ) |
| Customer | ดูของตัวเองผ่าน `/api/store/point/*` เท่านั้น | | | |

---

## 10. Reports & Metrics

| รายงาน | เนื้อหา | นิยาม/สูตร |
|---|---|---|
| **Liability (ภาระแต้มคงค้าง)** ⭐ | แต้มคงเหลือรวมทั้งฐาน × `pointValueSatang` = มูลค่าบาท · breakdown: ตามเดือนที่จะหมดอายุ (aging bucket: 0-30/31-90/91-365/ไม่หมดอายุ), ตาม tier, top 50 ผู้ถือแต้ม · แนวโน้ม liability รายเดือนย้อนหลัง 12 เดือน | `SUM(lotRemaining where lotRemaining>0)` — ตรงกับ `SUM(balance>0)` เสมอ (invariant) |
| Earn/Burn/Expire summary | ต่อวัน/เดือน: earn, burn, expire, net · burn rate = burn/earn % (สุขภาพ loyalty — ต่ำไป = ลูกค้าไม่เห็นค่า, แต้มจ่อ expire เยอะ = liability ระเบิด) | จาก ledger group by type |
| Earn ต่อหน่วย/โมดูล | แต้มเกิดจากกิจการไหน/โมดูลไหนเท่าไร (unitId tag) — เห็นว่ากิจการไหน drive loyalty | group by unitId |
| Rule performance | ต่อ rule: จำนวนบิล, แต้มที่แจก, ยอดขายที่เกี่ยว — เทียบช่วงก่อน/ระหว่าง multiplier campaign | group by ruleId |
| Expiring soon | แต้มจะหมดใน 30/60/90 วัน + จำนวนสมาชิกที่โดน — ใช้ทำแคมเปญ "รีบมาใช้" (ส่งต่อเป็น segment ฝั่ง Member ได้) | lot query |
| Adjust audit | รายการ ADJUST ทั้งหมด: ใคร เท่าไร เหตุผล — เรียงยอดสูงสุด (จับ fraud ภายใน) | type=ADJUST |
| Reconcile health | mismatch ล่าสุด, ประวัติ run | PointReconcileRun |
- การ์ด "แต้ม earn/burn วันนี้" บนหน้า Overview ทุกกิจการ (BLUEPRINT_BUSINESS_UNITS ข้อ 4) ดึงจาก summary API · ทุกรายงาน export CSV

---

## 11. Edge Cases & Rules

1. **ยิงซ้ำทุกกรณี** (double-click, retry เน็ตหลุด, cron ซ้อน, replay queue) — `@@unique([tenantId, idempotencyKey])` ที่ DB คือด่านสุดท้าย; service เจอ duplicate → คืน response เดิมจากแถวเดิม (HTTP 200 ไม่ใช่ error)
2. **Race 2 เครื่อง**: burn พร้อมกันยอดก้ำกึ่ง → lock ทำให้เครื่องที่สองเห็น balance หลังหักแล้ว → INSUFFICIENT อย่างถูกต้อง (มีเทส concurrent 20 threads ใน QC)
3. **Reverse บิลที่แต้มถูกใช้ไปแล้ว** → balance ติดลบได้ (นโยบายชัด: ลูกค้าติดหนี้แต้ม, earn ถัดไปหักกลบอัตโนมัติ) — UI โชว์ balance ติดลบพร้อมคำอธิบาย, ห้าม burn จนกลับเป็นบวก
4. **Reverse ซ้อน reverse** — REVERSAL ห้ามถูก reverse อีก (ตรวจ type ก่อน); void บิลเดิมซ้ำ → idempotency คืนผลเดิม
5. **แก้ rule ระหว่างวัน** — ledger เก็บ ruleId + calcMeta snapshot → ตรวจย้อนหลังได้เสมอว่าใช้กติกาไหน; rule ACTIVE แก้ไม่ได้ (duplicate → activate ตัวใหม่ → archive ตัวเก่า, สลับ atomic)
6. **Rule ชนกัน** — BASE ACTIVE หลายตัว scope ทับ: resolve ด้วยลำดับเจาะจง 7.1 (deterministic เสมอ); UI เตือนตอน activate ว่าทับกับตัวไหน
7. **ไม่มี BASE ACTIVE** — earn คืน 0 พร้อม reason=NO_RULE (ไม่ error, บิลเดินต่อ); dashboard ขึ้นแถบเตือนถาวร
8. **Clock/timezone** — expiresAt คำนวณจาก timezone ร้าน (สิ้นปี = 31 ธ.ค. 23:59:59 เวลาไทย เก็บเป็น UTC); occurredAt ของ earn ย้อนหลังใช้เวลาบิลจริง (ไม่ใช่เวลายิง event) เพื่อ multiplier ช่วงโปรถูกต้อง
9. **Member MERGED** — event ที่ยังอ้าง source member: PointService resolve `mergedIntoId` ก่อนทำงาน (ร่วมกติกาไฟล์ 06 ข้อ 11.5)
10. **Member BLOCKED/ANONYMIZED** — earn/burn ถูกปฏิเสธ (reason ชัด); ADJUST โดย OWNER ยังทำได้ (เคสแก้บัญชี)
11. **จำนวนใหญ่** — ledger โตเร็ว (ทุกบิล ≥1 แถว): index ตาม access pattern แล้ว, รายงาน aggregate หนักให้รันบน replica/cache รายวัน 🔜; ห้าม query SUM สดใน hot path (ใช้ cached balance)
12. **เปลี่ยน burnRate กลางทาง** — quote กับ burn จริงต้องเรตเดียวกัน: quoteBurn คืน `rateVersion` และ burn ตรวจว่า settings.updatedAt ไม่เปลี่ยน มิฉะนั้นให้ POS quote ใหม่ (กันลูกค้าเห็น 75฿ แต่โดนตัดอีกเรต)
13. **Import แต้มยกมา** — ผ่าน `point.adjust` เท่านั้น (idem=`import:{jobId}:{row}`), lot อายุตาม policy ณ วัน import
14. **Isolation** — ledger/balance/rule ทุก query inject tenantId; unitId บน rule/ledger ต้อง validate ว่า ∈ tenant ก่อนบันทึก (กัน tag ข้ามร้าน)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Correctness (ledger)**
- [ ] Invariant 4 ข้อ (หัวข้อ 4) ผ่านหลังชุดเทส: earn→burn→partial reverse→expire→merge — `SUM(delta)` = balance ทุกจุด
- [ ] ไม่มี SQL UPDATE/DELETE บน PointLedger นอกจาก `lotRemaining` (ตรวจด้วย trigger/grep query ใน service)
- [ ] FIFO ถูกต้อง: earn 3 lot อายุต่างกัน → burn ตัด lot ใกล้หมดก่อน, consumption trace ตรงทุกแต้ม
- [ ] คำนวณ earn: บิล 1,850฿ / rule 100฿=1 / x2 campaign / tier x1.5 → 54 แต้ม (FLOOR ทุกชั้น) — simulator กับ earn จริงให้เลขเดียวกัน (ฟังก์ชันเดียวกัน)
- [ ] เปลี่ยนนโยบาย expiry แล้ว lot เก่าไม่เปลี่ยน, lot ใหม่ใช้ policy ใหม่

**Idempotency & Race**
- [ ] ยิง point.earn ซ้ำ 10 ครั้ง key เดิม → ledger 1 แถว, response เหมือนกันทุกครั้ง
- [ ] Concurrent burn 20 threads, balance 100 แต้ม, ขอ 10 แต้ม/thread → สำเร็จพอดี 10, ที่เหลือ INSUFFICIENT, balance จบ = 0 (ไม่ติดลบ)
- [ ] Concurrent earn+burn+reverse ปนกัน 1 member → invariant ยัง hold
- [ ] Cron expire รัน 2 instance พร้อมกัน → EXPIRE ไม่ซ้ำ (idem ต่อ lot)
- [ ] transferOnMerge 2 ทิศพร้อมกัน → ไม่ deadlock (lock ordering)

**Flows**
- [ ] POS ปิดบิลมี member → แต้มเข้า + เลขบนใบเสร็จตรง ledger; guest → ไม่มีแถว
- [ ] Void บิล: earn ถูก reverse + burn ถูกคืน (อายุ lot คืนถูก), timeline ลูกค้าขึ้นครบ
- [ ] Point service ล่มตอนปิดบิล → บิลสำเร็จ, outbox retry แล้วแต้มเข้าภายหลัง 1 ครั้งเดียว
- [ ] Expire cron: lot ครบกำหนด → EXPIRE ถูกยอด; แจ้งเตือน 30/7 วันส่งครั้งเดียวต่อ threshold
- [ ] Reconcile: corrupt cache มือ → cron แก้กลับตาม SUM + log mismatch

**Reports & UI**
- [ ] Liability = SUM(lotRemaining) = SUM(balance บวก) ตรงกัน 3 ทาง; aging bucket รวม = total
- [ ] Simulator ใช้ได้กับ rule DRAFT, แสดง step ครบ, i18n TH/EN
- [ ] หน้า settings แก้ค่า → มีตัวอย่างคำนวณสดถูกต้อง; adjust modal บังคับ reason
- [ ] Storefront: balance/lot/ประวัติ ตรง ledger; ลูกค้าเห็นเฉพาะของตัวเอง (IDOR test)
- [ ] Empty/loading/error state + B&W minimal + responsive ครบทุกหน้า

**Isolation & Audit**
- [ ] Tenant leak test: token ร้าน A ยิงทุก endpoint ด้วย id ของร้าน B → 404/403 หมด
- [ ] AuditLog ครบ: adjust, rule activate/archive, settings change, expiry extend
- [ ] unitId ปลอม (ของ tenant อื่น) ใน earn payload → reject
