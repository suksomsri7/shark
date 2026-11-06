# ใบสั่ง H.3 — จอง V2: ถือห้องรอมัดจำ (HOLD) · หลายห้อง/กลุ่ม · แหล่งที่มา · คืนรายแถว · ยกเลิกตามขั้นบันได · ต่อ/ย่นคืน · no-show มือ · จอรายการ/รายละเอียด/วิซาร์ด · ตรวจ **เข้ม (กันจองซ้อน + เงิน)** · ผู้ตรวจ 2 รอบ + load test

> แหล่งความจริง: `ledger/SVC-HOTEL-PLAN.md` §2 (มติ 1–3, 8, 12) · สเปก S §3.3–3.4 (S:108–127) §4 (HotelBooking* → ใช้ HotelReservation) §5.4 (API การจอง S:728–741) §7.2 (createBooking + overbooking guard S:841–863) §7.3 (HOLD→CONFIRMED S:865–881) §7.5 ต่อ/ย่น (S:915–923) §7.8 state machine (S:976–986) §11 edge (S:1111–1124) §12 QC (S:1134–1136, 1143) · ใบ H.0 (ตาราง HotelBookingNight · ฟิลด์ใหม่ HotelReservation · SNAPSHOTS.reservation) · ใบ H.1 (`quoteStay` · `depositFor` · `refundFor` · `taxLines` · `loadPricingContext`) · POS `moduleTakeDeposit/moduleRefundDeposit/moduleForfeitDeposit` (`src/lib/modules/pos/deposit.ts`) · แกนห้อง `claimRoom/moveOccupancy/resizeOccupancy/releaseOccupancy/expireHolds` (`src/lib/modules/rooms`)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-h.3.mts» + load test «scripts/probe-h3-load.mts» (20 คำขอพร้อมกัน ห้องเหลือ 1 ⇒ สำเร็จ 1) · probe ผู้ตรวจ `probe-h3-b.mts`
> ผู้คุมแก้ให้แล้ว: `scripts/svc-qc-data.mts` บล็อก "SVC H.3" (`SQC_HOTEL_BOOKING_SCENE` · ภาพ `SQC_VISUAL_SPECS["h.3"]` · ผู้ใช้ frontdesk +`hotel.booking.manage` `hotel.reservation.create/cancel`)
> builder: **ห้าม build/next · ห้าม commit/push session/svc · ห้าม `pnpm install` · ห้าม migration/`prisma/**`** · เลนตามผู้คุม · temp `svc-h3-`

