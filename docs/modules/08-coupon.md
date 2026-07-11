# โมดูล 8 — Coupon & Voucher

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)

> scope: **TENANT** (+ `applicableUnitIds` จำกัดหน่วยได้) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> โมดูลนี้เป็น **provider ของ contract 2.3** (`coupon.validate` / `coupon.redeem`) — POS/Booking/Hotel/Ticket เป็นผู้เรียก ห้ามโมดูลอื่นแตะตารางคูปองตรง
> พึ่งพา: **Member (06)** = segment สำหรับแจกโค้ดเฉพาะคน · **POS (14)** = จุด redeem/void ผ่าน PosSale · **Reward (07)** = ผู้เรียก `issuePersonalCode` (รางวัลประเภทส่วนลด)
> เฟสตาม roadmap: Phase 4 (Engagement)

---

## 1. ภาพรวม + ขอบเขต

**ทำอะไร:** ร้านสร้าง "แคมเปญ" 2 ชนิด — **Coupon** (ส่วนลด %/บาท/ของแถม มีเงื่อนไขขั้นต่ำ/cap) และ **Voucher** (มูลค่าเงินตายตัว ใช้แทนเงินสด) → แจกเป็นโค้ด (สาธารณะ code เดียวหลายคน หรือเฉพาะคน unique ต่อ member) → ลูกค้าใส่โค้ดตอนจ่ายเงินในโมดูลไหนก็ได้ที่อนุญาต (POS/Booking/Hotel/Ticket) → validate โชว์ส่วนลด → redeem atomic ตอนปิดบิล ผูก `saleId` → void บิลแล้วคูปองคืนสถานะ → รายงาน attribution ว่าคูปองไหนดึงยอดเท่าไร

**หลักการ scope:** แคมเปญ/โค้ด/การใช้ เป็น **tenant-level** (ลูกค้าใช้โค้ดเดียวกันได้ทุกกิจการที่แคมเปญอนุญาต) — จำกัดหน่วยผ่าน `applicableUnitIds`, จำกัดโมดูลผ่าน `applicableModules` และทุก redemption tag `unitId + module` เพื่อ attribution รายหน่วย

### Decision ที่ตัดสินแล้ว (v1 — ห้ามเถียงตอน implement)
| เรื่อง | v1 | 🔜 |
|---|---|---|
| Voucher partial redeem | **ใช้ครั้งเดียวเต็มมูลค่า** — บิลน้อยกว่ามูลค่า voucher ส่วนต่างสละสิทธิ์ (แจ้งลูกค้าก่อนยืนยัน) | partial redeem + balance คงเหลือ |
| Stack คูปอง | **1 คูปอง/บิล** (PosSale ละ 1 redemption APPLIED) | stack ตาม priority + กติกา exclusivity |
| Auto-issue ตามเหตุการณ์ | ไม่ทำ | วันเกิด / tier up / ครบยอดสะสม (subscribe event จาก Member/Point) |
| ขาย Voucher เก็บเงิน (gift voucher) | ไม่ทำ — v1 voucher เป็นเครื่องมือตลาด (แจกฟรี) | ขายผ่าน POS → Account บันทึกเป็น liability, redeem ค่อยรับรู้รายได้ |
| ส่วนลดชนแต้ม | คิดแต้มจากยอด **หลังหักส่วนลด** (Point ใช้ `total` จาก PosSale — ฝั่ง POS รับผิดชอบ) | config ต่อ tenant |

### v1 (MVP) ทำ
- แคมเปญ Coupon: PERCENT (มี cap) / FIXED_AMOUNT / FREE_ITEM · ขั้นต่ำยอดซื้อ
- แคมเปญ Voucher: มูลค่าตายตัว ใช้เป็น "ส่วนลดเทียบเท่าเงินสด" ครั้งเดียว
- แจก: โค้ดสาธารณะ (1 code หลายคน + จำกัดครั้งรวม/ต่อคน), โค้ดเฉพาะคน (unique/member, แจกผ่าน segment ของโมดูล 6, ผ่าน Reward 07, หรือ manual รายคน)
- เงื่อนไข: ช่วงเวลา/วันหมดอายุ, จำกัดต่อคน, จำกัดครั้งรวม, เฉพาะโมดูล, เฉพาะหน่วย (applicableUnitIds), ขั้นต่ำ, cap
- Contract 2.3 เต็มรูป: validate (ตอนใส่โค้ด) → redeem (atomic ตอนปิดบิล ผูก saleId กันซ้ำด้วย transaction + partial unique index) → release (void บิล → คูปองคืนสถานะ)
- กันโกง: rate limit ลองโค้ดมั่ว + lockout, โค้ด CSPRNG เดาไม่ได้, AuditLog
- รายงาน attribution: ยอดขายที่คูปองดึงมา, ส่วนลดที่ให้, ROI, แยกหน่วย/โมดูล

### v1 ไม่ทำ (🔜)
- 🔜 คูปองแบบ referral (ชวนเพื่อน), flash sale ตามชั่วโมง, คูปองเฉพาะสินค้า/หมวดสินค้า (v1 ลดทั้งบิล)
- 🔜 Import โค้ดจากไฟล์ / sync โค้ดกับแพลตฟอร์มภายนอก
- 🔜 A/B testing แคมเปญ, คูปอง geo-based

---

## 2. Persona & User Stories

| Persona | Stories |
|---|---|
| **Owner** | สร้างแคมเปญ, กำหนดงบ (จำกัดครั้งรวม), แจก segment, ดู ROI ทุกหน่วย, ระงับแคมเปญที่โดน abuse ได้ทันที |
| **Manager** | ดูแคมเปญที่ใช้ได้ในหน่วยตน + รายงาน attribution หน่วยตน, (custom) สร้างแคมเปญเฉพาะหน่วยตนได้ |
| **Staff (แคชเชียร์)** | รับโค้ดจากลูกค้าที่หน้าจ่ายเงิน POS → ระบบ validate โชว์ส่วนลดอัตโนมัติ → ปิดบิล · void บิลแล้วไม่ต้องทำอะไรกับคูปอง (ระบบคืนให้) |
| **Customer** | รับโค้ดจากโฆษณา/ในวอลเล็ต "คูปองของฉัน" (โค้ดเฉพาะคน) → ใส่โค้ดตอนจอง/จ่าย → เห็นส่วนลดก่อนยืนยัน → ประวัติการใช้ |

ตัวอย่าง:
1. Owner สร้าง "SUMMER20" ลด 20% cap 200฿ ขั้นต่ำ 500฿ ใช้ได้ทุกหน่วย เฉพาะ POS+RESTAURANT จำกัด 500 ครั้ง 1 ครั้ง/คน → โพสต์ลง Facebook
2. Owner เลือก segment "ลูกค้า Gold ที่ไม่มา 60 วัน" (โมดูล 6) → แจกโค้ด unique voucher 100฿/คน หมดอายุ 30 วัน → ระบบ gen โค้ด + ส่ง noti รายคน
3. ลูกค้าจองห้องโรงแรม A ใส่ "SUMMER20" → invalid เพราะแคมเปญไม่ครอบ HOTEL → เห็นเหตุผลชัด
4. บิลถูก void ที่ POS → redemption เป็น VOIDED, สิทธิ์ลูกค้ากลับมาใช้ใหม่ได้

