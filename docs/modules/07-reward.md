# โมดูล 7 — Reward (แลกรางวัล)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)

> scope: **TENANT** (+ `applicableUnitIds` จำกัดหน่วยได้) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> พึ่งพา: **Member (06)** = ตัวตนลูกค้า/tier · **Point (09)** = ตัดแต้มผ่าน contract 2.2 · **Notification (2.5)** = แจ้งผลแลก
> เฟสตาม roadmap: Phase 4 (Engagement) — ต้องมี Member + Point ขึ้นก่อน

---

## 1. ภาพรวม + ขอบเขต

**ทำอะไร:** ร้านสร้าง "แคตตาล็อกรางวัล" ให้ลูกค้าเอาแต้ม (Point) มาแลก — ของชิ้น (physical), ส่วนลด, หรือบริการฟรี ลูกค้ากดแลกบน storefront → ระบบหักแต้มทันที (atomic) + จองสต็อก → ได้ redemption code/QR → มารับของ/ใช้สิทธิ์หน้าร้าน → staff สแกนยืนยัน (ระบุหน่วยที่รับ) → ปิดรายการ

**หลักการ scope:** Reward เป็น **tenant-level** — ลูกค้า 1 คนใช้แต้มก้อนเดียวแลกรางวัลได้ทุกกิจการขององค์กร (จุดขาย SHARK) แต่รางวัลแต่ละชิ้น **จำกัดหน่วยที่รับ/ใช้ได้** ผ่าน `applicableUnitIds` (เช่น "บุฟเฟ่ต์ฟรี 1 ที่" รับได้เฉพาะร้านอาหารสาขา 1) และตอน fulfill ต้อง tag `unitId` เสมอ เพื่อรายงานต้นทุนรางวัลรายหน่วย

### v1 (MVP) ทำ
- แคตตาล็อกรางวัล 3 ประเภท: ของชิ้น / ส่วนลด (ออกเป็นคูปองผูกโมดูล 8) / บริการฟรี
- เนื้อหา TH/EN ต่อรางวัล + รูปหลายรูป
- เงื่อนไข: tier ขั้นต่ำ, จำกัดต่อคน (ตลอดชีพ + ต่อเดือน), ช่วงเวลาเปิดแลก, จำกัดหน่วย
- สต็อกแบบจอง (reserve) → ยืนยัน (fulfill) → คืนสต็อกอัตโนมัติเมื่อหมดอายุ/ยกเลิก
- Flow แลกครบวงจร: storefront redeem → `point.burn` atomic → code/QR → staff scan fulfill
- สถานะ redemption: `PENDING / FULFILLED / EXPIRED / CANCELLED`
- รายงาน: รางวัลยอดนิยม, แต้ม burn, ต้นทุนรางวัลต่อหน่วย, อัตรามารับจริง

### v1 ไม่ทำ (🔜 Phase ถัดไป)
- 🔜 รางวัลแบบ "สุ่ม/gacha", รางวัลจับฉลาก
- 🔜 แลกด้วย แต้ม+เงิน (point + top-up cash)
- 🔜 จัดส่งของรางวัลทางไปรษณีย์ (v1 = รับหน้าร้านเท่านั้น)
- 🔜 Auto-refund แต้มเมื่อ EXPIRED (v1: EXPIRED คืนสต็อกแต่**ไม่คืนแต้มอัตโนมัติ** — owner กดยกเลิกพร้อมคืนแต้มรายกรณีได้)
- 🔜 แลกรางวัลแทนลูกค้าโดย staff จาก dashboard (v1: staff แนะนำให้ลูกค้ากดเองบนมือถือ)
- 🔜 Reward bundle (แลกทีเดียวได้หลายชิ้น), scheduled publish

---

## 2. Persona & User Stories

| Persona | Stories |
|---|---|
| **Owner** | สร้าง/แก้รางวัล, ตั้งแต้ม/สต็อก/เงื่อนไข, เห็นรายงาน burn + ต้นทุนทุกหน่วย, ยกเลิกรายการแลกพร้อมคืนแต้ม |
| **Manager** (คุมบางหน่วย) | เห็นแคตตาล็อกทั้งหมด (read), เห็น/จัดการ redemption ที่ fulfill ในหน่วยตัวเอง, สแกนยืนยันรับของ, ดูรายงานต้นทุนหน่วยตัวเอง |
| **Staff** (หน้าร้าน) | สแกน QR/พิมพ์ code → เห็นชื่อลูกค้า+รางวัล → กดยืนยันส่งมอบ (unitId ถูก tag จากหน่วยที่ตัวเองประจำ) |
| **Customer** | เห็นแคตตาล็อกบน storefront (กรองตามแต้มที่มี/tier), กดแลก, เห็น code/QR ใน "รางวัลของฉัน", รู้วันหมดอายุรับของ, ได้ noti ยืนยัน/เตือนใกล้หมดอายุ |

ตัวอย่าง user story หลัก:
1. ลูกค้า Gold มีแต้ม 1,200 → เห็น "หมอนผ้าห่ม (800 แต้ม, เหลือ 12 ชิ้น, รับที่โรงแรม A เท่านั้น)" → กดแลก → แต้มเหลือ 400 ทันที → ได้ QR หมดอายุใน 14 วัน
2. ลูกค้าโชว์ QR ที่ front โรงแรม A → staff สแกน → ระบบเช็คว่า unit นี้อยู่ใน `applicableUnitIds` → ยืนยัน → สต็อก confirm, รายงานต้นทุน 150฿ ลงหน่วยโรงแรม A
3. ลูกค้าไม่มารับใน 14 วัน → cron ตั้งสถานะ EXPIRED → สต็อกคืนอัตโนมัติ → ลูกค้าได้ noti "สิทธิ์หมดอายุ"

---

## 3. ฟังก์ชันทั้งหมด

### 3.1 แคตตาล็อกรางวัล
- ✅ ประเภทรางวัล (`RewardType`):
  - `PHYSICAL_ITEM` — ของชิ้น (แก้ว, เสื้อ, ตุ๊กตา) → ต้องรับหน้าร้าน
  - `DISCOUNT` — ส่วนลด: ตอน fulfill ระบบ **ออก CouponCode ส่วนตัว** (โมดูล 8) ให้ลูกค้าอัตโนมัติ เช่น "แลก 500 แต้ม = คูปองลด 100฿" (ดู Integration 8.3)
  - `FREE_SERVICE` — บริการฟรี (นวดฟรี 30 นาที, late checkout) → staff ยืนยันตอนใช้สิทธิ์หน้างาน
