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
  - SVC H.3 ▸ เปลี่ยนเป็นสูตรเดียวของ `hotelAvailability` (ด้านล่าง) — เหลือขาย = `available` · การจองที่ไม่มี nights ไม่นับอีก ◂

## การจอง (SVC H.3 · จอง V2)

### ไฟล์
`availability.ts` (สูตรห้องว่างเดียว) · `booking.ts` (server · การจองทั้งวงจร) · `booking-state.ts` (pure · state machine) · `service.ts` (เส้น P1 `createReservation`/`cancelReservation` เรียก `createBooking`/`cancelBooking` · `checkIn` เดิมใช้ occupancy + nights.roomId) · จอ `/hotel/reservations` (รายการ · `[id]` รายละเอียด · `new` วิซาร์ด 3 ขั้น)

### สูตรห้องว่าง (`hotelAvailability.get(ctx, {unitId, roomTypeId?, from, to})` · S §4.2)
`available(ประเภท, คืน) = ห้องขายรายคืนได้ − ห้องที่ถูก BLOCK − ห้องที่เป็นสัญญา LEASE − HotelBookingNight.counted` ปัดล่าง 0
- ห้องขายรายคืนได้ = active · ไม่ OOO/`OUT_OF_ORDER` · rentMode จริง (ห้อง ?? ประเภท) ∈ NIGHTLY|BOTH
- BLOCK/LEASE = occupancy active ครอบคืน นับห้องไม่ซ้ำ · HOLD/STAY ของการจองไม่นับซ้ำ (การจองนับผ่าน nights)
- คืนของ HOLD นับจนกว่า sweeper เก็บ · CANCELLED/NO_SHOW(ปล่อย)/ย่นคืน ⇒ `counted=false`
- ≤ 4 คำสั่งต่อการเรียก · ใช้ที่เดียวกันทุกที่: ปฏิทินราคา H.1 (`ratePreview.remaining`) · `service.availability`/`listPublicAvailability` (P1) · วิซาร์ด · guard tx (`availabilityInTx`)

### State machine (`booking-state.ts` · S §7.8)
`HOLD → CONFIRMED → CHECKED_IN → CHECKED_OUT` · `HOLD/CONFIRMED → CANCELLED` · `CONFIRMED → NO_SHOW` · `NO_SHOW → CONFIRMED` (MANAGER/OWNER ภายในวันเดียวกันไทย · ผ่าน guard tx) · `BOOKED` (P1) ไม่เขียนอีก · `REFUNDED` = ปลายเส้น P1 `refundStay`
- ข้อยกเว้นนอกตาราง `TRANSITIONS` (ตั้งใจ): `CANCELLED(HOLD_EXPIRED) → CONFIRMED` = re-book เมื่อมัดจำเข้าหลังหมดเวลาถือห้อง (เฉพาะวันเข้ายังไม่ผ่าน + ผ่าน guard tx ว่าง · ไม่งั้นคงยกเลิก + คืนเงินอัตโนมัติ + event `deposit_after_expiry`)
- ลำดับล็อกเดียวทุกเส้นที่เขียน: **ประเภท (advisory) → แถว reservation (CAS ตามสถานะ/วันที่ที่อ่าน — ไม่ตรง ⇒ `STATE_CHANGED`) → occupancy** · deadlock/หมดเวลาที่ยังหลุด ⇒ `BUSY`

### Guard tx (กันจองซ้อน · S §7.2 §11 ข้อ 1)
1. ตรวจ input นอก tx (วัน · `PAST_DATE` · `TOO_FAR` · ความจุ `OVER_OCCUPANCY` · เตียงเสริม · แผนของหน่วย) + `quoteStay` ต่อห้อง + snapshot
2. ใน tx: `pg_advisory_xact_lock(hashtext(unitId||':'||roomTypeId))` **เรียง roomTypeId** (ทุกเส้นทางที่กินห้องล็อกลำดับเดียวกัน ⇒ ไม่มี 40P01) → นับ `availabilityInTx` ทุกคืน → ไม่พอ ⇒ `AVAILABILITY_CHANGED {dates}` (เฉพาะคืนที่เต็ม)
3. รหัส `<rooms.hotel.codePrefix>-<YYMM>-<NNNN>` running ต่อหน่วย (ล็อกหน่วยหลังล็อกประเภท · ชน unique ⇒ ลองใหม่ 3)
4. `HotelReservation` ต่อห้อง (`groupId` เมื่อ > 1 ห้อง) + `HotelBookingNight` ทุกคืน `counted=true` + `policySnapshot` (`snapshotPolicy("reservation")` + กฎยกเลิกของแผน) + `taxSnapshot`
5. ห้องจริง: `claimRoom` best-fit (HOLD ⇒ kind HOLD + holdExpiresAt · อื่น STAY) · ไม่ได้ห้อง = ไม่ล้ม (nights พอ · กำหนดห้องภายหลัง/ตอนเช็กอิน)
6. CONFIRMED ⇒ `HotelFolio` OPEN · AuditLog + outbox `hotel.booking.created` ใน tx เดียวกัน
- ต่อคืน/ย้ายห้องต่างประเภท/เลื่อนวัน/ย้อนไม่มา/จ่ายหลังหมดเวลา ใช้ล็อก + นับสูตรเดียวกัน · ย่นคืน/ยกเลิก (ปล่อยห้อง) ไม่ต้องล็อก

### สถานะเริ่มต้น (`rooms.hotel.bookingMode`)
- `AUTO_CONFIRM` ⇒ CONFIRMED ทุกช่องทาง
- `MANUAL_APPROVE` ⇒ HOLD ถึง max(วันเข้า เวลาเช็กอิน `rooms.hotel.checkInTime`, now + `holdMinutesCounter`) (มติผู้คุม §11 ข้อ 4 ปรับ 7 พ.ย.) → `confirmBooking` · จอแสดง "รอโรงแรมยืนยัน · ถือห้องถึง …"
- `DEPOSIT_REQUIRED` (ค่าเริ่ม): มัดจำ 0 ⇒ CONFIRMED · WEB/LINE/ทางสาธารณะ/`hold:"ONLINE"` ⇒ HOLD `holdMinutesOnline` · `hold:"COUNTER"` («รอโอน») ⇒ HOLD `holdMinutesCounter` · อื่น ⇒ CONFIRMED
- actor null (ทางสาธารณะ H.8) ได้เฉพาะ WEB/LINE · OTA ต้องมี `channelRef`