---

## 3. ฟังก์ชันทั้งหมด

### 3.1 แคมเปญ (CouponCampaign)
- ✅ ชนิด (`kind`): `COUPON` | `VOUCHER`
- ✅ COUPON — ชนิดส่วนลด (`discountType`):
  - `PERCENT`: `discountPercentBp` (basis points, `2000` = 20% — **Int ห้าม Float**) + `maxDiscountSatang?` (cap)
  - `FIXED_AMOUNT`: `discountValueSatang` (ลดเป็นเงิน, ไม่เกินยอดบิล — ลดแล้วบิลต่ำสุด 0)
  - `FREE_ITEM`: `freeItemNameTh/En` + `freeItemValueSatang` (มูลค่าของแถม ใช้ทำรายงานต้นทุน) — ส่วนลดบนบิล = 0, POS แสดงบรรทัดแจ้งพนักงานหยิบของแถม
- ✅ VOUCHER — `voucherValueSatang` มูลค่าตายตัว, ใช้ครั้งเดียวเต็มมูลค่า (discount จริง = `min(voucherValue, ยอดบิล)` ส่วนเกินสละสิทธิ์)
- ✅ เนื้อหา TH/EN: `nameTh/nameEn` (ชื่อที่ลูกค้าเห็นบนบิล/วอลเล็ต), `descriptionTh/En`, `termsTh/En` (เงื่อนไขตัวเล็ก)
- ✅ เงื่อนไขบิล: `minSpendSatang` (ยอดก่อนหักส่วนลด ≥ ขั้นต่ำ)
- ✅ ขอบเขต: `applicableModules Json` (subset ของ `["POS","RESTAURANT","BOOKING","HOTEL","TICKET"]` หรือ `["*"]`), `applicableUnitIds Json?` (null = ทุกหน่วย)
- ✅ ช่วงเวลา: `validFrom / validUntil` (validUntil = วันหมดอายุแคมเปญ; โค้ดเฉพาะคน override ได้ด้วย `expiresAt` ของโค้ด เช่น "หมดอายุ 30 วันหลังแจก")
- ✅ ลิมิต: `totalRedeemLimit?` (ครั้งรวมทั้งแคมเปญ — งบ), `perMemberLimit?` (ครั้ง/คน นับจาก redemption APPLIED)
- ✅ สถานะ: `DRAFT → ACTIVE → PAUSED → ENDED → ARCHIVED` (PAUSED = หยุดชั่วคราวทันทีทุกโค้ด, ENDED = จบถาวร) — ไม่มี hard delete
- 🔜 งบเป็นเงิน (หยุดเมื่อส่วนลดสะสมถึงเพดานบาท), แคมเปญ recurring

### 3.2 การแจกโค้ด (CouponCode)
- ✅ **PUBLIC_CODE** — โค้ดเดียวใช้หลายคน: owner ตั้งเอง (เช่น `SUMMER20`, 4–20 ตัว A-Z0-9, unique ต่อ tenant, เก็บ uppercase) · จำกัดครั้งด้วย `totalRedeemLimit` ของแคมเปญ + `perMemberLimit` · guest ไม่ login ใช้ได้เฉพาะโมดูลที่รองรับ guest checkout และนับ limit ต่อคนไม่ได้ → **decision v1: PUBLIC_CODE ที่ตั้ง perMemberLimit จะบังคับต้องระบุ member ตอน redeem** (POS ผูก member ก่อน หรือไม่ผูก = ใช้ไม่ได้ถ้าแคมเปญตั้ง perMemberLimit)
- ✅ **PERSONAL** — โค้ด unique ต่อ member: gen อัตโนมัติ (CSPRNG Crockford base32 10 ตัว + prefix แคมเปญ ≤4 ตัว เช่น `GOLD-7XK2M9Q4RT`), ผูก `memberId`, ใช้ได้เฉพาะเจ้าของ, default 1 ครั้ง/โค้ด
  - แจกผ่าน: (ก) segment/tag จากโมดูล 6 (เลือก segment → resolve ผ่าน `member.resolveSegmentMembers` (contract 2.6) → preview จำนวนคน → ยืนยัน → gen โค้ด batch + `notify` รายคน) (ข) manual รายคน (ค) จาก Reward 07 (`issuePersonalCode`) (ง) 🔜 auto-issue event วันเกิด/tier-up — **การแจก (ก)(ข) = การตลาด**: notification วิ่งผ่าน consent gate ของ `notify()` (template class MARKETING — D15, ปิดช่อง PDPA bypass) · (ค) issuedVia=REWARD = transactional (ผลจากการกระทำของลูกค้าเอง)
- ✅ สถานะโค้ด: `ACTIVE / USED_UP / EXPIRED / REVOKED` (owner เพิกถอนรายโค้ดได้ เช่น โค้ดหลุด)
- ✅ Revoke ทั้งแคมเปญ = PAUSED/ENDED ที่แคมเปญ (โค้ดทุกใบหยุดตาม — validate เช็คสถานะแคมเปญเสมอ)

### 3.3 Validate → Redeem → Release (contract 2.3)
- ✅ `coupon.validate({ code, tenantId, unitId, memberId?, amount, module })` → `{ valid, discountSatang, campaignId, codeId, displayName, freeItemName?, reason? }`
  - เรียกตอนลูกค้า/แคชเชียร์ใส่โค้ด — **read-only ไม่จองสิทธิ์** (ไม่มี hold; ตัดจริงตอน redeem — ยอมรับ edge ที่โค้ดเต็มระหว่างพักบิล ดูข้อ 11.2)
  - ตรวจครบ: โค้ดมีจริง+ACTIVE → แคมเปญ ACTIVE+ในช่วงเวลา → module ∈ applicableModules → unitId ∈ applicableUnitIds → เจ้าของโค้ด (PERSONAL) → perMemberLimit → totalRedeemLimit → minSpend → คำนวณส่วนลด (percent→cap, fixed→ไม่เกินบิล, voucher→min(value, บิล))
  - `reason` เป็น error code เดียว i18n ได้: `NOT_FOUND / CAMPAIGN_INACTIVE / EXPIRED / WRONG_MODULE / WRONG_UNIT / NOT_OWNER / MEMBER_REQUIRED / PER_MEMBER_LIMIT / TOTAL_LIMIT / MIN_SPEND / ALREADY_USED`
