# โมดูล 6: Member — สมาชิก / CRM แกนกลาง

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)

> scope = **TENANT** (ห้ามผูก unit — ลูกค้า 1 คนเป็นสมาชิกร่วมทุกกิจการของร้าน ดู `BLUEPRINT_BUSINESS_UNITS.md` ข้อ 1)
> ยึด `_CONVENTIONS.md` ทุกข้อ · เงินทุกจำนวน = `Int` สตางค์ · เวลา UTC
> โมดูลนี้คือ "ฐาน" ที่ Point (09) / Reward (07) / Coupon (08) / Chat (10) และโมดูลธุรกิจทุกตัวเกาะ — ต้องนิ่งก่อนโมดูลอื่น

---

## 1. ภาพรวม + ขอบเขต

### ทำอะไร (v1)
- **CustomerProfile ต่อ tenant**: identity กลาง `User` 1 คน → เป็นสมาชิกได้หลาย tenant (หลายร้าน) โดยข้อมูลสมาชิก/แต้ม/tier แยกขาดต่อร้าน
- สมัครสมาชิก **4 ช่องทาง**: (ก) ลูกค้าสมัครเองบน storefront (ข) staff สร้างหน้าร้าน (ค) auto-create ตอนซื้อ/จองครั้งแรก (ง) import CSV
- Field มาตรฐาน + **custom fields ต่อร้าน** (ร้านนิยามเอง เช่น "ไซส์เสื้อ", "แพ้อาหาร")
- **Dedupe**: ตรวจเบอร์/อีเมลซ้ำตอนสร้าง + merge flow (รวม 2 โปรไฟล์เป็น 1 พร้อมย้ายแต้ม/ประวัติ)
- **Tier system**: เลื่อน tier อัตโนมัติจากยอดสะสม, คงระดับ, ตกระดับ (นโยบายตั้งได้ต่อร้าน)
- **บัตรสมาชิกดิจิทัล**: QR จาก `memberCode` (unique ต่อ tenant) ใช้สแกนหน้าร้านทุกกิจการ
- **Tag / Segment**: ติด tag มือ + segment แบบ dynamic filter builder สำหรับการตลาด
- **Timeline** กิจกรรมลูกค้ารวมทุกโมดูล (ซื้อ POS / จอง Booking / พัก Hotel / คิว Q / ตั๋ว Ticket / แต้ม earn-burn / แลกรางวัล)
- **PDPA**: เก็บ consent เป็น log ถอนได้, สิทธิ์เจ้าของข้อมูล (ขอสำเนา/ขอลบ → anonymize), ทะเบียนคำขอ (DSR)
- **รายงาน**: ลูกค้าใหม่/active/churn, top spenders, tier distribution, consent coverage
- **Storefront หน้าสมาชิก**: ลูกค้าดูแต้ม/tier/ประวัติ/บัตร QR/แก้โปรไฟล์/จัดการ consent

### ไม่ทำใน v1 (🔜 อยู่ในหัวข้อ 3)
- Wallet pass (Apple/Google Wallet) — v1 ใช้ QR ในเว็บ
- Marketing automation (ส่ง campaign ตาม segment) — v1 ให้ export segment เป็น CSV เท่านั้น
- Referral program, ครอบครัว/บริษัท (corporate member), หลาย tier track (แยก track ต่อ unit)
- ให้คะแนน RFM/CLV แบบ ML — v1 ให้ตัวเลขดิบพอ

### ความสัมพันธ์กับชั้น identity
```
User (platform-level, email unique)          ← login ครั้งเดียว ใช้ทุกร้าน
  └── CustomerProfile (tenant-level)         ← "สมาชิก" ของร้านหนึ่ง
        @@unique([tenantId, userId])         ← 1 user เป็นสมาชิกร้านละ 1 โปรไฟล์
```
- โปรไฟล์ที่ staff สร้าง/auto-create/import อาจ **ยังไม่มี userId** (ลูกค้าไม่เคย login) → `userId` nullable
- เมื่อลูกค้า login ครั้งแรกด้วยอีเมล/เบอร์ที่ตรงกับโปรไฟล์ค้าง → **claim flow** (ผูก userId เข้าโปรไฟล์เดิม หลัง verify OTP)

---

## 2. Persona & User Stories

| Persona | Stories |
|---|---|
| **Owner** | ฉันอยากเห็นฐานลูกค้าทั้งองค์กร (ทุกกิจการรวมกัน) ว่ามีกี่คน ใครใช้จ่ายสูงสุด ใครหายไป · ฉันอยากตั้งเกณฑ์ tier เอง (Silver 0฿ / Gold 20,000฿ / Platinum 100,000฿) แล้วระบบเลื่อนให้อัตโนมัติ · ฉันอยากมั่นใจว่าเก็บ consent ถูกกฎหมาย PDPA ถ้าลูกค้าขอลบข้อมูลต้องทำได้ใน 30 วัน |
| **Manager** (คุมบางหน่วย) | ฉันอยากดูโปรไฟล์ลูกค้าที่มาใช้บริการหน่วยของฉัน เห็น timeline เพื่อดูแลลูกค้าประจำ · ฉันแก้ไขโปรไฟล์/ติด tag ได้ แต่ลบสมาชิกไม่ได้ |
| **Staff** (แคชเชียร์/หน้าร้าน) | ลูกค้าบอกเบอร์โทร → ฉันค้นเจอใน 2 วินาที หรือสแกน QR บัตร → ขึ้นชื่อ+tier+แต้มทันที · ลูกค้าใหม่ walk-in → ฉันสร้างสมาชิกได้ใน 30 วินาที (ชื่อ+เบอร์+ติ๊ก consent ที่ลูกค้าตอบปากเปล่า/เซ็น) · ระบบเตือนถ้าเบอร์ซ้ำกับคนที่มีอยู่ |
| **Customer** | ฉันสมัครออนไลน์เองได้ ไม่ต้องรอร้าน · login ครั้งเดียวเห็นแต้ม/tier ของร้านนี้รวมทุกสาขา/ทุกกิจการ · ฉันเปิดบัตร QR จากมือถือให้ร้านสแกน · ฉันดูประวัติซื้อ/จอง/แต้มย้อนหลังได้ · ฉันถอน consent การตลาด หรือขอลบข้อมูลได้เอง |
| **Platform Admin** | (backoffice) เห็นจำนวนสมาชิกต่อ tenant เพื่อ metrics — ไม่เห็น PII รายคนโดย default |

---

## 3. ฟังก์ชันทั้งหมด

### 3.1 โปรไฟล์สมาชิก
- ✅ Field มาตรฐาน: ชื่อ-นามสกุล, ชื่อเล่น, เบอร์โทร (normalize E.164, TH default), อีเมล, วันเกิด, เพศ, ที่อยู่, note ภายใน, รูปโปรไฟล์, ช่องทางที่รู้จักร้าน
- ✅ `memberCode` unique ต่อ tenant — รูปแบบ `{prefix}{running}` (เช่น `SB-000123`) ตั้ง prefix ได้, ออกเลขด้วย sequence ต่อ tenant (กันชนด้วย transaction)
- ✅ Custom fields ต่อร้าน: นิยาม field (TEXT/NUMBER/DATE/SELECT/MULTI_SELECT/BOOLEAN), บังคับ/ไม่บังคับ, โชว์บนฟอร์มสมัคร storefront หรือ staff-only
- ✅ สถานะ: ACTIVE / BLOCKED (ร้านแบน เช่น no-show ซ้ำ) / MERGED (ถูกยุบเข้าโปรไฟล์อื่น) / ANONYMIZED (ลบตาม PDPA)
- ✅ ค่าสรุปบนโปรไฟล์ (denormalized, อัปเดตจาก event): `lifetimeSpendSatang`, `last12moSpendSatang`, `visitCount`, `lastActivityAt`
- 🔜 รูปแนบเอกสาร (บัตรประชาชนสำหรับธุรกิจที่ต้องเก็บ เช่น โรงแรม — v1 ให้โมดูล Hotel เก็บใน booking ของตัวเอง)

