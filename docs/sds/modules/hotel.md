# Hotel (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
โมดูลโรงแรม/ที่พัก — จัดการประเภทห้อง ห้องพัก เรตพื้นฐาน และการจอง (สร้าง/เช็คอิน/เช็คเอาท์/ยกเลิก) + ปฏิทินว่าง. ผู้ใช้: OWNER/MANAGER/STAFF ของ BusinessUnit type `HOTEL`. อยู่ **Layer 3: Business** (02) — scope=unit (ทุกแถวมี tenantId+unitId). เข้าเส้นเงินผ่าน POS ตอนเช็คเอาท์ (ไม่เปิดเส้นเงินใหม่).
โค้ด: `src/lib/modules/hotel/service.ts` · `src/lib/modules/hotel/actions.ts` · schema `prisma/schema/hotel.prisma`.

## Data model (prisma/schema/hotel.prisma)
- **HotelRoomType** — ประเภทห้อง: `name` `code?` `capacity` `baseRateSatang` `active`(soft-delete) `sortOrder`. unique `@@unique([unitId, name])`. scope axis=unit.
- **HotelRoom** — ห้องจริง: `number` `floor?` `status`(AVAILABLE/OCCUPIED/CLEANING/OOO) `active` `roomTypeId`. unique `@@unique([unitId, number])`.
- **HotelReservation** — การจอง: `code`(running ต่อ unit เช่น HR-2607-0001) `status`(BOOKED/CHECKED_IN/CHECKED_OUT/CANCELLED) `guestName/Phone/Email` `customerId?`(ผูก Member ภายหลัง) `roomTypeId` `roomId?` `checkInDate/checkOutDate`(@db.Date, checkOut exclusive) `nights` `adults/children` `ratePerNightSatang` `totalSatang`(snapshot) เวลา checkedIn/Out/cancelledAt. unique `@@unique([unitId, code])`. index availability `[unitId, roomTypeId, checkInDate, checkOutDate]` และกันห้องซ้อน `[unitId, roomId, checkInDate, checkOutDate]`.
- เงิน = Int สตางค์ · idempotency: ไม่มี key เฉพาะ (ผูก POS ตอนเช็คเอาท์ผ่าน idempotencyKey ของ PosSale).

## Service API (src/lib/modules/hotel/service.ts)
- helper: `parseDate/dateToStr/nightsBetween/todayBkk/addDaysStr` — จัดการวันที่ BKK.
- `listRoomTypes/createRoomType/updateRoomType/archiveRoomType` — CRUD ประเภทห้อง (archive = active=false, ห้าม hard delete).
- `listRooms/createRoom/setRoomStatus/archiveRoom` — CRUD ห้อง.
- `availability(...)` — คำนวณห้องว่างต่อประเภทในช่วง (นับ reservation ที่ทับช่วง).
- `createReservation({...})` — สร้างการจอง: gen code, คำนวณ nights/total จากเรต, ตรวจห้องว่าง.
- `assignableRooms(...)` — ห้องที่ assign ได้ (ว่าง + ไม่ซ้อน).
- `checkIn(...)` — BOOKED→CHECKED_IN, assign roomId, ตั้ง room.status=OCCUPIED, checkedInAt.
- `checkOut(...)` — CHECKED_IN→CHECKED_OUT: **สร้าง PosSale ผ่าน createSale** (payMethods CASH, ค่าห้อง nights×rate) → เข้าบัญชี, ตั้ง room=CLEANING.
- `cancelReservation(...)` — →CANCELLED + cancelReason.
- `dashboardData/listReservations/getReservation` — อ่าน.
- ข้อผิดพลาด: โยนข้อความไทยเมื่อห้องไม่ว่าง/สถานะไม่ถูกต้อง.

## การเชื่อมต่อ
- **ออก → POS** (Service call ผ่าน composition/service): `checkOut` เรียก `createSale` (pos/service) sourceModule ไม่ระบุ HOTEL โดยตรง — เข้า PosSale → outbox `pos.sale.paid` → account-bridge → บัญชี (เส้นเงินกลาง 02).
- **Member**: `customerId` scalar (ผูก Member.findOrCreate ภายหลัง — P1 เก็บ snapshot guest).
- ไม่มี outbox event ของตัวเอง.

## Permissions (assertCan ใน actions.ts)
`hotel.room.create` · `hotel.room.delete` · `hotel.reservation.create` · `hotel.reservation.cancel`. (setRoomStatus/checkIn/checkOut ทำผ่าน action ที่ผ่าน requireTenant+resolve unit; ไม่มี permission string เพิ่มเติมนอกเหนือรายการนี้)