- ✅ `coupon.redeem({ ...validate args, saleId })` — **atomic** เรียกโดย POS ภายใน transaction ปิดบิล (`createSale` contract 2.1):
  1. re-validate ทั้งหมดใน tx (ห้ามเชื่อผล validate ก่อนหน้า)
  2. conditional update กันแย่งสิทธิ์: `UPDATE "CouponCode" SET "usedCount"="usedCount"+1 WHERE id=? AND status='ACTIVE' AND ("maxUses" IS NULL OR "usedCount" < "maxUses")` → 0 แถว = แย่งไม่ทัน → throw ให้ POS ตัดสินใจ (ปิดบิลไม่มีส่วนลด — แจ้งแคชเชียร์)
  3. `UPDATE "CouponCampaign" SET "redeemedCount"="redeemedCount"+1 WHERE id=? AND ("totalRedeemLimit" IS NULL OR "redeemedCount" < "totalRedeemLimit")` → 0 แถว = โควตาแคมเปญเต็ม → throw + rollback ข้อ 2
  4. INSERT `CouponRedemption` (APPLIED, snapshot ส่วนลด/ยอดบิล, saleId, unitId, module) — **partial unique index** `(tenantId, saleId) WHERE status='APPLIED'` กัน 2 คูปอง/บิล + กัน redeem ซ้ำ saleId เดิม (double-submit)
  5. อัปเดตสถานะโค้ด: usedCount ≥ maxUses → `USED_UP`
- ✅ `coupon.release({ tenantId, saleId, reason })` — POS void บิล (contract: บิล immutable → void/reissue):
  - redemption APPLIED ของ saleId → `VOIDED` + `usedCount -1`, `redeemedCount -1`, โค้ด USED_UP → กลับ ACTIVE **ถ้ายังไม่หมดอายุ/แคมเปญยัง ACTIVE** (หมดอายุแล้วคืนเป็น EXPIRED — สิทธิ์ไม่ฟื้น, แจ้งใน response ให้ POS โชว์แคชเชียร์)
- ✅ ทุกจังหวะเขียน AuditLog (who/what/before/after) — action แตะเงิน

### 3.4 กันโกง (anti-abuse)
- ✅ **Rate limit ลองโค้ดมั่ว**: validate ผิด (NOT_FOUND) เกิน **10 ครั้ง/15 นาที** ต่อ (memberId หรือ IP+tenant สำหรับ guest) → lockout ใส่โค้ด 30 นาที (429 + `Retry-After`) — เก็บตัวนับในตาราง `CouponAttempt` (VPS instance เดียว ไม่พึ่ง Redis; cron ลบแถวเก่า > 24 ชม.)
- ✅ โค้ด PERSONAL: CSPRNG ≥ 50 bits (base32 10 ตัว), ไม่มีลำดับ/timestamp ฝังในโค้ด
- ✅ โค้ด PUBLIC: บังคับความยาว ≥ 4 และเตือน owner ถ้าสั้น/เดาง่าย (dictionary check เบื้องต้น 🔜)
- ✅ validate ตอบ `NOT_FOUND` เหมือนกันทั้ง "ไม่มีโค้ดนี้" และ "โค้ดของ tenant อื่น" — ไม่ leak
- ✅ AuditLog การ revoke/pause + รายงาน "โค้ดที่ถูกลองผิดบ่อย" 🔜

### 3.5 วอลเล็ต "คูปองของฉัน" (storefront)
- ✅ ลูกค้า login เห็นโค้ด PERSONAL ของตัวเอง: การ์ดคูปอง (ชื่อ, มูลค่า/%, หมดอายุ, ใช้ได้ที่หน่วย/โมดูลไหน, สถานะ) + ปุ่ม copy code
- ✅ ประวัติการใช้ (APPLIED ผูกใบเสร็จ)
- 🔜 กด "ใช้เลย" deep-link ไปหน้าจอง/สั่งของหน่วยที่ใช้ได้

---

## 4. Data Model (Prisma)

> tenant-scoped ทุก model · เงิน `Int` สตางค์ · เปอร์เซ็นต์ `Int` basis points · เวลา UTC

```prisma
enum CampaignKind {
  COUPON
  VOUCHER
}

enum DiscountType {
  PERCENT        // discountPercentBp + maxDiscountSatang?
  FIXED_AMOUNT   // discountValueSatang
  FREE_ITEM      // freeItemNameTh/En + freeItemValueSatang
}

enum DistributionType {
  PUBLIC_CODE    // โค้ดเดียว ใช้หลายคน
  PERSONAL       // โค้ด unique ต่อ member
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED     // หยุดชั่วคราว — validate/redeem ไม่ผ่านทันที
  ENDED      // จบถาวร
  ARCHIVED
}

enum CouponCodeStatus {
  ACTIVE
  USED_UP    // usedCount ถึง maxUses
  EXPIRED
  REVOKED    // เพิกถอน (โค้ดหลุด/แจกผิด)
}

enum CouponRedemptionStatus {
  APPLIED    // ใช้กับบิลแล้ว
  VOIDED     // บิลถูก void — สิทธิ์คืน
}

enum CodeIssueSource {
  MANUAL     // owner แจกรายคน
  SEGMENT    // แจกผ่าน segment โมดูล 6
  REWARD     // ออกจากการแลกรางวัล (โมดูล 7)
  AUTO       // 🔜 event วันเกิด/tier-up
  PUBLIC     // แถวโค้ดสาธารณะของแคมเปญ
}

model CouponCampaign {
  id        String         @id @default(cuid())
  tenantId  String         // FK → Tenant
  kind      CampaignKind
  status    CampaignStatus @default(DRAFT)

  // เนื้อหา TH/EN
  nameTh        String
  nameEn        String?
  descriptionTh String?  @db.Text
  descriptionEn String?  @db.Text
  termsTh       String?  @db.Text
  termsEn       String?  @db.Text

  // COUPON
  discountType        DiscountType?  // บังคับเมื่อ kind=COUPON
  discountPercentBp   Int?           // 2000 = 20.00% (kind=COUPON, PERCENT)
  maxDiscountSatang   Int?           // cap ของ PERCENT
  discountValueSatang Int?           // FIXED_AMOUNT
  freeItemNameTh      String?        // FREE_ITEM
  freeItemNameEn      String?
  freeItemValueSatang Int?           // มูลค่าของแถม (รายงานต้นทุน)

  // VOUCHER
  voucherValueSatang  Int?           // บังคับเมื่อ kind=VOUCHER — ใช้ครั้งเดียวเต็มมูลค่า (v1)

  // เงื่อนไข
  minSpendSatang    Int      @default(0)
  applicableModules Json     @default("[\"*\"]")  // ["POS","BOOKING",...] | ["*"]
  applicableUnitIds Json?                          // ["unitId1",...] | null = ทุกหน่วย
  validFrom         DateTime
  validUntil        DateTime
  perMemberLimit    Int?                           // ครั้ง/คน (นับ APPLIED)
  totalRedeemLimit  Int?                           // ครั้งรวมทั้งแคมเปญ
  redeemedCount     Int      @default(0)           // ตัวนับ atomic (นับ APPLIED ปัจจุบัน)

  distribution      DistributionType
  codePrefix        String?                        // PERSONAL: prefix ≤ 4 ตัว
  personalCodeTtlDays Int?                         // PERSONAL: อายุโค้ดนับจากวันแจก (null = ตาม validUntil)

  archivedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  codes       CouponCode[]
  redemptions CouponRedemption[]

  @@index([tenantId, status, kind])
  @@index([tenantId, validUntil])
}

model CouponCode {
  id         String           @id @default(cuid())
  tenantId   String
  campaignId String
  campaign   CouponCampaign   @relation(fields: [campaignId], references: [id])
  code       String           // uppercase — PUBLIC ตั้งเอง / PERSONAL gen CSPRNG
  status     CouponCodeStatus @default(ACTIVE)

  memberId   String?          // PERSONAL: FK → CustomerProfile (เจ้าของโค้ด) · PUBLIC: null
  maxUses    Int?             // PERSONAL default 1 · PUBLIC null = ไม่จำกัดที่ตัวโค้ด (คุมที่แคมเปญ)
  usedCount  Int      @default(0)
  expiresAt  DateTime?        // PERSONAL: issuedAt + personalCodeTtlDays (ไม่เกิน validUntil) · PUBLIC: null (ใช้ validUntil)

  issuedVia  CodeIssueSource
  issueRefId String?          // SEGMENT: batchId · REWARD: redemptionId (โมดูล 7)
  revokedAt  DateTime?
  revokedReason String?

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  redemptions CouponRedemption[]

  @@unique([tenantId, code])              // โค้ดไม่ชนกันใน tenant (ข้ามแคมเปญด้วย)
  @@index([tenantId, campaignId, status])
  @@index([tenantId, memberId, status])   // วอลเล็ต "คูปองของฉัน"
}

model CouponRedemption {
  id         String                 @id @default(cuid())
  tenantId   String
  campaignId String
  campaign   CouponCampaign         @relation(fields: [campaignId], references: [id])
  codeId     String
  couponCode CouponCode             @relation(fields: [codeId], references: [id])
  status     CouponRedemptionStatus @default(APPLIED)

  memberId   String?   // FK → CustomerProfile (null ได้เฉพาะแคมเปญไม่ตั้ง perMemberLimit)
  saleId     String    // FK → PosSale (POS 14) — บิลที่ใช้
  unitId     String    // FK → BusinessUnit — หน่วยที่เกิดบิล (attribution)
  module     String    // 'POS'|'RESTAURANT'|'BOOKING'|'HOTEL'|'TICKET' (sourceModule จาก contract 2.1)

  // snapshot ณ เวลาใช้ (เอกสารเงิน — freeze)
  billAmountSatang  Int   // ยอดบิลก่อนหักส่วนลด
  discountSatang    Int   // ส่วนลดที่ให้จริง (FREE_ITEM = 0, voucher = min(value, bill))
  forfeitSatang     Int   @default(0) // VOUCHER: มูลค่าที่สละสิทธิ์ (value - discount)
  codeSnapshot      String
  campaignNameTh    String

  redeemedAt DateTime  @default(now())
  voidedAt   DateTime?
  voidReason String?

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  // กัน 2 คูปอง/บิล + กัน redeem ซ้ำ — partial unique (สร้างใน migration SQL, Prisma ยังไม่รองรับ):
  // CREATE UNIQUE INDEX "coupon_redemption_one_per_sale"
  //   ON "CouponRedemption" ("tenantId","saleId") WHERE status = 'APPLIED';
  @@index([tenantId, saleId])
  @@index([tenantId, campaignId, status, redeemedAt]) // attribution
  @@index([tenantId, unitId, redeemedAt])             // รายงานรายหน่วย
  @@index([tenantId, codeId, memberId, status])       // นับ perMemberLimit
}

model CouponAttempt {   // ตัวนับ rate limit ลองโค้ดผิด (cron ลบเก่า > 24 ชม.)
  id        String   @id @default(cuid())
  tenantId  String
  actorKey  String   // "member:<id>" หรือ "ip:<ip>"
  createdAt DateTime @default(now())

  @@index([tenantId, actorKey, createdAt])
}
```

