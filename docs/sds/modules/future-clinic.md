# Clinic / Healthcare (DESIGN — สำหรับ WO-0052)

> ต่อยอด Booking (นัด) + Inventory (ยา) + Customer (ผู้ป่วย) + เส้นเงิน POS · **PDPA sensitive** · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** นัดหมาย (ต่อยอด Booking) · ประวัติผู้ป่วยแบบเบา · จ่ายยา (ต่อ Inventory) · เก็บค่ารักษา → เส้นเงิน
- **ผู้ใช้:** คลินิกเล็ก/คลินิกความงาม/ทันตกรรม/สัตวแพทย์ (SME ไทย)
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` Layer 3 · **ขึ้นกับ WO-0042 (PDPA)** เพราะข้อมูลสุขภาพ = ข้อมูลอ่อนไหวสูงสุด ต้องมี data rights + audit ก่อนเปิด

## Data model เสนอ
โมดูลใหม่ `clinic` — axis = **system** (AppSystem type ใหม่ `CLINIC`). ข้อมูลอ่อนไหวเก็บให้น้อยที่สุด (data minimization).

- `ClinicPatient` (axis: system) — ผู้ป่วย (ผูก Customer กลาง)
  - `id` · `tenantId` · `systemId` · `customerId` (Customer.id — ข้อมูลติดต่ออยู่ที่ Customer ไม่ซ้ำ)
  - `hn` String (เลขเวชระเบียน รันต่อระบบ) · `birthYear` Int? · `bloodType` String? · `allergyNote` String? · `chronicNote` String?
  - `@@unique([systemId, hn])` · `@@unique([systemId, customerId])` · `@@index([systemId])`
- `ClinicVisit` (axis: system) — การเข้ารับบริการ 1 ครั้ง
  - `id` · `tenantId` · `systemId` · `patientId` · `appointmentId` String? (ผูก Booking Appointment)
  - `visitAt` DateTime · `chiefComplaint` String? · `diagnosis` String? · `treatmentNote` String? (encrypted-at-rest ระดับ field ถ้าทำได้)
  - `doctorEmployeeId` String? · `saleId` String? (PosSale ค่ารักษา+ยา)
  - `status` (`OPEN | CLOSED`) · `@@index([systemId, patientId, visitAt])`
- `ClinicPrescription` (axis: system, append-only) — รายการยาต่อ visit
  - `id` · `tenantId` · `systemId` · `visitId` · `invItemId` String? (ผูก InvItem ในคลัง) · `drugName` · `qty` Int · `dosageText` String · `priceSatang` Int
  - `@@index([visitId])`

**PDPA:** ประวัติ (diagnosis/treatment/allergy) = special category. ทุกการอ่านต้อง audit (AuditLog) · export/ลบ ผ่านกลไก WO-0042 · เก็บเท่าที่จำเป็น.

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/clinic/service.ts)
- `registerPatient(ctx, { customerId | {name,phone}, ...clinical })` — findOrCreate Customer → สร้าง ClinicPatient + HN รัน (tx)
- `openVisit(ctx, { patientId, appointmentId? })` — เปิด visit จากนัด (Booking Appointment) หรือ walk-in
- `recordVisit(ctx, visitId, { diagnosis, treatmentNote, prescriptions[] })` — บันทึกประวัติ + สั่งยา
- `dispenseAndBill(ctx, visitId, { serviceItems[], prescriptions[] })` — **ตัดสต็อกยาผ่าน invSvc (movement OUT)** + **createSale (POS sourceModule `CLINIC`)** ค่ารักษา+ยา → CLOSED
- `patientHistory(m, ctx, patientId)` — อ่านประวัติ (assertCan `clinic.record.view` + audit read)
- **Edge cases:** ผู้ป่วยไม่มา (นัด NO_SHOW) → ไม่เปิด visit · ยาไม่พอในคลัง → เตือน/บล็อกจ่าย · แก้ประวัติหลัง CLOSED → append addendum ไม่ทับ (append-only ประวัติ)

## การเชื่อมต่อ
- **เส้นเงิน (บังคับ):** ค่ารักษา+ยา → `PosSale` (`sourceModule="CLINIC"`, `sourceId=visitId`) → outbox `pos.sale.paid` → account-bridge
- **Inventory:** ยาจ่ายออก = InvMovement OUT ผ่าน service เดิม (composition root) — สต็อกยาคุมที่ Inventory ไม่ทำซ้ำ
- **Booking:** นัด = Appointment เดิม (`src/lib/modules/booking/service.ts`) · visit ผูก appointmentId
- **Customer กลาง:** ผู้ป่วย = Customer + MemberActivity `CLINIC_VISIT` (สรุปเชิงบริการเท่านั้น ไม่ใส่ diagnosis ใน timeline สาธารณะ)
- **Outbox ใหม่:** `clinic.visit.closed`
- **PDPA (0042):** export/ลบ ClinicPatient/Visit/Prescription รวมในชุด data rights

## AI actions
- **read:** `clinic_today_visits` (นัด/visit วันนี้) — **ไม่เปิดเผย diagnosis/allergy ผ่าน AI** (ข้อมูลอ่อนไหว) คืนแค่ชื่อ+เวลา+สถานะ
- **action:** `clinic_open_visit` → ProposalKind `clinic_open_visit` (เปิด visit จากนัด) — **ไม่ให้ AI บันทึก diagnosis/สั่งยาแทน** (ความปลอดภัยทางการแพทย์)
- KIND_ACCESS `{ module: "clinic", action: "clinic.visit.open" }`

## Permissions เสนอ
- `clinic.patient.manage` · `clinic.visit.record` · `clinic.record.view` (แยกสิทธิ์อ่านประวัติ — ไม่ทุกคนเห็น) · `clinic.visit.bill`

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้านัดวันนี้/คิว** — `DataList` visit วันนี้
- **หน้า visit** — ประวัติย่อ (allergy เด่น `--color-danger`), บันทึกอาการ/วินิจฉัย (`FormField`), สั่งยาจากคลัง, สรุปบิล
- **หน้าประวัติผู้ป่วย** — timeline visit (เข้าถึงเฉพาะสิทธิ์ `clinic.record.view`)
- ไม่โชว์ข้อมูลอ่อนไหวในหน้า list สาธารณะ

## ข้อสอบ oracle ที่ต้องมี
1. registerPatient → HN รันไม่ซ้ำต่อระบบ, Customer ถูก findOrCreate
2. dispenseAndBill → PosSale sourceModule=CLINIC + InvMovement OUT (สต็อกยาลด) + บัญชีเขียว
3. ยาในคลังไม่พอ → บล็อก/เตือน ไม่ตัดสต็อกติดลบ
4. อ่านประวัติต้อง assertCan clinic.record.view + เกิด AuditLog (read audit)
5. STAFF ไม่มี clinic.record.view → เห็นแค่ชื่อ/เวลา ไม่เห็น diagnosis
6. tenant/system อื่นมองไม่เห็น patient/visit (cross-tenant)
7. แก้ประวัติหลัง CLOSED → addendum ใหม่ ไม่ทับของเดิม
8. AI clinic_today_visits ไม่คืน diagnosis/allergy
9. PDPA: export ผู้ป่วยได้ครบ, ลบแล้ว purge จริง (ต่อ WO-0042)
10. qc:account เขียว

## ความเสี่ยง / คำถามเปิด
- 🔑 **ขอบเขต PDPA/กฎหมายสถานพยาบาล** — เก็บประวัติเวชระเบียนมีข้อกำหนดกฎหมายเฉพาะ (พ.ร.บ.สถานพยาบาล) · ต้องการเจ้าของยืนยันขอบเขต "ประวัติแบบเบา" ไม่ก้าวเป็น EMR เต็ม
- 🔑 field-level encryption ของ diagnosis/treatmentNote: ทำจริงไหม (กระทบ backup/DR + คีย์)
- ต้องรอ WO-0042 (PDPA) เสร็จก่อน (dependency ใน `docs/sds/10_MASTER_QUEUE.md`)