## UI
- `/app/u/[unitSlug]/hotel` — แดชบอร์ด · `/app/u/[unitSlug]/hotel/reservations` — รายการจอง · `/app/u/[unitSlug]/hotel/setup` — ตั้งค่าประเภทห้อง/ห้อง.

## การทดสอบ
- `scripts/qc-hotel-money.mts` (Fable oracle, WO-0008) — พิสูจน์เส้น Hotel→POS→บัญชี: เช็คเอาท์แล้วค่าห้อง (nights×rate) เข้าสมุดบัญชีอัตโนมัติ (ชุด HT-2.*). fail-before: hotel ไม่เคยเรียก POS → HT-2.* แดง.
- `scripts/qc-systems.mts` — happy path ผ่าน service จริง (hotel รวมอยู่ในชุด 7 ระบบ ~30 assertion).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- P1 slice: ไม่มี housekeeping เต็ม, night audit, folio/POS charge ระหว่างพัก, rate plan/ฤดู, channel manager/OTA, storefront จองออนไลน์, group booking (ระบุใน header schema).
- customerId ยังไม่ auto-link Member ตอน check-in.
- WO-0040 (หนี้เส้นเงิน): DEPOSIT/ROOM_CHARGE map บัญชีถูก + oracle harness booking→POS + เลิกพึ่ง tx 30s.

## ราคา (SVC H.1)

> โค้ด: `src/lib/modules/hotel/` (facade `index.ts`) · ใบสั่ง `ledger/svc-briefs/svc-brief-h.1.md` · สเปก `docs/modules/01-hotel.md` §3.2 §4 §7.1

### ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `pricing.ts` | pure ล้วน — `resolveSeason` `resolveNightPrice` `quoteStay` `depositFor` `refundFor` `taxLines` · ไม่แตะฐาน · ไม่อ่านนาฬิกาเครื่อง · วันที่ = สตริง `YYYY-MM-DD` ไทย · เงิน = สตางค์ Int |
| `rates.ts` | CRUD แผนราคา/ขั้นบันไดยกเลิก/ฤดู/วันหยุด/ตารางราคา/แก้มือรายวัน + `loadPricingContext` (≤ 8 คิวรี) + `ratePreview` (ปฏิทินราคา + เหลือขาย) + `loadRatesScreen` |
| `hotel-settings.ts` | จอตั้งค่าโรงแรม — ครอบ `loadSettingsForm` (unitType `HOTEL`) / `setSettings` / `resetSetting` |

### ลำดับคิดราคา 1 คืน (`resolveNightPrice`)
1. **OVERRIDE** — `HotelRateOverride` ตรง (ประเภท, แผน, วัน) → ไม่มี → (ประเภท, ทุกแผน `null`, วัน)
2. **ฤดู** — ฤดู `ACTIVE` ที่ `dateStart ≤ วัน ≤ dateEnd` (รวมวันจบ) priority สูงสุด · เสมอ ⇒ `dateStart` ล่าสุด
3. **RATE** — แถว `HotelRate(แผน, ประเภท, ฤดู)` → ไม่มี → `HotelRate(แผน, ประเภท, null)` · เลือกช่อง: วันหยุด (`HotelHoliday` และ `priceHolidaySatang` ≠ null) → สุดสัปดาห์ (`dayOfWeek ∈ rooms.hotel.weekendDays` · dow คิดจากสตริง ไม่ใช้ `getDay`) → ธรรมดา
4. **FALLBACK** — ไม่มีแถวเลย ⇒ `rooms.hotel.baseRate` (ชั้น ประเภทห้อง → แผน) × (10000 + `dayOfWeekAdjustBp[dow]`) / 10000 ปัดตาม `rooms.money.rounding`
5. ไม่มีราคาฐาน ⇒ `null` = ขายไม่ได้ (storefront ซ่อน · จอราคาแสดง —)
6. + เตียงเสริม × `extraBedPriceSatang` ของประเภท (quote ตรวจ `extraBedAllowed` · baseOccupancy + เตียง ≤ maxOccupancy)

### quoteStay
คืน `[checkIn, checkOut)` ทุกคืน + `nightsTotal` · ล้ม = `INVALID_RANGE` · `PAST_DATE` (วันเข้า < today) · `OUT_OF_RANGE` (บริบทโหลดวันหยุด/แก้มือไว้แค่ `ctx.range` — คืนนอกช่วงปฏิเสธ ไม่คิดเงียบ ๆ · `resolveNightPrice` รายคืนไม่ตรวจช่วง — ผู้เรียกต้องโหลดบริบทให้ครอบวันเอง) · เพดานระบบ 365 คืน (`MAX_NIGHTS`) · `TOO_FAR` (วันเข้า − today > maxAdvanceBookingDays) · `CLOSED_TO_ARRIVAL` · `MIN_NIGHTS` (ขั้นต่ำ = max(แผน, ฤดูที่ครอบคืนแรก, ค่าตั้ง)) · `MAX_NIGHTS` (min ของแผน/ค่าตั้ง) · `EXTRA_BED_NOT_ALLOWED` · `OVER_OCCUPANCY` · `NO_RATE` + `dates` คืนที่ไม่มีราคา