หมายเหตุ schema:
- **partial unique index** บน CouponRedemption ต้องสร้างด้วย raw SQL ใน migration (คอมเมนต์ไว้ใน schema) — นี่คือชั้นกันใช้ซ้ำสุดท้าย ต่อให้ logic ชั้นบนพลาด DB ก็ reject
- นับ `perMemberLimit` = count(CouponRedemption where campaignId, memberId, status=APPLIED) ใน tx redeem (หลังได้ row lock จาก conditional update ข้อ 3.3.2 → กันนับแข่งกันระดับโค้ดเดียว; ข้ามโค้ด (PERSONAL หลายใบแคมเปญเดียว) ใช้ `SELECT ... FOR UPDATE` ที่แถว campaign ก่อนนับ)
- validation ระดับ service: kind=COUPON บังคับ discountType + ฟิลด์คู่กัน, kind=VOUCHER บังคับ voucherValueSatang — schema เก็บ nullable เพื่อใช้ตารางเดียว

---

## 5. API Endpoints

> สิทธิ์ผ่าน `can(user, { tenantId, module: 'COUPON', action })` — tenant-level 3 มิติ · service ภายใน (contract 2.3) ไม่ใช่ REST public แต่มี HTTP wrapper สำหรับโมดูลอื่นเรียกข้าม process ถ้าจำเป็น (v1 monolith เรียก function ตรง)

### Dashboard (app)

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/api/coupons/campaigns` | list + filter (kind, status, q) + สถิติย่อ (ใช้แล้ว/โควตา) | `coupon.read` |
| POST | `/api/coupons/campaigns` | สร้างแคมเปญ (validate ฟิลด์ตาม kind) | `coupon.write` |
| GET | `/api/coupons/campaigns/[id]` | รายละเอียด + สถิติ (redeemed, discount รวม, ยอดขาย attributed) | `coupon.read` |
| PATCH | `/api/coupons/campaigns/[id]` | แก้ไข (ห้ามแก้ kind/discountType หลังมี redemption — 422) | `coupon.write` |
| POST | `/api/coupons/campaigns/[id]/status` | `{ status }` เปลี่ยน ACTIVE/PAUSED/ENDED/ARCHIVED (ตาม state machine) | `coupon.write` |
| GET | `/api/coupons/campaigns/[id]/codes` | list โค้ด (PERSONAL: ค้นหาด้วยชื่อ/เบอร์ member) + สถานะ | `coupon.read` |
| POST | `/api/coupons/campaigns/[id]/codes/issue` | แจกโค้ด PERSONAL: `{ memberIds?: [], segmentId?: string, notify: boolean }` — segment resolve ผ่าน `member.resolveSegmentMembers` (2.6) → batch gen + noti ผ่าน **consent gate ของ notify()** (template `coupon.issued` class MARKETING — D15, ครอบทั้ง segment และ **manual รายคน**) · คืน `{ batchId, issued, skipped, skippedNoConsent }` (skip = มีโค้ด ACTIVE แคมเปญนี้อยู่แล้ว · skippedNoConsent = ไม่มี marketing consent จึงไม่ถูกส่ง noti — รายงานแยก) | `coupon.issue` |
| POST | `/api/coupons/codes/[id]/revoke` | `{ reason }` เพิกถอนโค้ด | `coupon.write` |
| GET | `/api/coupons/redemptions` | list การใช้ (filter แคมเปญ/หน่วย/โมดูล/ช่วงวัน/สถานะ) | `coupon.read` |
| GET | `/api/coupons/reports/attribution` | ROI ต่อแคมเปญ (ดูข้อ 10) | `coupon.report` |
| GET | `/api/coupons/reports/by-unit` | ส่วนลด/ยอดขาย attributed ต่อหน่วย | `coupon.report` |

### Internal service (contract 2.3 — โมดูลอื่นเรียก)

| Function | ผู้เรียก | หมายเหตุ |
|---|---|---|
| `coupon.validate({ code, tenantId, unitId, memberId?, amount, module })` | POS/Booking/Hotel/Ticket ตอนใส่โค้ด | read-only + บันทึก CouponAttempt เมื่อ NOT_FOUND + ตรวจ lockout ก่อน |
| `coupon.redeem({ ...validate, saleId, tx })` | **POS เท่านั้น** ภายใน tx `createSale` (contract 2.1) | atomic — รับ Prisma tx client ร่วม transaction เดียวกับบิล |
| `coupon.release({ tenantId, saleId, reason, tx })` | POS ตอน void บิล | คืนสิทธิ์ตามกติกา 3.3 |
| `couponService.issuePersonalCode({ tenantId, campaignId, memberId, issuedVia, refId, tx? })` | Reward (07), auto-issue 🔜 | คืน `{ codeId, code, expiresAt }` |

### Storefront (store — ลูกค้า)

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/store/[tenantSlug]/me/coupons` | วอลเล็ต: โค้ด PERSONAL ของฉัน (ACTIVE ก่อน, แล้ว used/expired) + เงื่อนไขย่อ |
| GET | `/api/store/[tenantSlug]/me/coupons/[codeId]` | รายละเอียด + ประวัติใช้ |
| POST | `/api/store/[tenantSlug]/coupons/validate` | `{ code, unitId, module, amount }` — ให้หน้าจ่ายเงิน storefront (จองคิว/จองห้อง/สั่งอาหาร) พรีวิวส่วนลด · rate limit ตามข้อ 3.4 |

