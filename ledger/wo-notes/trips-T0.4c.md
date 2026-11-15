# wo-notes — TRIPS T0.4c (ผู้สร้าง · 14 พ.ย. 2569)

ทรี `/root/projects/shark-trips-l2` · branch `wip/trips-t0.4c` @de940e2e3 (ยังไม่ commit — ผู้คุม commit) · ไม่มี migration · ไม่แก้ข้อสอบ/probe

## 1. สิ่งที่ได้ (ไฟล์:บรรทัด ณ ทรีงาน)
| เรื่อง | ที่ | สรุป |
|---|---|---|
| (1) เพดาน PUBLIC | `capacity.ts:93-94` | `REASON_TH.PUBLIC_UNPAID_SHARE` (ไม่มีคำว่า "เต็ม" · ไม่บอกจำนวน) |
| | `capacity.ts:211` | `DeparturePolicy.unpaidHoldMaxPct` |
| | `capacity.ts:627` | `phase1HoldInTx`: หลัง `blockOf` → SOLD_OUT → **เพดาน** (เฉพาะ `isPublic(c)`) → `holdSeatsSql` (D.1(1)) |
| | `capacity.ts:631-646` | `assertPublicShareInTx`: SELECT ไม่ล็อกใต้ล็อก 1a · Σ(qtyPublic+qtyAllot) + min(expiresAt) ของ hold `tenantId/unitId/departureId` · ACTIVE · `expiresAt > ctx.now` · `channel = ANY(PUBLIC_CHANNELS)` · `purpose IN (PAYMENT, SHOP_CONFIRM)` · เพดาน `ceil(capacity × pct / 100)` · ที่นับ = 0 ⇒ ผ่าน (ตะกร้าแรก Q1) · เกิน ⇒ `HOLD_LIMIT {reason, retryAfterSec}` (retryAfterSec = max(1, ceil((min expiresAt − ctx.now)/1000))) |
| | `capacity-service.ts:81,88-89,118-119` | คีย์ `K.X31` ใน `DEP_KEYS` · `settingOf(INT 1–100)` → `unpaidHoldMaxPct` (ค่าตั้งผิดรูป ⇒ VALIDATION SETTINGS_INVALID เดิม) |
| | `defs/trips.ts:502` | แถวคีย์ใหม่ต่อจาก `showLeftAtOrBelow` ตามสัญญา §3.2 ตรงตัวอักษร |
| | `TRIPS-DEFAULTS.md` | แถว X31 ต่อท้าย X28 |
| | `booking.ts:454-466` | `reserveHoldsInTx` รวมจำนวนต่อรอบ → `reserveInTx(HOLD)` ครั้งเดียวต่อรอบ (เรียง id) · `insertHoldsInTx` คงแถวละบรรทัด |
| (2) ยืนยันตรวจรอบ | `capacity.ts:648-663` | `assertDeparturesSellableInTx(tx, c, policies, ids)` (ส่งออกจาก capacity.ts · **ไม่** ส่งออกทาง index.ts): `gateOfTx` → `lockDeparture` เรียง id → `blockOf(..., fullIsOpen=true)` → `blockAbort` |
| | `booking.ts:969-971` | เรียกที่ต้น `finalizeCoreInTx` (ครอบ confirm FAIL/REHOLD · bookTripsNow · finalizeTripsInTx K1.1) |
| (3) Party ไม่ค้าง | `booking.ts:607-609,637` | `PreparedConfirm.booker: BookerRef = {partyId} \| {name, phone, email}` (แทน `bookerPartyId` · แช่แข็ง+WeakSet เดิม) |
| | `booking.ts:715-725` | `prepareCore`: STAFF partyId ตรวจนอก tx (อ่านอย่างเดียว · ไม่พบ ⇒ NOT_FOUND เดิม) · ไม่มี `safeFindOrCreate` |
| | `booking.ts:997-1000,1033` | ใน `finalizeCoreInTx` หลัง advisory คำอนุมัติ ก่อน 2c: `safeFindOrCreate(tenantId, {...}, t)` (client ของ tx) · null ⇒ `BUSY BOOKER_UNAVAILABLE` (rollback) |