## 0. หลักของใบ
- **ห้องจริง = `RoomOccupancy` (EXCLUDE) · ประเภทห้อง = `HotelBookingNight.counted` + advisory lock ต่อ (unit, roomType)** — สองชั้นนี้เขียนใน tx เดียวกันเสมอ (มติ §2 ข้อ 2–3) · availability สูตรเดียว S §4.2 ใช้ทุกที่ (ย้ายของ H.1 "เหลือขาย" มาเป็น `hotelAvailability.get(unitId, roomTypeId?, from, to)` ใน `availability.ts` แล้วให้ H.1/H.2/H.8/H.10 เรียกตัวเดียวกัน)
- **เงินทุกบาทผ่าน POS**: มัดจำ = `moduleTakeDeposit` (รับ payType จาก UI · ไม่ใช่ TRANSFER ตายตัว) · ริบ = `moduleForfeitDeposit` · คืนตามขั้นบันได = `moduleRefundDeposit` (ยอด = `refundFor`) · ไม่มีการเขียนบัญชีตรงจากโมดูลโรงแรม
- **snapshot ตอนจอง**: `policySnapshot` = `snapshotPolicy("reservation")` + กฎยกเลิกของแผน + `taxSnapshot` · ทุกการตัดสินใจหลังจอง (คืนเงิน · no-show · เวลาเช็กอิน) อ่านจาก snapshot ไม่อ่านค่าตั้งสด
- **เลิกเส้น legacy** ของ P1 (`stayLoad` นับการจองที่ไม่มี occupancy · `ratePerNightSatang×nights`) — ก่อนลบต้องรัน `svc-h0-backfill` บนฐานของเลน แล้ว CONFLICT = 0
- **สถานะ**: `HOLD → CONFIRMED → CHECKED_IN → CHECKED_OUT` · `HOLD/CONFIRMED → CANCELLED` · `CONFIRMED → NO_SHOW` · `NO_SHOW → CONFIRMED` (MANAGER ภายในวันเดียว) · ห้ามเขียน `BOOKED` อีก (ของเดิมที่ค้างถูก backfill แล้ว) · `REFUNDED` คงเป็นสถานะปลายของเส้น P1 (refundStay) เท่านั้น
- ไม่ทำในใบนี้: tape chart/ย้ายห้องด้วยการลาก (H.2) · เช็กอิน V2/ทะเบียนแขก (H.4 — ใบนี้คง `checkIn` เดิมแต่ให้ทำงานกับ nights/occupancy ใหม่) · folio/เช็กเอาต์ V2 (H.5 — ใบนี้คง `checkOut` เดิม) · storefront (H.8 — ใบนี้เตรียม API `createBooking({source:"WEB"})` ให้เรียกได้) · OTA (H.10)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/lib/modules/hotel/availability.ts» | ใหม่ | `hotelAvailability.get` §3.1 (อ่านอย่างเดียว · ผ่าน `occupancyRange` + nights) |
| «src/lib/modules/hotel/booking.ts» | ใหม่ (server) | `createBooking` `confirmBooking` `cancelBooking` `extendBooking` `shortenBooking` `assignRoom` `markNoShow` `undoNoShow` `takeBookingDeposit` `listBookings` `getBooking` `sweepExpiredHolds` §3 |
| «src/lib/modules/hotel/booking-state.ts» | ใหม่ (pure) | state machine `canTransition(from,to,{role,sameDay})` · `nightsOf(checkIn,checkOut)` · `holdDeadline(now, minutes)` |
| `src/lib/modules/hotel/service.ts` | **แก้เฉพาะ**: `createReservation` → เรียก `createBooking` (คง signature เดิมให้ P1 callers) · `checkIn` ใช้ nights.roomId/occupancy ใหม่ (ลบ legacy branch) · `cancelReservation` → `cancelBooking` · ลบ `stayLoad` legacy (หลัง CONFLICT=0) · อื่นห้ามแตะ (checkOut/refundStay = H.5) |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่ม | facade + actions §3.5 (บล็อก `// SVC H.3 ▸ … ◂`) |
| `src/lib/modules/hotel/pricing.ts` | เพิ่มอย่างเดียว | `depositPolicyOf(plan, setting)` ใช้จริง · ไม่แก้สูตรเดิม |
| «src/components/hotel/{BookingList,BookingDetail,BookingWizard,BookingDepositDialog}.tsx» + `booking-shared.ts` | ใหม่ | จอ §4 |
| `src/app/app/u/[unitSlug]/hotel/reservations/page.tsx` · «…/reservations/[id]/page.tsx» · «…/reservations/new/page.tsx» | แก้/ใหม่ | หน้า §4 · ด่าน HOTEL · ถอด `ModuleTabs` ซ้อน (หนี้ H.1) |
| `src/lib/platform/cron.ts` | เพิ่ม | เรียก `sweepExpiredHolds` ทุกนาที (ต่อจาก `expireHolds` ของแกนห้อง · idempotent) |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | เพิ่ม | event §5 ลง 3 ทะเบียน (CC §7) |
| `src/lib/core/permissions.ts` | ย้าย `hotel.booking.manage` จาก planned → ใช้จริง |
| «scripts/svc-qc-hotel-booking-scene.mts» | ใหม่ | ฉาก §6 |
| `docs/sds/modules/hotel.md` | เพิ่ม §การจอง | state machine · guard · สูตร availability · มัดจำ/คืนเงิน |

ห้ามแตะ: `prisma/**` · `modules/rooms/**` (ใช้ facade) · `modules/pos/**` (ใช้ module API) · `rates.ts`/`hotel-settings.ts` (H.1) · storefront · oracle

