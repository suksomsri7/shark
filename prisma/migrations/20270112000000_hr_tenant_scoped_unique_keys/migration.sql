-- HR PRIV-3 ▸ R10 (controller ruling) — unique keys ของ HrSalaryProfile / HrPayrollRun ผูกกับร้าน (tenantId) — ดัชนีอย่างเดียว
--   เหตุ: unique เดิมข้ามร้าน ⇒ แถวของร้านอื่นที่ชี้ systemId ของเรา (ช่องโหว่ R6) จองคีย์และกันร้านเจ้าของสร้างโปรไฟล์/รอบจ่าย
--   ไม่มีการเปลี่ยนคอลัมน์/ข้อมูล · แถวเดิมทุกแถวอยู่ครบ (แถวที่จองข้ามร้านไว้แล้วไม่ถูกลบ — ไม่มีใครเห็น และไม่กันอีกต่อไป)
--   คีย์ใหม่กว้างกว่าเดิม (เพิ่ม tenantId นำหน้า) ⇒ ข้อมูลที่ผ่านคีย์เดิมผ่านคีย์ใหม่เสมอ (CREATE ไม่ล้ม) · Prisma รันไฟล์นี้ใน transaction เดียว ⇒ ไม่มีช่วงที่ไม่มี unique
--   โค้ดเก่ายังทำงานได้: ไม่มีโค้ดใช้คีย์ประกอบนี้ใน where/upsert/connect/ON CONFLICT (ตรวจซ้ำและโปรไฟล์ซ้ำ = query ก่อนเขียนในร้านเดียว)

-- HR PRIV-3 ▸ R14: สร้าง unique ใหม่ก่อน แล้วจึงถอดของเดิม (IF EXISTS) — ทุกจังหวะมี unique อย่างน้อยหนึ่งตัว · ไฟล์นี้แก้ในที่เดิม (ชื่อโฟลเดอร์เดิม) · ฐานเลน 5 มีสถานะปลายทางนี้แล้ว (ไม่รันดัชนีซ้ำ)

-- HrSalaryProfile: (systemId, employeeId) → (tenantId, systemId, employeeId)  [schema @@unique สลับตาม]
CREATE UNIQUE INDEX "HrSalaryProfile_tenantId_systemId_employeeId_key" ON "HrSalaryProfile"("tenantId", "systemId", "employeeId");
DROP INDEX IF EXISTS "HrSalaryProfile_systemId_employeeId_key";

-- HrPayrollRun: partial unique ของรอบที่ยังมีผล (H0.6) — (systemId, periodKey) → (tenantId, systemId, periodKey) · ไม่อยู่ใน schema (Prisma ไม่รองรับ WHERE)
CREATE UNIQUE INDEX "HrPayrollRun_tenantId_systemId_periodKey_live_key" ON "HrPayrollRun"("tenantId", "systemId", "periodKey") WHERE "status" <> 'REVERSED';
DROP INDEX IF EXISTS "HrPayrollRun_systemId_periodKey_live_key";
