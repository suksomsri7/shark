# School / คอร์สเรียน (DESIGN — สำหรับ WO-0051)

> ต่อยอด Booking (รอบเรียน = slot) + Customer กลาง (นักเรียน) + เส้นเงิน POS · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** จัดการคอร์ส/รอบเรียน · ลงทะเบียนนักเรียน · เช็คชื่อเข้าเรียน · เก็บค่าเรียน (เต็ม/ผ่อนงวด) → เส้นเงิน
- **ผู้ใช้:** โรงเรียนสอนพิเศษ/สถาบันภาษา/คอร์สทำอาหาร-ดำน้ำ-ดนตรี/ยิม (SME ไทย)
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` Layer 3 · นักเรียน = Customer กลาง (reuse Member) ทำให้ CRM/แต้ม/แคมเปญใช้ต่อได้ทันที

## Data model เสนอ
โมดูลใหม่ `school` — axis = **system** (ผูก AppSystem type ใหม่ `SCHOOL` หรือ unit; ดู 🔑). เสนอ **system** เพื่อให้ course/enrollment อยู่ใต้ระบบเดียว query ง่าย (แบบ Inventory/CRM ใน `src/lib/core/scope.ts`).

- `SchoolCourse` (axis: system) — คอร์ส
  - `id` · `tenantId` · `systemId` · `name` · `description` String?
  - `priceSatang` Int · `sessionCount` Int (จำนวนคาบ) · `active` Boolean
  - `@@index([systemId, active])`
- `SchoolClass` (axis: system) — รอบเรียน (instance ของคอร์ส)
  - `id` · `tenantId` · `systemId` · `courseId` · `name` (เช่น "รอบเช้า อ.สมชาย")
  - `teacherName` String? (หรือ `teacherEmployeeId` ผูก HrEmployee) · `capacity` Int
  - `startDate` DateTime · `endDate` DateTime? · `scheduleJson` Json (ตารางคาบ: วัน/เวลา)
  - `status` (`OPEN | RUNNING | FINISHED | CANCELLED`) · `@@index([systemId, courseId, status])`
- `SchoolEnrollment` (axis: system) — นักเรียนลงรอบ
  - `id` · `tenantId` · `systemId` · `classId` · `customerId` (Customer กลาง · findOrCreate)
  - `studentName` · `studentPhone` (snapshot)
  - `status` (`ENROLLED | COMPLETED | DROPPED | WAITLIST`)
  - `priceSatang` Int (ราคาที่ตกลง) · `paidSatang` Int @default(0) (ยอดจ่ายสะสม)
  - `idempotencyKey` String · `@@unique([tenantId, idempotencyKey])` · `@@unique([systemId, classId, customerId])` (กันลงซ้ำ) · `@@index([systemId, classId, status])`
- `SchoolAttendance` (axis: system, append-only) — เช็คชื่อต่อคาบ
  - `id` · `tenantId` · `systemId` · `enrollmentId` · `sessionNo` Int · `at` DateTime · `present` Boolean · `note` String?
  - `@@unique([enrollmentId, sessionNo])`
- (ค่าเรียนแบบผ่อน) ใช้ `SchoolPayment` หรือ reuse PosSale หลายใบต่อ enrollment (ดูเส้นเงิน)

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/school/service.ts)
- `enroll(ctx, { classId, studentName, studentPhone, priceSatang })` — ตรวจ capacity ใน tx → ENROLLED (เกิน = WAITLIST) · findOrCreate Customer · **รับค่าเรียน → createSale (POS sourceModule `SCHOOL`)** เต็มหรืองวดแรก
- `payInstallment(ctx, enrollmentId, amountSatang)` — รับงวดถัดไป → PosSale ใหม่ (append-only) + อัปเดต `paidSatang`
- `checkIn(ctx, enrollmentId, sessionNo, present)` — บันทึก SchoolAttendance (idempotent ต่อ session)
- `listRoster(ctx, classId)` — รายชื่อนักเรียน + สถานะจ่าย/เช็คชื่อ
- `dropStudent(ctx, enrollmentId, { refundSatang? })` — DROPPED + คืนเงินบางส่วนผ่านบิล refund (append-only)
- **Edge cases:** ลงเกิน capacity → WAITLIST · เลื่อนจาก WAITLIST เมื่อมีคนออก · จ่ายเกินราคา → ปฏิเสธ/บันทึก overpay · เช็คชื่อ session เดิมซ้ำ → idempotent update present

## การเชื่อมต่อ
- **เส้นเงิน (บังคับ):** ค่าเรียนทุกงวด → `PosSale` (`sourceModule="SCHOOL"`, `sourceId=enrollmentId`) → outbox `pos.sale.paid` → account-bridge. ผ่อนงวด = หลาย PosSale ต่อ 1 enrollment (append-only) — ห้ามเปิดเส้นบัญชีใหม่
- **Customer กลาง:** นักเรียน = Customer (memberSystemId) · MemberActivity `COURSE_ENROLLED`, `CLASS_ATTENDED`
- **Outbox ใหม่:** `school.enrollment.created` · `school.class.finished`
- **HR:** teacher ผูก HrEmployee ได้ (ผ่าน composition root, ไม่ import ตรง)
- **Approval (0049):** ส่วนลด/คืนเงินเกินวงเงิน → approval (optional)

## AI actions
- **read:** `school_roster` (รายชื่อในรอบ) · `school_unpaid` (นักเรียนค้างชำระ)
- **action:** `school_enroll` → ProposalKind `school_enroll` → dispatch `schoolSvc.enroll` (เดินเส้น proposal เดิม)
- KIND_ACCESS `{ module: "school", action: "school.enrollment.create" }`

## Permissions เสนอ
- `school.course.manage` · `school.enrollment.create` · `school.attendance.record` · `school.enrollment.view`

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้าคอร์ส/รอบเรียน** — `DataList` คอร์ส → รอบเรียน (แสดง capacity/ลงแล้ว)
- **หน้าลงทะเบียน** — เลือกรอบ → กรอกนักเรียน → รับชำระ (เต็ม/งวด)
- **หน้าเช็คชื่อ** — เลือกคาบ → รายชื่อ toggle มา/ขาด (touch target ใหญ่)
- **หน้าค้างชำระ** — `DataList` + `MoneyText` ยอดค้าง

## ข้อสอบ oracle ที่ต้องมี
1. enroll → PosSale sourceModule=SCHOOL, Customer ถูก findOrCreate, MemberActivity ถูกบันทึก
2. ลงเกิน capacity → WAITLIST ไม่ใช่ ENROLLED
3. ลงซ้ำ (customer เดิม+class เดิม) → ถูกกันด้วย unique
4. ผ่อน 3 งวด → 3 PosSale, paidSatang รวมถูก, บัญชีเขียวทุกงวด
5. เช็คชื่อ session เดิม 2 ครั้ง → 1 แถว (idempotent), present ล่าสุดชนะ
6. drop + คืนเงิน → บิล refund append-only, enrollment DROPPED
7. tenant/system อื่นมองไม่เห็น course/enrollment
8. qc:account เขียว (SCHOOL เข้าเส้นเดียว)
9. AI school_enroll เดินเส้น proposal, assertCan คนกด
10. WAITLIST เลื่อนขึ้นเมื่อมีคน drop

## ความเสี่ยง / คำถามเปิด
- 🔑 axis system vs unit (บาง institute มีหลายสาขา = unit). เสนอ system + ผูก unit ผ่าน AppSystemUnit — ยืนยัน
- 🔑 ค่าเรียนผ่อนงวด: หลาย PosSale ต่อ enrollment (เสนอ) vs ตาราง SchoolPayment แยก — กระทบ oracle บัญชีรายรับรอรับรู้
- การรับรู้รายได้ล่วงหน้า (จ่ายก่อนเรียน) = ประเด็นบัญชีลึก (deferred revenue) → รอ WO บัญชีลึก (0039)
