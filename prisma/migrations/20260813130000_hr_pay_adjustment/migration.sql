-- OT / คอมมิชชั่น / โบนัส / เบี้ยเลี้ยง / หักเงิน / เบิกล่วงหน้า + สายอนุมัติ (ข้อ 5+7)
-- additive ล้วน: รอบจ่ายเดิมที่ไม่มีรายการเพิ่ม-หัก ค่าเป็น 0 → ตัวเลขเท่าเดิมทุกบาท
CREATE TYPE "HrPayItemKind" AS ENUM ('OT', 'COMMISSION', 'BONUS', 'ALLOWANCE', 'DEDUCTION', 'ADVANCE');
CREATE TYPE "HrPayItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "HrPayAdjustment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "kind" "HrPayItemKind" NOT NULL,
  "amountSatang" INTEGER NOT NULL,
  "hours" DOUBLE PRECISION,
  "rateSatang" INTEGER,
  "note" TEXT,
  "status" "HrPayItemStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "runId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrPayAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HrPayAdjustment_systemId_periodKey_status_idx" ON "HrPayAdjustment"("systemId", "periodKey", "status");
CREATE INDEX "HrPayAdjustment_systemId_employeeId_idx" ON "HrPayAdjustment"("systemId", "employeeId");
CREATE INDEX "HrPayAdjustment_tenantId_idx" ON "HrPayAdjustment"("tenantId");

ALTER TABLE "HrSalaryProfile" ADD COLUMN "otHourlyRateSatang" INTEGER;
ALTER TABLE "HrPayrollRun" ADD COLUMN "totalAddSatang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HrPayrollRun" ADD COLUMN "totalDeductSatang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HrPayrollItem" ADD COLUMN "addSatang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HrPayrollItem" ADD COLUMN "deductSatang" INTEGER NOT NULL DEFAULT 0;