- ✅ เนื้อหา 2 ภาษา: `nameTh/nameEn`, `descriptionTh/descriptionEn` (EN optional — storefront fallback TH)
- ✅ รูปหลายรูป (สูงสุด 5) เก็บ URL บน object storage, รูปแรก = cover, เรียงลำดับได้
- ✅ `pointCost` (แต้มที่ใช้แลก) + `costSatang` (ต้นทุนจริงของร้านต่อชิ้น หน่วยสตางค์ — ใช้ทำรายงานค่าใช้จ่าย ไม่โชว์ลูกค้า)
- ✅ สถานะรางวัล: `DRAFT` (ซ่อน) → `ACTIVE` (แลกได้) → `PAUSED` (โชว์แต่กดแลกไม่ได้/หรือซ่อน — config) → `ARCHIVED` (เก็บถาวร read-only, redemption ค้างยัง fulfill ได้)
- ✅ `sortOrder` จัดลำดับบน storefront
- 🔜 duplicate รางวัล, หมวดหมู่รางวัล, ป้าย "ใหม่/ใกล้หมด" อัตโนมัติ

### 3.2 เงื่อนไขการแลก (ตรวจครบทุกข้อ ณ วินาทีกดแลก — ใน transaction)
- ✅ `minTierLevel Int?` — tier ขั้นต่ำ (อ้าง `MemberTier.level` จากโมดูล 6; null = ทุก tier รวม non-tier)
- ✅ `limitPerMember Int?` — จำนวนครั้งสูงสุดต่อคน **ตลอดอายุรางวัล** (นับ PENDING+FULFILLED, ไม่นับ CANCELLED/EXPIRED)
- ✅ `limitPerMemberPerMonth Int?` — ต่อคนต่อเดือนปฏิทิน (timezone `Asia/Bangkok` ระดับ tenant)
- ✅ `startsAt / endsAt DateTime?` — ช่วงเวลาเปิดให้กดแลก (นอกช่วง = ซ่อนปุ่มแลก แต่ redemption ค้างยังรับของได้ตาม `expiresAt` ของตัวมันเอง)
- ✅ `applicableUnitIds Json?` — array unitId ที่ **รับของ/ใช้สิทธิ์ได้** (`null` = ทุกหน่วย ACTIVE) — ตรวจ 2 จุด: แสดงบน storefront ("รับได้ที่: โรงแรม A") + ตอน staff fulfill (unit ไม่ตรง → block)
- ✅ แต้มพอ (เช็คใน `point.burn` — Point เป็นเจ้าของ balance, Reward ห้ามคำนวณเอง)
- ✅ สต็อกเหลือ (ดู 3.3)

### 3.3 สต็อกรางวัล (reserve → confirm → release)
- ✅ `stockTotal Int?` — null = ไม่จำกัด
- ✅ ตัวนับ 2 ตัว: `stockReserved` (PENDING ค้างอยู่), `stockFulfilled` (รับแล้ว)
  - คงเหลือแสดงผล = `stockTotal - stockReserved - stockFulfilled`
- ✅ **จองตอนกดแลก** (reserve): conditional update กัน race —
  `UPDATE "Reward" SET "stockReserved" = "stockReserved"+1 WHERE id=? AND ("stockTotal" IS NULL OR "stockReserved"+"stockFulfilled" < "stockTotal")` → 0 แถว = สต็อกหมด → abort ทั้ง transaction (แต้มไม่ถูกหัก)
- ✅ **confirm ตอน fulfill**: `stockReserved -1, stockFulfilled +1`
- ✅ **คืนสต็อก** เมื่อ EXPIRED (cron) หรือ CANCELLED: `stockReserved -1`
- ✅ เติม/แก้สต็อก: owner แก้ `stockTotal` ได้ (ห้ามต่ำกว่า `stockReserved+stockFulfilled` — validate)
- 🔜 แจ้งเตือน owner เมื่อสต็อกเหลือ ≤ threshold

### 3.4 Flow แลก + Redemption code/QR
- ✅ ลูกค้ากดแลกบน storefront (ต้อง login เป็น member ของ tenant นี้)
- ✅ Transaction เดียว: ตรวจเงื่อนไข → reserve สต็อก → `point.burn` (contract 2.2) → สร้าง `RewardRedemption` (PENDING) — ล้มข้อไหน rollback หมด
- ✅ Redemption code: 10 ตัวอักษร Crockford base32 (ตัด I,L,O,U กันอ่านผิด) จาก CSPRNG (`crypto.randomBytes`) — เดาไม่ได้, `@@unique([tenantId, code])`, ชนแล้ว retry สูงสุด 3 ครั้ง
- ✅ QR = encode code ตรงๆ (ไม่ฝัง URL — สแกนได้ทั้งกล้องแอปร้านและเครื่องอ่าน)
- ✅ อายุรับของ: `expiresAt = reservedAt + pickupWindowDays` (ตั้งได้ต่อรางวัล, default 14 วัน)
- ✅ Staff verify: พิมพ์ code หรือสแกน → เห็น preview (รูป+ชื่อรางวัล, ชื่อ member, สถานะ, หมดอายุ, หน่วยที่รับได้) → กด "ยืนยันส่งมอบ" → FULFILLED + tag `fulfilledUnitId`, `fulfilledByUserId`
- ✅ `DISCOUNT` type: ตอน fulfill ระบบเรียกโมดูล 8 ออก personal CouponCode ให้ member แล้วแนบ `issuedCouponCodeId` — หรือถ้ารางวัลตั้ง `autoFulfillDiscount=true` จะ fulfill ทันทีตอนแลก (ไม่ต้องมาโชว์หน้าร้าน) — decision v1: **DISCOUNT default auto-fulfill ทันที** (ลูกค้าได้คูปองเลย), PHYSICAL/FREE_SERVICE ต้องสแกนหน้าร้านเสมอ
- ✅ Cancel: owner/manager ยกเลิกรายการ PENDING ได้ พร้อมเลือก "คืนแต้ม" (default ✔) → `point.reverse({refType:'RewardRedemption', refId})` + คืนสต็อก + noti ลูกค้า — REVERSAL คืนแต้มเข้า lot ใหม่ **อายุ = อายุคงเหลือของ lot เดิม** (กัน age-pump — **ห้ามใช้ `point.adjust(+)` แทน** ตาม RESOLUTIONS D5) · ลูกค้ากดยกเลิกเองได้ภายใน 1 ชม.หลังแลก (คืนแต้มอัตโนมัติ เส้นเดียวกัน)
- ✅ Expire: cron รายชั่วโมง → PENDING ที่เลย `expiresAt` → EXPIRED + คืนสต็อก + noti (ไม่คืนแต้ม — ดู 1.)