## 2. มติของใบนี้
1. **createBooking (tx เดียว · S §7.2)**: ตรวจ input (checkIn ≥ วันนี้ไทย · checkOut > checkIn · ≤ `maxAdvanceBookingDays` · occupancy ≤ maxOccupancy · ห้องที่ขอ ≥ 1 ≤ 10) → โหลด `PricingContext` ครอบช่วง → `quoteStay` ต่อห้อง (ล้ม = คืน error ของ quote) → **`pg_advisory_xact_lock(hashtext(unitId||':'||roomTypeId))` เรียงตาม roomTypeId** → นับ nights.counted + occupancy BLOCK/LEASE ต่อคืน → ไม่พอ ⇒ `AVAILABILITY_CHANGED {dates}` → สร้าง `HotelReservation` ต่อห้อง (`groupId` เดียว = cuid เมื่อ > 1 ห้อง · `code` running ต่อหน่วย prefix `rooms.hotel.codePrefix` · retry 3 เมื่อชน unique) + `HotelBookingNight` ทุกคืน `counted=true` + `policySnapshot`/`taxSnapshot` → **ห้องจริง**: `claimRoom(kind: HOLD|STAY)` ต่อแถว (best-fit ของ P1 · ไม่ได้ห้อง = ไม่ล้ม ถ้า nights พอ — ห้องจริง assign ตอนเช็กอิน · แต่ถ้าได้ให้ถือทันที) → สถานะตาม `bookingMode`/ช่องทาง: WEB/LINE ⇒ HOLD (`holdExpiresAt = now + holdMinutesOnline`) · COUNTER/PHONE ⇒ CONFIRMED (หรือ HOLD `holdMinutesCounter` เมื่อเลือก "รอโอน") · `AUTO_CONFIRM` ⇒ CONFIRMED ทุกช่องทาง · `MANUAL_APPROVE` ⇒ HOLD ไม่มีหมดอายุ (null) รอพนักงานกด → `HotelFolio` OPEN เมื่อ CONFIRMED (item ยังไม่มี · H.5 เป็นเจ้าของ item) → AuditLog + outbox `hotel.booking.created`
2. **มัดจำ**: `depositRequiredSatang` = `depositFor(quotes ทั้งกลุ่ม, policy)` เก็บบนแถว "หัวกลุ่ม" (แถวแรก · `depositSatang` ของแถวอื่น = 0) · `takeBookingDeposit({reservationId, payType, amountSatang?, reference?})` → `moduleTakeDeposit` keyBase `hotel-deposit-<groupId|id>` → `depositPaidAt/depositSaleId` → ถ้า HOLD ยังไม่หมดอายุ ⇒ CONFIRMED ทุกแถวในกลุ่ม · จ่ายหลังหมดอายุ (`HOLD_EXPIRED`): ลอง re-book ใน guard tx — ว่าง ⇒ CONFIRMED · ไม่ว่าง ⇒ สถานะคง CANCELLED + คืนมัดจำอัตโนมัติ (`moduleRefundDeposit`) + แจ้งพนักงาน (outbox `hotel.booking.deposit_after_expiry`)
3. **sweepExpiredHolds** (cron ทุกนาที · ข้ามร้าน · index `[status, holdExpiresAt]`): HOLD ที่ `holdExpiresAt < now` ⇒ CANCELLED `cancelReason="HOLD_EXPIRED"` · nights `counted=false` · `releaseOccupancy` ของแถว · folio (ถ้ามี) VOID · ทำทีละก้อน ≤ 200 · idempotent · ไม่แตะ HOLD ที่ `holdExpiresAt` null (MANUAL_APPROVE)
4. **ยกเลิก** `cancelBooking({reservationId|groupId, reason, by})`: อนุญาต HOLD/CONFIRMED · ยกเลิกทั้งกลุ่มหรือรายห้อง (ถ้ารายห้องและห้องนั้นถือมัดจำหัวกลุ่ม ⇒ ย้ายหัวกลุ่มไปแถวถัดไป · ไม่คืนมัดจำ) · คืนเงิน = `refundFor({paid: depositPaidSatang, checkInDate, cancelAt: วันนี้ไทย, rules: policySnapshot.cancelRules})` → `moduleRefundDeposit` ยอดนั้น (0 = ไม่เรียก · ส่วนที่เหลือ = `moduleForfeitDeposit`) · สิทธิ์: STAFF ยกเลิกได้เมื่อมัดจำจ่าย = 0 · มีคืนเงิน/ริบ = `hotel.booking.manage` (MANAGER) · nights counted=false · release occupancy · AuditLog + outbox `hotel.booking.cancelled`
5. **ต่อคืน** `extendBooking({id, newCheckOut})`: guard tx เฉพาะคืนใหม่ · ราคา = `quoteStay` ณ ปัจจุบัน (UI แสดงยืนยันก่อน) · ห้องเดิมไม่ว่างคืนใหม่ ⇒ `ROOM_BUSY {suggest: ย้ายห้อง}` (ยังไม่ทำย้ายอัตโนมัติ) · `resizeOccupancy` · nights เพิ่ม · `totalSatang` อัป · **ย่นคืน** `shortenBooking({id, newCheckOut})`: คืนอนาคต `counted=false` · คืนที่ `postedAuditId` แล้วไม่ถอน · resize occupancy · ไม่คืนเงินอัตโนมัติ (S:923)
6. **no-show มือ** `markNoShow({id})`: CONFIRMED + checkInDate ≤ วันนี้ไทย · ตาม `rooms.hotel.noShow` ใน snapshot: `FORFEIT_RELEASE_AFTER_AUDIT` ⇒ ริบมัดจำ + ปล่อยห้อง/nights · `FORFEIT_HOLD_STAY` ⇒ ริบแต่ถือห้องต่อ (counted คง) · `REFUND_RELEASE` ⇒ คืนมัดจำเต็ม + ปล่อย · `undoNoShow` MANAGER ภายในวันเดียวกัน (ไทย) ผ่าน guard tx (ต้องยังว่าง)
7. **assignRoom** `({id, roomId})`: CONFIRMED/HOLD · ห้องประเภทเดียวกัน (หรือต่างประเภท = ไม่คิดส่วนต่าง S:911 + ต้องมี `hotel.booking.manage`) · ว่างตลอดช่วง · `moveOccupancy`/`claimRoom` · nights.roomId อัปทุกคืน · ห้อง OUT_OF_ORDER ⇒ `ROOM_INACTIVE`
8. **source** ∈ `WEB WALK_IN PHONE LINE OTA` · `channelRef` เมื่อ OTA (คีย์เอง · H.10 ผูกจริง) · จอกรองตามแหล่ง
9. **ข้ามร้าน/หน่วย** = `NOT_FOUND` ทุกฟังก์ชัน · ด่าน `unit.type === "HOTEL"` · ทุกคิวรีผ่าน `tenantDb({tenantId, unitId})`
10. **ด่านพร้อมกัน (load)**: 20 คำขอ `createBooking` พร้อมกันบนประเภทห้องที่เหลือ 1 ⇒ สำเร็จ 1 · ที่เหลือ `AVAILABILITY_CHANGED` · ไม่มีแถว nights/occupancy ส่วนเกิน · ไม่มี 40P01 ดิบ (ล็อกเรียงลำดับ)
11. **legacy**: หลังใบนี้ `stayLoad` ไม่นับการจองที่ไม่มี occupancy อีก · ทุกการจอง active ต้องมี nights · ข้อสอบตรวจว่าไม่มี path ใดสร้าง reservation โดยไม่มี nights
12. **โทรศัพท์/walk-in หน้าเคาน์เตอร์**: วิซาร์ด 3 ขั้น (เลือกวัน/ประเภท/จำนวนห้อง → ผู้เข้าพัก/แผน/แหล่ง → ยืนยัน+มัดจำ) · มัดจำรับได้ทันที (เงินสด/QR/โอน/บัตร) หรือ "รอโอน" = HOLD ตาม `holdMinutesCounter`