### 3.2 สมัครสมาชิก 4 ทาง
- ✅ **(ก) Storefront self-signup**: `/s/{tenant}/member/signup` — ลูกค้า login ด้วย magic link/OTP ก่อน (ได้ userId) → กรอกฟอร์ม (field มาตรฐาน + custom field ที่ตั้ง showOnSignup) → ติ๊ก consent → ได้บัตรทันที
- ✅ **(ข) Staff สร้างหน้าร้าน**: ฟอร์มย่อในหน้า Member และ quick-create จากหน้าจอ POS/Booking (ชื่อ+เบอร์พอ) — `source=STAFF`, consent บันทึกเป็น `channel=STAFF_VERBAL` หรือ `STAFF_PAPER`
- ✅ **(ค) Auto-create ตอนธุรกรรมแรก**: โมดูลธุรกิจเรียก contract `member.findOrCreate` (ดูหัวข้อ 8) ด้วยเบอร์/อีเมล → ถ้าไม่เจอสร้างโปรไฟล์ minimal `source=AUTO`, consent การตลาด = **ยังไม่ให้** (เก็บเฉพาะ contact เพื่อ service ตามสัญญา) → ระบบส่งลิงก์ "claim บัตรสมาชิกของคุณ" ทาง notify
- ✅ **(ง) Import CSV**: wizard 4 ขั้น — upload → map คอลัมน์ (รวม custom fields) → validate + dedupe preview (แถวไหนจะสร้าง/อัปเดต/ข้าม/ชน) → commit เป็น background job + รายงานผล/ไฟล์ error กลับ. รองรับ initial points (ยิงเข้า Point เป็น ADJUST พร้อม reason=IMPORT)
- ✅ **Claim flow**: ลูกค้า login แล้วเบอร์/อีเมล match โปรไฟล์ที่ `userId=null` → verify OTP ไปยัง contact นั้น → ผูก userId (กัน account takeover: ห้าม auto-link โดยไม่ verify)

### 3.3 Dedupe & Merge
- ✅ ตอนสร้าง (ทุกช่องทาง): ตรวจเบอร์/อีเมล normalize แล้วชนกับสมาชิกเดิม → staff เห็น warning + ปุ่ม "ใช้โปรไฟล์เดิม" / storefront เจอโปรไฟล์ค้าง → เข้า claim flow / auto-create เจอ → คืนโปรไฟล์เดิม (ไม่สร้างซ้ำ)
- ✅ หน้ารายการ "สงสัยซ้ำ" (duplicate candidates): จับคู่จากเบอร์เหมือน / อีเมลเหมือน / ชื่อคล้าย+วันเกิดตรง
- ✅ **Merge flow** (OWNER/MANAGER เท่านั้น): เลือก source → target, preview field ที่จะเก็บ (target ชนะ, field ว่างเติมจาก source), สิ่งที่ย้าย: PointLedger ทั้งหมด (ยิง contract `point.transferOnMerge`), activity timeline, tags, consents (เก็บ log สองฝั่ง), reward/coupon ที่ถืออยู่ (ย้าย FK `CouponCode.memberId` + `RewardRedemption.memberId` — ดู step f ใน 7.3) → source เปลี่ยนสถานะ MERGED + `mergedIntoId`, memberCode ของ source ยัง resolve ไปหา target ได้ (สแกนบัตรเก่าไม่ตาย)
- ✅ Merge เป็น atomic transaction + `MemberMergeLog` (snapshot ก่อน merge, ใครทำ) + AuditLog
- 🔜 Undo merge ภายใน 7 วัน (v1: ห้าม undo — เตือน 2 ชั้นก่อนยืนยัน)

### 3.4 Tier System
- ✅ ร้านนิยาม tier ได้เอง (จำนวนไม่จำกัด, มี default template Silver/Gold/Platinum), แต่ละ tier: ชื่อ TH/EN, ลำดับ (level), เกณฑ์ยอดสะสม `entrySpendSatang`, เกณฑ์คงระดับ `maintainSpendSatang?`, สิทธิประโยชน์ (ข้อความ + `pointMultiplier` ที่โมดูล Point อ่านไปใช้), สี badge
- ✅ นโยบายการคำนวณ (ตั้งใน MemberSettings): หน้าต่างยอด = `CALENDAR_YEAR` (ปีปฏิทิน) หรือ `ROLLING_MONTHS` (12 เดือนย้อนหลัง ค่า default), นับจากยอดชำระจริงสุทธิ (net หลังส่วนลด, ไม่รวมยอดที่ void/refund)
- ✅ **เลื่อนขึ้น (upgrade)**: ทันทีที่ยอดสะสมในหน้าต่างถึงเกณฑ์ → event-driven จากธุรกรรม (ดู flow 7.4) + แจ้งลูกค้าผ่าน notify
- ✅ **คงระดับ/ตกระดับ (retain/downgrade)**: ประเมิน ณ สิ้นรอบ (cron รายวันเช็ครอบที่ครบกำหนด) — ถ้ายอดในรอบ ≥ maintainSpend → ต่ออายุ tier อีก 1 รอบ; ถ้าไม่ถึง → ตกลง tier ที่ยอดรองรับ + grace period ตั้งได้ (default 0 วัน) + แจ้งเตือนล่วงหน้า 30 วันก่อนสิ้นรอบถ้ายอดยังไม่ถึง
- ✅ Override มือ: staff ที่มีสิทธิ์ตั้ง tier มือได้ (เช่น VIP เจ้าของเชิญ) พร้อม reason + วันหมดอายุ override — บันทึก TierChangeLog ทุกครั้ง (AUTO_UPGRADE/AUTO_DOWNGRADE/RENEW/MANUAL)
- ✅ ปุ่ม "คำนวณใหม่ทั้งฐาน" (recalculate) หลังร้านแก้เกณฑ์ tier — background job + preview ผลกระทบก่อนยืนยัน (กี่คนขึ้น/ลง)
- 🔜 Tier แบบสะสมแต้ม (point-based entry) แทนยอดเงิน — v1 ยึดยอดเงินอย่างเดียว

### 3.5 บัตรสมาชิกดิจิทัล
- ✅ QR payload = token อ้าง memberCode (signed, มี checksum — ไม่ฝัง PII), refresh ได้ถ้ารั่ว
- ✅ หน้า "บัตร" บน storefront: ชื่อร้าน+โลโก้, ชื่อลูกค้า, memberCode, tier badge, แต้มคงเหลือ (อ่านจาก Point), QR ขนาดเต็มจอ + ปุ่มเพิ่ม brightness hint
- ✅ ฝั่งร้าน: ช่องสแกน/พิมพ์ค้นหาในทุกจุดขาย (POS/Booking/Hotel/Reward) → resolve `member.resolveByCode` → แสดง mini-card (ชื่อ, tier, แต้ม, tag, note แจ้งเตือน เช่น BLOCKED)
- 🔜 Apple/Google Wallet pass, บัตรพลาสติกพิมพ์ (export PDF บัตร)

### 3.6 Tag & Segment
- ✅ **Tag**: ร้านสร้าง tag อิสระ (ชื่อ+สี), ติด/ถอดรายคน หรือ bulk จากหน้า list/segment — ใช้กรองและเป็นเงื่อนไข Coupon/Reward ได้
- ✅ **Segment (dynamic)**: filter builder เก็บเป็น AST JSON — เงื่อนไขที่รองรับ v1: field มาตรฐาน (เพศ/อายุ/จังหวัด/วันเกิดเดือนนี้), custom field, tier, tag, ยอดใช้จ่ายช่วงเวลา, จำนวนครั้ง, lastActivityAt (เช่น "ไม่มา > 90 วัน"), เคยใช้บริการหน่วยไหน (จาก activity.unitId), consent การตลาด = granted (บังคับ AND เสมอเมื่อใช้เพื่อการตลาด)
  ```json
  { "op": "AND", "rules": [
      { "field": "tier", "cmp": "in", "value": ["gold","platinum"] },
      { "field": "lastActivityAt", "cmp": "olderThanDays", "value": 90 },
      { "field": "consent.MARKETING_ANY", "cmp": "eq", "value": true } ] }
  ```
- ✅ Segment count แบบ near-realtime (query ตอนเปิด + ปุ่ม refresh), export CSV (ตัด PII ตาม consent — คนไม่ให้ consent การตลาดไม่ติด export แบบ marketing)
- 🔜 Static list (snapshot), ส่ง campaign ตรงจาก segment (รอโมดูล marketing)

### 3.7 Timeline กิจกรรม
- ✅ ตาราง `MemberActivity` append-only — ทุกโมดูลยิงผ่าน **contract 2.7 `activity.log`** (approve แล้ว — _CONVENTIONS 2.7 + RESOLUTIONS D6): ซื้อ (POS sale), จองคิว/นัด, เข้าพัก (check-in/out), คิว Q, ตั๋ว, แต้ม earn/burn/expire, แลกรางวัล, ใช้คูปอง, tier change, แก้โปรไฟล์, consent change, merge — **producer บังคับตามตาราง RESOLUTIONS D6**: POS(sale) · Hotel(booking, checkin/out) · Restaurant(order ปิดบิล) · Booking(นัด DONE/NO_SHOW) · Ticket(ซื้อ/เข้างาน) · Reward(แลก) · Coupon(ใช้) · Point(earn/burn/expire) · Chat(เธรด resolved) — โมดูลเหล่านี้ต้องมีแถว Integration ระบุ type ที่ยิงในสเปคตัวเอง (ไม่ใช่แค่ "ทุกโมดูลควรยิง")
- ✅ แต่ละแถวเก็บ: type, refType/refId (ลิงก์ไปเอกสารต้นทาง), unitId? (เกิดที่กิจการไหน), amountSatang?, title snapshot (แสดงได้แม้เอกสารต้นทางถูก archive), occurredAt
- ✅ แสดงบน dashboard (โปรไฟล์ลูกค้า, กรองตาม type/unit/ช่วงเวลา, infinite scroll) และ storefront (เฉพาะ type ที่ลูกค้าควรเห็น: ธุรกรรม/แต้ม/รางวัล/tier — ไม่โชว์ note ภายใน/การแก้โดย staff)
- ✅ ธุรกรรมเงินย้อนหลังเข้าสูตร lifetimeSpend/tier ผ่าน activity ที่ `countsAsSpend=true`