### 3.5 การแจ้งเตือน (contract 2.5)
- ✅ แลกสำเร็จ → email/LINE: code + QR + วิธีรับ + หมดอายุ
- ✅ เตือนก่อนหมดอายุ 3 วัน (PENDING เท่านั้น)
- ✅ FULFILLED / CANCELLED / EXPIRED → แจ้งผล
- 🔜 แจ้ง staff ประจำหน่วยเมื่อมีการแลกรางวัลที่รับได้หน่วยนั้น

---

## 4. Data Model (Prisma)

> ทุก model มี `tenantId` (tenant-scoped) — Prisma extension inject อัตโนมัติ · เงิน `Int` สตางค์ · เวลา UTC
> relation ไป `Tenant`, `CustomerProfile`(Member 06), `User`, `BusinessUnit`, `PointLedger`(09), `CouponCode`(08) เป็น FK scalar + comment (สองฝั่งอยู่ schema กลาง)

```prisma
enum RewardType {
  PHYSICAL_ITEM   // ของชิ้น รับหน้าร้าน
  DISCOUNT        // ออกเป็น CouponCode (โมดูล 8)
  FREE_SERVICE    // บริการฟรี ใช้สิทธิ์หน้างาน
}

enum RewardStatus {
  DRAFT
  ACTIVE
  PAUSED
  ARCHIVED
}

enum RedemptionStatus {
  PENDING     // จองแล้ว หักแต้มแล้ว รอรับของ/ใช้สิทธิ์
  FULFILLED   // รับของ/ใช้สิทธิ์แล้ว
  EXPIRED     // เลยกำหนดรับ — คืนสต็อก ไม่คืนแต้ม (v1)
  CANCELLED   // ยกเลิก — คืนสต็อก + คืนแต้มถ้าเลือก
}

model Reward {
  id            String       @id @default(cuid())
  tenantId      String       // FK → Tenant
  type          RewardType
  status        RewardStatus @default(DRAFT)

  // เนื้อหา TH/EN
  nameTh        String
  nameEn        String?
  descriptionTh String?      @db.Text
  descriptionEn String?      @db.Text
  images        Json         @default("[]")  // [{url, alt?}] สูงสุด 5, ตัวแรก = cover

  // ราคาแต้ม + ต้นทุน
  pointCost     Int                          // แต้มที่ใช้แลก (> 0)
  costSatang    Int          @default(0)     // ต้นทุนจริงต่อชิ้น (สตางค์) — รายงานภายใน

  // เงื่อนไข
  minTierLevel           Int?               // อ้าง MemberTier.level (โมดูล 6), null = ทุกคน
  limitPerMember         Int?               // ครั้ง/คน ตลอดอายุรางวัล
  limitPerMemberPerMonth Int?               // ครั้ง/คน/เดือนปฏิทิน (Asia/Bangkok)
  startsAt               DateTime?
  endsAt                 DateTime?
  applicableUnitIds      Json?              // ["unitId1", ...] | null = ทุกหน่วย
  pickupWindowDays       Int      @default(14) // อายุรับของหลังกดแลก

  // สต็อก
  stockTotal     Int?                        // null = ไม่จำกัด
  stockReserved  Int          @default(0)
  stockFulfilled Int          @default(0)

  // DISCOUNT type — ผูกแคมเปญคูปองที่จะออกโค้ดให้ (โมดูล 8)
  discountCampaignId  String?                // FK → CouponCampaign (kind=COUPON, distribution=PERSONAL)
  autoFulfillDiscount Boolean  @default(true) // DISCOUNT: fulfill ทันทีตอนแลก

  sortOrder     Int          @default(0)
  archivedAt    DateTime?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  redemptions   RewardRedemption[]

  @@index([tenantId, status, sortOrder])
  @@index([tenantId, type])
}

model RewardRedemption {
  id         String           @id @default(cuid())
  tenantId   String           // FK → Tenant
  rewardId   String
  reward     Reward           @relation(fields: [rewardId], references: [id])
  memberId   String           // FK → CustomerProfile (โมดูล 6, contract 2.6)
  status     RedemptionStatus @default(PENDING)

  code       String           // Crockford base32 10 ตัว — ใส่ใน QR
  // snapshot ณ เวลาแลก (เอกสารธุรกรรม — freeze ได้ตาม contract 2.6)
  rewardNameTh    String
  rewardNameEn    String?
  pointCost       Int          // แต้มที่หักจริง
  costSatang      Int          // ต้นทุน ณ เวลาแลก — ใช้รายงานต่อหน่วย

  reservedAt      DateTime     @default(now())
  expiresAt       DateTime     // reservedAt + pickupWindowDays

  // fulfill
  fulfilledAt       DateTime?
  fulfilledUnitId   String?    // FK → BusinessUnit — หน่วยที่รับของ/ใช้สิทธิ์ (บังคับตอน FULFILLED)
  fulfilledByUserId String?    // FK → User (staff ที่กดยืนยัน)
  issuedCouponCodeId String?   // DISCOUNT: FK → CouponCode ที่ออกให้ (โมดูล 8)

  // cancel
  cancelledAt       DateTime?
  cancelledByUserId String?    // null = ลูกค้ายกเลิกเอง
  cancelReason      String?
  pointsRefunded    Boolean    @default(false)

  // อ้าง ledger ฝั่ง Point (โมดูล 9) เพื่อ audit
  burnLedgerId      String?    // FK → PointLedger (รายการหักแต้ม)
  refundLedgerId    String?    // FK → PointLedger (รายการคืนแต้ม ถ้ามี)

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId, status, expiresAt])   // cron expire
  @@index([tenantId, memberId, status])    // นับ limit ต่อคน + "รางวัลของฉัน"
  @@index([tenantId, rewardId, status])    // รายงานยอดนิยม
  @@index([tenantId, fulfilledUnitId])     // รายงานต้นทุนต่อหน่วย
}
```