## 3. สัญญาโค้ด (ย่อ · ข้อสอบผูกชื่อ/รูป)
3.1 `hotelAvailability.get(ctx, {unitId, roomTypeId?, from, to}) → { byDate: Record<ymd, Record<roomTypeId, {total, blocked, leased, counted, available}>> }` (อ่านอย่างเดียว · ≤ 4 คิวรี)
3.2 `createBooking(actor|null(public), ctx, input: { unitId; rooms: {roomTypeId; adults; children; extraBeds?}[]; checkIn; checkOut; ratePlanId?; source; guest: {name; phone?; email?}; note?; couponCode?; hold?: "ONLINE"|"COUNTER"|null; channelRef? }) → {ok:true, groupId|null, reservations: [{id, code, roomTypeId, status, holdExpiresAt, nights, totalSatang}], depositRequiredSatang, quote} | {ok:false, code: "INVALID_INPUT"|"NO_RATE"|"MIN_NIGHTS"|"MAX_NIGHTS"|"CLOSED_TO_ARRIVAL"|"TOO_FAR"|"PAST_DATE"|"OVER_OCCUPANCY"|"EXTRA_BED_NOT_ALLOWED"|"AVAILABILITY_CHANGED"|"NOT_FOUND"|"FORBIDDEN", reason, dates?}`
3.3 `takeBookingDeposit` · `confirmBooking` (MANUAL_APPROVE) · `cancelBooking` · `extendBooking` · `shortenBooking` · `assignRoom` · `markNoShow` · `undoNoShow` · `listBookings({unitId, status?, source?, from?, to?, q?, page})` · `getBooking({id})` (รวม nights · occupancy · folio สรุป · snapshot · ประวัติ AuditLog) · `sweepExpiredHolds({now?, limit?})` → `{expired: n}`
3.4 `booking-state.ts`: `TRANSITIONS` ตารางคงที่ · `canTransition` pure · ข้อสอบยิงครบทุกคู่
3.5 actions: `createBookingAction` `takeBookingDepositAction` `confirmBookingAction` `cancelBookingAction` `extendBookingAction` `shortenBookingAction` `assignRoomAction` `markNoShowAction` `undoNoShowAction` — `assertHotelCan` + ด่าน HOTEL · สิทธิ์: create = `hotel.reservation.create` · cancel = `hotel.reservation.cancel` (+ manage เมื่อมีเงิน) · อื่น = `hotel.booking.manage`