### Cron

| Path | ทำอะไร |
|---|---|
| `/api/cron/coupons/expire` (รายชั่วโมง) | โค้ด ACTIVE ที่ expiresAt < now → EXPIRED · แคมเปญ ACTIVE ที่ validUntil < now → ENDED · ลบ CouponAttempt > 24 ชม. |

---

## 6. UI Screens

### Dashboard `(app)` — เมนูโซน tenant-level "คูปอง"
1. **`/app/coupons`** — ตารางแคมเปญ: ชื่อ, kind badge (คูปอง/voucher), ส่วนลด, ใช้แล้ว/โควตา (progress bar), ช่วงเวลา, สถานะ · แท็บ ACTIVE / ทั้งหมด · ปุ่มสร้าง · มือถือ = card list
2. **`/app/coupons/new`** — wizard 3 ขั้น: (1) ชนิด+มูลค่า (เลือก COUPON %→cap /บาท/ของแถม หรือ VOUCHER — โชว์ตัวอย่างการ์ดคูปอง live preview) (2) เงื่อนไข (ขั้นต่ำ, ช่วงเวลา, limit ต่อคน/รวม, **โมดูล multi-select**, **หน่วย multi-select** default ทุกกิจการ) (3) การแจก (PUBLIC: ตั้งโค้ดเอง + ปุ่มสุ่ม / PERSONAL: prefix + อายุโค้ด) → บันทึกเป็น DRAFT → ปุ่ม "เปิดใช้งาน"
3. **`/app/coupons/[id]`** — รายละเอียด: สถิติหัวจอ (ใช้แล้ว, ส่วนลดสะสม, ยอดขาย attributed, ROI), ปุ่ม pause/end, แท็บ: ภาพรวม / โค้ด (list+ค้นหา+revoke) / การใช้ (redemption list) 
4. **`/app/coupons/[id]/issue`** — แจกโค้ด PERSONAL: เลือก segment (dropdown จากโมดูล 6 + preview จำนวนคน) หรือค้นหา member รายคน → toggle ส่ง noti → ยืนยัน → ผลลัพธ์ (แจกสำเร็จ n, ข้าม m)
5. **`/app/coupons/redemptions`** — ตารางการใช้ทั้งหมด: เวลา, โค้ด, member, บิล (ลิงก์ PosSale), หน่วย, โมดูล, ส่วนลด, สถานะ (APPLIED/VOIDED)
6. **`/app/coupons/reports`** — attribution: ตารางต่อแคมเปญ (redemptions, ส่วนลดให้ไป, ยอดขายที่ดึงมา, AOV, ROI) + กราฟรายวัน + breakdown หน่วย/โมดูล + export CSV

### จุดใช้โค้ดในโมดูลอื่น (สเปค UI ที่โมดูลนั้นต้อง implement ตาม contract)
7. **POS checkout (14)** — ช่อง "โค้ดส่วนลด" + ปุ่มสแกน: ใส่แล้วเรียก validate → แถวส่วนลดสีเทาใต้ subtotal + ชื่อแคมเปญ · invalid → ข้อความเหตุผลใต้ช่อง (inline ไม่ใช่ alert) · FREE_ITEM → บรรทัด "ของแถม: X (หยิบให้ลูกค้า)" 
8. **Storefront checkout (Booking/Hotel/Ticket/สั่งอาหาร)** — ช่องโค้ด collapse ("มีโค้ดส่วนลด?") + validate แบบเดียวกัน · ลูกค้า login เห็นปุ่ม "เลือกจากคูปองของฉัน" (bottom-sheet list เฉพาะใบที่ผ่านเงื่อนไขหน่วย/โมดูล/ขั้นต่ำ ณ ตะกร้านั้น)

### Storefront
9. **`/s/[tenantSlug]/me/coupons`** — วอลเล็ต: การ์ดคูปอง B&W (มูลค่าใหญ่, ชื่อแคมเปญ, หมดอายุ, ใช้ได้ที่, ปุ่ม copy) · แท็บ ใช้ได้ / ประวัติ · empty state ชวนดูรางวัล (ลิงก์โมดูล 7)

---

## 7. Business Flows

### 7.1 Validate ตอนใส่โค้ด (ทุกโมดูล)

```
ลูกค้า/แคชเชียร์ใส่โค้ด (code, unitId, module, amount, memberId?)
└─ ตรวจ lockout (CouponAttempt ของ actor > 10 ใน 15 นาที) → 429 Retry-After
└─ หา CouponCode (tenantId + upper(code)) → ไม่เจอ: บันทึก attempt + คืน NOT_FOUND
└─ ตรวจตามลำดับ (จบที่ reason แรกที่เจอ):
   แคมเปญ status=ACTIVE → CAMPAIGN_INACTIVE
   now ∈ [validFrom, validUntil] และโค้ดไม่ EXPIRED/REVOKED/USED_UP → EXPIRED/ALREADY_USED
   module ∈ applicableModules → WRONG_MODULE
   unitId ∈ applicableUnitIds → WRONG_UNIT ("ใช้ได้ที่ ร้านอาหารสาขา 1 เท่านั้น")
   PERSONAL: memberId = code.memberId → NOT_OWNER
   perMemberLimit ตั้งไว้ && ไม่มี memberId → MEMBER_REQUIRED (POS ชวนผูกสมาชิกก่อน)
   count APPLIED ของ member ในแคมเปญ < perMemberLimit → PER_MEMBER_LIMIT
   redeemedCount < totalRedeemLimit → TOTAL_LIMIT
   amount >= minSpendSatang → MIN_SPEND ("ขั้นต่ำ 500.00 บาท — ขาดอีก 120.00")
└─ คำนวณ discount:
   PERCENT: min(amount * bp / 10000 (ปัดลงเป็นสตางค์), maxDiscountSatang ?? ∞)
   FIXED_AMOUNT: min(discountValueSatang, amount)
   FREE_ITEM: 0 (+ ชื่อของแถม)
   VOUCHER: min(voucherValueSatang, amount) — ถ้า amount < value แนบ forfeitSatang ให้ UI เตือน
     "voucher มูลค่า 500.00 บิลนี้ 320.00 — ส่วนต่าง 180.00 จะสละสิทธิ์"
└─ คืน { valid: true, discountSatang, ... }
```