หมายเหตุ schema:
- นับ limit ต่อคน = `count(RewardRedemption where memberId, rewardId, status in [PENDING,FULFILLED])` ภายใน transaction แลก (อ่านหลัง lock แถว Reward ด้วย conditional update → กันนับพลาดระดับ practical; กรณี strict ใช้ `SELECT ... FOR UPDATE` ที่แถว CustomerProfile)
- ไม่มี hard delete — Reward ใช้ `ARCHIVED + archivedAt`, Redemption เป็นเอกสารธุรกรรม เก็บตลอด
- `AuditLog` กลาง (ดู _CONVENTIONS ข้อ 5) บันทึกทุก action ที่แตะแต้ม/สต็อก: redeem, fulfill, cancel, แก้ stockTotal, แก้ pointCost

---

## 5. API Endpoints

> สิทธิ์ตรวจผ่าน `can(user, { tenantId, unitId?, module: 'REWARD', action })` — Reward เป็น tenant-level ตรวจ 3 มิติ ยกเว้น fulfill ตรวจ unitId ด้วย (มิติที่ 4)
> ทุก endpoint dashboard อยู่ใต้ session (app) · storefront อยู่ใต้ session customer

### Dashboard (app)

| Method | Path | ทำอะไร | สิทธิ์ (action) |
|---|---|---|---|
| GET | `/api/rewards` | list + filter (status, type, q) + สต็อกคงเหลือ | `reward.read` |
| POST | `/api/rewards` | สร้างรางวัล (payload = ฟิลด์ Reward ทั้งหมด) | `reward.write` |
| GET | `/api/rewards/[id]` | รายละเอียด + สถิติย่อ (แลกแล้ว/ค้างรับ) | `reward.read` |
| PATCH | `/api/rewards/[id]` | แก้ไข (validate stockTotal ≥ reserved+fulfilled) | `reward.write` |
| POST | `/api/rewards/[id]/archive` | เก็บถาวร (แทน DELETE) | `reward.write` |
| POST | `/api/rewards/images/upload` | อัปรูป → object storage → คืน URL | `reward.write` |
| GET | `/api/rewards/redemptions` | list redemption + filter (status, rewardId, memberId, unitId, ช่วงวัน) — Manager เห็นเฉพาะ fulfilledUnitId ในหน่วยตน + PENDING ที่รับได้หน่วยตน | `reward.redemption.read` |
| GET | `/api/rewards/redemptions/[id]` | รายละเอียด + timeline | `reward.redemption.read` |
| POST | `/api/rewards/redemptions/verify` | `{ code }` → preview (member, รางวัล, สถานะ, expiresAt, applicableUnits) — **ไม่เปลี่ยนสถานะ** · rate limit 20 ครั้ง/นาที/user กันไล่เดา code | `reward.fulfill` |
| POST | `/api/rewards/redemptions/[id]/fulfill` | `{ unitId }` → FULFILLED (ตรวจ applicableUnitIds + unitAccess ของ staff + สถานะ PENDING + ยังไม่หมดอายุ) | `reward.fulfill` (4 มิติ: ต้องมีสิทธิ์ unit นั้น) |
| POST | `/api/rewards/redemptions/[id]/cancel` | `{ reason, refundPoints: boolean }` → CANCELLED + คืนสต็อก (+ `point.reverse` ถ้า refund — คงอายุ lot เดิม) | `reward.cancel` |
| GET | `/api/rewards/reports/summary` | KPI ช่วงวัน: แลก/รับจริง/expire, แต้ม burn, ต้นทุนรวม | `reward.report` |
| GET | `/api/rewards/reports/by-reward` | ยอดนิยมรายรางวัล | `reward.report` |
| GET | `/api/rewards/reports/by-unit` | ต้นทุน + จำนวน fulfill ต่อหน่วย | `reward.report` |