### 3.8 PDPA (สำคัญ — กฎหมายไทย พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล 2562)
- ✅ **Consent log append-only** (`MemberConsent`): ประเภท v1 = `TERMS_PRIVACY` (จำเป็นต่อการให้บริการ), `MARKETING_EMAIL`, `MARKETING_SMS`, `MARKETING_LINE` — เก็บ: ให้/ถอน, เวอร์ชันข้อความ ณ ตอนกด, ช่องทาง (STOREFRONT/STAFF_VERBAL/STAFF_PAPER/IMPORT), เวลา, IP/actor. สถานะปัจจุบัน = แถวล่าสุดต่อ type
- ✅ ข้อความ consent ต่อร้าน: ร้านแก้ข้อความได้ → เวอร์ชันใหม่ (เก็บทุกเวอร์ชัน) — ลูกค้าเห็นข้อความเวอร์ชันที่ตัวเองเคยกดได้
- ✅ **สิทธิเจ้าของข้อมูล (DSR)**: ลูกค้ายื่นจาก storefront หรือ staff คีย์แทน — ประเภท: ACCESS (ขอสำเนาข้อมูล → ระบบ generate JSON/PDF), RECTIFY (แก้ข้อมูล), DELETE (ขอลบ → anonymize), WITHDRAW_CONSENT. ทะเบียนคำขอมี SLA countdown 30 วัน + สถานะ (PENDING/IN_PROGRESS/DONE/REJECTED พร้อมเหตุผล)
- ✅ **Anonymize (ลบแบบคงบัญชี)**: แทนที่ PII ทั้งหมด (ชื่อ→"ลูกค้า (ลบข้อมูลแล้ว)", เบอร์/อีเมล/ที่อยู่/วันเกิด/custom fields/รูป → null, memberCode คงไว้), **คงแถว ledger/ใบเสร็จ/activity เชิงตัวเลข** (ภาระทางบัญชี-ภาษีเป็น lawful basis ที่เก็บต่อได้), แต้มคงเหลือถูก expire (ADJUST เหตุผล PDPA_ERASURE), unlink userId, สถานะ ANONYMIZED — **irreversible**, ยืนยัน 2 ชั้น + OWNER เท่านั้น
- ✅ Data retention note ในหน้า settings (ข้อความให้ร้านแสดงนโยบาย)
- 🔜 Auto-delete ลูกค้า inactive เกิน N ปี (retention cron), DPO contact per tenant, consent ผ่าน cookie banner storefront

### 3.9 รายงาน — ดูหัวข้อ 10

### 3.10 Storefront หน้าสมาชิก — ดูหัวข้อ 6.2

---

## 4. Data Model (Prisma)

> ทุก model อยู่ scope tenant: `tenantId` + `@@unique([tenantId, ...])` — **ไม่มี unitId บนโปรไฟล์** (มีเฉพาะ tag ที่มาใน activity)
> relation ไปตารางแพลตฟอร์ม (`User`, `Tenant`) และข้ามโมดูล (Point) เขียนเป็น comment เพื่อไม่ผูก schema ข้ามไฟล์