### 7.2 Redeem ตอนปิดบิล (POS เรียกใน tx เดียวกับ createSale — contract 2.1)

```
POS createSale(..., couponCode) →
BEGIN TX (ของ createSale)
  1. coupon.redeem({code, tenantId, unitId, memberId?, amount: subtotal, module: sourceModule, saleId, tx})
     a. re-validate ทั้ง 7.1 ใน tx
     b. conditional UPDATE CouponCode.usedCount (+ status→USED_UP ถ้าถึง maxUses) → 0 แถว: throw COUPON_RACE_LOST
     c. conditional UPDATE Campaign.redeemedCount → 0 แถว: throw TOTAL_LIMIT
     d. INSERT CouponRedemption (APPLIED, snapshot bill/discount/forfeit, saleId, unitId, module)
        — partial unique (tenantId,saleId WHERE APPLIED) → ชน: throw ONE_COUPON_PER_SALE
  2. POS หัก discount จาก total → คิดแต้มจากยอดหลังหัก → posting Account ตามปกติ
COMMIT — ล้มข้อไหน rollback ทั้งบิล (บิลกับคูปองไม่มีทาง desync)
Failure UX: COUPON_RACE_LOST/TOTAL_LIMIT → POS แจ้งแคชเชียร์ "โค้ดเต็มแล้ว" ให้เลือก ปิดบิลไม่มีส่วนลด หรือยกเลิก
```

### 7.3 Void บิล → คืนสถานะคูปอง

```
POS void PosSale (ออกใบ void อ้างใบเดิม — เอกสาร immutable)
BEGIN TX
  coupon.release({tenantId, saleId, reason, tx})
  1. หา redemption APPLIED ของ saleId (FOR UPDATE) → ไม่มี: no-op
  2. → VOIDED + voidedAt/voidReason
  3. CouponCode.usedCount -1 · USED_UP → ACTIVE ถ้า (ไม่ expired && ไม่ revoked && แคมเปญ ACTIVE) ไม่งั้นตั้ง EXPIRED
  4. Campaign.redeemedCount -1
COMMIT → AuditLog · response แจ้ง POS ว่าสิทธิ์ "คืนแล้ว" หรือ "หมดอายุไปแล้ว คืนไม่ได้"
* บิลใหม่ (reissue) อยากใช้คูปองเดิม → ใส่โค้ดใหม่ตามปกติ (validate/redeem รอบใหม่)
```

### 7.4 แจกโค้ดผ่าน segment

```
Owner เลือกแคมเปญ PERSONAL → เลือก segment → resolve รายชื่อผ่าน
  `member.resolveSegmentMembers({ tenantId, segmentId, purpose: 'marketing' })` (service ของ 06 ตาม contract 2.6)
  → preview N คน → ยืนยัน
└─ สร้าง batchId → loop member (chunk 100):
   มีโค้ด ACTIVE แคมเปญนี้แล้ว → skip (กันแจกซ้ำ)
   gen code (retry ถ้าชน unique) → INSERT (issuedVia=SEGMENT, issueRefId=batchId,
     expiresAt = now + personalCodeTtlDays คุมไม่เกิน validUntil)
   notify(member, template `coupon.issued` class **MARKETING**, {code, value, expiresAt}) — ถ้าเลือกส่ง
     → **notify() เป็นผู้บังคับ consent gate เอง (RESOLUTIONS D15)**: member ที่ไม่ให้/ถอน marketing consent
       จะไม่ถูกส่ง → นับเป็น `skippedNoConsent` (รายงานแยกจาก skipped)
     → กติกาเดียวกันครอบการแจก **manual รายคน** ด้วย (ปิดช่อง PDPA bypass — QC2-M5)
└─ สรุปผล issued/skipped/skippedNoConsent · batch ใหญ่รันเป็น background job + progress (SSE) 🔜 (v1: จำกัด 2,000 คน/ครั้ง แบบ synchronous chunk)
```

---

## 8. Integration (contract ข้อ 2)

| Contract | บทบาทของโมดูลนี้ |
|---|---|
| **2.3 Coupon** | **เป็นเจ้าของ contract** — expose `validate / redeem / release / issuePersonalCode` ตามสเปคข้อ 5 · redeem/release ต้องรับ `tx` (Prisma transaction client) จาก POS เพื่อ atomic ร่วมบิล |
| **2.1 POS** | POS เป็นผู้เรียกเดียวของ `redeem` (ทุกโมดูลรับเงินผ่าน createSale อยู่แล้ว → คูปองถูกตัดที่จุดเดียว) · `payMethods type VOUCHER` ใน contract 2.1 **v1 ไม่ใช้** — voucher เดินทางเป็น "ส่วนลด" ผ่าน couponCode เพื่อให้มีจุด redeem เดียว (ตัดสินใจแล้ว; ตอนทำ "ขาย voucher" 🔜 ค่อยใช้ payMethod VOUCHER + Account liability) |
| **2.2 Point** | ไม่เรียกตรง — POS คิดแต้มจากยอดหลังหักส่วนลดเอง (decision ข้อ 1) — โมดูลนี้ไม่แตะแต้ม |
| **2.4 Account** | ไม่ posting เอง — ส่วนลดสะท้อนใน PosSale ที่ POS posting อยู่แล้ว · 🔜 voucher ขายจริงค่อยมี journal liability |
| **2.5 Notification** | แจกโค้ด PERSONAL (segment **และ** manual) → notify(template `coupon.issued` **class MARKETING**) — **notify() เป็นผู้บังคับ consent gate (RESOLUTIONS D15)**: ไม่มี marketing consent = ไม่ส่ง + รายงาน `skippedNoConsent` — ปิดช่อง PDPA bypass (QC2-M5) · ยกเว้น issuedVia=REWARD = TRANSACTIONAL (ส่งได้เสมอ) · เตือนโค้ดใกล้หมดอายุ 3 วัน 🔜 |
| **2.6 Member** | อ้าง `memberId` — วอลเล็ต/perMemberLimit/NOT_OWNER · แจกผ่าน segment ใช้ `member.resolveSegmentMembers({ segmentId, purpose:'marketing' })` — **service ของ 06 ตาม contract 2.6 (approve แล้ว — ไม่ใช่ assumption)**, purpose=marketing บังคับ AND consent ที่ service layer ฝั่ง 06 |
| **2.7 Activity** | redeem สำเร็จ (APPLIED) → `activity.log({ module:'COUPON', type:'COUPON_USE', refType:'CouponRedemption', refId, unitId })` ผ่าน outbox กลาง — Coupon เป็น producer บังคับตามตาราง RESOLUTIONS D6 (timeline ลูกค้าเห็น "ใช้คูปอง X") · void → ไม่ยิงเพิ่ม (timeline ฝั่ง sale จัดการโดย POS) |
| **โมดูล 7 Reward** | Reward เรียก `issuePersonalCode(issuedVia: REWARD, refId: redemptionId)` — แคมเปญปลายทางต้อง kind=COUPON/VOUCHER + distribution=PERSONAL + status=ACTIVE (Reward form validate ให้) |