### Storefront (store — ลูกค้า)

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/store/[tenantSlug]/rewards` | รางวัล ACTIVE ในช่วงเวลา, แนบ "แลกได้ไหม" ต่อรายการ (แต้มพอ/tier ถึง/สต็อกเหลือ/ยังไม่เกิน limit) + หน่วยที่รับได้ |
| GET | `/api/store/[tenantSlug]/rewards/[id]` | รายละเอียดรางวัล |
| POST | `/api/store/[tenantSlug]/rewards/[id]/redeem` | **แลก** (ต้อง login) — transaction ตามข้อ 7.1 · คืน `{ redemptionId, code, expiresAt }` · rate limit 5 ครั้ง/นาที/member · idempotency key จาก client (`Idempotency-Key` header) กันกดซ้ำ |
| GET | `/api/store/[tenantSlug]/me/redemptions` | "รางวัลของฉัน" (ทุกสถานะ, PENDING ขึ้นก่อน) |
| GET | `/api/store/[tenantSlug]/me/redemptions/[id]` | รายละเอียด + QR |
| POST | `/api/store/[tenantSlug]/me/redemptions/[id]/cancel` | ลูกค้ายกเลิกเอง (ภายใน 60 นาทีหลังแลก, PENDING เท่านั้น) → คืนแต้ม+สต็อกอัตโนมัติ |

### Cron (internal)

| Path | ทำอะไร |
|---|---|
| `/api/cron/rewards/expire` (รายชั่วโมง, header `X-Cron-Secret`) | PENDING เลย expiresAt → EXPIRED + คืนสต็อก + noti · เตือนล่วงหน้า 3 วัน (ส่งครั้งเดียว — เช็คจาก NotificationLog กลาง) |

---

## 6. UI Screens

> B&W minimal, i18n TH/EN, responsive mobile-first, ทุกหน้า: empty/loading/error state

### Dashboard `(app)` — เมนูโซน tenant-level "รางวัล"
1. **`/app/rewards`** — ตารางแคตตาล็อก: cover, ชื่อ, ประเภท, แต้ม, สต็อก (เหลือ/จอง/รับแล้ว), สถานะ, ช่วงเวลา · filter + search · ปุ่ม "สร้างรางวัล" · มือถือ = card list
2. **`/app/rewards/new` + `/app/rewards/[id]/edit`** — ฟอร์ม 4 ส่วน: (ก) ข้อมูล+รูป TH/EN (ข) แต้ม/ต้นทุน (ค) เงื่อนไข (tier dropdown จากโมดูล 6, limit, ช่วงเวลา, **multi-select หน่วย** — default "ทุกกิจการ") (ง) สต็อก+อายุรับของ · DISCOUNT type โชว์ dropdown เลือกแคมเปญคูปอง (ลิงก์ไปสร้างในโมดูล 8 ถ้ายังไม่มี)
3. **`/app/rewards/redemptions`** — ตารางรายการแลก: code, member, รางวัล, สถานะ (badge), หมดอายุ, หน่วยที่รับ · filter สถานะ/หน่วย/ช่วงวัน · row action: ดู/ยกเลิก
4. **`/app/rewards/redemptions/[id]`** — รายละเอียด + timeline (แลก→เตือน→รับ/หมดอายุ/ยกเลิก) + ปุ่ม fulfill/cancel + ลิงก์ member profile + ลิงก์ PointLedger
5. **`/app/rewards/scan`** — หน้าสแกน (เปิดกล้อง + ช่องพิมพ์ code ใหญ่ๆ สำหรับมือถือหน้าร้าน): สแกนแล้วโชว์ preview card (รูป, ชื่อรางวัล, ชื่อลูกค้า, หมดอายุ, "รับได้ที่หน่วยนี้ไหม" ✓/✕) → ปุ่มยืนยันส่งมอบ · ถ้า staff มีสิทธิ์หลายหน่วย: dropdown เลือกหน่วยก่อนยืนยัน (default = หน่วยล่าสุดที่ใช้)
6. **`/app/rewards/reports`** — 3 แท็บ: ภาพรวม (KPI + กราฟ burn รายวัน), รายรางวัล (ตารางยอดนิยม), รายหน่วย (ต้นทุน)

### Storefront `(store)` — `/s/[tenantSlug]/rewards` (+ custom domain)
7. **แคตตาล็อกรางวัล** — header โชว์แต้มคงเหลือ + tier ของฉัน · grid card: รูป, ชื่อ, แต้ม, ป้าย "เหลือ n ชิ้น" เมื่อ ≤ 10, ป้ายหน่วยที่รับได้ · card ที่แลกไม่ได้ (แต้มไม่พอ/tier ไม่ถึง/หมด) แสดง disabled + เหตุผล · ยังไม่ login = ดูได้ กดแลก → ชวน login
8. **รายละเอียดรางวัล + ยืนยันแลก** — รูป carousel, คำอธิบาย, เงื่อนไขครบ (tier, limit, รับได้ที่ไหน, อายุรับของ) → ปุ่มแลก → bottom-sheet ยืนยัน: "ใช้ 800 แต้ม (คงเหลือ 400)" → สำเร็จโชว์ code/QR ทันที
9. **รางวัลของฉัน** — `/s/[tenantSlug]/me/rewards`: list PENDING (code+QR+countdown หมดอายุ+ปุ่มยกเลิกภายใน 1 ชม.) / ประวัติ (FULFILLED/EXPIRED/CANCELLED) · หน้า QR เต็มจอ ปรับ brightness-friendly (พื้นขาว QR ดำ ใหญ่)

มือถือ: ปุ่มแลก/ยืนยันเป็น sticky bottom bar · หน้าสแกน staff ออกแบบ mobile-first (ใช้มือถือร้านเป็นหลัก)

---

## 7. Business Flows

### 7.1 แลกรางวัล (storefront) — happy path + failure

```
Customer กดแลก (rewardId, Idempotency-Key)
└─ ตรวจ session member ∈ tenant → 401/403
└─ BEGIN TRANSACTION (Serializable ไม่จำเป็น — ใช้ conditional update + row lock)
   1. SELECT Reward (สถานะ ACTIVE, อยู่ในช่วง startsAt..endsAt) → ไม่ผ่าน: 409 REWARD_NOT_AVAILABLE
   2. ตรวจ tier: `MemberTier.level` ของสมาชิก (อ่านผ่าน relation `member.tier.level` — CustomerProfile ไม่มี field tierLevel ตรง, D17) >= minTierLevel → 409 TIER_TOO_LOW
   3. นับ limit ต่อคน (ตลอดชีพ + เดือนนี้ตาม Asia/Bangkok) → 409 LIMIT_REACHED
   4. Reserve สต็อก: conditional UPDATE (ข้อ 3.3) → 0 แถว: 409 OUT_OF_STOCK
   5. point.burn({ tenantId, memberId, unitId: null, points: pointCost,
        refType: 'RewardRedemption', refId: <id ที่ gen ไว้ก่อน>,
        idempotencyKey: 'RewardRedemption:{id}:burn', reason: 'REWARD_REDEEM', tx })
        — signature 2.2 v2: ส่ง `points` เป็น**จำนวนบวก** (ไม่ใช่ delta ติดลบ) + `idempotencyKey` บังคับ + ส่ง `tx` ร่วม transaction เดียวกัน (09 join ไม่เปิด tx ซ้อน)
        — **lock ordering ตายตัว**: Reward lock แถวตัวเองก่อน (ขั้น 4) → Point lock PointBalance ทีหลัง (กัน deadlock ตาม 09 §5.1)
        — Point ตรวจ balance ใน lock → แต้มไม่พอ: throw → ROLLBACK (สต็อกคืนอัตโนมัติเพราะ rollback)
   6. สร้าง RewardRedemption (PENDING, code สุ่ม, snapshot ชื่อ/แต้ม/ต้นทุน, expiresAt, burnLedgerId)
   7. ถ้า type=DISCOUNT && autoFulfillDiscount: ออก CouponCode (โมดูล 8, ใน tx เดียวกัน)
        → set FULFILLED ทันที (fulfilledUnitId = null — ไม่ผูกหน่วยเพราะไม่มีการรับของ), stockReserved→stockFulfilled
   COMMIT
