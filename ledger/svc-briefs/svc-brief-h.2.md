# ใบสั่ง H.2 — ปฏิทินห้อง (tape chart) · ลากย้ายห้อง/ยืดคืน · ปิดห้อง (BLOCK) · สัญญาหอบนแกนเดียว · อัตราเข้าพักรายคืน · KPI แถบบน (ภาพ 08) · ตรวจ **เข้ม (กันจองซ้อน)** · ผู้ตรวจ 1 รอบ + PARITY

> แหล่งความจริง: `ledger/SVC-HOTEL-PLAN.md` §2 (มติ 2–3, 10) · สเปก S §5.3 `GET /tape-chart` (S:722) · UI D2 (S:795) · D3 availability calendar (S:796) · D1 Hotel Today (S:794) · §7.5 ย้ายห้อง (S:904–913) · §11 edge (S:1118–1119) · §12 QC (S:1138, 1158–1159) · DH §7 "ปฏิทินห้อง" + ภาพ `ledger/design-dorm/08-hotel-tape.png` (+ `.body.html`) · ใบ H.3 (`assignRoom` `extendBooking` `shortenBooking` `hotelAvailability`) · แกนห้อง `roomBoard` `occupancyRange` `claimRoom(kind BLOCK)` `releaseOccupancy` (`src/lib/modules/rooms`) · หอ: `DormLease`/`RoomOccupancy kind LEASE` (แสดงอย่างเดียว)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-h.2.mts» · probe ผู้ตรวจ `probe-h2-b.mts` · ภาพ `SQC_VISUAL_SPECS["h.2"]` (ผู้คุมตั้ง)
> builder: **ห้าม build/next · ห้าม commit/push session/svc · ห้าม `pnpm install` · ห้าม prisma/**** · temp `svc-h2-`

## 0. หลักของใบ
- tape chart เป็น **มุมมอง** ของข้อมูลที่ H.3 เขียน: ทุกการเปลี่ยน (ลาก/ยืด/ปิดห้อง) เรียก `booking.ts`/facade rooms เท่านั้น ไม่มีเส้นเขียนใหม่ · ยืนยันก่อน commit เสมอ (S:795)
- ห้องจริงตัดสินด้วย `RoomOccupancy` EXCLUDE · ชั้นประเภทด้วย nights.counted — ย้ายห้องข้ามประเภทต้องผ่านทั้งสองชั้น (H.3 `assignRoom` ทำแล้ว)
- **BLOCK** = `RoomOccupancy kind BLOCK` + `reason`/`note` (H.0 ไม่ได้เพิ่มคอลัมน์ reason — ใช้ `refType "HotelRoomBlock"` + `refId` = cuid และเก็บ reason ใน `HotelHousekeepingLog.note` เมื่อ toStatus OUT_OF_ORDER · หรือเพิ่มคอลัมน์ = ขอผู้คุม ⇒ **มติ: ไม่เพิ่มคอลัมน์ · reason ลง HousekeepingLog + AuditLog**)
- ห้องรายเดือน (หอ) แสดงเป็นแถบเทา "ปล่อยรายเดือน (ระบบหอ) · ผู้เช่า · ถึง <วัน>" คลิกไปหน้าหอ · ลาก/แก้ไม่ได้จากที่นี่

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/lib/modules/hotel/tape.ts» | ใหม่ (server · อ่าน) | `tapeChart(ctx, {unitId, from, to, view})` §3.1 · `hotelToday(ctx, {unitId})` §3.3 |
| «src/lib/modules/hotel/block.ts» | ใหม่ (server) | `blockRoom` `releaseBlock` `listBlocks` §3.2 |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่ม | facade + actions (บล็อก `// SVC H.2 ▸ … ◂`): `moveBookingAction` (= assignRoom + เลื่อนวัน) · `resizeBookingAction` (extend/shorten) · `blockRoomAction` · `releaseBlockAction` |
| «src/components/hotel/{TapeChart,TapeBar,TapeKpis,BlockDialog,MoveConfirmDialog}.tsx» + `tape-shared.ts` | ใหม่ (`'use client'`) | จอ §4 · ลากด้วย pointer events (ไม่ใช้ไลบรารี) |
| «src/app/app/u/[unitSlug]/hotel/calendar/page.tsx» | ใหม่ | `/hotel/calendar?from&view=week\|2w\|month` · ด่าน HOTEL · สิทธิ์ `hotel.reservation.create` (อ่าน) · เขียน = `hotel.booking.manage` |
| `src/components/hotel/hotel-tabs-shared.ts` | แก้ค่าเดียว | แท็บ calendar `available: true` |
| `src/app/app/u/[unitSlug]/hotel/page.tsx` + «src/components/hotel/HotelToday.tsx» | แก้/ใหม่ | หน้าเคาน์เตอร์ (D1) ใช้ `hotelToday`: เข้าวันนี้ · ออกวันนี้ · พักอยู่ · แม่บ้านรอทำ · สัปดาห์นี้ % (ภาพ 08 แถบบน) · คง action เช็กอิน/เอาต์ P1 (ถอด ModuleTabs) |
| «scripts/svc-qc-hotel-tape-scene.mts» | ใหม่ | ฉาก §6 (ต่อยอดฉาก H.3) |
| `docs/sds/modules/hotel.md` | เพิ่ม §ปฏิทินห้อง | นิยามแถบ 6 แบบ · กติกาลาก · BLOCK |

ห้ามแตะ: `booking.ts`/`availability.ts` (H.3 · ถ้าขาด API = ขอผู้คุม) · `rooms/**` · `prisma/**` · หน้าหอ · oracle

## 2. มติของใบนี้
1. **tapeChart** = ห้องจริงทุกห้อง NIGHTLY/BOTH ของหน่วย (เรียงอาคาร→ชั้น→เลขห้อง · จัดกลุ่มตามประเภท + ราคาฐานวันนี้/เสาร์อาทิตย์ในหัวกลุ่ม ภาพ 08) × วัน `[from, from+N)` (N = 7/14/เดือนไทย) · แถบ 6 แบบ (ภาพ 08 คำอธิบาย): **พักอยู่** (CHECKED_IN · ดำ) · **จองแล้ว** (CONFIRMED · ขอบ) · **มาจาก OTA** (source OTA · ประ) · **ถือไว้รอมัดจำ** (HOLD · ฟ้า + เวลาหมดอายุ) · **ปิดซ่อม** (BLOCK/OUT_OF_ORDER · ลาย) · **เช่ารายเดือน** (LEASE · เทา · ลิงก์หอ) · แถบเริ่มกลางวันเช็กอิน จบกลางวันเช็กเอาต์ · การจองที่ยังไม่ได้ห้อง (roomId null) = แถว "ยังไม่กำหนดห้อง" ใต้กลุ่มประเภท (ลากลงห้อง = assignRoom)
2. **ลาก** = ย้ายห้อง (แนวตั้ง) และ/หรือเลื่อนวัน (แนวนอน · เฉพาะ CONFIRMED/HOLD · CHECKED_IN เลื่อนวันเข้าไม่ได้) · ปล่อยแล้วขึ้นไดอะล็อกยืนยัน: ห้องเดิม→ใหม่ · วันเดิม→ใหม่ · ราคาใหม่ถ้าเลื่อนวัน (`quoteStay`) · "ไม่คิดส่วนต่างเมื่อย้ายประเภท" · ยืนยัน → `moveBookingAction` → ล้ม (`ROOM_TAKEN`/`AVAILABILITY_CHANGED`/`ROOM_INACTIVE`) = แถบเด้งกลับ + ข้อความ · **ยืดคืน** = ลากขอบขวา → `resizeBookingAction` (extend/shorten ตาม H.3 · ย่นต่ำกว่าคืนที่ post แล้วไม่ได้)
3. **ปิดห้อง** `blockRoom({roomId, from, to, reason})`: `claimRoom(kind BLOCK)` · ชนการจองที่ assign แล้ว ⇒ `ROOM_TAKEN` + รายชื่อการจอง (S:1118 ไม่ทับ) · `hkStatus` → OUT_OF_ORDER เมื่อ BLOCK ครอบวันนี้ (ผ่าน `setHkStatus` + `affectedByOutOfOrder`) · `releaseBlock` คืน DIRTY · ปิดห้องจนประเภทขาดจำนวน ⇒ เตือน "เกินจอง N คืน" (ไม่ยกเลิกอัตโนมัติ) · reason ลง AuditLog + HousekeepingLog
4. **อัตราเข้าพักรายคืน** (แถวล่าง ภาพ 08): `occupied/sellable` ต่อวัน · sellable = ห้อง NIGHTLY/BOTH active − BLOCK − LEASE · occupied = nights.counted ที่มีห้อง + การจองไม่มีห้อง (นับประเภท) · ไม่นับรายเดือน/ซ่อม (ป้าย "ไม่นับรายเดือน/ซ่อม")
5. **KPI แถบบน** (`hotelToday`): เข้าวันนี้ (CONFIRMED checkIn=วันนี้ · ชื่อ 2 คนแรก) · ออกวันนี้ (CHECKED_IN checkOut=วันนี้ · ก่อน `checkOutTime`) · พักอยู่คืนนี้ x/ห้องขายได้ (+ ปิดซ่อม/รายเดือน) · แม่บ้านรอทำ (hkStatus DIRTY) · สัปดาห์นี้ % + ADR (จาก nights.priceSatang ของคืนที่ counted · ศ.–ส. %)
6. **ประสิทธิภาพ**: tapeChart 100 ห้อง × 31 วัน < 1 วิ (S:1159) · ≤ 6 คิวรี (ห้อง · occupancy ช่วง · reservation ที่เกี่ยว · nights ของช่วง · lease ของช่วง · hk) · availability 100 ห้อง × 365 วัน < 200 ms (S:1158 · ของ H.3 แต่วัดที่นี่)
7. **สิทธิ์**: ดู = `hotel.reservation.create` หรือ `hotel.booking.manage` หรือ `hotel.housekeeping` (แม่บ้านเห็นแต่ลากไม่ได้) · ลาก/ปิดห้อง = `hotel.booking.manage` · read-only ไม่ render handle ลาก
8. **ข้ามร้าน/หน่วย** NOT_FOUND · ด่าน HOTEL · หอ: ลิงก์ `/app/u/<หอ>/dorm/tenants?room=` เฉพาะเมื่อผู้ใช้มี `dorm.view` ของหน่วยหอนั้น (ไม่งั้นข้อความเฉย ๆ)
9. **มือถือ 390**: รายการรายวัน (ห้อง → แถบของวัน) + แถบเล็กสัปดาห์ · ไม่ลาก (ปุ่ม "ย้ายห้อง/เลื่อน" เปิดไดอะล็อกแทน) · `data-scroll-hint` บนกริดเดสก์ท็อป

## 3. สัญญาโค้ด (ย่อ)
3.1 `tapeChart(ctx, {unitId, from, days}) → { days: ymd[]; groups: [{roomTypeId, name, rateTodaySatang, rateWeekendSatang, rooms: [{roomId, number, hkStatus, bars: Bar[]}], unassigned: Bar[]}]; occupancy: [{date, occupied, sellable}]; legend }` · `Bar = {kind: "STAY"|"CONFIRMED"|"HOLD"|"OTA"|"BLOCK"|"LEASE"; refId; label; from; to; holdExpiresAt?; guestName?; source?; groupId?; href?}`
3.2 `blockRoom(actor, ctx, {unitId, roomId, from, to, reason}) → {ok, blockId} | {ok:false, code: "ROOM_TAKEN"|"INVALID_RANGE"|"NOT_FOUND"|"FORBIDDEN", conflicts?: [{code, guestName}]}` · `releaseBlock` · `listBlocks`
3.3 `hotelToday(ctx, {unitId, now?}) → {arrivals, departures, inHouse, sellable, blocked, leased, hkDirty, weekOccBps, adrSatang, names…}`
3.4 actions: `moveBookingAction({id, roomId?, checkIn?, checkOut?})` → เรียก H.3 `assignRoom` และ/หรือ `extendBooking/shortenBooking` ใน **tx เดียว** (ถ้า H.3 ไม่มีฟังก์ชันรวม ⇒ ขอผู้คุมเพิ่ม `rescheduleBooking` ใน booking.ts — จดก่อนเริ่ม) · `resizeBookingAction` · `blockRoomAction` · `releaseBlockAction`

## 4. จอ (ภาพ 08 · PARITY ผู้คุม)
หัว: "ปฏิทินห้อง" + สลับ สัปดาห์/2 สัปดาห์/เดือน + ช่วงวัน ‹ › + ปุ่ม "ปิดห้อง" + "จองใหม่" (→ วิซาร์ด H.3) · KPI 5 การ์ด · กริด: คอลัมน์ห้อง (เลข + ป้าย hk) + 7/14/30 คอลัมน์วัน (วันนี้ไฮไลต์) · หัวกลุ่มประเภทพร้อมราคา · แถบตามมติ 1 · แถวอัตราเข้าพักท้ายกริด · คำอธิบายแถบ 6 แบบ + หมายเหตุ OTA (ภาพ 08 ล่างขวา) · คลิกแถบ = ป็อปสรุป + ลิงก์รายละเอียด (H.3) · ไทยทั้งหมด · ตัวเลขจุลภาค

## 5. ฉาก «svc-qc-hotel-tape-scene.mts»
ต่อยอดฉาก H.3 ให้ตรงภาพ 08 ในสัปดาห์ปัจจุบัน: B101 พักอยู่ออกพรุ่งนี้ · B102 walk-in วันนี้ · B103 ปิดซ่อม 3 วัน · B104 Agoda 3 คืน (source OTA) · B105 พักอยู่ · B106–B201 กลุ่มงานแต่ง 3 ห้อง ศ.–ส. · B202 Booking.com 3 คืน · B203 ออกวันนี้ + HOLD รอมัดจำถึง 18:00 · B204 LINE มาถึงวันนี้ · B205 รายเดือน (มีอยู่จากฉากหอ) · B206 ครอบครัว ศ. · B207 หน้าเว็บ พ.–ศ. · ทั้งหมดผ่าน `createBooking`/`blockRoom` เท่านั้น · idempotent · `--clear`

## 6. เกณฑ์รับ · regression · X
- «qc-svc-h.2.mts» ผ่านทุกข้อ · probe-h2-b breach 0 · tsc 0 · fitness 2 โหมด · perf ตามมติ 6 (ข้อสอบวัดจริงบนฉาก 100 ห้องชั่วคราว) · ภาพ h.2 (calendar week/month desktop · mobile · hotel-today) owner/frontdesk/แม่บ้าน(read-only) · PARITY ภาพ 08
- G: qc-svc-h.3 · h.1 · h.0 · r0.8 · r0.9 (ยอม G-1) · d.13 (หอไม่เปลี่ยน) · smoke
- X1 ข้ามร้าน · X4 ลากพร้อมกันสองคนห้องเดียวกัน = สำเร็จ 1 · X9 สิทธิ์ 3 ระดับ · X10
- หนี้ที่รู้: ย้ายข้ามประเภทไม่คิดส่วนต่าง (S:911 🔜) · ลากบนมือถือไม่มี