```prisma
// ───────────────────────── enums ─────────────────────────
enum MemberStatus { ACTIVE BLOCKED MERGED ANONYMIZED }
enum MemberSource { STOREFRONT STAFF AUTO IMPORT }
enum Gender { MALE FEMALE OTHER UNSPECIFIED }

enum CustomFieldType { TEXT NUMBER DATE SELECT MULTI_SELECT BOOLEAN }

enum ConsentType { TERMS_PRIVACY MARKETING_EMAIL MARKETING_SMS MARKETING_LINE }
enum ConsentChannel { STOREFRONT STAFF_VERBAL STAFF_PAPER IMPORT SYSTEM }

enum TierChangeType { AUTO_UPGRADE AUTO_DOWNGRADE RENEW MANUAL RECALC }

enum ActivityType {
  SALE            // ซื้อ (POS/Restaurant/Hotel folio ปิดบิล)
  BOOKING         // จองนัดหมาย
  HOTEL_STAY      // เช็คอิน/เช็คเอาต์
  QUEUE           // ใช้บัตรคิว
  TICKET          // ซื้อ/ใช้ตั๋วอีเวนต์
  POINT_EARN POINT_BURN POINT_ADJUST POINT_EXPIRE
  REWARD_REDEEM COUPON_USE
  TIER_CHANGE PROFILE_UPDATE CONSENT_CHANGE MERGE NOTE
}

enum DsrType { ACCESS RECTIFY DELETE WITHDRAW_CONSENT }
enum DsrStatus { PENDING IN_PROGRESS DONE REJECTED }

enum ImportJobStatus { UPLOADED MAPPED VALIDATED RUNNING DONE FAILED }

// ───────────────────────── core ─────────────────────────
model CustomerProfile {
  id            String        @id @default(cuid())
  tenantId      String
  userId        String?       // ผูก identity กลาง — null = ยังไม่ claim
  memberCode    String        // "SB-000123" unique ต่อ tenant, immutable
  status        MemberStatus  @default(ACTIVE)
  source        MemberSource
  // ---- PII (nullable ทั้งหมด เพื่อรองรับ ANONYMIZED + minimal auto-create)
  firstName     String?
  lastName      String?
  nickname      String?
  phone         String?       // เก็บ normalize E.164 เช่น +66812345678
  email         String?       // เก็บ lowercase
  birthDate     DateTime?     // เก็บเฉพาะวันที่ (UTC midnight)
  gender        Gender        @default(UNSPECIFIED)
  addressLine   String?
  province      String?
  postalCode    String?
  avatarUrl     String?
  referralNote  String?       // รู้จักร้านจากไหน (free text v1)
  internalNote  String?       // note ภายใน staff เห็นเท่านั้น
  customFields  Json          @default("{}")  // { fieldKey: value } ตาม MemberFieldDef
  // ---- tier (denormalized เพื่อ read เร็ว — source of truth = TierChangeLog ล่าสุด)
  tierId          String?
  tierSince       DateTime?
  tierExpiresAt   DateTime?   // สิ้นรอบประเมินปัจจุบัน (null = tier ฐาน ไม่หมดอายุ)
  tierIsManual    Boolean     @default(false)
  // ---- summary (denormalized, อัปเดตจาก activity — reconcile ได้จาก MemberActivity)
  lifetimeSpendSatang  Int    @default(0)
  windowSpendSatang    Int    @default(0)  // ยอดในหน้าต่าง tier ปัจจุบัน
  visitCount           Int    @default(0)
  lastActivityAt       DateTime?
  // ---- lifecycle
  blockedReason  String?
  mergedIntoId   String?      // เมื่อ status=MERGED
  anonymizedAt   DateTime?
  qrTokenVersion Int          @default(1)   // เพิ่มเมื่อ refresh QR (revoke ของเก่า)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  tier          MemberTier?        @relation(fields: [tierId], references: [id])
  mergedInto    CustomerProfile?   @relation("MergeTree", fields: [mergedIntoId], references: [id])
  mergedFrom    CustomerProfile[]  @relation("MergeTree")
  tags          MemberTagAssignment[]
  consents      MemberConsent[]
  activities    MemberActivity[]
  tierLogs      TierChangeLog[]
  dsrRequests   DataSubjectRequest[]

  @@unique([tenantId, memberCode])
  @@unique([tenantId, userId])       // 1 user = 1 โปรไฟล์ต่อร้าน (Postgres: NULL ไม่ชนกัน)
  @@index([tenantId, phone])         // dedupe lookup — ไม่ unique เพราะ MERGED/ANONYMIZED ค้างค่า null/ซ้ำได้
  @@index([tenantId, email])
  @@index([tenantId, status, lastActivityAt])
  @@index([tenantId, tierId])
  @@index([tenantId, createdAt])
}

model MemberCodeCounter {          // ออกเลขสมาชิกต่อ tenant (atomic increment ใน transaction)
  tenantId String @id
  nextNo   Int    @default(1)
}

model MemberSettings {             // singleton ต่อ tenant
  tenantId            String  @id
  codePrefix          String  @default("M-")
  codePadding         Int     @default(6)
  tierWindowMode      TierWindowMode @default(ROLLING_MONTHS)
  tierWindowMonths    Int     @default(12)     // ใช้เมื่อ ROLLING_MONTHS
  downgradeGraceDays  Int     @default(0)
  duplicateCheck      Json    @default("{\"phone\":true,\"email\":true}")
  retentionNote       String? // ข้อความนโยบายเก็บข้อมูล แสดงบน storefront
  updatedAt           DateTime @updatedAt
}
enum TierWindowMode { CALENDAR_YEAR ROLLING_MONTHS }

// ───────────────────────── custom fields ─────────────────────────
model MemberFieldDef {
  id           String          @id @default(cuid())
  tenantId     String
  key          String          // "shirt_size" — immutable หลังสร้าง
  label        String          // "ไซส์เสื้อ"
  labelEn      String?
  type         CustomFieldType
  options      Json?           // สำหรับ SELECT/MULTI_SELECT: ["S","M","L"]
  required     Boolean         @default(false)
  showOnSignup Boolean         @default(false) // โชว์บนฟอร์ม storefront
  sortOrder    Int             @default(0)
  archivedAt   DateTime?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  @@unique([tenantId, key])
  @@index([tenantId, archivedAt])
}

// ───────────────────────── tier ─────────────────────────
model MemberTier {
  id                  String   @id @default(cuid())
  tenantId            String
  name                String   // "Gold"
  nameEn              String?
  level               Int      // 0 = ฐาน, มากกว่า = สูงกว่า
  entrySpendSatang    Int      @default(0)   // ยอดสะสมในหน้าต่างเพื่อเลื่อนเข้า
  maintainSpendSatang Int?     // ยอดต่อรอบเพื่อคงระดับ (null = ใช้ entry)
  pointMultiplier     Decimal  @default(1.0) @db.Decimal(4, 2) // Point (09) อ่านไปใช้
  benefits            Json     @default("[]") // [{th,en}] ข้อความสิทธิประโยชน์
  badgeColor          String   @default("#000000")
  archivedAt          DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  members             CustomerProfile[]
  @@unique([tenantId, level])
  @@unique([tenantId, name])
  @@index([tenantId, archivedAt])
}

model TierChangeLog {
  id          String         @id @default(cuid())
  tenantId    String
  memberId    String
  member      CustomerProfile @relation(fields: [memberId], references: [id])
  changeType  TierChangeType
  fromTierId  String?
  toTierId    String?
  reason      String?        // บังคับเมื่อ MANUAL
  actorUserId String?        // null = ระบบ
  windowSpendSatang Int?     // ยอด ณ ตอนประเมิน (หลักฐาน)
  createdAt   DateTime       @default(now())
  @@index([tenantId, memberId, createdAt])
}

// ───────────────────────── tag & segment ─────────────────────────
model MemberTag {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  color     String   @default("#000000")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  assignments MemberTagAssignment[]
  @@unique([tenantId, name])
}

model MemberTagAssignment {
  id        String          @id @default(cuid())
  tenantId  String
  memberId  String
  tagId     String
  member    CustomerProfile @relation(fields: [memberId], references: [id])
  tag       MemberTag       @relation(fields: [tagId], references: [id])
  createdAt DateTime        @default(now())
  createdBy String?         // userId ของ staff (null = ระบบ/import)
  @@unique([memberId, tagId])
  @@index([tenantId, tagId])
}

model MemberSegment {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  description String?
  filter      Json     // AST — ดู 3.6
  lastCount   Int?     // cache นับล่าสุด
  lastCountAt DateTime?
  archivedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([tenantId, name])
}

// ───────────────────────── timeline ─────────────────────────
model MemberActivity {            // append-only — ห้าม update/delete
  id            String          @id @default(cuid())
  tenantId      String
  memberId      String
  member        CustomerProfile @relation(fields: [memberId], references: [id])
  unitId        String?         // เกิดที่กิจการไหน (null = tenant-level เช่น consent)
  type          ActivityType
  refType       String?         // 'PosSale' | 'Booking' | 'PointLedger' | ...
  refId         String?
  title         String          // snapshot แสดงผล เช่น "ซื้อที่ ร้านชาบูสาขา 2 · ใบเสร็จ R2-00045"
  amountSatang  Int?            // มูลค่าธุรกรรม (ยอดสุทธิ) — บวก=จ่ายเข้า ลบ=refund
  pointDelta    Int?            // สำหรับ type กลุ่ม POINT_*
  countsAsSpend Boolean         @default(false) // เข้าเกณฑ์ lifetime/tier ไหม
  visibleToCustomer Boolean     @default(true)
  meta          Json?
  actorUserId   String?
  occurredAt    DateTime        @default(now())
  createdAt     DateTime        @default(now())
  @@index([tenantId, memberId, occurredAt(sort: Desc)])
  @@index([tenantId, type, occurredAt])
  @@index([tenantId, refType, refId])   // reverse lookup ตอน void
}

// ───────────────────────── PDPA ─────────────────────────
model ConsentTextVersion {
  id        String      @id @default(cuid())
  tenantId  String
  type      ConsentType
  version   Int
  bodyTh    String
  bodyEn    String?
  createdAt DateTime    @default(now())
  @@unique([tenantId, type, version])
}

model MemberConsent {              // append-only log — สถานะปัจจุบัน = แถวล่าสุดต่อ (memberId, type)
  id            String          @id @default(cuid())
  tenantId      String
  memberId      String
  member        CustomerProfile @relation(fields: [memberId], references: [id])
  type          ConsentType
  granted       Boolean
  textVersionId String?         // เวอร์ชันข้อความ ณ ตอนกด
  channel       ConsentChannel
  actorUserId   String?         // ใครบันทึก (ลูกค้าเอง/staff)
  ipAddress     String?
  createdAt     DateTime        @default(now())
  @@index([tenantId, memberId, type, createdAt(sort: Desc)])
}

model DataSubjectRequest {
  id           String          @id @default(cuid())
  tenantId     String
  memberId     String
  member       CustomerProfile @relation(fields: [memberId], references: [id])
  type         DsrType
  status       DsrStatus       @default(PENDING)
  detail       String?         // คำขอของลูกค้า
  resolution   String?         // ผลการดำเนินการ / เหตุผล reject
  requestedVia ConsentChannel
  dueAt        DateTime        // requestedAt + 30 วัน (SLA PDPA)
  processedBy  String?         // userId
  processedAt  DateTime?
  exportFileUrl String?        // สำหรับ ACCESS
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  @@index([tenantId, status, dueAt])
  @@index([tenantId, memberId])
}

// ───────────────────────── merge & import ─────────────────────────
model MemberMergeLog {
  id             String   @id @default(cuid())
  tenantId       String
  sourceMemberId String
  targetMemberId String
  sourceSnapshot Json     // โปรไฟล์ source เต็มก่อน merge
  movedSummary   Json     // { points: 120, activities: 34, tags: 2, consents: 3 }
  actorUserId    String
  createdAt      DateTime @default(now())
  @@index([tenantId, targetMemberId])
}

model MemberImportJob {
  id           String          @id @default(cuid())
  tenantId     String
  status       ImportJobStatus @default(UPLOADED)
  fileName     String
  fileUrl      String
  columnMap    Json?           // { csvCol: fieldKey }
  options      Json?           // { onDuplicate: 'SKIP'|'UPDATE', consentChannel, initialPointsCol? }
  totalRows    Int?
  createdCount Int             @default(0)
  updatedCount Int             @default(0)
  skippedCount Int             @default(0)
  errorCount   Int             @default(0)
  errorFileUrl String?         // CSV แถวที่พลาด + เหตุผล
  actorUserId  String
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  @@index([tenantId, createdAt])
}
```

**หมายเหตุ index/constraint**
- เบอร์/อีเมล **ไม่ unique** ระดับ DB (โปรไฟล์ MERGED/เบอร์บ้านร่วมกันมีจริง) — dedupe บังคับที่ service layer เฉพาะ `status=ACTIVE`
- `@@unique([tenantId, userId])` ใน Postgres อนุญาต NULL หลายแถว → โปรไฟล์ยังไม่ claim อยู่ร่วมกันได้
- `MemberActivity`, `MemberConsent`, `TierChangeLog`, `MemberMergeLog` = **append-only** (บังคับใน service + ไม่มี endpoint update/delete)

---

## 5. API Endpoints

> ทุก endpoint อยู่ใต้ tenant context (session/domain resolver) — member เป็น tenant-scoped จึง**ไม่มี** `/api/u/[unitId]/` prefix
> สิทธิ์อ้างตาราง หัวข้อ 9 · ทุก mutation ที่แตะ PII/tier/merge → เขียน `AuditLog`