## 4. จอ (desktop หลัก · มือถือ 390 ใช้ได้ · ไทยทั้งหมด)
- **รายการการจอง** `/hotel/reservations`: ตัวกรอง สถานะ/แหล่ง/ช่วงวัน/ค้นหา (ชื่อ/เบอร์/รหัส) · แถว = รหัส · แขก · ประเภท/ห้อง · วันเข้า–ออก (คืน) · แหล่ง · สถานะ (ป้ายไทย: ถือไว้รอมัดจำ นับถอยหลัง / ยืนยัน / เข้าพัก / ออกแล้ว / ไม่มา / ยกเลิก) · ยอด/มัดจำ · กลุ่ม N ห้อง · ปุ่ม "จองใหม่"
- **รายละเอียด** `/hotel/reservations/[id]`: แท็บ แขก · ห้อง&คืน (ตารางคืน ราคา/source/ห้อง) · เงิน (ยอด · มัดจำ · นโยบาย snapshot · ปุ่มรับมัดจำ/คืน) · ประวัติ · ปุ่มตามสถานะ: ยืนยัน(MANUAL) · รับมัดจำ · กำหนดห้อง · ต่อคืน/ย่นคืน (แสดงราคาใหม่ก่อนยืนยัน) · ไม่มา · ยกเลิก (แสดงยอดคืนตามขั้นบันไดก่อนยืนยัน) · กลุ่ม: รายการห้องในกลุ่ม + "ยกเลิกทั้งกลุ่ม"
- **วิซาร์ด** `/hotel/reservations/new` 3 ขั้น (มติ 12) · ขั้น 1 แสดงห้องเหลือต่อประเภท (availability) + ราคารวมจาก quote · ขั้น 3 เลือกวิธีรับมัดจำ/รอโอน
- read-only (ไม่มีสิทธิ์เขียน) ไม่ render ปุ่ม · `data-scroll-hint` บนตารางเลื่อน · ไม่มี ModuleTabs ซ้อน HotelTabs (ถอดของเดิม)