└─ นอก transaction: notify(member, template REWARD_REDEEMED, {code, qr, expiresAt}) + AuditLog
   + `activity.log({ module:'REWARD', type:'REWARD_REDEEM', refType:'RewardRedemption', refId, title })` ผ่าน outbox กลาง (contract 2.7)
└─ Idempotency-Key ซ้ำภายใน 24 ชม. → คืน response เดิม ไม่แลกซ้ำ
```

### 7.2 Staff fulfill หน้าร้าน

```
Staff เปิด /app/rewards/scan → สแกน QR / พิมพ์ code
└─ POST verify {code} → คืน preview + คำเตือนถ้า (หมดอายุ | หน่วยปัจจุบันไม่อยู่ใน applicableUnitIds | สถานะไม่ใช่ PENDING)
└─ Staff กดยืนยัน → POST fulfill {unitId}
   BEGIN TX
   1. SELECT redemption FOR UPDATE — status ต้อง PENDING → ไม่ใช่: 409 (โชว์สถานะจริง เช่น "รับไปแล้วเมื่อ 12:03 โดย สมชาย")
   2. now() <= expiresAt → เลย: 409 EXPIRED (ให้ cron/on-demand ตั้ง EXPIRED)
   3. unitId ∈ applicableUnitIds (ถ้าไม่ null) → 409 WRONG_UNIT ("รางวัลนี้รับได้ที่ โรงแรม A เท่านั้น")
   4. can(staff, {tenantId, unitId, module:'REWARD', action:'reward.fulfill'}) → 403
   5. UPDATE: FULFILLED, fulfilledAt/UnitId/ByUserId · Reward: stockReserved-1, stockFulfilled+1
   COMMIT → noti ลูกค้า + AuditLog
```

### 7.3 ยกเลิก (owner/manager หรือลูกค้าใน 1 ชม.)

```
POST cancel {reason, refundPoints}
BEGIN TX
1. FOR UPDATE, status=PENDING เท่านั้น (FULFILLED ห้ามยกเลิก — ของส่งมอบแล้ว, ต้องใช้ point.adjust แยกเป็นกรณีพิเศษ)
2. UPDATE → CANCELLED (+cancelledByUserId/reason) · คืนสต็อก stockReserved-1
3. ถ้า refundPoints: point.reverse({ tenantId, refType:'RewardRedemption', refId,
     reason:'REWARD_CANCEL', idempotencyKey:'RewardRedemption:{id}:reverse' })
   — **ไม่ใช่ adjust(+)** (RESOLUTIONS D5): REVERSAL คืนแต้มเข้า lot ใหม่ อายุ = อายุคงเหลือของ lot เดิมที่ถูกตัด
     (กลไก 09 §3.4 — กันลูกค้าแลก-แล้ว-ยกเลิกเพื่อปั๊มอายุแต้มใหม่เต็มรอบ)
   → เก็บ refundLedgerId, pointsRefunded=true