### มัดจำ / คืนเงิน (เงินทุกบาทผ่าน POS)
- มัดจำของกลุ่ม = `depositFor(quotes ทั้งกลุ่ม, depositPolicyOf(แผน, ค่าตั้ง))` เก็บบนแถวหัวกลุ่ม · `takeBookingDeposit` ⇒ `moduleTakeDeposit` keyBase `hotel-deposit-<groupId|id>` (ใบรับ POS_DEPOSIT · payType จาก UI) ⇒ HOLD ทั้งกลุ่ม → CONFIRMED (HOLD → STAY ห้องเดิม · folio OPEN)
- จ่ายหลังหมดเวลา (`HOLD_EXPIRED` หรือ HOLD เลยเวลาที่ sweeper ยังไม่เก็บ): รับเงินก่อน (ใบรับเสมอ) → guard tx: ว่าง ⇒ CONFIRMED (nights นับใหม่ · ถือห้องใหม่) · เต็ม ⇒ คง CANCELLED + `moduleRefundDeposit` คืนเต็มอัตโนมัติ + event `hotel.booking.deposit_after_expiry`
- ยกเลิก (`cancelBooking`): คืน = `refundFor({paid: มัดจำคงเหลือใน POS, checkInDate, cancelAt: วันนี้ไทย, rules: กฎยกเลิกใน snapshot})` ปัด**ลง**ตาม `rooms.money.rounding` (BAHT_* ⇒ เต็มบาท) · ค่าธรรมเนียม = จ่าย − คืน · 100% ⇒ `moduleRefundDeposit` · ค่าธรรมเนียม > 0 (รวม 0% = ทั้งก้อน) ⇒ บิล "ค่าธรรมเนียมยกเลิก <รหัส>" (แถวจ่าย DEPOSIT อ้างใบรับ · คีย์ริบ `dep-forfeit:<มัดจำ>`) แล้ว `moduleRefundDeposit` คงเหลือ (มติผู้คุม §11 ข้อ 1 · m3 m4)
  - AuditLog เงิน 2 จังหวะ: แผน (`moneyPlan`) ใน tx ของสถานะ · ผลจริง `hotel.booking.money` หลัง settle (ยกเลิก + ไม่มา) · มัดจำนอก POS ⇒ ต้อง `hotel.booking.manage` + `moneyWarning` "มัดจำนอก POS ให้จัดการมือ"
  - รับมัดจำ: ปั๊ม depositPaidAt เฉพาะหัวกลุ่มที่ยังถือห้อง (HOLD/CONFIRMED/CHECKED_IN) · อ่านสดหลังล็อก — ไม่ถือห้องแล้ว/วันเข้าผ่าน/เต็ม ⇒ คืนเงิน + event `deposit_after_expiry`
  - ยกเลิกรายห้องที่ถือมัดจำหัวกลุ่มขณะห้องอื่นยัง active ⇒ ย้ายหัวกลุ่มไปห้องถัดไป ไม่คืนเงิน · ห้องสุดท้าย/ทั้งกลุ่ม ⇒ คืนตามขั้นบันได
  - มีคืน/ริบเงิน ⇒ ต้องมี `hotel.booking.manage` · ไม่มีมัดจำ ⇒ `hotel.reservation.cancel` พอ
- ไม่มา (`markNoShow` · CONFIRMED + วันเข้า ≤ วันนี้): นโยบายจาก snapshot `rooms.hotel.noShow` — `FORFEIT_RELEASE_AFTER_AUDIT` ริบ + ปล่อย · `FORFEIT_HOLD_STAY` ริบ + ถือห้องต่อ · `REFUND_RELEASE` คืนเต็ม + ปล่อย · `undoNoShow` ไม่คืนเงินที่ริบอัตโนมัติ (หนี้ `moduleUnforfeitDeposit` รับเฉพาะ BOOKING)
- ไม่มีการเขียนบัญชีตรงจากโมดูลโรงแรม

### ต่อ / ย่น / ย้าย / เลื่อน
- `extendBooking`: guard tx เฉพาะคืนใหม่ · ราคา = quote ณ ปัจจุบัน (จอแสดงก่อนยืนยันผ่าน `quoteExtension`) · ห้องเดิมไม่ว่าง ⇒ `ROOM_BUSY` + ห้องที่ย้ายได้ (ไม่ย้ายเอง)
- `shortenBooking`: คืนอนาคต `counted=false` (แถวคงอยู่) · ทับคืนที่ `postedAuditId` ⇒ `SHORTEN_POSTED` · ไม่คืนเงินอัตโนมัติ
- `assignRoom`: HOLD/CONFIRMED · `moveOccupancy` (id เดิม) หรือ `claimRoom` · ต่างประเภท = ไม่คิดส่วนต่าง แต่นับชั้นประเภทของประเภทใหม่ (nights.roomTypeId ย้ายตาม) · ปิดซ่อม ⇒ `ROOM_INACTIVE`
- `rescheduleBooking` (ฐานการลาก H.2): ย้ายห้อง + เลื่อนวันเข้า/ออกใน guard tx เดียว · CHECKED_IN เลื่อนได้เฉพาะวันออก · คืนเดิมคงราคา คืนใหม่ quote ปัจจุบัน · ห้องปลายทางถูกการจองที่ยังไม่เข้าพักถือ ⇒ จัดห้องให้รายการนั้นใหม่ในประเภทเดียวกัน (ไม่ได้ ⇒ `ROOM_BUSY`) · ล้ม = ไม่เปลี่ยนอะไร · `repack: false` (= `moveBooking` ของ facade · การลากบนปฏิทินห้อง · มติผู้คุม 7 พ.ย.) ⇒ ไม่จัดห้องให้การจองอื่น ห้องปลายทางไม่ว่าง = `ROOM_BUSY` ทันที

### Sweeper (`sweepExpiredHolds({now?, limit?})` · minute-job `hotel.sweepExpiredHolds` ต่อจาก `rooms.expireHolds`)
HOLD ที่ `holdExpiresAt < now` ทุกร้าน ⇒ CANCELLED `HOLD_EXPIRED` · nights `counted=false` · ปล่อยห้อง · folio VOID · event `hotel.booking.hold_expired` · ก้อนละ ≤ 200 · CAS ต่อใบ (ซ้อนกัน/ซ้ำ = ครั้งเดียว · X5)

### นาฬิกาฉาก
ทุกฟังก์ชันใน `booking.ts` รับ `at` (ISO) เป็นเวลาปัจจุบันเฉพาะเมื่อ `SVC_QC_CLOCK=1` (อ่าน env ตอนเรียก) · action ไม่ส่งต่อ (รับเฉพาะคีย์ที่รู้จัก) · ค่าตั้งยังอ่าน ณ เวลาจริง

### Event (outbox · 3 ทะเบียน)
`hotel.booking.created` · `confirmed` · `cancelled` · `hold_expired` · `no_show` · `changed` (ต่อ/ย่น/ย้าย/เลื่อน) · `deposit_after_expiry` — ใน tx เดียวกับสถานะ · payload `{tenantId, unitId, reservationId, groupId, code, status, source}` ไม่มี PII

## บิลระหว่างพัก (folio) · เช็กเอาต์ (SVC H.5)

### ไฟล์
- `src/lib/modules/hotel/folio.ts` — `getFolio` · `postFolioItem` · `voidFolioItem` · `postRoomNights` (H.7 เรียก) · `folioForGroup` · `postDeposit` (H.3 `takeBookingDeposit` เรียก 1 จุด)
- `src/lib/modules/hotel/checkout.ts` — `prepareCheckout` · `settleAndCheckOut` · `takeSecurityDeposit` / `refundSecurityDeposit` / `forfeitSecurityDeposit` · `afterRefundStay` (service.refundStay เรียก)
- `src/lib/modules/hotel/room-charge.ts` — `chargeToRoom` (S §8.3) · consumer `onPosSalePaidRoomCharge` / `onPosSaleVoidedRoomCharge` · `listUnmatchedRoomCharges` · `attachRoomCharge`
- `account/index.ts` ท้ายไฟล์: `reverseRoomChargePosting` · `restoreRoomChargePosting` (ห่อ `reverseFor` / `reverseEntry`)