### มัดจำ · คืนเงิน
- `depositFor(quotes[], policy, rounding)`: NONE 0 · FIRST_NIGHT = คืนแรกรวมทุกห้องในกลุ่ม · FULL = ยอดรวม · PERCENT = ยอด × bp / 10000 ปัด · FIXED_AMOUNT = จำนวนที่ร้านตั้ง (ไม่ผูกกับยอด) · แผนกำหนด (`depositKind/Value`) ทับค่าตั้ง `rooms.hotel.deposit` (`depositPolicyOf`)
- `refundFor`: daysBefore = วันเข้า − วันยกเลิก (วันเดียวกัน 0 · หลังวันเข้า ติดลบ ⇒ 0) · เรียงกฎก่อน · กฎ = `daysBefore ≥ rule.daysBefore` ที่มากสุด (daysBefore ซ้ำ ⇒ refundBp สูงสุด · cap 100% · `ruleUsed` = ค่าที่ใช้จริง) · คืน = จ่าย × refundBp / 10000 ปัดลง · กฎมาจาก snapshot ของการจอง (ไม่อ่านฐาน)

### ภาษี (`taxLines` · ค่าจาก `taxSnapshot` ของการจอง)
- **INCLUSIVE**: ไม่มีบรรทัดบวก · total = subtotal · `vatIncludedSatang` = subtotal × vat / (10000 + vat) ปัดเป็นสตางค์เสมอ (ตัวเลขรายงาน ไม่ตามโหมดปัดบาท)
- subtotal ติดลบ ⇒ 0 — ส่วนลดต้องหักก่อนเรียก (H.5)
- **EXCLUSIVE**: SERVICE_CHARGE = subtotal × sc → TAX = (subtotal + SC) × vat → total = subtotal + SC + TAX · ปัดทุกขั้น · บรรทัด 0 ไม่ออก
- ตัวอย่าง 1,234.50 (sc 10% · vat 7% · SATANG): SC 123.45 → VAT 95.06 → 1,453.01 · INCLUSIVE VAT ในราคา 80.76

### ตัวเลขฉาก (bansuan-hotel · `SQC_HOTEL_RATES`)
STANDARD: ซูพีเรีย 990 ทุกวัน · ดีลักซ์ 1,290 / ศ.–ส. 1,490 · แฟมิลี 1,890 / 2,190 · ไฮซีซัน 1 ธ.ค.–28 ก.พ. +20% (ดีลักซ์ธรรมดา 154,800 สตางค์ = 1,548) · ปีใหม่ 29 ธ.ค.–2 ม.ค. priority 20 ราคาเฉพาะ (ดีลักซ์ 199,000 สตางค์ = 1,990) ขั้นต่ำ 2 คืน · วันพ่อ 5 ธ.ค. ดีลักซ์ 1,788 (ช่องวันหยุด × 1.2) · แก้มือ ดีลักซ์วันที่ 14 = 1,690 · BREAKFAST +200 × 2 คน · NONREF −10% ปัดลงเป็นบาท (ศ.+ส. ดีลักซ์ 2,682)

### การเขียน (rates.ts)
- ด่าน: หน่วย HOTEL ของร้าน → เข้าหน่วยได้ (ไม่ ⇒ NOT_FOUND) → `hotel.rates.read` / `hotel.rates.write` (ไม่ ⇒ FORBIDDEN) · AuditLog `hotel.*` ใน tx เดียวกับการเขียน
- แผนเริ่มต้น 1 แผนต่อหน่วย (partial unique) · ไม่มี ⇒ สร้างจาก `rooms.hotel.defaultRatePlan` ตอนเปิดจอ · เก็บแผนเริ่มต้นเข้าคลัง ⇒ `DEFAULT_PLAN` · เก็บเข้าคลังเท่านั้น ไม่ลบ
- unique NULLS NOT DISTINCT (`HotelRate.seasonId` · `HotelRateOverride.ratePlanId`) ⇒ ล็อก advisory + อ่านแถวเดิมใน tx แล้ว create/update (ไม่ใช้ upsert) · `saveRates` ตรวจทุกแถวก่อน (ราคาติดลบ ⇒ `INVALID_PRICE` ไม่เขียนสักแถว)
- เหลือขาย = ห้องขายรายคืนได้ − ห้องที่สัญญา/กันห้องถือ − max(คืนที่นับ `HotelBookingNight.counted`, ห้องที่การจองถือ)
