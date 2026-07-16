# Calendar รวม (DESIGN — สำหรับ WO-0057)

> ปฏิทินกลาง read-only v1 รวม Booking/Meeting/HR ลา/Rental · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** ปฏิทินเดียวเห็นทุกอย่างที่มีเวลา — นัดจอง (Booking), ประชุม (Meeting), พนักงานลา (HR), สัญญาเช่า (Rental) — read-only v1 (คลิกเด้งไปต้นทาง)
- **ผู้ใช้:** OWNER/MANAGER — เห็นภาพรวมวัน/สัปดาห์ในที่เดียว
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` — ลดการสลับหน้าจอ · aggregation view ที่ ERP ใหญ่มี · read-only ก่อน (v1) ลดความเสี่ยง double-write

## Data model เสนอ
**ไม่มีตารางใหม่** (v1 read-only aggregation). Calendar เป็น **read layer** ที่รวม event จากตารางที่มีอยู่ผ่าน composition root — ไม่เก็บสำเนา (กัน stale + ไม่ต้อง sync).

- นิยาม type กลางในโค้ด: `CalendarEvent = { id, source: "BOOKING"|"MEETING"|"HR_LEAVE"|"RENTAL", title, startAt, endAt, href, unitId?, systemId?, tone }`
- Source mapping:
  - Booking → `Appointment` (`src/lib/modules/booking/service.ts`) startAt/endAt
  - Meeting → `MeetingMessage`/meeting schedule (ถ้ามี event เวลา)
  - HR ลา → `HrLeave` (`prisma/schema/hr.prisma`) fromDate/toDate (approved เท่านั้น)
  - Rental → `RentalContract` startAt/dueAt (จาก future-rental)
- (v2 ถ้าต้องการ event ส่วนตัว/นัดที่ไม่ผูกโมดูล → ค่อยเพิ่มตาราง `CalendarEntry` axis unit/tenant ภายหลัง)

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/calendar/service.ts — หรือ src/lib/dashboard/calendar.ts ในกลุ่ม composition root)
- `getEvents(m, ctx, { from, to, sources?, unitId? })` — รวม event จากทุก source ที่ user มีสิทธิ์เห็น (assertCan ต่อ source: booking.*/hr.leave.view/...) → merge → sort by startAt → คืน CalendarEvent[]
- แต่ละ source อ่านผ่าน service เดิมของโมดูล (ไม่ import model ตรง) · กรองตาม scope (tenantDb ใส่ unitId/systemId)
- **Edge cases:** event ข้ามวัน/หลายวัน (ลา) → แสดงเป็น span · ระบบยังไม่เปิด → ไม่มี event จาก source นั้น · user เห็นเฉพาะ source ที่มีสิทธิ์ (HR ลาไม่โชว์ให้คนไม่มี hr.leave.view) · timezone → เวลาไทย (dayKeyBangkok)

## การเชื่อมต่อ
- **ไม่มีเงิน** — read-only pure aggregation
- **composition root:** calendar อยู่ในกลุ่มที่ยกเว้นกฎ module→module (อ้าง `docs/sds/02_ARCHITECTURE.md` ข้อ 3, เหมือน `src/lib/dashboard/*`) → เรียก service read หลายโมดูลได้
- **ไม่ emit outbox** (read-only) · ไม่ต้องเพิ่ม event ใหม่

## AI actions
- **read:** `calendar_day` / `calendar_week` — "วันนี้/สัปดาห์นี้มีอะไรบ้าง" → คืน event รวม (read-only, ไม่ต้อง proposal)
- ไม่มี action v1 (read-only) · v2 ที่แก้/สร้าง event ค่อยเดินเส้น proposal ผ่านโมดูลต้นทาง (เช่น สร้างนัด = booking action ที่มีอยู่)

## Permissions เสนอ
- ไม่มี permission ใหม่ — Calendar **ยืมสิทธิ์ของแต่ละ source** (เห็นนัด = booking.appointment.view · เห็นลา = hr.leave.view ฯลฯ) → event ที่ไม่มีสิทธิ์ถูกกรองออก (ไม่ leak)

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้าปฏิทิน** — มุมมองวัน/สัปดาห์ (mobile = วัน/agenda list ก่อน · สัปดาห์เต็มบน desktop) · แต่ละ event = แถวคลิกได้ (`DataList` แบบมี href ไปต้นทาง)
- ตัวกรอง source (chip เปิด/ปิด Booking/Meeting/ลา/เช่า) — โทน ink/line ไม่ใช้สีสดแยกสี (ใช้ label + `StatusChip` tone แทนสี)
- ไม่มี grid สีรุ้ง — คุมด้วย token (มาตรฐานสี)

## ข้อสอบ oracle ที่ต้องมี
1. getEvents รวม event จาก Booking+HR+Rental ในช่วงถูกต้อง, sort by startAt
2. HR ลาที่ยัง PENDING → ไม่โผล่ (เฉพาะ approved)
3. user ไม่มี hr.leave.view → ไม่เห็น event ลา (แต่เห็นนัด booking ที่มีสิทธิ์)
4. event ข้ามวัน (ลา 3 วัน) → span ถูกช่วง
5. tenant/unit อื่นมองไม่เห็น event (cross-tenant/scope)
6. ระบบที่ยังไม่เปิด → ไม่มี event จาก source นั้น (ไม่ error)
7. เวลาแสดงเป็นเวลาไทย ไม่เพี้ยน timezone
8. AI calendar_day คืน event เฉพาะที่ user มีสิทธิ์

## ความเสี่ยง / คำถามเปิด
- 🔑 v1 read-only (เสนอ) vs รวมสร้าง/แก้ในตัว — เสนอ read-only ก่อน (ตาม `docs/sds/10_MASTER_QUEUE.md`). ยืนยัน
- 🔑 Meeting มี event เชิงเวลาชัดไหม (MeetingMessage เป็นแชท) — อาจต้องนิยาม "นัดประชุม" ที่มี startAt ก่อน หรือตัด Meeting ออกจาก source v1
- performance: aggregate หลาย source ต่อช่วงกว้าง → limit ช่วง (เดือน) + query budget (WO-0044)