### เครื่องหมาย (sign convention)
- `balanceSatang` = Σ amount ทุกแถว (cache · คำนวณใหม่ใน tx เดียวกับการเขียน) · ค่าใช้จ่าย (ROOM · SERVICE · MINIBAR · PENALTY · POS_CHARGE · TAX · SERVICE_CHARGE) บวก · DISCOUNT ลบ
- DEPOSIT ลบ = รับมัดจำ · DEPOSIT บวก = มัดจำที่ถูกใช้ชำระบิลเช็กเอาต์ (อ่านจากแถวชำระ DEPOSIT ของบิลจริง) · PAYMENT ลบ = −ยอดค่าใช้จ่ายของ folio (อ้างบิล POS) · REFUND บวก = คืนมัดจำส่วนเกิน / คืนเงินการเข้าพัก
- SECURITY_DEPOSIT / SECURITY_REFUND / PENALTY ของประกัน = amount 0 (ข้อมูล · ยอดอยู่ใน description · refId = ใบรับ/ใบคืน/บิลริบ) — เงินประกันไม่เข้า balance
- void = แถวเดิมติด `voidedAt/voidReason` (ไม่ลบ) + แถว `VOID_REVERSAL` ตรงข้ามเครื่องหมาย อ้าง `reversalOfId` · ห้าม void PAYMENT/DEPOSIT/VOID_REVERSAL/POS_CHARGE (บิลร้าน void ที่ POS ⇒ consumer `pos.sale.voided` กลับรายการให้)
- TAX/SERVICE_CHARGE (แยกภาษี) = 1 แถวต่อชนิด ปรับยอดในที่ตาม `taxLines(Σ ค่าใช้จ่ายที่มีผล)` — แถวแสดงผล ไม่ส่งเป็นบรรทัด POS

### เส้นเงิน (เช็กเอาต์ · S §7.7)
1. tx A: ล็อก folio · `postRoomNights(upTo = วันออก)` · คำนวณใหม่
2. ตรวจ: `TAX_CONFIG_MISMATCH` (vatBp ของโรงแรม ≠ อัตราของสมุดที่ POS ผูก · POS ไม่เชื่อมบัญชี = เตือนเฉย ๆ) · Σ วิธีจ่าย + มัดจำที่ใช้ = ยอดบิล (`PAY_MISMATCH`)
3. `pos.createSale` ใบเดียวนอก tx · คีย์ `hotel-sale-<reservationId|groupId>` (บิลของคีย์ถูก void ⇒ `-r<n>`) · บรรทัด: ค่าห้องสรุปต่อประเภท×ราคา · รายการอื่น itemized · ส่วนลด = `billDiscountSatang` (ไม่มีบรรทัดติดลบ) · แยกภาษี = บรรทัดรวม VAT แล้ว + `serviceChargeSatang` (เศษปัดลงค่าบริการ/ส่วนลด · เกินเศษ = `TAX_ROUNDING_MISMATCH`) · วิธีจ่าย = `DEPOSIT{refSaleId}` + วิธีจริง (≤ 6 แถว) · `shiftId` จาก UI
4. ประกัน (นอก tx): คืน `moduleRefundDeposit` · ริบ `moduleForfeitDeposit` (บิลริบ = รายได้ค่าเสียหายครั้งเดียว · ต้อง `hotel.booking.manage`)
5. tx B: CAS CHECKED_IN → CHECKED_OUT · PAYMENT ต่อ folio · DEPOSIT (+ที่ใช้) · SETTLED · ห้อง DIRTY + HousekeepingLog · ปล่อย occupancy · audit `hotel.folio.settled` · outbox `hotel.checked_out` (+saleId) / `hotel.folio.settled` · Σ PAYMENT ≠ ยอดบิล หรือคงค้าง ≠ มัดจำคงเหลือ ⇒ ย้อน tx B (บิลค้างให้ผู้จัดการ void)
6. หลัง tx B: คืนมัดจำส่วนเกิน (ไม่มีห้องอื่นในกลุ่มใช้ต่อ) + แถว REFUND · กันรายได้ซ้ำของบิลร้านที่ลงห้อง
- ซ้ำ/พร้อมกัน: บิลเดิมของคีย์ = ใช้ต่อ (resume tx B) · CAS ⇒ สถานะ/PAYMENT/event ครั้งเดียว
- P1 `checkOut(tenantId, unitId, id)` = settle ทางเดิม (มัดจำ + เงินสดส่วนที่เหลือ) **เฉพาะ** `rooms.hotel.checkout.allowLegacyCash` (ค่าเริ่มปิด ⇒ `PAY_METHODS_REQUIRED`)

### ลงห้องจาก POS · กันรายได้ซ้ำ (Q-H5-1)
- บิลร้าน ROOM_CHARGE: POS ลง Dr 1100 / Cr รายได้+ภาษีขาย ตอนบิลร้าน · consumer โรงแรมหาแขกจาก `reference` (เลขห้องที่มีแขกพัก หรือรหัสจอง · ทุกหน่วย HOTEL ของร้าน · ซ้ำหลายหน่วย ⇒ `AMBIGUOUS_ROOM`) ⇒ POS_CHARGE itemized · หาไม่ได้ ⇒ คิว unmatched + `hotel.folio.charge_unmatched`
- เช็กเอาต์รวมบรรทัดอาหารในบิลโรงแรม (รับเงินจริง · VAT ครั้งเดียว) ⇒ `reverseRoomChargePosting` กลับ JV ของบิลร้าน ⇒ รายได้อาหารรับรู้ครั้งเดียวที่บิลโรงแรม · 1100 ล้าง · สต็อกร้านไม่แตะ
- `refundStay` หลังเช็กเอาต์: void บิลโรงแรม (POS กลับบัญชี) + folio VOID + `restoreRoomChargePosting` (บิลร้านกลับเป็นลูกหนี้ 1100 ค้าง)
- สายรายการต่อบิลร้าน: ต้นฉบับ → กลับ → คืน → กลับ … · ทั้งสองฟังก์ชัน idempotent ตามสถานะสาย · ร้านไม่เชื่อมบัญชี ⇒ `{posted:false}`

### เงินประกันห้อง (Q3)
- เปิดด้วย `rooms.hotel.securityDeposit.enabled` (ค่าเริ่มปิด) · ยอด `rooms.hotel.securityDeposit` (ต่อประเภทห้อง) · ใบรับ POS_DEPOSIT คีย์ `hotel-secdep-<id>` (Cr 2110 · ไม่ใช่รายได้)
- คืนเต็ม = ใบคืนอ้างใบรับ (วิธีเดียวกับตอนรับ) · ริบเต็ม = บิลริบ `dep-forfeit:<depositId>` (รายได้ครั้งเดียว) · ริบบางส่วน = หนี้ v1
## ปฏิทินห้อง (SVC H.2 · tape chart · ภาพ 08)

### ไฟล์
- `src/lib/modules/hotel/tape.ts` — `tapeChart(ctx, {unitId, from, days})` · `hotelToday(ctx, {unitId, now?})` · `previewMove` (อ่านอย่างเดียว · ไม่มีคิวรีเขียน)
- `src/lib/modules/hotel/block.ts` — `blockRoom` · `releaseBlock` · `listBlocks` (ปิดห้อง)
- จอ `src/components/hotel/{TapeChart,TapeBar,TapeKpis,BlockDialog,MoveConfirmDialog,HotelToday}.tsx` + `tape-shared.ts` (pure) · หน้า `/app/u/<slug>/hotel/calendar?view=week|2w|month&from=` · หน้าเคาน์เตอร์ `/hotel` ใช้ `hotelToday`
- actions (`actions.ts` บล็อก SVC H.2): `moveBookingAction` (= `moveBooking` = `rescheduleBooking` ของ H.3 แบบ `repack: false` · tx เดียว · ไม่ย้ายการจองคนอื่นเงียบ ๆ) · `resizeBookingAction` (`extendBooking`/`shortenBooking`) · `blockRoomAction` · `releaseBlockAction` · `previewMoveAction`

### แถว · กลุ่ม
- แถวห้อง = ห้อง active ที่ขายรายคืนได้ (`rentMode` จริง NIGHTLY/BOTH) · ห้อง MONTHLY ล้วนไม่มีแถว (ของหอ) · เรียง อาคาร (`sortOrder`) → ชั้น → เลขห้อง
- กลุ่ม = ประเภทห้อง (`sortOrder`) · หัวกลุ่ม `rateTodaySatang` = ราคาแผนเริ่มต้นวันนี้ · `rateWeekendSatang` = วันสุดสัปดาห์ถัดไป (`rooms.hotel.weekendDays`) ผ่าน `resolveNightPrice` ของ H.1 (ฤดู/แก้มือ/วันหยุดรวม)
- การจองที่ยังไม่มีห้อง (`roomId` null) = แถว «ยังไม่กำหนดห้อง» ใต้กลุ่ม (`unassigned`) · ลากลงห้อง = กำหนดห้อง