## 2. ลำดับล็อกที่ใช้จริง
**ถือ PUBLIC (holdTrips):** 0 INSERT SellBasket → 0 advisory ตะกร้า (acquireHoldCapInTx) → สินค้า FOR SHARE เรียง → ต่อรอบเรียง id: [TRY advisory + นับ X10] → 1a `FOR UPDATE` → `blockOf` → SOLD_OUT → **นับ hold (SELECT ไม่ล็อก)** → UPDATE held → (ครบทุกรอบ) 2a INSERT hold ต่อบรรทัด · placeHold: ชั้น 0 BLOCK advisory → … → เหมือนกันหลัง 1a
**ยืนยัน (confirmTrips FAIL):** 0 SellBasket FOR UPDATE → 0 rekey (PUBLIC) → สินค้า FOR SHARE → 1a รอบเรียง id (CONVERT) → **1a′ `assertDeparturesSellableInTx`** (gateOfTx · lockDeparture ซ้ำแถวที่ถืออยู่ = ไม่รอ) → 2a ผูก/แปลง hold → advisory คำอนุมัติ → **Party (findFirst ≤ 3 + INSERT บน tx)** → 2c เลขจอง → 2b → 2d งวด → โค้ดส่วนลด → 2h → ตะกร้า CAS
**REHOLD (STAFF):** สินค้า → 1a → ปล่อย hold เก่า → reserveInTx(HOLD) → insert hold → 1a′ → … เหมือนบน · ตรวจ 1a′ ของ FAIL มาก่อนผูก hold ⇒ รอบปิด = SLOT_CLOSED ไม่เข้า REHOLD
**bookTripsNow:** 0 INSERT ตะกร้า → สินค้า → reserveInTx(HOLD) (1a + blockOf) → insert hold → 1a′ (ซ้ำ · ไม่รอ) → …
ไม่มีล็อกใหม่ · ไม่มีการอ่านค่าตั้งใน tx (pct มาจาก `policies` ที่โหลดก่อน tx) · ทุกคิวรีใช้ client ของ tx

## 3. การตัดสินใจที่ใบสั่งเงียบ
1. `reserveHoldsInTx` รวมเกิน `QTY_MAX` (50) ต่อรอบ ⇒ แบ่งก้อน ≤ 50 (intent ของ Sellable รับ ≤ 50) — ก้อนที่ 2+ มองไม่เห็นก้อนก่อนหน้า (ยังไม่มีแถว hold) ⇒ นับขาดเฉพาะตะกร้า PUBLIC > 50 ที่ต่อรอบเดียว (W1.2a จำกัด 10 ที่/การถือ) — หนี้ข้อ 3
2. `retryAfterSec` ไม่มีเพดานบน (ตามสูตร §3.1) — hold SHOP_CONFIRM (X2 ชม.) ทำให้ได้หลักหมื่นวินาที (ดูข้อแย้ง PH-8)
3. `assertDeparturesSellableInTx` ไม่พบรอบ ⇒ NOT_FOUND · ไม่มีค่าตั้งของรอบ ⇒ VALIDATION POLICIES_REQUIRED (requirePolicy เดิม)
4. Party: เส้นทาง safeFindOrCreate กลืน error ⇒ ถ้าฐานยกเลิก tx (เช่น 40P01 ระหว่าง INSERT Party) ได้ BUSY BOOKER_UNAVAILABLE แทนการลองใหม่ของ runTx (หายาก · Party ไม่มี unique/ล็อก)