## 5. event (CC §7 · 3 ทะเบียน · ป้ายไทย)
`hotel.booking.created` · `hotel.booking.confirmed` · `hotel.booking.cancelled` · `hotel.booking.hold_expired` · `hotel.booking.no_show` · `hotel.booking.changed` (ต่อ/ย่น/ย้ายห้อง) · `hotel.booking.deposit_after_expiry` — ทุกตัว emit ใน tx เดียวกับสถานะ · payload {tenantId, unitId, reservationId, groupId, code, status, source} ไม่มี PII

## 6. ฉาก «svc-qc-hotel-booking-scene.mts» (builder · บนฟิกซ์เจอร์ H.1)
สร้างบน bansuan-hotel สัมพัทธ์วันนี้ไทย: HOLD ออนไลน์ 1 (หมดอายุอีก 10 นาที) · HOLD หมดอายุแล้ว 1 (ให้ sweep เก็บ) · CONFIRMED 4 (วันนี้ 2 · พรุ่งนี้ 1 · กลุ่ม 3 ห้อง สัปดาห์หน้า) · CHECKED_IN 2 · NO_SHOW 1 (เมื่อวาน) · CANCELLED 1 (คืนเงิน 50%) · แหล่งคละ WEB/WALK_IN/PHONE/LINE/OTA(channelRef) · ผ่าน `createBooking` เท่านั้น (ห้าม insert ตรง) · มัดจำผ่าน `takeBookingDeposit` payType PROMPTPAY · idempotent + `--clear` (ลบผ่าน cancel + ลบแถวฉาก mark `note` "SvcQcScene:h3")

## 7. เกณฑ์รับ · regression · X
- «qc-svc-h.3.mts» ผ่านทุกข้อ · `probe-h3-load.mts` 20 คำขอ สำเร็จ 1 (รัน 3 รอบ) · probe-h3-b breach 0 · tsc 0 · fitness 2 โหมด · ภาพ h.3 (รายการ · รายละเอียดกลุ่ม · วิซาร์ดขั้น 1/3) owner/frontdesk · ไล่กดโรงแรม (walker H ต่อจาก g2) 0 error
- G: qc-svc-h.0 · h.1 · qc-hotel-money/public/refund (เส้น P1 ยังต้องเขียว: จองผ่าน createReservation เดิม → nights/occupancy ครบ) · r0.8 · r0.9 (ยอม G-1) · smoke · b.0 (ทะเบียน event)
- X1 ข้ามร้าน/หน่วย · X3 idempotent (มัดจำซ้ำ · sweep ซ้ำ · cancel ซ้ำ) · X4 พร้อมกัน (load) · X9 สิทธิ์ 3 ระดับ · X10 payload ไม่มี PII
- ผู้ตรวจ: รอบ 1 = guard tx/ล็อก/ลำดับ/race (อ่านโค้ด + load) · รอบ 2 = เงิน (มัดจำ/คืน/ริบ ผ่าน POS · snapshot · กลุ่ม)

## 8. ส่งต่อ
H.2: `assignRoom`/`extendBooking` เป็นฐานของการลาก · H.4: `checkIn` V2 ใช้ nights.roomId · H.5: folio item · เช็กเอาต์ · H.7: no-show อัตโนมัติ = `markNoShow` ชุด · H.8: `createBooking(null, …, {source:"WEB", hold:"ONLINE"})` + `takeBookingDeposit` ผ่าน PaymentIntent · H.10: `source:"OTA"` + `channelRef` + คิว NEEDS_ROOM เมื่อ `AVAILABILITY_CHANGED`