### นิยามแถบ 6 แบบ (`Bar.kind`)
| kind | ที่มา | แสดง |
|---|---|---|
| STAY | HotelReservation CHECKED_IN (สถานะชนะ source · OTA ที่เข้าพักแล้ว = STAY) | ทึบ «พักอยู่» |
| CONFIRMED | CONFIRMED (source ≠ OTA) | ขอบ «จองแล้ว» |
| OTA | CONFIRMED + source OTA | เส้นประ «มาจาก OTA» |
| HOLD | HOLD (+ `holdExpiresAt`) | ฟ้า «ถือไว้ รอมัดจำ» |
| BLOCK | RoomOccupancy kind BLOCK · refType `HotelRoomBlock` · refId = blockId · label มีเหตุผล | ลาย «ปิดซ่อม» |
| LEASE | RoomOccupancy kind LEASE (สัญญาหอบนห้อง BOTH) | เทา «ปล่อยรายเดือน (ระบบหอ)» · ลิงก์หน้าหอเฉพาะผู้มี `dorm.view` ของหน่วยหอ |
- การจองแสดงเมื่อ `checkIn < ปลายกริด` และ `checkOut ≥ ต้นกริด` (ครึ่งวันเช็กเอาต์) · BLOCK/LEASE เมื่อ `start < ปลาย` และ `end > ต้น` · `from/to` = วันจริงไม่ตัดตามกริด · แถบเริ่มกลางวันเข้า จบกลางวันออก

### อัตราเข้าพักรายคืน
- `sellable` = แถวห้อง − ห้องที่มี BLOCK − ห้องที่มี LEASE ครอบคืนนั้น · `occupied` = HotelBookingNight `counted` ของการจอง HOLD/CONFIRMED/CHECKED_IN (มีห้องหรือไม่ก็นับ · HOLD counted นับ) · ไม่นับรายเดือน/ซ่อม

### กติกาลาก (pointer events · ไม่มีไลบรารี)
- ตัวแถบ (`data-drag-handle`) = ย้ายห้อง (แนวตั้ง) และ/หรือเลื่อนวัน (แนวนอน · CONFIRMED/HOLD/OTA) · **CHECKED_IN เลื่อนวันเข้าไม่ได้** (ย้ายห้อง/ยืดคืนได้) · ขอบขวา (`data-resize-handle`) = ยืด/ย่นคืน (ย่นทับคืนที่ปิดวันแล้วไม่ได้ · `SHORTEN_POSTED`)
- ปล่อยแล้วเปิด `MoveConfirmDialog` เสมอ (ห้องเดิม→ใหม่ · วันเดิม→ใหม่ · ราคาใหม่จาก `previewMove` · ไม่คิดส่วนต่างเมื่อย้ายประเภท) · ล้ม (`ROOM_BUSY`/`AVAILABILITY_CHANGED`/`ROOM_INACTIVE`/`STATE_CHANGED`) = ไม่มีอะไรเปลี่ยน แถบกลับที่เดิม + ข้อความ
- ผู้ดูอย่างเดียว (แม่บ้าน `hotel.housekeeping` · ไม่มี `hotel.booking.manage`) ไม่ render `data-tape-bar`/`data-drag-handle`/`data-resize-handle` · มือถือ 390 = รายการรายวัน + แถบเล็กสัปดาห์ ไม่ลาก (ปุ่ม «ย้ายห้อง/เลื่อน» เปิดไดอะล็อกแบบเลือกเอง)

### ปิดห้อง (BLOCK)
- `blockRoom(actor, ctx, {unitId, roomId, from, to, reason})` — ล็อกประเภทห้อง (advisory เดียวกับ booking.ts) → `claimRoom(kind BLOCK, refType HotelRoomBlock)` (EXCLUDE ของฐาน) → ชนการจอง ⇒ `ROOM_TAKEN` + `conflicts [{code, guestName}]` (ไม่ทับ) · เกินจอง (ห้องขาย − ปิด − รายเดือน − คืนที่นับ < 0) ⇒ ok + `warning {overbookedNights, message "เกินจอง N คืน"}` ไม่ยกเลิกการจองให้
- เหตุผลลง AuditLog `hotel.room.blocked` (targetId = blockId · แหล่งของ `listBlocks`/แถบ) · BLOCK ครอบวันนี้ ⇒ HotelHousekeepingLog → `OUT_OF_ORDER` + `setHkStatus(OUT_OF_ORDER)` (คำเตือน `affectedByOutOfOrder`)
- `releaseBlock` ⇒ occupancy inactive · AuditLog `hotel.room.unblocked` · ถ้าห้อง OUT_OF_ORDER จากการปิดที่ครอบวันนี้และไม่มี BLOCK อื่น ⇒ HousekeepingLog OUT_OF_ORDER→`DIRTY` + `setHkStatus(DIRTY)` (แม่บ้านตรวจก่อนขาย) · ปล่อยซ้ำ = ok noop
- สิทธิ์: ปิด/ปล่อย = `hotel.booking.manage` · ดูรายการ = `hotel.reservation.create` | `hotel.booking.manage` | `hotel.housekeeping` · ข้ามร้าน/หน่วย ⇒ NOT_FOUND

### KPI หน้าเคาน์เตอร์ (`hotelToday`)
- เข้าวันนี้ = CONFIRMED เข้าวันนี้ (ชื่อ 2 คนแรก) · ออกวันนี้ = CHECKED_IN ออกวันนี้ · พักอยู่คืนนี้ = CHECKED_IN/CONFIRMED ครอบคืนนี้ (ไม่รวม HOLD) / ขายได้ · แม่บ้านรอทำ = แถวห้อง DIRTY · สัปดาห์นี้ = Σoccupied/Σsellable 7 วันนับจากวันนี้ (bp) · ADR = Σ ราคาคืน counted ÷ จำนวนคืน (ปัดลง) · ศ.–ส. % แยก

### ประสิทธิภาพ
- `tapeChart` = 6 คำสั่งคงที่: กรอบ (หน่วย+ประเภท+ห้อง+อาคาร+ราคาแผนเริ่มต้น · JSON ใน SQL เดียว) · ค่าตั้ง 2 (`resolveSettingsMany`) · occupancy BLOCK/LEASE + สัญญาหอ + เหตุผลปิดห้อง 1 · การจอง 1 · คืน counted ต่อวัน 1 · `hotelToday` = 4 คำสั่ง

## เช็กอิน V2 · ทะเบียนผู้พัก (ร.ร.3/ร.ร.4) · ตม.30 · PDPA (SVC H.4 · ภาพ 09 ซ้าย)

