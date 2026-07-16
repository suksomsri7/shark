# HR / พนักงาน (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
พนักงาน + ลงเวลา (clock in/out) + ลา (request/decide) + availability (contract C-2). availability เป็นของ HR — ระบบอื่นถาม ห้าม copy. ผู้ใช้: staff/manager. **Layer 2: Core** (feature no.17) — scope=system (AppSystem type HR).
โค้ด: `src/lib/modules/hr/{service,actions,rules,ui}.ts` · schema `prisma/schema/hr.prisma`.

## Data model (prisma/schema/hr.prisma) — tenantId+systemId
- **HrEmployee** — `name` `phone?` `position?` `pinCode?`(kiosk clock) `linkedUserId?` `active`. index `[systemId,active]`.
- **HrAttendance** — `employeeId` `kind`(IN/OUT) `at` `note?`. index `[systemId,employeeId,at]`.
- **HrLeave** — `employeeId` `type`(SICK/PERSONAL/VACATION/OTHER) `fromDate/toDate`(@db.Date) `status`(PENDING/APPROVED/REJECTED/CANCELLED) `reason?` `decidedById?`. index `[systemId,status]`, `[systemId,employeeId,fromDate]`.

## Service API (src/lib/modules/hr/service.ts) — ctx {tenantId,systemId}
- `createEmployee(ctx, input)` · `listEmployees(ctx, take=200)`.
- `clock(...)` — ลงเวลา IN/OUT (สลับกันตามล่าสุด).
- `requestLeave(ctx, input)` — ยื่นลา PENDING.
- `decideLeave(...)` — APPROVED/REJECTED + decidedById.
- `isAvailable(ctx, employeeId, date)` — พร้อมทำงาน? (ไม่มีลา APPROVED คร่อมวัน) — C-2, ระบบอื่นเรียกตัวนี้.
- `listLeaves/pendingLeaves/listAttendance(ctx, ...)`.
- `monthlyMinutes(ctx, employeeId, monthStart)` — รวมนาทีทำงานเดือน (สำหรับ payroll ภายหลัง).
- **rules.ts** (สมอง, Fable เขียน): `isAvailable(...)` · `workedMinutes(events)` — pure, คำนวณเวลาจากคู่ IN/OUT.

## การเชื่อมต่อ
- **Booking/หน้างาน**: ถาม `isAvailable` (C-2) — ลาอนุมัติ → Booking ปิด slot (wiring ภายหลัง).
- self-contained · ไม่มี outbox · ยังไม่เข้าเส้นเงิน (payroll = WO-0036).

## Permissions (assertCan ใน actions.ts)
`hr.employee.create` · `hr.attendance.clock` · `hr.leave.request` · `hr.leave.decide`.

## UI
- `/app/sys/[id]` (type=HR, HrContent) — พนักงาน/ลงเวลา/ลา.

## การทดสอบ
- `scripts/qc-hr.mts` (Fable oracle) — พนักงาน + ลงเวลา + ลา + availability (C-2); severity CRITICAL/MAJOR/MINOR. ส่วน rules (สมอง) เขียวตั้งแต่ต้น, ส่วน service (Builder) fail-before.

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- ยังไม่มี payroll/เงินเดือน → **WO-0036** (Payroll ไทย: งวด · ปสส.5% · ภงด.1 · payslip · ลงบัญชีผ่านเส้นเงินเดิม).
- ลา→Booking ปิด slot ยังไม่ wire.
- WO-0045: AI สร้างพนักงาน/ตัดสินใจลา ผ่าน proposal (hr_decide_leave เป็น ProposalKind แล้ว).