Assumption ข้ามโมดูล:
1. โมดูล 14 (POS): `createSale` รับ `couponCode?` และ orchestrate redeem ใน tx เดียว + `voidSale` เรียก `release` — ต้องเขียนใน 14-pos.md ให้ตรง
2. โมดูล 6 (Member): ✅ ยืนยันแล้ว — `member.resolveSegmentMembers` อยู่ใน contract 2.6 (RESOLUTIONS D6) + merge ย้าย `CouponCode.memberId` โดย 06 (ดู 11.17)
3. โมดูลบริการ (03/01/05) ที่มีหน้าจ่าย storefront เรียก `validate` เพื่อพรีวิว แล้วส่ง `couponCode` เข้าตอน createSale — ไม่ redeem เอง
4. `AuditLog` + `notify()` + cron secret กลาง (`X-Cron-Secret`) มีแล้วจาก Phase 0/1

---

## 9. Permissions (action × role)

module key = `COUPON` — tenant-level ตรวจ 3 มิติ (รายงาน by-unit กรองตาม unitAccess ของ Manager)

| Action | OWNER | MANAGER | STAFF | หมายเหตุ |
|---|---|---|---|---|
| `coupon.read` (ดูแคมเปญ/โค้ด/การใช้) | ✅ | ✅ | ✅ (เฉพาะ lookup โค้ดตอนคิดเงิน — ไม่เห็น list แคมเปญ) | แคชเชียร์เห็นผล validate พอ |
| `coupon.write` (สร้าง/แก้/pause/end/revoke) | ✅ | ❌ (custom เปิดได้ — เช่น ผจก.การตลาด) | ❌ | แตะเงิน → AuditLog |
| `coupon.issue` (แจกโค้ด segment/รายคน) | ✅ | ❌ (custom) | ❌ | ส่ง noti หาลูกค้าจำนวนมาก — จำกัดสิทธิ์ |
| `coupon.redeem` (ผ่าน POS ปิดบิล) | ✅ | ✅ | ✅ | ไม่มี endpoint แยก — สิทธิ์ตามการปิดบิล POS (`pos.sale`) ของหน่วยนั้น |
| `coupon.report` (attribution/ROI) | ✅ | ✅ (by-unit เฉพาะหน่วยตน) | ❌ | |

Customer (storefront): เห็นเฉพาะโค้ด PERSONAL ของตัวเอง (`memberId = session.memberId`) + validate ต่อตะกร้าตัวเอง — rate limited

---

## 10. Reports & Metrics

| รายงาน | เนื้อหา |
|---|---|
| **Attribution ต่อแคมเปญ** | redemptions (APPLIED สุทธิ, VOIDED แยกบรรทัด), ส่วนลดที่ให้ Σ discountSatang, **ยอดขายที่ดึงมา** Σ billAmountSatang ของบิล APPLIED, AOV ของบิลติดคูปอง vs ไม่ติด, **ROI = (ยอดขาย attributed − ส่วนลด − มูลค่าของแถม) / (ส่วนลด + มูลค่าของแถม)**, forfeit รวม (voucher) |
| **รายหน่วย / รายโมดูล** | breakdown จาก `unitId`/`module` บน redemption — หน่วยไหนคูปองดึงลูกค้าเข้ามากสุด |
| **การแจก (PERSONAL)** | แจกไป n, ใช้จริง m, **conversion rate m/n**, เวลาเฉลี่ยจากแจกถึงใช้, หมดอายุทิ้ง k |
| **กราฟรายวัน** | redemptions + ส่วนลด + ยอด attributed ต่อวัน ช่วงแคมเปญ |
| **Fraud snapshot** 🔜 | actor ที่โดน lockout บ่อย, โค้ดที่ถูกลองผิดมากผิดปกติ |
| Export | CSV ทุกตาราง (ตาม convention Account/รายงาน) |

Metric ป้อน Overview "ทุกกิจการ": ส่วนลดที่ให้วันนี้ + คูปองถูกใช้วันนี้ (แถบรวมบน)

---

## 11. Edge Cases & Rules