### ไฟล์
- `src/lib/modules/hotel/checkin.ts` — `assignableRooms` · `checkInV2` · `undoCheckIn` · `checkinView` · `checkInV2Legacy` (ทางเดิม `service.checkIn`)
- `src/lib/modules/hotel/guest.ts` — `upsertGuestRecord` · `deleteGuestRecord` · `listGuests` · `revealGuestId` · `signRr3` · `rr3Card` · `rr4Register` · `purgeExpiredGuestRecords` · `RR3_FIELDS`
- `src/lib/modules/hotel/guest-id-ai.ts` — `readIdDocument` (AI เสนอ · คนยืนยัน) · `src/lib/modules/hotel/tm30.ts` — `tm30Queue` · `tm30Export` · `markTm30Filed` · `tm30Sweep` · `TM30_DEFAULT_COLUMNS`
- `src/lib/modules/hotel/guest-shared.ts` (pure) — สัญชาติ ISO-3 → ไทย · `isForeigner` · ตรวจเลขบัตรไทย (checksum mod 11) / พาสปอร์ต 6–9 ตัว · `maskId`
- จอ: `CheckinPanel` · `RoomPicker` · `GuestForm` · `IdScanButton` · `SignaturePad` · `Rr3Card` · `Tm30Queue` · `Tm30FileDialog` · `SecurityDepositStep` (+ `checkin-shared.ts`)
- หน้า: `/hotel/reservations/[id]?tab=guests` · `/hotel/guests` · `/hotel/guests/rr4/print?from&to` · `/hotel/guests/[guestId]/rr3/print` · `/hotel/tm30`

### เช็กอิน V2 (S §7.4 · ธุรกรรมเดียว)
CONFIRMED (+BOOKED แถวเก่า) · วันเข้า ≤ วันนี้ไทย (ก่อนวัน = `earlyOverride {reason}` ของผู้มี `hotel.booking.manage`) → ห้องประเภทเดียวกันที่ว่างทั้งช่วง ·
แม่บ้านพร้อม = CLEAN|INSPECTED (`rooms.hotel.inspectionRequired` ⇒ INSPECTED เท่านั้น) · ไม่พร้อม = `force {reason}` (manage) + AuditLog + `HotelHousekeepingLog` (hkStatus ไม่เปลี่ยน) →
ทะเบียนผู้พักหลัก ≥ 1 คน (`GUEST_REQUIRED` · ปิดได้ด้วย `rooms.hotel.guest.requireRegistration`) · ผู้พักรวม ≤ `maxOccupancy ?? capacity` (`occupancyOverride`) →
ล็อกประเภทห้อง (advisory) → CAS แถว CONFIRMED→CHECKED_IN → occupancy (claim/move/HOLD→STAY ผ่าน facade rooms · EXCLUDE ตัดสินห้องชน · X3) → nights.roomId → ห้อง OCCUPIED →
แถวผู้พัก + outbox `hotel.checked_in {reservationId, roomId, guests, foreigners}`.
มัดจำค้าง ⇒ เช็กอินผ่าน + `needsDeposit` (จอบังคับรับ) · เงินประกัน (`securityDeposit.enabled/appliesTo`) ⇒ `needsSecurityDeposit` — รับเป็นขั้นแยกหลัง CHECKED_IN ผ่าน `takeSecurityDeposit` (H.5) · สมาชิก opt-in (`member.findOrCreate` source STAFF · ยินยอมเท่านั้น) หลัง commit.
`undoCheckIn` = ผู้จัดการ/เจ้าของ · วันเดียวกัน · folio ไม่มีรายการนอก ROOM/DEPOSIT/SECURITY_DEPOSIT · ห้องจริงยังถือ · ทะเบียนคงไว้.
ทางเดิม `service.checkIn(tenantId, unitId, reservationId, roomId)` ห่อแกนเดียวกัน (ไม่มีผู้กระทำ · คงพฤติกรรม P1: ไม่ตรวจวันเข้า/แม่บ้าน · ทะเบียนตาม `LEGACY_REQUIRES_GUEST` — ข้อแย้ง oracle wo-notes svc-h.4).

### ทะเบียนผู้พัก = ร.ร.3 อิเล็กทรอนิกส์ (พ.ร.บ.โรงแรม 2547 ม.35)
1 แถว `HotelGuestRecord` ต่อผู้พัก 1 คน · ช่องตามแบบ ร.ร.3 ท้ายประกาศกระทรวงมหาดไทย (`RR3_FIELDS` · ที่ปรึกษากฎหมายตรวจก่อนใช้จริง J3 / Q-H4-2) ·
เลขบัตร `RR3-<พ.ศ.>-NNNNNN` = ลำดับ createdAt ต่อหน่วยต่อปี (ไม่มีคอลัมน์ถาวร) · ร.ร.4 = `rr4Register` แถว ร.ร.3 ของช่วงวันเข้าเรียงเลขบัตร (พิมพ์ด้วยเบราว์เซอร์ · ส่งสำเนานายทะเบียนตามรอบ — ระบบเตือน ไม่ส่งเอง) ·
ลงชื่อ = `signRr3` ลายเซ็นบนจอ (PNG private) หรือ `method: "PAPER"` เมื่อ `rr3OnScreen` ปิด · คนหนึ่งลงชื่อแทนห้องได้ (ตั้ง `rr3SignedAt` ให้ผู้พักที่มีอยู่ตอนลงชื่อ) ·
แก้ได้จนเช็กเอาต์ (หลังจากนั้นผู้จัดการ/เจ้าของ) · ลบได้เฉพาะคนที่สร้าง ภายใน 10 นาที ยังไม่ลงชื่อ/ยังไม่แจ้ง ตม.

### PDPA · masking · retention (Q6 · X8/X10)
- เลขเอกสาร + ข้อมูลอ่อนไหว (เพศ · อาชีพ · ที่อยู่ · ตรวจลงตรา · ตม.6) อยู่ใน `idNumberEnc` = `sealIntegrationSecret(…, AAD = recordId)` เท่านั้น · คอลัมน์อ่านได้ = ชื่อ · สัญชาติ · ชนิดเอกสาร · `idNumberLast4` · วันเกิด · มาจาก/ไปต่อ
- จอ/DTO/AuditLog/outbox/ชื่อไฟล์ ไม่มีเลขเต็ม (mask = เห็น 4 ตัวท้ายเท่านั้น) · เลขเต็ม = `revealGuestId` (สิทธิ์ `hotel.guest.viewId` · หรือ `guest.register` เมื่อ `maskIdForStaff` ปิด) AuditLog `hotel.guest.id_revealed` + outbox ทุกครั้ง · ไม่ cache
- รูปเอกสาร/ลายเซ็น/หลักฐาน ตม. = ไฟล์ private (`uploadFile visibility private` · ลิงก์ `privateFileUrl` ผูกผู้ดู ≤ 15 นาที · ลบ `deleteFileAsset`) · ≤ 8 MB · PNG/JPEG(/WebP รูปเอกสาร · PDF หลักฐาน) ไบต์หัวตรงชนิด
- เก็บถึง `retainUntil` = วันออก + `rooms.hotel.guest.retainYears` (2 ปี ≥ 1 ปีตามกฎหมาย) · งานรายวัน `hotel.purgeExpiredGuestRecords` (≤ 200 แถว/รอบ · idempotent) ล้างกล่องลับ/รูป/ลายเซ็น คงชื่อ + 4 ตัวท้าย + สัญชาติ + วันเข้าออก · AuditLog SYSTEM + outbox `hotel.guest.purged {count}`

### AI อ่านเอกสาร (Q5 · ปิดเป็นค่าเริ่ม)
`rooms.hotel.guest.aiIdReader` ปิด ⇒ `AI_DISABLED` ไม่ยิง · provider ของระบบ (`resolveProvider("smart")`) ไม่มี ⇒ `NO_PROVIDER` · เครดิตหมด ⇒ `NO_CREDIT` · ผล = ข้อเสนอใส่ฟอร์ม (`aiProposed`) ต้องยืนยัน (`confirmed`) ก่อนบันทึก · หักเครดิต `hotel.guest.idReader` (ref กันซ้ำ) · ไม่เก็บรูป/ไม่ log

