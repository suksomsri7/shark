# Booking (จองคิว/นัดหมาย) (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
โมดูลนัดหมายตามเวลา (นวด สปา คลินิก ทำเล็บ) — บริการ + ช่าง + ตารางเวลารายสัปดาห์ + slot engine + นัด. ผู้ใช้: staff ร้าน (จองหน้าร้าน) + ลูกค้า (จองออนไลน์ผ่าน storefront). **Layer 3: Business** — scope=unit. มี storefront สาธารณะ (public API).
โค้ด: `src/lib/modules/booking/service.ts` · `src/lib/modules/booking/slots.ts` · schema `prisma/schema/booking.prisma`.

## Data model (prisma/schema/booking.prisma)
- **BookingService** — บริการ: `name` `durationMin` `priceSatang` `bufferMin`(พักหลังบริการ) `active` `sortOrder`.
- **BookingStaff** — ช่าง/พนักงาน: `name` `active` `sortOrder`.
- **BookingStaffHours** — ตารางเวลารายสัปดาห์: `weekday`(0=อา..6=ส) `startMin/endMin`(นาทีจากเที่ยงคืน).
- **Appointment** — นัด: `customerId?`(ผูก Member) `staffId` `serviceId` `startAt/endAt`(endAt รวม buffer แล้ว → กันจองซ้อน) `status`(PENDING/CONFIRMED/ARRIVED/DONE/NO_SHOW/CANCELLED default CONFIRMED) `customerName/Phone`(snapshot) `source`(STAFF|ONLINE). index `[staffId, startAt]`.
- ทุกแถว scope axis=unit (tenantId+unitId). ไม่มี field เงินของตัวเอง (priceSatang อยู่ที่ service).

## Service API
`src/lib/modules/booking/slots.ts`:
- `localToUtc(dateStr, minutes)` · `localWeekday(dateStr)` · `minutesToHHMM(min)` — helper เวลา BKK.
- `computeStaffSlots({...})` — คำนวณช่องเวลาว่างของช่างจากตารางทำงาน − นัดที่มี − buffer.

`src/lib/modules/booking/service.ts`:
- `resolveUnit(tenantSlug, unitSlug)` — resolve BusinessUnit จาก slug (สำหรับ storefront).
- `getBookingData(tenantId, unitId)` — services+staff active.
- `getAvailableSlots(...)` — slot ว่างต่อวัน/บริการ/ช่าง (ใช้ computeStaffSlots).
- `createAppointment({...})` — สร้างนัด: ตรวจ slot ว่าง (กันซ้อนด้วย endAt), snapshot ลูกค้า, emit MemberActivity `APPOINTMENT_BOOKED`.
- `listAppointments(tenantId, unitId, fromDateStr)` · `setAppointmentStatus(...)` — จัดการสถานะ.

## การเชื่อมต่อ
- **Member (Customer กลาง)**: Appointment.customerId → Customer.id · `createAppointment` เขียน `MemberActivity` type `APPOINTMENT_BOOKED` (booking/service.ts:180) — timeline ลูกค้า.
- **Queue** (handoff): QueueTicket มี `refType="APPOINTMENT"` + `refId=appointmentId` (queue รับช่วงจากนัด) — เชื่อมผ่าน ref scalar.
- **HR availability**: ตามสเปค ลาอนุมัติ → ปิด slot (wiring ภายหลัง — ยังไม่ผูกใน P1).
- ไม่มี outbox event.

## Permissions
ไม่มี `assertCan` ใน booking (grep = ว่าง). Action ฝั่ง staff ผ่าน requireTenant + resolveUnit; storefront เป็น public (ไม่มี auth). — เป็นหนี้ที่ควรตรวจ (ดูข้อจำกัด).

## UI
- Backoffice: `/app/u/[unitSlug]/booking` · `/app/u/[unitSlug]/booking/setup` (บริการ/ช่าง/ตารางเวลา).
- Storefront สาธารณะ: `/(store)/s/[tenantSlug]/[unitSlug]` (หน้า unit) · API `POST /api/store/[tenantSlug]/[unitSlug]/book` (สร้างนัด) · `GET /api/store/[tenantSlug]/[unitSlug]/slots` (slot ว่าง).

## การทดสอบ
- `scripts/qc-systems.mts` — booking รวมในชุด 7 ระบบ (happy path ผ่าน service จริง). ไม่มี oracle เงินแยก (booking ไม่เข้าเส้นเงินโดยตรง — ชำระผ่าน POS/หน้าร้านภายหลัง).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- ไม่มี assertCan ในโมดูล — ต้องพึ่ง gate ที่ action layer; ควรเพิ่ม permission string ตาม convention.
- Defer: skill mapping ราย service, วันหยุด/ลา (HR wiring), มัดจำ, recurring.
- ยังไม่เข้าเส้นเงิน (ชำระเงินจริง). เกี่ยว WO-0052 Clinic/Healthcare (ต่อยอด Booking).