1. **Redeem แข่งกัน (โค้ด public เหลือครั้งเดียว, 2 เคาน์เตอร์)** — conditional update ที่ CouponCode + Campaign เป็น atomic → ชนะ 1 แพ้ 1, ฝั่งแพ้ rollback บิลหรือปิดไม่มีส่วนลด (แคชเชียร์เลือก)
2. **Validate ผ่านแต่ redeem ไม่ผ่าน** (โค้ดถูกใช้เต็มระหว่างพักบิล) — by design: validate ไม่ hold สิทธิ์ (กัน hold รั่ว/ปล่อยไม่ครบ) → UX ต้องแจ้งชัดตอนปิดบิล
3. **Double-submit ปิดบิลซ้ำ** — partial unique (tenantId, saleId WHERE APPLIED) → INSERT ที่สองชน → tx บิลที่สอง fail (POS กัน saleId ซ้ำอยู่แล้วอีกชั้น)
4. **บิล void แล้ว reissue พร้อมคูปองเดิม** — release คืนสิทธิ์ก่อน (7.3) → บิลใหม่ redeem ใหม่ ตามเงื่อนไข ณ ตอนนั้น (ถ้าแคมเปญหมดอายุระหว่างนั้น = ใช้ไม่ได้ — ถูกต้องตามกติกา)
5. **Void หลังโค้ด/แคมเปญหมดอายุ** — usedCount คืนแต่โค้ดตั้ง EXPIRED (สิทธิ์ไม่ฟื้น) — แจ้งแคชเชียร์ใน response กันงงว่า "คืนแล้วทำไมใช้ไม่ได้"
6. **ส่วนลดเกินบิล** — FIXED/VOUCHER คิด `min(..., bill)` — บิลต่ำสุด 0 ห้ามติดลบ · PERCENT ปัดเศษ**ลง**เป็นสตางค์ (เข้าทางลูกค้าเสมอ กันข้อพิพาท 1 สตางค์)
7. **minSpend คิดจากยอดไหน** — ยอดสินค้า/บริการก่อนส่วนลด (subtotal) ไม่รวมค่าที่ POS นิยามเป็น non-discountable 🔜 (v1 = subtotal ทั้งบิล)
8. **แก้เงื่อนไขแคมเปญหลังแจกโค้ดแล้ว** — แก้ได้เฉพาะ: ขยาย validUntil, เพิ่ม totalRedeemLimit, เพิ่มหน่วย/โมดูล (ผ่อน) · **ห้ามแก้ให้แคบลง/ลดมูลค่า** เมื่อมีโค้ด PERSONAL แจกไปแล้ว (โค้ดคือคำสัญญา) — enforce ที่ API + แสดงเหตุผล
9. **PUBLIC_CODE ตั้ง perMemberLimit แต่ลูกค้าไม่ผูกสมาชิก** — MEMBER_REQUIRED (decision 3.2) — POS มีปุ่ม "ผูกสมาชิกด่วน" (เบอร์โทร) ก่อนใส่โค้ด
10. **Unit ใน applicableUnitIds ถูก PAUSED** — validate ที่หน่วยนั้น = WRONG_UNIT ตามจริง (บิลใหม่เกิดไม่ได้ที่หน่วย paused อยู่แล้ว) — ไม่ต้อง special-case
11. **โค้ดชนข้ามแคมเปญ** — unique (tenantId, code) ครอบทุกแคมเปญ → ตั้ง PUBLIC code ซ้ำของเก่า = 409 พร้อมบอกว่าชนแคมเปญไหน (เฉพาะชื่อ ไม่ leak เงื่อนไข ถ้าคนตั้งไม่มีสิทธิ์อ่านแคมเปญนั้น)
12. **เดาโค้ด PERSONAL จาก prefix** — prefix เปิดเผยได้ (แค่ branding) ความปลอดภัยอยู่ที่ 10 ตัวสุ่ม (50+ bits) + rate limit + lockout
13. **นาฬิกา/timezone** — validFrom/validUntil เก็บ UTC, UI เลือกเวลาเป็น Asia/Bangkok และแสดงกำกับชัด (เที่ยงคืนไทย ≠ UTC)
14. **Rounding แต้มหลังส่วนลด** — ความรับผิดชอบ POS/Point (ยอดหลังหัก) — โมดูลนี้แค่การันตี discountSatang เป็น Int เสมอ
15. **แคมเปญถูก ARCHIVED** — redemption/รายงานยังอ่านได้ตลอด (เอกสารธุรกรรม immutable) — archive แค่ซ่อนจาก list ทำงาน
16. **i18n** — nameEn ว่าง fallback TH · reason code แปลที่ชั้น UI (server คืน code ไม่คืนข้อความ)
17. **Merge สมาชิก (RESOLUTIONS D6)** — โมดูล 6 เป็นผู้ย้าย `CouponCode.memberId` → target ภายใน transaction merge (06 §7.3 step f — โมดูลนี้**ไม่ทำเอง**) · `perMemberLimit` หลัง merge นับรวมแบบ **union** ของทั้งสองโปรไฟล์ (แถว redemption ที่ย้ายไป target ถูกนับด้วย query เดิมโดยอัตโนมัติ — intended ไม่ใช่ bug) · target ถือโค้ด PERSONAL ACTIVE ของแคมเปญเดียวกัน 2 ใบ (จากสองโปรไฟล์) → **เก็บทั้งคู่** (โค้ดที่แจกแล้วคือคำสัญญา ตาม 11.8) แต่ redeem ได้ตาม perMemberLimit รวม · กฎ "skip คนที่มีโค้ด ACTIVE" ตอนแจก (7.4): member ที่มี ≥1 ใบหลัง merge ถูก skip เช่นกัน

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional — Coupon**
- [ ] สร้างแคมเปญครบ 3 discountType + VOUCHER, live preview ถูก, validate ฟิลด์ตาม kind (เช่น PERCENT ไม่มี bp → 422)
- [ ] PERCENT: ส่วนลด = bp/10000 ปัดลงสตางค์ + ไม่เกิน cap · FIXED: ไม่เกินบิล · FREE_ITEM: discount 0 + ชื่อของแถมโผล่ที่ POS · VOUCHER: min(value, bill) + forfeit บันทึกถูก + UI เตือนสละสิทธิ์
- [ ] เงื่อนไขทุกตัว reject ถูก reason: นอกช่วงเวลา / ผิดโมดูล / ผิดหน่วย / ไม่ใช่เจ้าของ / เกิน limit ต่อคน / โควตารวมเต็ม / ต่ำกว่าขั้นต่ำ — ข้อความ inline ไม่ใช่ alert
- [ ] แจก segment: gen โค้ด unique ครบ, คนที่มีโค้ด ACTIVE อยู่แล้วถูก skip, noti ออก, expiresAt = min(TTL, validUntil)
- [ ] วอลเล็ตลูกค้าเห็นเฉพาะโค้ดตัวเอง + สถานะ/หมดอายุถูก

**Atomicity / Race (ทดสอบ concurrent จริง)**
- [ ] โค้ด public เหลือ 1 สิทธิ์ ยิงปิดบิลพร้อมกัน 10 → APPLIED 1 เดียว, redeemedCount = limit พอดี
- [ ] redeem แล้ว POS ล้มกลางบิล (จำลอง throw หลัง redeem) → rollback หมด: usedCount/redeemedCount ไม่ขยับ, ไม่มี redemption ค้าง
- [ ] ปิดบิลเดียวกันซ้ำ (retry) → partial unique block, บิลไม่โดนหัก 2 รอบ
- [ ] void → VOIDED + สิทธิ์คืน (usedCount/redeemedCount ลด) · void ตอนโค้ดหมดอายุ → คืนเป็น EXPIRED + แจ้งถูก
- [ ] 1 คูปอง/บิล: ใส่โค้ดที่สองบนบิลเดิม → ONE_COUPON_PER_SALE

**Anti-fraud**
- [ ] ลองโค้ดมั่ว 11 ครั้ง/15 นาที → 429 + Retry-After, ครบ 30 นาทีปลดล็อก, attempt เก่าถูก cron ลบ
- [ ] โค้ด tenant อื่น → NOT_FOUND (ไม่ leak) · โค้ด PERSONAL คนอื่น → NOT_OWNER เฉพาะเมื่อ login แล้ว
- [ ] gen โค้ด 10,000 ใบ ไม่ชน ไม่มี pattern (ตรวจ distribution ตัวอักษร)

**Isolation**
- [ ] ทุก query ติด tenantId (ทดสอบ cross-tenant read/write = 0 แถว)
- [ ] Manager เห็นรายงาน by-unit เฉพาะหน่วยใน unitAccess

**Integration**
- [ ] createSale (POS) จ่ายจริง: บิลมีบรรทัดส่วนลด, แต้มคิดจากยอดหลังหัก, Account posting ยอดสุทธิ, redemption ผูก saleId/unitId/module ครบ
- [ ] Reward (07) แลกรางวัล DISCOUNT → ได้ CouponCode issuedVia=REWARD โผล่ในวอลเล็ต + ใช้ได้จริง

**i18n / UI**
- [ ] TH/EN ครบทุกหน้า + reason code แปลถูก, การ์ดคูปอง B&W ตาม design system, mobile: wizard/วอลเล็ต/ช่องโค้ดใช้สะดวก, empty/loading/error ครบ
- [ ] เงินแสดงบาทจากสตางค์ถูกต้องทุกจุด (ไม่มี float ในโค้ดคำนวณ — ตรวจ code review)