### ตม.30 (พ.ร.บ.คนเข้าเมือง 2522 ม.38 · Q4)
ต่างด้าว (สัญชาติ ≠ THA) + `rooms.hotel.tm30.enabled` ⇒ PENDING · ครบกำหนด = เวลาเข้าพัก + 24 ชม. · `tm30Sweep` ทุก 15 นาที: เลยกำหนด ⇒ LATE (UPDATE มีเงื่อนไข · X5) + เตือนก่อนครบ `tm30ReminderHours` (outbox `hotel.tm30.due` 1 ครั้งต่อผู้พัก) ·
ไฟล์อัปโหลด = CSV UTF-8 BOM (คอลัมน์ `rooms.hotel.tm30.exportColumns` · ค่าเริ่ม 12 ช่องแบบ ตม.30 กระดาษ · แม่แบบจริงรอเจ้าของ Q-H4-1) มีเลขหนังสือเดินทางเต็มตามแบบ ตม. · AuditLog `hotel.tm30.exported` · ไม่เก็บไฟล์ ·
`markTm30Filed` เลขรับแจ้ง 1 เลขหลายคน ⇒ FILED (+หลักฐาน private) · คนไทย = NOT_REQUIRED · ระบบไม่ส่ง ตม. เอง.

### Event (outbox · 3 ทะเบียน · payload id/จำนวนล้วน)
`hotel.checked_in` · `hotel.guest.registered` · `hotel.guest.id_revealed` · `hotel.tm30.due` · `hotel.tm30.filed` · `hotel.guest.purged`
### รอบ 3 (ผู้ตรวจเงินรอบ 1)
- **บิลผสม** (เงินสดที่ร้าน + ลงห้อง): ลงห้องเฉพาะยอด ROOM_CHARGE (บรรทัดเดียว) · ตอนเช็กเอาต์ไม่กลับ JV บิลร้านทั้งใบ — โพสต์ JV ปรับเฉพาะส่วนลงห้อง (Cr ลูกหนี้ = ยอดลงห้อง · Dr รายได้/ภาษีขายตามสัดส่วน · refType PosSale คีย์ `PosSale#<sale>#RCADJ#<n>`) · คืนสภาพ = กลับ JV ปรับ · บิลลงห้องเต็มใบยังกลับทั้งใบ
- **แยกภาษี + ลงห้องจาก POS**: POS_CHARGE = ยอดรวม VAT แล้วเสมอ — ไม่อยู่ในฐาน `taxLines` ของโรงแรม · ส่งเข้าบิล POS ตามยอดเดิม (ไม่ gross ซ้ำ) · ยอด folio = taxLines(ฐานโรงแรม).total + Σ POS_CHARGE
- **ค่าห้องคืนค้าง post ใน tx B** (หลังบิล POS สำเร็จ) · tx A แค่ล็อก/ตรวจ + void ROOM ของคืนที่เลิกนับแล้ว (ย่นวันออก · ยังไม่ปิดวัน) · prepare ไม่นับ ROOM ของคืนที่เลิกนับ
- **มัดจำกลุ่ม**: settle รายห้องใช้มัดจำของแถวที่ถือใบรับในกลุ่ม · ผู้ถือออกขณะห้องอื่นยัง active ⇒ แถว DEPOSIT บวก "ย้ายมัดจำคงเหลือ" ปิด folio ผู้ถือที่ 0 · ห้องที่ใช้ภายหลังลงคู่ "รับโอนมัดจำ (ลบ) + ใช้มัดจำ (บวก)" ที่ folio ของตัวเอง · คืนส่วนเกินเมื่อกลุ่มไม่เหลือห้อง active (ห้องสุดท้ายลงคู่ "รับโอน + REFUND") — ไม่เขียน folio ที่ SETTLED แล้ว
- settle({groupId}) คืนเงินประกันที่ถือของทุกห้อง (FORFEIT ทั้งกลุ่ม = เตือนรายห้อง) · consumer ลงห้องได้ BUSY ⇒ โยนให้คิวลองใหม่ · refundStay หาบิลเช็กเอาต์ล่าสุดที่ PAID (รวม `-r<n>`)
- **สัญญาผู้เรียก `chargeToRoom` (facade · m5)**: facade ไม่ตรวจวิธีจ่ายของบิลต้นทาง — ผู้เรียกต้องส่งเฉพาะยอดที่ "ลงห้อง" จริง (บิลที่ร้านเก็บเงินสดแล้วห้ามส่งซ้ำ ไม่งั้นแขกจ่ายสองครั้ง) · consumer ของ POS ส่งเฉพาะบิลที่มีแถว ROOM_CHARGE และยอดเท่า ROOM_CHARGE · กันรายได้ซ้ำทำเฉพาะบิลที่มี ROOM_CHARGE

## แม่บ้าน (SVC H.6 · ภาพ 13 ก/ข · มือถือ 390)

### ไฟล์
- `hotel/hk-state.ts` (pure) — `HK_TRANSITIONS` · `canHkTransition(from, to, {role, inspectionRequired})` · `HK_ROLES` (MAID · INSPECTOR · SYSTEM) · `hkPriority(row)` · `parseHkNote/serializeHkNote`
- `hotel/housekeeping.ts` (server) — `hkBoard` `hkRoom` `hkSetStatus` `hkStart` `hkRelease` `hkFinish` `hkInspect` `hkLogs` `postMinibar` `reportDefect` `setGuestRequest` `markStayoversDirty` `syncBlockedRooms`
- จอ `components/hotel/hk/*` (`'use client'` · ไม่ลากถึง prisma) · หน้า `/hotel/housekeeping` · `/hotel/housekeeping/[roomId]` · `/hotel/housekeeping/logs`
- realtime: `EV_HOTEL_HK` · ช่อง `hotel:hk:<tenantId>:<unitId>` · token `/api/realtime/hotel-hk-token?unitId=` · จอ `subscribeHotelHk` + poll 15 วิ

### state machine (S §7.6)
| จาก → ไป | แม่บ้าน (hotel.housekeeping) | หัวหน้า (hotel.housekeeping.inspect) | ระบบ |
|---|---|---|---|
| DIRTY → CLEAN | ✓ | ✓ | — |
| CLEAN → INSPECTED | ✗ (FORBIDDEN) | ✓ (ปิด inspectionRequired ก็ตรวจได้ · CLEAN ขายได้อยู่แล้ว) | — |
| CLEAN/INSPECTED → DIRTY | ✓ (สั่งทำใหม่) | ✓ (ตรวจไม่ผ่าน + เหตุผล) | ✓ night audit |
| * → OUT_OF_ORDER | ✗ `USE_BLOCK` | ✗ `USE_BLOCK` | ✓ BLOCK ของ H.2 / ถึงวันปิดห้อง |
| OUT_OF_ORDER → DIRTY | ✗ `USE_BLOCK` | ✗ | ✓ ปล่อยห้อง/หมดช่วงปิด |
| DIRTY → INSPECTED · INSPECTED → CLEAN · เท่าเดิม | ✗ | ✗ | ✗ |

- แหล่งความจริง = `HotelRoom.hkStatus` เขียนผ่าน `rooms.setHkStatus` เท่านั้น · ทุก transition = `HotelHousekeepingLog` 1 แถว (note JSON) + event `hotel.hk.changed` ใน tx เดียว · publish หลัง commit (ไม่ throw)
- ความพร้อมกัน: ล็อกต่อห้อง `pg_try_advisory_xact_lock(hashtextextended('hotel.hk:<tenant>:room:<id>'))` + ลองซ้ำ (ผู้รอไม่ถือ connection — `setHkStatus` เปิด connection ของตัวเอง) ⇒ 10 ทางพร้อมกัน = log 1
- `idempotencyKey` (คิวออฟไลน์ของมือถือ) อยู่ใน `note.key` ของ log · ห้องเดิม = คืนผลเดิม (ไม่ log ซ้ำ) · ห้องอื่น = INVALID_INPUT (ชนคีย์) · ค้น 30 วันล่าสุดของหน่วย