## 4. ข้อแย้งต่อข้อสอบ t0.4c (ปล่อยแดง)
- **PH-8**: สัญญา §3.1 ให้ `retryAfterSec` = เวลาถึง hold ที่นับซึ่งหมดเร็วสุด · ข้อนี้มีแต่ hold SHOP_CONFIRM (12 ชม. ค่าเริ่ม X2) ⇒ 43200 แต่ `shareR` บังคับ ≤ HOLD_MIN×60 (3600) — ส่วนอื่นของข้อผ่าน (HOLD_LIMIT + reason ถูก) · เสนอ ORACLE-EDIT: ขอบบนของ `retryAfterSec` ใน PH-8 = X2 ชม.×3600 หรือผู้คุมกำหนดเพดาน retryAfterSec ในสัญญา
- **PH-6**: ทุก assert ของพฤติกรรมผ่าน (เพดาน · sold 5 / held 5) แต่ `invOk` (D.3: sold = Σ ที่นั่งของการจองที่ขายแล้ว) แดงเพราะข้อสอบแปลง hold ด้วย `convertHoldInTx` ตรง ๆ โดยไม่มีการจอง ⇒ sold 5 / ไม่มีรายการจอง 0 โดยนิยาม (ข้อสอบสร้างสภาพนี้เอง ไม่เกี่ยวกับโค้ด) · เสนอ ORACLE-EDIT: ตัด invOk ของ PH-6 หรือแปลงผ่าน confirm PAY_LATER/CONVERT

## 5. หนี้ส่งต่อ
1. W1.2a/W1.2b: รหัสจอ `SLOT_BUSY` สำหรับ `HOLD_LIMIT` reason `PUBLIC_UNPAID_SHARE` (ก่อน M1) · ข้อสอบ w1.2 ที่นับ Party หลังยืนยันล้มคาด 0
2. ย้าย rekey หลัง 1a (T0.7) · Party ซ้ำเมื่อสองการจองพร้อมกันใช้เบอร์ใหม่เดียวกัน (มีมาก่อน · ไม่มี unique)
3. ตะกร้า PUBLIC > QTY_MAX ที่นั่งต่อรอบเดียว: นับเพดานขาดระหว่างก้อน (ข้อ 3.1)
4. เพดานฐาน `capacity − reserved` เมื่อ A1.4 · retryAfterSec ของ SHOP_CONFIRM (ข้อแย้ง PH-8)
5. K1.1 `platform/basket.ts`: finalizeTripsInTx ล็อกรอบเองเรียง id ถ้าผู้เรียกยังไม่ล็อก — ผู้เรียกที่ล็อกแถวอื่นก่อนต้องรักษาลำดับเดิม

## 6. ผลรัน (14–15 พ.ย. · log ใน `scratchpad/t0.4c/` · ฐาน qc-trips ep-calm-sun)
- seed ×2: รอบสอง "ไม่มีการเขียน" (created/updated ว่าง)
- **t0.4c 48/50** — แดง PH-6 PH-8 (ข้อแย้ง §4)
- แดงเพราะใบนี้ตามคาด (§7): t0.1 R-1 R-2 (93/96) · t0.4 S-14 RC-12 (107/110) · t0.6 S-11 S-14 (124/126) · t0.4 RC-2 (ถือ PUBLIC เกินครึ่งรอบ · ได้ HOLD_LIMIT PUBLIC_UNPAID_SHARE)
- แดงเพราะใบนี้ที่ไม่ได้คาดใน §7 (ทุกข้อ = ข้อขอบเขต git/เทียบไฟล์ หรือรายการคีย์ฝังในข้อสอบ · ไม่ใช่พฤติกรรม): t0.1 F-2 (คีย์ใหม่ชั้น PRODUCT ไม่อยู่ในรายการของข้อสอบ) · t0.3 S-13 (115/116) · t0.7 S-11 (capacity.ts แก้ > 8 บรรทัด) S-15 (148/150) · t0.8 S-8 (159/160) · t1.3 S-13 (123/124) · t1.4 S-13 (91/92) · w1.1 S-12 (83/84) · a1.1 S-9 S-10 S-11 G-1 (121/125 · G-1 = t0.1 R-1/R-2/F-2) · a1.2 S-6 S-7 S-8 (170/173) · a1.3 S-6 S-7 S-9 (118/121) — ข้อ S ของ a1.x นับ `scripts/qc-trips-t0.4c.mts` (commit ของผู้ร่างบน branch) และ scratchpad ของผู้อื่นด้วย
- t0.5 130/130
- fitness 54/54 ทั้งสองแบบ (มี/ไม่มี DATABASE_URL) · typecheck exit 0