### 5.1 Dashboard (staff)
| Method | Path | Body/Query หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/members` | `q` (ชื่อ/เบอร์/อีเมล/code), `tierId`, `tagIds`, `status`, `segmentId`, `sort`, cursor pagination | member.read |
| POST | `/api/members` | field มาตรฐาน + `customFields` + `consents:[{type,granted,channel}]` + `dedupeOverride?:bool` → 409 + candidates ถ้าซ้ำและไม่ override | member.create |
| GET | `/api/members/[id]` | โปรไฟล์เต็ม + tier + tags + สรุปแต้ม (proxy Point) | member.read |
| PATCH | `/api/members/[id]` | partial update (field มาตรฐาน + customFields) — เขียน activity PROFILE_UPDATE | member.update |
| POST | `/api/members/[id]/block` `/unblock` | `{ reason }` | member.block |
| GET | `/api/members/[id]/activities` | `types?`, `unitId?`, `from/to`, cursor | member.read |
| POST | `/api/members/[id]/notes` | `{ text }` → activity type NOTE (visibleToCustomer=false) | member.update |
| GET | `/api/members/resolve` | `code=` (QR/memberCode) → mini-card { id, name, tierName, pointBalance, tags, status } — ใช้ทุกจุดขาย | member.read |
| POST | `/api/members/[id]/qr/refresh` | เพิ่ม qrTokenVersion (revoke QR เก่า) | member.update |
| GET | `/api/members/duplicates` | รายการคู่สงสัยซ้ำ | member.merge |
| POST | `/api/members/merge` | `{ sourceId, targetId, confirm: true }` → preview เมื่อ `confirm:false` | member.merge |
| POST | `/api/members/[id]/tags` / DELETE `.../tags/[tagId]` | ติด/ถอด tag | member.update |
| POST | `/api/members/bulk/tags` | `{ memberIds \| segmentId, addTagIds, removeTagIds }` | member.update |

### 5.2 Tier
| Method | Path | หมายเหตุ | สิทธิ์ |
|---|---|---|---|
| GET/POST | `/api/member-tiers` · PATCH/DELETE `/api/member-tiers/[id]` | DELETE = archive (ห้ามลบถ้ามีสมาชิกถือ tier → บังคับย้ายก่อน) | member.tier.manage |
| POST | `/api/member-tiers/recalculate` | `{ dryRun: true }` → preview { upgrades, downgrades } · `dryRun:false` → enqueue job | member.tier.manage |
| POST | `/api/members/[id]/tier` | `{ tierId, reason, expiresAt? }` — manual override | member.tier.manage |

### 5.3 Custom fields / Tag / Segment / Settings
| Method | Path | สิทธิ์ |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/member-fields` `[id]` (DELETE = archive, key immutable) | member.settings |
| GET/POST/PATCH/DELETE | `/api/member-tags` `[id]` | member.update |
| GET/POST/PATCH/DELETE | `/api/member-segments` `[id]` | member.segment |
| POST | `/api/member-segments/preview` `{ filter }` → `{ count, sample: 10 }` | member.segment |
| GET | `/api/member-segments/[id]/export?purpose=marketing\|service` → CSV (marketing กรอง consent) | member.export |
| GET/PATCH | `/api/member-settings` (prefix, tier window, dedupe policy, retention note) | member.settings |

### 5.4 Import
| Method | Path | หมายเหตุ |
|---|---|---|
| POST | `/api/member-imports` | multipart upload CSV → job UPLOADED (limit 20,000 แถว/ไฟล์) |
| POST | `/api/member-imports/[id]/map` | `{ columnMap, options }` → VALIDATED + validation report |
| POST | `/api/member-imports/[id]/commit` | enqueue background job → RUNNING → DONE |
| GET | `/api/member-imports` `/[id]` | สถานะ + ผลลัพธ์ + errorFileUrl |

สิทธิ์ทั้งหมด: member.import (OWNER/MANAGER)

### 5.5 PDPA
| Method | Path | หมายเหตุ | สิทธิ์ |
|---|---|---|---|
| GET/POST | `/api/members/[id]/consents` | POST = `{ type, granted, channel }` append log + activity | member.update |
| GET/POST/PATCH | `/api/consent-texts` | จัดการข้อความ consent (POST = เวอร์ชันใหม่) | member.settings |
| GET/POST | `/api/dsr` · PATCH `/api/dsr/[id]` | ทะเบียนคำขอ, PATCH เปลี่ยนสถานะ+resolution | member.pdpa |
| POST | `/api/members/[id]/export-data` | generate ไฟล์ข้อมูลลูกค้า (ACCESS) | member.pdpa |
| POST | `/api/members/[id]/anonymize` | `{ dsrId, confirmText }` — OWNER เท่านั้น, irreversible | member.pdpa (OWNER) |

### 5.6 Internal service contracts (เรียกภายใน module boundary — ไม่ expose HTTP สาธารณะ)
```ts
// signature ตาม _CONVENTIONS 2.6 / 2.6b / 2.7 (approve แล้ว — RESOLUTIONS D6)
member.findOrCreate({ tenantId, phone?|email?, name?, source: 'AUTO'|'STAFF',
                      consents?: [{type, granted, channel}], unitId?, tx? })
  → { memberId, created: boolean }        // ใช้โดย POS/Restaurant/Booking/Hotel/Ticket ตอนธุรกรรมแรก — เบอร์ normalize E.164
member.sendOtp({ tenantId, channel: 'phone'|'email', to, purpose: 'LINK_SESSION'|'CLAIM' })
  → { otpRef }
member.verifyOtp({ tenantId, otpRef, otp })
  → { memberId }
  // ใช้ verify ตัวตน guest ที่โต๊ะอาหาร (Restaurant), Hotel check-in, Ticket guest, Booking
  // ⚠️ คนละ use case กับ claim flow เดิม (3.2/7.1 — ผูก userId เข้าโปรไฟล์ค้าง) ซึ่ง**คงไว้ตามเดิม**
  // rate limit/lockout กติกาเดียวกับ claim: ผิด 5 ครั้ง → lock 30 นาที
member.resolveByCode({ tenantId, code })  → mini-card | null   // สแกน QR
member.recordSpend({ tenantId, memberId, unitId, amountSatang, saleId })
  → อัปเดต summary + ตรวจ tier upgrade
  // ⚠️ นี่คือ **trigger เดียวของ tier engine** — POS เป็นผู้เรียกหลังปิดบิลผ่าน outbox กลาง (post-commit, ดู 8.1)
member.reverseSpend({ tenantId, refType, refId })   // ตอน void/refund
member.getProfile({ tenantId, memberId })            // read-only — Chat panel / Coupon / Reward (คืน tier ผ่าน relation tier.level)
member.resolveSegmentMembers({ tenantId, segmentId, purpose: 'marketing'|'service' })
  → memberId[]   // service ให้โมดูลอื่น (Coupon แจกโค้ด) — purpose=marketing บังคับ AND consent ตามกฎ 11.11
activity.log({ tenantId, memberId, unitId?, module, type, refType?, refId?, title, amountSatang?, pointDelta?, countsAsSpend?, visibleToCustomer?, meta?, occurredAt? })
  // = contract 2.7 — ยิงผ่าน outbox กลางเดียวกับ point/notify, idempotent ด้วย (refType, refId, type)
```