### hkNote JSON (มติ §9 ข้อ 2 · ไม่เพิ่มคอลัมน์)
`HotelRoom.hkNote = {"assignedTo","startedAt","guestRequest"}` (3 คีย์เท่านั้น) · `hkStart` เขียน assignedTo/startedAt (คนอื่นทำอยู่ ⇒ `TAKEN` · หัวหน้า `override`) · `hkFinish` ล้าง assignedTo/startedAt คง guestRequest · ข้อความเดิมก่อน H.6 (ไม่ใช่ JSON) อ่านเป็นคำขอแขก · `setGuestRequest` (แม่บ้าน/หน้าเคาน์เตอร์) · `at` ของ hkStart รับเฉพาะใต้ `SVC_QC_CLOCK=1`

### งานห้องวันนี้ (`hkBoard` · มุมมองคำนวณสด · ≤ 4 คำสั่ง SQL)
- บริบท: OOO (hkStatus OUT_OF_ORDER หรือ BLOCK ครอบวันนี้) → STAYOVER (CHECKED_IN ออกหลังวันนี้) → DEPARTING (CHECKED_IN ออกวันนี้) → DEPARTED (CHECKED_OUT/REFUNDED วันนี้) → ARRIVING (CONFIRMED/HOLD เข้าวันนี้ · arrivalTime = checkInTime ของประเภทห้อง) → VACANT · ห้องรายเดือน (MONTHLY) ไม่อยู่บนบอร์ด
- `upcoming` (มีเฉพาะเมื่อจริง): ห้องว่างที่ **ตรวจแล้ว** และมีจองเข้าใน 7 วัน (ป้าย "พร้อมรับ <ชื่อ> <วัน>")
- ลำดับด่วน `hkPriority`: 0 ออกแล้ว+แขกเข้า · 1 แขกเข้า · 2 ออกแล้ว/ออกวันนี้ · 3 ค้างต่อ · 4 ว่างไม่สะอาด · 5 อื่น (แล้วเรียงเวลาเข้า · เลขห้อง)
- counts: total = ไม่ OOO และ (ไม่ VACANT หรือ DIRTY หรือ upcoming) · done = ใน total ที่ CLEAN/INSPECTED และไม่มีคำขอแขก · mine = assignedTo = ผู้ดู

