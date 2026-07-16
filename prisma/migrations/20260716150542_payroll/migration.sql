-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "HrSalaryProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "baseSalarySatang" INTEGER NOT NULL,
    "ssoEligible" BOOLEAN NOT NULL DEFAULT true,
    "taxId" TEXT,
    "personalDeductionJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrSalaryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPayrollRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGrossSatang" INTEGER NOT NULL DEFAULT 0,
    "totalSsoEmployeeSatang" INTEGER NOT NULL DEFAULT 0,
    "totalSsoEmployerSatang" INTEGER NOT NULL DEFAULT 0,
    "totalWhtSatang" INTEGER NOT NULL DEFAULT 0,
    "totalNetSatang" INTEGER NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPayrollItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grossSatang" INTEGER NOT NULL,
    "ssoBaseSatang" INTEGER NOT NULL,
    "ssoEmployeeSatang" INTEGER NOT NULL,
    "ssoEmployerSatang" INTEGER NOT NULL,
    "whtSatang" INTEGER NOT NULL,
    "netSatang" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "HrPayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrSalaryProfile_tenantId_idx" ON "HrSalaryProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrSalaryProfile_systemId_employeeId_key" ON "HrSalaryProfile"("systemId", "employeeId");

-- CreateIndex
CREATE INDEX "HrPayrollRun_tenantId_status_idx" ON "HrPayrollRun"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HrPayrollRun_systemId_periodKey_key" ON "HrPayrollRun"("systemId", "periodKey");

-- CreateIndex
CREATE INDEX "HrPayrollItem_tenantId_systemId_idx" ON "HrPayrollItem"("tenantId", "systemId");

-- CreateIndex
CREATE UNIQUE INDEX "HrPayrollItem_runId_employeeId_key" ON "HrPayrollItem"("runId", "employeeId");

-- AddForeignKey
ALTER TABLE "HrPayrollItem" ADD CONSTRAINT "HrPayrollItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HrPayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
