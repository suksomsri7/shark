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