### มินิบาร์ (§2 ข้อ 4 · Q7)
- รายการ = ค่าตั้ง `rooms.hotel.minibar` (#75 union: `{key,name,priceSatang}` ใช้บนมือถือ · `{productId,priceSatang?}` เดิมยังผ่าน schema แต่จอแม่บ้านยังไม่แสดง)
- แขก CHECKED_IN พักอยู่ ⇒ `postFolioItem(MINIBAR)` ต่อรายการ (ราคา/ชื่อ snapshot ณ เวลาโพสต์ · `refType "HotelHousekeeping"` · `refId svc-h6-minibar-<roomId>-<ymd>-<key>[-<clientKey>]` กันซ้ำ) + `hotel.hk.minibar_posted` · ไม่ตัดสต็อก/ไม่ผ่าน POS
- ไม่มีแขกพัก/บิลปิด ⇒ ไม่โพสต์ · `hotel.hk.minibar_unbilled` (ครั้งเดียวต่อชุด/วัน) + log note `{minibar:{unbilled:true,status:"PENDING",items}}` ให้หน้าเคาน์เตอร์เลือกเรียกเก็บ/ยกให้ (คิวหน้าเคาน์เตอร์ = H.7/H.4)
- แม่บ้านโพสต์ได้เฉพาะ MINIBAR ราคาจากค่าตั้ง (ไม่ต้องมี hotel.folio.post — housekeeping.ts ให้สิทธิ์เฉพาะเส้นนี้)

### แจ้งของเสีย (`reportDefect`) · ด่าน DORM|HOTEL
- รูป ≤ 3 · jpeg/png/webp · ≤ 8 MB · ไบต์หัวตรงชนิด (X6) · ไฟล์ส่วนตัว
- `REPAIR` (hotel.housekeeping) ⇒ `dorm.createStaffRepair` (ใบซ่อมพนักงาน · leaseId/partyId null · หมวด `rooms.repair.categories` ของหน่วย → OTHER) · event `dorm.repair.created` เดิม · ไม่เปลี่ยน hkStatus
- `BLOCK` (hotel.booking.manage หรือ hotel.housekeeping + `rooms.hotel.hk.canBlock`) ⇒ `blockRoom` ของ H.2 วันนี้..+N (1–30) ⇒ OUT_OF_ORDER · ชนแขก ⇒ `ROOM_TAKEN` + suggest REPAIR
- `dorm/portal.dormStaffGate(ctx, unitId, action, opts?: {allowTypes})` ค่าเริ่ม `["DORM"]` = ทางเดิมทุกไบต์ · `dorm/repair` เส้นพนักงาน (list/job/complete) ส่ง `["DORM","HOTEL"]` · หน่วย HOTEL ไม่มีขอบเขตอาคารของหอ (เห็นทั้งหน่วย)

### night audit (H.7 เรียก)
- `markStayoversDirty(ctx, {unitId, businessDate})`: CHECKED_IN ที่ checkIn ≤ วันนั้น < checkOut + `dailyHousekeeping` (ชั้นประเภทห้อง) ⇒ DIRTY (by null · note "night audit") · idempotent ตามสถานะ
- `syncBlockedRooms` (เรียกในตัวด้วย): BLOCK ที่ถึงวัน ⇒ OUT_OF_ORDER (ปิดหนี้ H.2) · BLOCK หมดช่วงภายใน 7 วันและไม่มีปิดอื่นครอบ ⇒ DIRTY

### Event (3 ทะเบียน · payload ไม่มี PII)
`hotel.hk.changed {roomId, from, to, byUserId}` · `hotel.hk.minibar_posted {reservationId, roomId, items, amountSatang}` · `hotel.hk.minibar_unbilled {roomId, items, amountSatang}` · `hotel.hk.defect {roomId, action, repairId|blockId}`

## ปิดวัน (night audit) · รายงาน (SVC H.7)

### ไฟล์
`hotel/business-date.ts` (pure · timezone) · `hotel/night-audit.ts` (ปิดวัน/reopen/ประวัติ/cron/อีเมลสรุป) · `hotel/reports.ts` (รายงาน + CSV + getUnitKpi) · จอ `/hotel/reports` · `/hotel/reports/audit` · `/hotel/reports/export` (CSV) · minute job `hotel-night-audit` (15 นาที)

### business date
- วันทางธุรกิจของร้าน = วันที่ตาม timezone ของหน่วย (`unit.settings.timezone` · ค่าเริ่ม Asia/Bangkok ⇒ `bkkYmd` · timezone อื่นผ่าน `Intl` รองรับ DST · ผิด ⇒ ถอยเป็น Bangkok)
- ปิดได้เฉพาะวันที่ `< วันนี้ของร้าน` (`TOO_EARLY`) · วันที่จะปิดถัดไป: ไม่เคยปิด = เมื่อวาน (หรือวันเริ่มใช้ที่เลือก ≤ เมื่อวาน) · วันล่าสุดถูก reopen = วันนั้น · อื่น = วันปิดล่าสุด + 1
- ข้ามวัน = `PREVIOUS_OPEN` · ปิดย้อนก่อนวันปิดล่าสุด = `INVALID_INPUT` · คืนก่อนวันเริ่มใช้ไม่ post ย้อน (ค่าห้อง P1 อยู่ใน totalSatang แล้ว)
- `isAuditDue(tz, nightAuditTime, now, lastClosed)` = เวลาร้าน ≥ nightAuditTime และ (ไม่เคยปิด หรือ lastClosed + 1 < วันนี้ของร้าน) · cron ตัดสินจาก `now` ที่ส่งเข้าเท่านั้น

### 6 ขั้น (idempotent)
1. no-show: CONFIRMED ที่ checkInDate = วันปิด ⇒ `markNoShow` (H.3) **นอก tx** ทีละแถว — มัดจำริบ/คืนผ่าน POS · folio VOID ตาม `releaseStayTx` (มติ §9.1) · CAS สถานะ ⇒ รันซ้ำ = ข้าม · ล้ม = warning
1ข. (r3) แขกที่ย้อน «ไม่มา» (AuditLog `hotel.booking.no_show_undo`) แล้วเข้าพัก (CHECKED_IN) แต่บิลริบ **มัดจำการจอง** (`dep-forfeit:<มัดจำ>` · HOTEL) ยัง PAID ⇒ `reports.restoreForfeitedDepositsOnStay`: `pos.voidSale` (ทางเดียวกับ `refundStay` · กลับบัญชี) + `depositSaleVoided` (มัดจำกลับ OPEN) ⇒ ถูกใช้หักบิลเช็กเอาต์ (แขกจ่าย = ค่าห้องที่พักจริง) · นอก tx · idempotent · ล้ม = warning · AuditLog `hotel.booking.deposit_unforfeited`
2. post ค่าห้อง: คืน counted ของวันปิด · การจอง CHECKED_IN · `folioItemId` ว่าง ⇒ `postRoomNightsTx` (H.5 · ตั้ง `postedAuditId`) · คืนที่ post แล้ว/void แล้วไม่ post ซ้ำ ·
   (r3) คืนค้างของวันที่ปิดไปแล้ว (≥ วันเริ่มใช้ · เช่นย้อน «ไม่มา» แล้วเช็กอิน) ⇒ โพสต์เข้า **วันที่กำลังปิด** (businessDate/postedAuditId = วันนั้น) คำอธิบาย "คืนย้อนหลัง <วัน>" + snapshot.notes · แถว freeze ของวันที่ปิดแล้วไม่ถูกแก้
3. ห้องค้างต่อ ⇒ DIRTY: `markStayoversDirty` (H.6) หลัง commit · เฉพาะครั้งแรกที่ปิด "เมื่อวาน" (ปิดใหม่หลัง reopen ไม่ทำซ้ำ)
4. freeze KPI ลง `HotelNightAudit` (unique unitId+businessDate) · 5. AuditLog `hotel.audit.closed` + outbox `hotel.audit.closed` (consumer ส่งอีเมลสรุป `sendEmailRich` กุญแจ `hotel-audit-<auditId>`)
6. ลำดับวัน (ข้างบน) · cron ไล่ปิดทีละวัน ≤ 7 วัน/หน่วย/รอบ
- ขั้น 2+4+5 อยู่ใน tx เดียว + `pg_advisory_xact_lock(hotel-night-audit:<unitId>)` + ตรวจแถวซ้ำใน tx ⇒ ล้ม = ย้อนทั้งก้อน · ปิดพร้อมกัน/cron ซ้อน = ปิดครั้งเดียว (`ALREADY_CLOSED`)
- reopen: OWNER/MANAGER + `hotel.audit.run` · เฉพาะวันล่าสุด · ต้องมีเหตุผล · ไม่ถอนรายการ folio · ปิดใหม่ = KPI คำนวณทับ (auditId เดิม)

### สูตร KPI (ใบ §2.1)
- roomsTotal = ห้อง active ที่ rentMode (ห้อง ?? ประเภท) ∈ NIGHTLY/BOTH · roomsOOO = ห้องขายได้ที่มี BLOCK ครอบคืน · roomsAvailable = total − OOO
- roomsOccupied = จำนวนห้อง (ไม่ซ้ำ · เฉพาะห้องในชุดที่ขายได้และไม่ BLOCK คืนนั้น ⇒ ≤ available) ที่มีคืน counted ของการจอง CHECKED_IN/CHECKED_OUT · occupancyBps = ⌊occupied × 10000 ÷ available⌋
- roomRevenueSatang = `roomRevenueByDay` (สูตรเดียวของ preview · freeze · รายงานสด · getUnitKpi — r3 มติผู้คุม ข้อ 1): Σ ROOM ที่ไม่ void ตาม businessDate (ไม่นับ folio VOID / การจอง REFUNDED) + nights.priceSatang ของคืน counted ที่ยังไม่โพสต์ (CHECKED_IN/CHECKED_OUT) + คืนค้างของวันที่ปิดแล้วนับเข้าวันที่รอปิด · ราคาตามที่ขายแขก (INCLUSIVE = รวม VAT) · ADR = revenue ÷ occupied · RevPAR = revenue ÷ available (ปัดตาม `rooms.money.rounding`)
- arrivals = เข้าวันนั้นและเข้าพักจริง · departures = ออกวันนั้นและ CHECKED_OUT · noShowCount = เข้าวันนั้นและ NO_SHOW · cancelledCount = cancelledAt ตกวันนั้น (เวลาร้าน)

### รายงาน
- วันที่ปิดแล้ว (CLOSED) = ค่าที่ freeze · วันยังไม่ปิด = คำนวณสดสูตรเดียวกัน (`roomRevenueByDay`) ⇒ สดก่อนปิด = preview = freeze หลังปิด
- รายเดือน = รวมวัน (occupied/available/revenue รวม แล้วคิด bps/ADR/RevPAR จากผลรวม) · ช่วง ≤ 366 วัน (`INVALID_RANGE`) · ≤ 8 คำสั่ง SQL ต่อรายงาน
- รายได้ตามแหล่ง/แผน/ประเภท (r3) = แถว folio ที่ไม่ void ตาม businessDate (ไม่นับ folio VOID / การจอง REFUNDED): ห้อง = ROOM · อื่น = SERVICE/POS_CHARGE/MINIBAR/PENALTY/DISCOUNT/TAX/SERVICE_CHARGE ⇒ รวม = ยอดที่เก็บแขก (= ยอดบิลเช็กเอาต์ POS) · `vatSatang` = VAT ในยอดรวมต่อ folio ตามโหมดภาษี (INCLUSIVE `splitIncludedVat` · EXCLUSIVE แถว TAX + VAT ในบิลร้านที่ลงห้อง) ⇒ รวม − VAT = รายได้ GL 4xxx · groupBy roomType คีย์ = id ประเภท (ชื่อ = ป้าย) · ยังนับเฉพาะคืนที่โพสต์แล้ว (ข้อสอบ RP-3)
- มัดจำ (r3): «ริบ» = บิลริบ PAID ของมัดจำการจอง (ใบรับ = `depositSaleId` ของการจองในหน่วย) ที่การจองยังเป็น NO_SHOW — ไม่รวมริบเงินประกันห้อง/ค่าธรรมเนียมยกเลิก (คีย์ `dep-forfeit:` เดียวกัน)
- ฟันเนล = การจองที่สร้างในช่วง · forecast30 = `hotelAvailability` (H.3)
- `getUnitKpi(unitId)` = {occupancyTodayBps (on-the-books: CHECKED_IN คืนนี้ + CONFIRMED เข้าวันนี้), arrivalsToday, roomRevenueYesterdaySatang (ปิดแล้ว = audit · ไม่งั้นสด)}
- CSV: UTF-8 BOM · หัวตารางไทย · ทุกช่องผ่าน `csvRow` (X6) · ชื่อไฟล์ใช้ id หน่วย ไม่มีชื่อร้าน · (r3) แถวรวมท้ายตาราง (route ส่ง total) · แม่บ้านรายคน (`housekeepingUsers`) · ฟันเนลมีคอลัมน์เหตุผลยกเลิก · รายได้มีคอลัมน์ VAT · วันที่คงรูป ISO