### 5.7 Storefront (customer — auth ด้วย session ลูกค้า, resolve tenant จาก domain/slug)
| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/api/store/member/me` | โปรไฟล์ตัวเอง + tier + แต้มคงเหลือ + บัตร (QR token) — 404 ถ้ายังไม่สมัคร |
| POST | `/api/store/member/signup` | ฟอร์มสมัคร (ต้อง login แล้ว) — ตรวจ claim ก่อน |
| POST | `/api/store/member/claim/verify` | `{ otp }` ผูก userId เข้าโปรไฟล์ค้าง |
| PATCH | `/api/store/member/me` | แก้ field ที่อนุญาต (ห้ามแตะ memberCode/tier/summary) |
| GET | `/api/store/member/activities` | timeline เฉพาะ visibleToCustomer |
| GET/POST | `/api/store/member/consents` | ดู/เปลี่ยน consent ของตัวเอง |
| POST | `/api/store/member/dsr` | ยื่นคำขอ PDPA |
| GET | `/api/store/member/card` | payload บัตร: `{ qrToken, memberCode, tier, pointBalance }` |

---

## 6. UI Screens

### 6.1 Dashboard `(app)` — เมนูโซน tenant-level "สมาชิก" (เห็นตลอด ไม่ขึ้นกับ unit switcher)
| หน้า | เนื้อหา | Mobile |
|---|---|---|
| `/app/members` | ตาราง/การ์ดรายชื่อ: ค้นหา instant (ชื่อ/เบอร์/code), filter (tier/tag/status/segment), bulk action (tag), ปุ่ม + สมาชิกใหม่, ปุ่ม import, ปุ่มสแกน QR (เปิดกล้อง) | list card, ปุ่มสแกนเด่น, search sticky |
| `/app/members/new` | ฟอร์มสร้าง: มาตรฐาน + custom fields + บล็อก consent (checkbox ต่อ type + ช่องทาง) — เจอซ้ำ → banner คู่ candidate + ปุ่ม "เปิดโปรไฟล์เดิม" | single column |
| `/app/members/[id]` | โปรไฟล์: header (ชื่อ, code, tier badge, แต้มคงเหลือ, สถานะ, tags) + tabs: **ภาพรวม** (summary cards: lifetime spend, ยอดปีนี้, visit, หน่วยที่ใช้บ่อย) / **Timeline** (filter type+unit) / **แต้ม** (embed ledger จากโมดูล Point) / **Consent & PDPA** (สถานะ consent ปัจจุบัน + ประวัติ + ปุ่มยื่น DSR แทนลูกค้า) / **ตั้งค่า** (block, refresh QR, merge, anonymize) | tabs เป็น horizontal scroll |
| `/app/members/duplicates` | รายการคู่สงสัยซ้ำ + ปุ่ม merge → modal preview (field ไหนถูกเก็บ, อะไรจะย้าย) → ยืนยัน 2 ชั้น | stack เทียบบน-ล่าง |
| `/app/members/import` | wizard 4 ขั้น (upload → map → validate → commit) + ประวัติ job | รองรับแต่แนะนำ desktop |
| `/app/members/segments` | รายการ segment + count · `/segments/[id]` filter builder (แถวเงื่อนไข AND/OR, dropdown field → cmp → value), preview count live, export | builder แบบ stacked rows |
| `/app/members/tiers` | ตาราง tier (level/เกณฑ์/multiplier/จำนวนสมาชิก), แก้ inline, ปุ่ม "คำนวณใหม่ทั้งฐาน" (แสดง dry-run ก่อน), ตั้งค่า window/grace | card ต่อ tier |
| `/app/members/settings` | prefix เลขสมาชิก, custom fields (จัดลำดับ drag), ข้อความ consent (แก้ = เวอร์ชันใหม่), dedupe policy, retention note | — |
| `/app/members/pdpa` | ทะเบียน DSR: ตาราง (type, สมาชิก, สถานะ, dueAt countdown สีแดงเมื่อ <7วัน), หน้า detail ดำเนินการ | — |
| `/app/members/reports` | ดูหัวข้อ 10 | การ์ดสรุป |
| Mini-card (component ใช้ร่วม) | popup หลังสแกน/ค้นใน POS/Booking/Reward: ชื่อ+tier+แต้ม+tags+คำเตือน (BLOCKED/แต้มใกล้หมดอายุ) + ลิงก์โปรไฟล์เต็ม | bottom-sheet |

### 6.2 Storefront `(store)` — `/s/[tenantSlug]/member/...` (และ custom domain `/member/...`)
| หน้า | เนื้อหา |
|---|---|
| `/member` | ยังไม่ login → ปุ่ม login/สมัคร · login แล้วยังไม่เป็นสมาชิก → ฟอร์มสมัคร · เป็นแล้ว → **หน้าหลักสมาชิก**: การ์ดบัตร (tier + แต้มใหญ่ๆ + ปุ่ม "แสดง QR"), แต้มใกล้หมดอายุ (จาก Point), shortcut ประวัติ/รางวัล |
| `/member/card` | บัตรเต็มจอ: QR ใหญ่, memberCode, tier badge, ชื่อ — พื้นขาวตัวดำ (B&W), auto-refresh token |
| `/member/history` | timeline ลูกค้า (เฉพาะ visibleToCustomer) กรอง: ทั้งหมด/ซื้อ/จอง/แต้ม |
| `/member/profile` | แก้โปรไฟล์ + custom fields (เฉพาะ showOnSignup) + จัดการ consent (toggle ต่อ type พร้อมข้อความเวอร์ชันปัจจุบัน) + ลิงก์ "สิทธิ์ในข้อมูลของฉัน" → ฟอร์ม DSR |
| `/member/signup` | ฟอร์มสมัคร + consent checkboxes (TERMS_PRIVACY บังคับ, marketing เลือกได้ — **ห้าม pre-check** ตาม PDPA) |
- ทุกหน้า i18n TH/EN, mobile-first (ลูกค้าใช้มือถือเป็นหลัก), empty/loading/error state ครบ

---

## 7. Business Flows

### 7.1 สมัครเอง (storefront)
1. ลูกค้าเข้า `/member` → login magic link/OTP (ได้ `User`)
2. ระบบตรวจ: (ก) มี CustomerProfile ที่ userId นี้ → เข้าหน้าสมาชิกเลย (ข) มีโปรไฟล์ค้าง (email/เบอร์ match, userId=null) → **claim flow**: ส่ง OTP ไป contact ของโปรไฟล์ค้าง → verify → ผูก userId + activity MERGE-less claim (ค) ไม่มี → ฟอร์มสมัคร
3. Submit: validate + normalize เบอร์ → สร้างโปรไฟล์ (ออก memberCode จาก counter ใน transaction) → เขียน MemberConsent ทุก checkbox → activity CONSENT_CHANGE + PROFILE_UPDATE → แสดงบัตร
- **Failure**: OTP claim ผิด 5 ครั้ง → lock claim 30 นาที + แจ้งร้าน (กัน enumeration) · เบอร์ที่กรอกชนโปรไฟล์ ACTIVE ที่มี userId อื่น → บล็อกพร้อมข้อความ "เบอร์นี้ถูกใช้แล้ว ติดต่อร้าน" (ห้ามเผยชื่อเจ้าของเดิม)

### 7.2 Staff สร้าง + auto-create
1. Staff กรอกชื่อ+เบอร์ (ฟอร์มเต็มหรือ quick-create จาก POS) → service ตรวจ dedupe (phone/email, status=ACTIVE)
2. ซ้ำ → 409 + candidates → staff เลือก "ใช้โปรไฟล์เดิม" (แนบ member เข้าธุรกรรม) หรือ override (สิทธิ์ member.create + reason)
3. ไม่ซ้ำ → สร้าง `source=STAFF` + consent ตาม checkbox ที่ staff ติ๊ก (channel STAFF_VERBAL/PAPER)
4. **Auto-create** (`member.findOrCreate`): โมดูลธุรกิจส่ง phone/email → เจอ ACTIVE คืน memberId เดิม · ไม่เจอ → สร้าง minimal (`source=AUTO`, consent เฉพาะ TERMS_PRIVACY channel=SYSTEM ระดับ service necessity, marketing = ไม่ให้) → enqueue notify "รับบัตรสมาชิก" 1 ครั้ง (ไม่ spam ซ้ำ)
- **Failure**: findOrCreate ไม่มีทั้ง phone/email → error ให้โมดูลต้นทางทำธุรกรรมแบบ guest (memberId=null) — ห้ามสร้างโปรไฟล์เปล่าไร้ contact

### 7.3 Merge
1. เข้าจากหน้า duplicates หรือปุ่มบนโปรไฟล์ → เลือก source/target (default: target = ตัวที่มี userId หรือเก่ากว่า)
2. `POST /merge confirm:false` → preview: ตาราง field เทียบ + สรุปสิ่งที่จะย้าย (แต้มคงเหลือ source, activity n แถว, tags, coupons/rewards ที่ถือ)
3. ยืนยัน (พิมพ์ memberCode ของ source) → transaction:
   a. ย้าย MemberActivity, MemberTagAssignment (ข้าม duplicate), MemberConsent (append log ใหม่ฝั่ง target ด้วยค่า "granted มากกว่า" — ถ้าฝั่งใดฝั่งหนึ่ง revoke marketing → target = revoke, เลือกทาง privacy-safe)
   b. เรียก `point.transferOnMerge({ sourceMemberId, targetMemberId })` (โมดูล Point ทำ BURN(source)+EARN(target) คู่กัน ดู 09)
   c. รวม summary (lifetime/window/visit) → recompute tier ของ target
   d. source: status=MERGED, mergedIntoId, ปลด userId ถ้า target มีอยู่แล้ว (ถ้า source มี userId แต่ target ไม่มี → ย้าย userId ไป target)
   e. MemberMergeLog + AuditLog + activity type MERGE ทั้งสองฝั่ง
   f. **ย้ายสิทธิ์ Coupon/Reward** (ใน tx เดียวกัน — ตาม RESOLUTIONS D6): `UPDATE "CouponCode" SET "memberId"=target WHERE "memberId"=source` + `UPDATE "RewardRedemption" SET "memberId"=target WHERE "memberId"=source`
4. หลัง merge: `resolveByCode(source.memberCode)` → follow `mergedIntoId` คืน target (บัตรเก่ายังใช้ได้)
- **กติกา limit หลัง merge (D6)**: `perMemberLimit` ของ Coupon (08) และ `limitPerMember*` ของ Reward (07) นับรวมแบบ **union** — แถวที่ย้ายไป target ถูกนับด้วย query เดิมโดยอัตโนมัติ (intended ไม่ใช่ bug) · target ถือโค้ด PERSONAL ของแคมเปญเดียวกัน 2 ใบ (จากสองโปรไฟล์) → เก็บทั้งคู่ (สิทธิ์ที่แจกแล้วคือคำสัญญา) แต่ redeem ได้ตาม limit รวม
- **Failure**: transaction ล้ม → rollback ทั้งหมด · target=BLOCKED/ANONYMIZED → ห้าม merge

### 7.4 Tier evaluation
- **Upgrade (event-driven)**: `member.recordSpend` ทุกครั้ง → windowSpend += amount → ถ้า ≥ entrySpend ของ tier ที่ level สูงกว่าปัจจุบัน (เลือกสูงสุดที่ผ่านเกณฑ์) → เปลี่ยน tierId, tierSince=now, tierExpiresAt=สิ้นรอบใหม่, TierChangeLog(AUTO_UPGRADE) + activity + `notify(template:'tier_upgraded')` — ทำใน transaction เดียวกับ recordSpend, ห้าม downgrade จาก event นี้
- **Retain/Downgrade (cron รายวัน 03:00 ตามโซนร้าน)**: หา member ที่ `tierExpiresAt <= now` และ `tierIsManual=false` → คำนวณยอดรอบที่จบ: ≥ maintainSpend → RENEW (ต่อ tierExpiresAt อีก 1 รอบ, reset windowSpend) · ไม่ถึง → หา tier สูงสุดที่ยอดผ่าน entry → AUTO_DOWNGRADE (+grace days ถ้าตั้ง) + notify
- **เตือนล่วงหน้า**: cron เดียวกัน หา member ที่เหลือ 30 วันก่อน expire และยอดยังไม่ถึง maintain → notify 1 ครั้ง/รอบ
- **Void/refund**: `member.reverseSpend` → ลด windowSpend/lifetime → **ไม่ downgrade ทันที** (รอประเมินสิ้นรอบ — กติกาเป็นมิตรลูกค้า + กัน flapping) แต่ถ้ายังอยู่ใน transaction เดียวกับ upgrade ที่เพิ่งเกิดจากบิลนั้น (upgrade เกิดจาก refType/refId เดียวกัน ภายใน 24 ชม.) → revert upgrade

### 7.5 PDPA: ขอลบข้อมูล
1. ลูกค้ายื่นจาก storefront (หรือ staff คีย์) → DSR type=DELETE, dueAt=+30 วัน → notify OWNER
2. OWNER เปิดเคส → ระบบแสดงผลกระทบ: แต้มคงเหลือที่จะถูกยกเลิก, รางวัล/คูปองที่ถือ, ธุรกรรมที่จะถูกคง (ตัวเลข ไม่มีชื่อ)
3. ติดต่อยืนยันลูกค้า (นอกระบบ/ผ่าน notify) → กด Anonymize: transaction — ล้าง PII ทุก field + customFields, ลบ avatar file, expire แต้ม (`point.adjust` reason PDPA_ERASURE), revoke consents (append log), unlink userId, status=ANONYMIZED, DSR=DONE, AuditLog
4. ข้อมูลที่**คงไว้** (lawful basis: ภาระบัญชี/ภาษี): PointLedger (ผูก memberId เดิมที่ไร้ PII), PosSale snapshot ฝั่ง POS, MemberActivity เชิงตัวเลข (title ถูก rewrite เป็น generic)
- **Failure/กติกา**: มีจองค้างอนาคต (Hotel/Booking แจ้งผ่าน query cross-module) → เตือนให้จัดการก่อน แต่ไม่ block ถ้า OWNER ยืนยัน · REJECTED ต้องกรอกเหตุผล (แสดงต่อลูกค้า)

### 7.6 Import CSV
upload (UTF-8/TIS-620 auto-detect, ≤20,000 แถว) → map (auto-guess หัวคอลัมน์ TH/EN) → validate: เบอร์/อีเมล format, custom field type, dedupe ภายในไฟล์ + กับฐาน → รายงานก่อน commit (สร้าง n / อัปเดต n / ข้าม n / error n) → commit background (chunk 500 แถว/transaction, job resume ได้) → ผลลัพธ์ + error CSV · initial points → `point.adjust` ต่อคน (idempotencyKey = `import:{jobId}:{row}` — รันซ้ำไม่บวกซ้ำ)

---

## 8. Integration (contract ข้อ 2 ของ _CONVENTIONS)

| จุด | Contract | ทิศทาง |
|---|---|---|
| 8.1 ปิดบิล POS | POS (2.1) หลัง createSale สำเร็จ → เรียก `member.recordSpend` + `activity.log(type:SALE)` **ผ่าน outbox กลาง (post-commit)** — `recordSpend` เป็น **trigger เดียวของ tier engine** และ **POS เป็นผู้เรียกเพียงรายเดียว** (RESOLUTIONS D6) · void/refund → `member.reverseSpend` — Member ไม่แตะตาราง POS ตรง | POS → Member |
| 8.2 แต้ม | Member **ไม่คำนวณแต้มเอง** (กติกา 2.2) — หน้าโปรไฟล์/บัตรอ่าน balance ผ่าน `point.getBalance(memberId)` (อ่านอย่างเดียว), tier ส่ง `pointMultiplier` ให้ Point อ่านตอนคิด earn | Member ↔ Point |
| 8.3 Notify | tier change, claim OTP, เชิญรับบัตร (auto-create), เตือนก่อนตกระดับ, DSR update → `notify({ tenantId, to:{memberId}, channel, template, data })` (2.5) — notify service ตรวจ consent marketing เองสำหรับ template กลุ่ม marketing; template ธุรกรรม (transactional) ส่งได้เสมอ | Member → Notify |
| 8.4 Identity | โมดูลอื่นเก็บ `memberId?` อ้างอิงเท่านั้น (2.6) — snapshot ชื่อได้เฉพาะเอกสาร freeze (ใบเสร็จ) — เมื่อ anonymize เอกสาร freeze ไม่ต้องแก้ (ถูกต้องตาม lawful basis) | ทุกโมดูล → Member |
| 8.5 Activity **(contract 2.7 — approve แล้ว)** | `activity.log({...})` (นิยามใน 5.6) — ทุกโมดูลยิง timeline เข้าที่เดียว แทนที่ Member จะไป query ข้ามโมดูล · **producer บังคับ = ตาราง RESOLUTIONS D6** (POS·Hotel·Restaurant·Booking·Ticket·Reward·Coupon·Point·Chat) — แต่ละโมดูลต้องระบุแถว Integration ของตัวเอง | ทุกโมดูล → Member |
| 8.6 findOrCreate **(contract 2.6b — approve แล้ว)** | `member.findOrCreate({...})` + `member.sendOtp/verifyOtp` — มาตรฐาน auto-create/verify ที่ POS/Restaurant/Booking/Hotel/Ticket ใช้ร่วม (กันแต่ละโมดูลสร้างเองคนละแบบ) | ทุกโมดูล → Member |
| 8.7 Merge → Point | `point.transferOnMerge({ tenantId, sourceMemberId, targetMemberId, actorUserId, idempotencyKey: 'MemberMergeLog:{id}:transfer' })` **(2.2 v2 — approve แล้ว, idempotencyKey บังคับทุก mutation ตาม D5)** | Member → Point |
| 8.8 Coupon/Reward | อ่าน tier/tag ของ member เพื่อเงื่อนไข (`member.get(memberId)` read-only) | Coupon/Reward → Member |

---

## 9. Permissions (RBAC — member เป็น tenant-scoped: ตรวจ 3 มิติ, action หน้างาน tag unitId ลง activity)

| Action key | OWNER | MANAGER | STAFF | หมายเหตุ |
|---|---|---|---|---|
| member.read | ✅ | ✅ | ✅ (ถ้าได้โมดูล) | staff เห็นโปรไฟล์+timeline, **ไม่เห็น internalNote ถ้าไม่มี member.update** |
| member.create | ✅ | ✅ | ✅ | quick-create หน้าร้าน |
| member.update | ✅ | ✅ | ⚙️ (default ✅ แก้ contact/tag, ❌ block) | |
| member.block | ✅ | ✅ | ❌ | |
| member.merge | ✅ | ✅ | ❌ | |
| member.tier.manage | ✅ | ❌ | ❌ | เกณฑ์ tier + manual override + recalc |
| member.segment | ✅ | ✅ | ❌ | |
| member.export | ✅ | ⚙️ (default ❌) | ❌ | export = PII ออกนอกระบบ → AuditLog เสมอ |
| member.import | ✅ | ⚙️ | ❌ | |
| member.settings | ✅ | ❌ | ❌ | custom fields, consent text, prefix |
| member.pdpa | ✅ | ⚙️ (ดู/ดำเนินการ ยกเว้น anonymize) | ❌ | **anonymize = OWNER เท่านั้น** hard-coded |

⚙️ = custom ได้ผ่าน `Membership.permissions` · Customer เข้าถึงเฉพาะ endpoint `/api/store/member/*` ของตัวเอง (ตรวจ session.userId → โปรไฟล์ตัวเองเท่านั้น)

---

## 10. Reports & Metrics (`/app/members/reports`)

| รายงาน | เนื้อหา | นิยาม |
|---|---|---|
| ภาพรวมฐานสมาชิก | total, ACTIVE, ใหม่เดือนนี้ (กราฟ 12 เดือน), แยก source | — |
| Active / Churn | Active = มี activity countsAsSpend ใน 90 วัน (config ได้) · At-risk = 91–180 วัน · Churned > 180 วัน — กราฟแนวโน้ม + รายชื่อ drill-down (ต่อยอดเป็น segment ได้ 1 คลิก) | อิง lastActivityAt |
| Top spenders | Top 50 ตามยอด (เลือกช่วง: 30วัน/12เดือน/ตลอด), คอลัมน์: ยอด, ครั้ง, tier, หน่วยที่ใช้บ่อย | จาก MemberActivity |
| Tier distribution | จำนวน+% ต่อ tier, ขึ้น/ลง/ต่ออายุเดือนนี้ (จาก TierChangeLog) | — |
| New member funnel | สมัครแยกช่องทาง 4 ทาง, อัตรา claim ของ AUTO (สร้าง auto → claim จริงกี่ %) | — |
| Consent coverage | % ให้ marketing consent ต่อ type, จำนวนถอนเดือนนี้ | PDPA posture |
| DSR SLA | คำขอค้าง, ใกล้ครบ 30 วัน, เวลาเฉลี่ยที่ใช้ปิด | — |
| วันเกิดเดือนนี้ | รายชื่อ (เฉพาะ consent marketing) → export/ติด tag | ใช้ทำแคมเปญ |
- ทุกรายงานกรองช่วงเวลา + export CSV (ตามสิทธิ์ member.export) · ตัวเลขฝั่ง Owner Overview (การ์ด "สมาชิกใหม่วันนี้") ดึงจาก API report เดียวกัน

---

## 11. Edge Cases & Rules

1. **เบอร์ซ้ำข้ามคน (ครอบครัวใช้เบอร์เดียว)** — dedupe เป็น warning ไม่ใช่ hard block; staff override ได้พร้อม reason → มีได้หลาย ACTIVE เบอร์เดียวกัน แต่ auto-create/claim จะ match **คนที่ activity ล่าสุด** และ storefront claim ต้องผ่าน OTP เสมอ
2. **memberCode ห้าม reuse/เปลี่ยน** — สแกนบัตรเก่าของโปรไฟล์ MERGED ต้อง resolve ถึง target (follow chain, จำกัดลึก 5 ชั้นกัน loop); ANONYMIZED → คืน "ไม่พบสมาชิก"
3. **Race ออกเลขสมาชิก** — `MemberCodeCounter` update ด้วย atomic increment ใน transaction เดียวกับ insert; ชน unique → retry 3 ครั้ง
4. **Claim hijack** — ห้ามผูก userId อัตโนมัติจาก email/เบอร์ match เฉยๆ ต้อง OTP ไปยัง contact **ของโปรไฟล์เดิม** (ไม่ใช่ contact ที่เพิ่งกรอก)
5. **Merge แล้วธุรกรรม in-flight ของ source** — โมดูลอื่นถือ memberId เก่าอยู่: จุดรับ event (recordSpend/point.earn) ต้อง resolve MERGED → redirect ไป target อัตโนมัติ + log warning
6. **แก้เกณฑ์ tier ย้อนหลัง** — ไม่มีผลอัตโนมัติ ต้องกด recalc (มี dry-run) เพื่อกัน mass-downgrade เงียบๆ; recalc เขียน TierChangeLog type=RECALC
7. **windowSpend กับ ROLLING_MONTHS** — เก็บ denormalized + reconcile รายคืนจาก `SUM(MemberActivity.amountSatang where countsAsSpend, occurredAt in window)`; ค่าที่ต่างกัน → แก้ตาม SUM + log
8. **ลูกค้า BLOCKED** — ยังสะสม/ใช้แต้มไม่ได้ (Point ตรวจสถานะก่อน earn/burn), จองใหม่ไม่ได้, แต่ดูข้อมูลตัวเอง+ยื่น DSR ได้เสมอ (สิทธิ์ตามกฎหมายไม่หายเพราะถูกแบน)
9. **Custom field key immutable** — เปลี่ยน label ได้อย่างเดียว; archive field → ค่าที่เก็บอยู่ไม่หาย แค่ซ่อนจากฟอร์ม; ห้าม reuse key ที่ archive แล้ว
10. **Consent ห้าม pre-check + แยก granular** — TERMS_PRIVACY เป็นเงื่อนไขใช้บริการ (necessary) แต่ marketing แต่ละช่องแยกติ๊ก; import ระบุที่มา consent ต่อไฟล์ (ร้านยืนยันว่าได้ consent มาแล้วจากไหน) — ถ้าไม่ระบุ → import แบบ "ไม่มี marketing consent"
11. **Segment เพื่อการตลาด** — ทุก export/นับที่ purpose=marketing บังคับ AND consent อัตโนมัติที่ service layer แม้ผู้ใช้ไม่ใส่เงื่อนไข (กันร้านเผลอผิด PDPA)
12. **ไทม์โซนวันเกิด/รอบ tier** — ประเมินตาม timezone ของ tenant (default Asia/Bangkok) แม้เก็บ UTC; รอบ CALENDAR_YEAR = 1 ม.ค. 00:00 เวลาร้าน
13. **Isolation** — ทุก query ผ่าน Prisma extension inject tenantId; `userId` เป็น platform-level: ห้ามมี endpoint ที่ list โปรไฟล์ข้าม tenant จาก userId (ยกเว้น "ร้านของฉัน" ฝั่ง customer ที่คืนเฉพาะ {tenantName, memberCode})
14. **PII ใน log** — application log ห้ามพิมพ์เบอร์/อีเมลเต็ม (mask `+6681***5678`); AuditLog เก็บ before/after ได้ (อยู่ใน DB ภายใต้ tenant isolation)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional**
- [ ] สมัครครบ 4 ช่องทาง: storefront (พร้อม claim+OTP) / staff / auto-create (findOrCreate คืนตัวเดิมเมื่อซ้ำ) / import (ไฟล์ 1,000 แถวมี dup+error → ตัวเลข created/updated/skipped/error ตรง + error CSV เปิดได้)
- [ ] memberCode รันต่อเนื่องไม่ซ้ำภายใต้ concurrent create 50 พร้อมกัน (เทส race)
- [ ] Dedupe: สร้างเบอร์ซ้ำ → 409+candidates; override ได้ตามสิทธิ์; merge แล้วแต้ม+timeline+tags ย้ายครบ, บัตรเก่า resolve ไป target, source กลายเป็น MERGED
- [ ] Tier: ยอดถึงเกณฑ์ → upgrade ทันที + notify; cron สิ้นรอบ → renew/downgrade ถูกตามยอด; recalc dry-run ตัวเลขตรงกับ commit จริง; manual override บันทึก log+reason
- [ ] บัตร QR: สแกน resolve <1s, refresh token แล้วอันเก่าใช้ไม่ได้, โปรไฟล์ BLOCKED ขึ้นคำเตือนบน mini-card
- [ ] Segment: filter ทุก operator คืนผลถูก (เทียบ SQL มือ), export purpose=marketing ไม่มีคนไม่ให้ consent ปน
- [ ] Timeline: ธุรกรรมจาก POS/Booking/Point ขึ้นครบ, ลูกค้าไม่เห็นแถว visibleToCustomer=false
- [ ] PDPA: consent log append-only (ไม่มี UPDATE ใน DB), anonymize แล้ว PII หายทุกตาราง (query ตรวจ) แต่ ledger/ใบเสร็จอยู่ครบ, DSR ครบ lifecycle + SLA countdown

**Isolation & Security**
- [ ] เทส tenant leak: user 2 tenant สลับกัน — API ทุกเส้นคืนเฉพาะข้อมูล tenant ตัวเอง (รวม resolve memberCode ของ tenant อื่น → 404)
- [ ] Customer endpoint เข้าถึงได้เฉพาะโปรไฟล์ตัวเอง (ลอง IDOR ด้วย memberId คนอื่น → 403/404)
- [ ] Claim ไม่ผ่าน OTP → ผูก userId ไม่ได้; OTP ผิด 5 ครั้ง → lock
- [ ] AuditLog ครบทุก mutation: merge, block, anonymize, export, tier override, consent เปลี่ยนโดย staff
- [ ] Log ไม่มี PII เต็มรูป (สุ่มตรวจ)

**i18n / UI**
- [ ] ทุกหน้า dashboard+storefront มี TH/EN ครบ (ไม่มี string ค้าง hardcode), B&W minimal, responsive 3 breakpoint
- [ ] empty state (ยังไม่มีสมาชิก/segment/DSR), loading skeleton, error state ครบทุกหน้า
- [ ] ฟอร์ม consent: ไม่ pre-check marketing, ข้อความเวอร์ชันปัจจุบันแสดงถูก

**Performance**
- [ ] ค้นหาสมาชิก (ฐาน 100k คน) < 300ms (ใช้ index ตาม schema), timeline paginate ลื่น
- [ ] Import 20,000 แถวจบ < 5 นาที ไม่ timeout (background job)
