-- HR H3.9 ▸ ทะเบียนลูกจ้าง (พ.ร.บ.คุ้มครองแรงงาน ม.113 (3) สัญชาติ · (8) ประโยชน์ตอบแทนอย่างอื่น) — ตารางใหม่ ตารางเดียว (additive)
--   ไม่มี FK (แบบ HrBankFile.runId) ⇒ บล็อก HrEmployee คงเดิมทุกไบต์ · 1 แถวต่อพนักงาน (employeeId UNIQUE) ◂
CREATE TABLE "HrEmployeeRegister" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "nationality" TEXT,
    "otherBenefits" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrEmployeeRegister_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HrEmployeeRegister_nationality_len" CHECK ("nationality" IS NULL OR char_length("nationality") BETWEEN 1 AND 60),
    CONSTRAINT "HrEmployeeRegister_otherBenefits_len" CHECK ("otherBenefits" IS NULL OR char_length("otherBenefits") BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX "HrEmployeeRegister_employeeId_key" ON "HrEmployeeRegister"("employeeId");
CREATE INDEX "HrEmployeeRegister_systemId_idx" ON "HrEmployeeRegister"("systemId");
CREATE INDEX "HrEmployeeRegister_tenantId_idx" ON "HrEmployeeRegister"("tenantId");