COMMIT → noti + AuditLog
* ลูกค้ายกเลิกเอง: refundPoints บังคับ true, ตรวจ now() - reservedAt <= 60 นาที
```

### 7.4 หมดอายุ (cron รายชั่วโมง)

```
เลือก PENDING ที่ expiresAt < now() ทีละ batch (100) — ต่อแถว:
TX: FOR UPDATE ยังเป็น PENDING → EXPIRED + stockReserved-1 → noti
(แต้มไม่คืน v1 — owner ตามคืนรายกรณีผ่าน `point.reverse` เส้นเดียวกับ 7.3 — คงอายุ lot เดิม, ห้ามใช้ adjust+)
+ รอบเดียวกัน: PENDING ที่จะหมดอายุใน 3 วัน & ยังไม่เคยเตือน → notify เตือน
```

---

## 8. Integration (contract ข้อ 2 ของ _CONVENTIONS)

| Contract | ใช้ตรงไหน |
|---|---|
| **2.2 Point (v2)** | `point.burn({ points: บวก, idempotencyKey, tx })` ตอนแลก (7.1 ข้อ 5, join DB transaction เดียวกันผ่าน `tx?`) · `point.reverse({refType:'RewardRedemption', refId})` ตอนคืนแต้ม/ยกเลิก (7.3, 7.4 กรณี owner คืน) — **คงอายุ lot เดิม กัน age-pump, ห้ามใช้ adjust แทน (D5)** — Reward **ไม่แตะ** ตาราง PointLedger ตรง, อ้างผ่าน `burnLedgerId/refundLedgerId` ที่ service คืนมา · `unitId: null` ตอน burn (แลกจาก storefront ไม่ผูกหน่วย) — รายงาน "แต้มถูก burn ที่หน่วยไหน" ใช้ `fulfilledUnitId` ฝั่ง Redemption แทน |
| **2.3 Coupon** | รางวัล type DISCOUNT → เรียก service ภายในโมดูล 8: `couponService.issuePersonalCode({ tenantId, campaignId: reward.discountCampaignId, memberId, issuedVia: 'REWARD', refId: redemptionId })` — เงื่อนไขส่วนลด/หน่วย/วันหมดอายุเป็นของแคมเปญคูปองนั้น |
| **2.5 Notification** | `notify()` 5 จุด: แลกสำเร็จ / เตือน 3 วัน / FULFILLED / CANCELLED / EXPIRED — template TH/EN |
| **2.6 Member** | อ้าง `memberId` เสมอ · snapshot เฉพาะชื่อรางวัล+แต้มลงเอกสาร Redemption (freeze ได้) · อ่าน tier ณ เวลาแลกผ่าน **`MemberTier.level`** (relation `member.tier.level` หรือ `member.getProfile` — CustomerProfile **ไม่มี** field `tierLevel` ตรง, RESOLUTIONS D17) |
| **2.7 Activity** | แลกสำเร็จ → `activity.log({ module:'REWARD', type:'REWARD_REDEEM', refType:'RewardRedemption', refId })` ผ่าน outbox กลาง — Reward เป็น producer บังคับตามตาราง RESOLUTIONS D6 (7.1 ขั้นนอก tx) |
| **2.1 POS / 2.4 Account** | **ไม่เกี่ยว v1** — การแลกไม่ใช่ธุรกรรมเงิน · 🔜 option ส่ง posting ต้นทุนรางวัล (`journal: 'EXPENSE'`, accountCode ค่าใช้จ่ายการตลาด) เข้า Account ตอน fulfill เพื่อบัญชีครบวงจร |

Assumption ข้ามโมดูล (ยืนยันหลัง QC แล้ว):
1. โมดูล 6 มี `MemberTier { level Int }` ✅ — อ่านผ่าน relation `CustomerProfile.tier.level` (**ไม่มี** field `tierLevel` denormalized — D17)
2. โมดูล 9 expose `point.burn/reverse` ที่ **ร่วม transaction Prisma เดียวกันได้** ✅ ยืนยันแล้ว — 2.2 v2 ทุก mutation รับ `tx?` optional (RESOLUTIONS D5) และ throw เมื่อ balance ไม่พอ
3. โมดูล 8 มี `issuePersonalCode()` + แคมเปญ distribution PERSONAL
4. มี NotificationLog กลางกันส่งเตือนซ้ำ

---

## 9. Permissions (action × role)

module key = `REWARD` · Manager/Staff จำกัดด้วย `unitAccess` เฉพาะ action ที่มีมิติ unit (fulfill) — action ระดับ tenant (จัดแคตตาล็อก) ให้เฉพาะที่ระบุ

| Action | OWNER | MANAGER | STAFF | หมายเหตุ |
|---|---|---|---|---|
| `reward.read` (ดูแคตตาล็อก) | ✅ | ✅ | ✅ | staff เห็น read-only เพื่อคุยกับลูกค้า |
| `reward.write` (สร้าง/แก้/archive/สต็อก/รูป) | ✅ | ❌ (custom เปิดได้) | ❌ | แตะต้นทุน/แต้ม = owner เท่านั้น default |
| `reward.redemption.read` | ✅ ทุกหน่วย | ✅ เฉพาะ scope หน่วยตน | ✅ เฉพาะที่ตัวเอง fulfill | |
| `reward.fulfill` (verify+ยืนยันส่งมอบ) | ✅ | ✅ (unit ∈ unitAccess) | ✅ (unit ∈ unitAccess) | ตรวจ 4 มิติ |
| `reward.cancel` (+เลือกคืนแต้ม) | ✅ | ✅ (custom ปิดได้) | ❌ | แตะแต้ม → AuditLog เสมอ |
| `reward.report` | ✅ | ✅ (เห็นเฉพาะหน่วยตนใน by-unit) | ❌ | |

- ทุก action ใน `Membership.permissions` custom ได้รายคน (เปิด/ปิดเกิน default)
- Customer (storefront): แลก/ดู/ยกเลิกของตัวเองเท่านั้น — ownership check `memberId = session.memberId` ทุก endpoint `me/*`

---

## 10. Reports & Metrics

| รายงาน | เนื้อหา | มิติ |
|---|---|---|
| **ภาพรวม (summary)** | จำนวนแลก, รับจริง, expire rate, cancel rate, แต้ม burn รวม, ต้นทุนรวม (Σ costSatang ของ FULFILLED) | ช่วงวัน, กราฟรายวัน/รายเดือน |
| **รางวัลยอดนิยม (by-reward)** | ต่อรางวัล: ครั้งที่แลก, แต้ม burn, fulfill rate, สต็อกคงเหลือ, ต้นทุนสะสม | sort ได้, export CSV |
| **ต้นทุนต่อหน่วย (by-unit)** | ต่อ BusinessUnit: จำนวน fulfill, Σ costSatang, Σ แต้มที่ผูกกับหน่วย — จาก `fulfilledUnitId` (DISCOUNT auto-fulfill ไม่มีหน่วย → แถว "ไม่ระบุหน่วย") | เดือน/ช่วงวัน |
| **Funnel** | PENDING → FULFILLED กี่ %, เวลาเฉลี่ยจากแลกถึงรับ, expire ทิ้งกี่ % | ต่อรางวัล |
| **แต้ม burn เทียบ earn** 🔜 | ดึงร่วมกับโมดูล 9 — health ของ loyalty program (burn/earn ratio) | |

Metric ที่ dashboard Overview ("ทุกกิจการ") ใช้: แต้ม burn วันนี้ + รายการรอรับของ (แถบรวมบน ตาม BLUEPRINT_BUSINESS_UNITS ข้อ 4)

---

## 11. Edge Cases & Rules

1. **Race สต็อกชิ้นสุดท้าย** — reserve ด้วย conditional UPDATE แถวเดียว (atomic ระดับ DB) — สองคนกดพร้อมกัน ได้คนเดียว อีกคนได้ OUT_OF_STOCK ก่อนแต้มถูกหัก
2. **กดแลกซ้ำ (double-tap / network retry)** — `Idempotency-Key` ต่อ request เก็บ 24 ชม. → คืนผลเดิม · ปุ่ม UI disabled ระหว่างรอ
3. **แต้มไม่พอแต่สต็อกถูกจองไปแล้วใน tx** — ลำดับใน 7.1 จอง stock ก่อน burn ก็จริง แต่ทั้งหมดอยู่ transaction เดียว → burn fail = rollback stock อัตโนมัติ ไม่มีสต็อกรั่ว
4. **Fulfill ชนกัน 2 เคาน์เตอร์** — `SELECT FOR UPDATE` ที่แถว redemption → เครื่องที่สองเห็น "รับไปแล้ว โดยใคร เมื่อไหร่"
5. **Fulfill ผิดหน่วย** — ตรวจ `applicableUnitIds` ฝั่ง server เสมอ (อย่าเชื่อ preview ฝั่ง client) — ข้อ 8.6 ของ BLUEPRINT_BUSINESS_UNITS
6. **หมดอายุพอดีวินาทีที่สแกน** — fulfill ตรวจ `now() <= expiresAt` ใน tx; cron ที่มาทีหลังเจอสถานะ FULFILLED แล้วก็ข้าม (cron ก็ FOR UPDATE + เช็คสถานะซ้ำ)
7. **แก้ `pointCost`/`costSatang` หลังมีคนแลกค้าง** — redemption เก็บ snapshot → รายการเก่าไม่กระทบ · ปุ๊บที่แก้ มีผลเฉพาะการแลกใหม่
8. **ลด `stockTotal` ต่ำกว่าที่จอง+รับไปแล้ว** — validate ฝั่ง API → 422 พร้อมบอกตัวเลขขั้นต่ำ
9. **Reward ถูก PAUSED/ARCHIVED ระหว่างมีของค้างรับ** — redemption PENDING ยัง fulfill ได้ตาม expiresAt เดิม (สัญญากับลูกค้าต้อง honor) — เฉพาะการแลกใหม่ที่ถูก block
10. **Tier ลดระหว่างรอรับ** — ตรวจ tier ณ เวลาแลกเท่านั้น (ตัดสินใจแล้ว — จบที่จุดแลก)
11. **Unit ใน applicableUnitIds ถูก PAUSED/ARCHIVED** — ตอนแสดง storefront กรองเฉพาะ unit ACTIVE; ถ้าทุก unit ของรางวัลไม่ ACTIVE → ซ่อนรางวัล + แจ้ง owner บน dashboard (badge เตือน) · redemption ค้าง: อนุญาต fulfill ที่ unit PAUSED ได้ (honor ของเดิม ตาม edge case 4 ของ BLUEPRINT_BUSINESS_UNITS)
12. **member ถูก merge/ลบ (โมดูล 6)** — ✅ ยืนยันแล้ว (RESOLUTIONS D6): 06 §7.3 step f ย้าย `RewardRedemption.memberId` → target ใน transaction merge (Reward ไม่จัดการเอง) · หลัง merge `limitPerMember`/`limitPerMemberPerMonth` นับรวมแบบ **union** (แถวที่ย้ายมาถูกนับด้วย query เดิมอัตโนมัติ — intended)
13. **Code ชน** — โอกาส ~0 (32^10) แต่ retry 3 ครั้ง, ครั้งที่ 4 = 500 + alert
14. **กันไล่เดา code** — verify มี rate limit ต่อ user + ต้องมีสิทธิ์ `reward.fulfill` อยู่แล้ว (endpoint ไม่ public) · code ไม่เรียงลำดับ ไม่มี prefix เดาได้
15. **เวลาเดือนปฏิทิน** — limitPerMemberPerMonth ตัดรอบตาม Asia/Bangkok (ไม่ใช่ UTC) — ระบุใน query ให้ชัด (`date_trunc` ด้วย timezone)
16. **i18n fallback** — nameEn ว่าง → โชว์ nameTh ทั้งสองภาษา (ห้าม string ว่าง)
17. **เอกสาร immutable** — Redemption ที่จบสถานะแล้ว (FULFILLED/EXPIRED/CANCELLED) ห้ามแก้ทุก field — enforce ที่ service layer

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional**
- [ ] สร้างรางวัลครบ 3 ประเภท + รูป + TH/EN แล้วแสดงบน storefront ถูกต้อง (fallback EN→TH)
- [ ] แลกสำเร็จ: แต้มถูกหักตรง pointCost, PointLedger มีรายการ refType=RewardRedemption, สต็อก reserved +1, ได้ code/QR, noti ออก
- [ ] แต้มไม่พอ / tier ไม่ถึง / เกิน limit (ตลอดชีพ+รายเดือน) / นอกช่วงเวลา / สต็อกหมด → แลกไม่ได้ + error message ตรงเหตุผล + **แต้มและสต็อกไม่เปลี่ยน**
- [ ] Fulfill: สแกน/พิมพ์ code → FULFILLED, tag unitId+userId, สต็อกย้าย reserved→fulfilled, noti ออก
- [ ] Fulfill ผิดหน่วย (ไม่อยู่ใน applicableUnitIds) → block พร้อมบอกหน่วยที่ถูก
- [ ] Cancel พร้อมคืนแต้ม → แต้มกลับเต็มผ่าน `point.reverse` (ledger type REVERSAL, lot ใหม่อายุ = คงเหลือของ lot เดิม — ไม่ใช่ ADJUST), สต็อกคืน, ledger refund อ้าง redemption เดิม
- [ ] Cron expire: ตั้ง EXPIRED + คืนสต็อก + noti, ไม่คืนแต้ม, เตือนล่วงหน้า 3 วันส่งครั้งเดียว
- [ ] DISCOUNT auto-fulfill: ได้ CouponCode ส่วนตัวทันที + redemption เป็น FULFILLED
- [ ] Idempotency-Key ซ้ำ → ไม่แลกซ้ำ ไม่หักแต้มซ้ำ

**Race / Atomicity (ทดสอบ concurrent จริง)**
- [ ] ยิง redeem พร้อมกัน 10 request ที่สต็อกเหลือ 1 → สำเร็จ 1 เท่านั้น, แต้มถูกหักคนเดียว
- [ ] fulfill พร้อมกัน 2 จุด → สำเร็จ 1, อีกจุดเห็นสถานะ+ผู้รับ
- [ ] point.burn fail กลาง tx → ไม่มี redemption ค้าง, สต็อกไม่รั่ว (นับ reserved กลับมาเท่าเดิม)

**Isolation (multi-tenant/unit)**
- [ ] code ของ tenant A ใช้ verify ใน tenant B ไม่เจอ (unique per tenant + tenantId inject)
- [ ] Manager หน่วย A ไม่เห็น redemption fulfilled หน่วย B ใน list
- [ ] storefront tenant A ไม่เห็นรางวัล tenant B

**i18n / UI**
- [ ] ทุกหน้า TH/EN สลับได้, empty/loading/error ครบ, mobile: sticky CTA + หน้าสแกนใช้กล้องได้
- [ ] จำนวนเงินแสดงจากสตางค์ → บาท ถูกต้อง (÷100, ไม่มี float)

**Audit / Security**
- [ ] AuditLog ครบ: redeem, fulfill, cancel, แก้สต็อก/แต้ม (who/before/after)
- [ ] rate limit redeem + verify ทำงาน (ยิงเกิน → 429)
- [ ] endpoint `me/*` ปลอม redemptionId คนอื่น → 404/403 (ownership check)
