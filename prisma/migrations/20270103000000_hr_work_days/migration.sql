-- HR H3.1 ▸ หัววันทำงาน (HrWorkDay) + ผูกแถวชนิด HrWorkEntry กับหัววัน (additive)
--   2 enum ใหม่ (CREATE TYPE) · 1 ตารางใหม่ · 1 คอลัมน์ใหม่ (nullable) ใน HrWorkEntry · ไม่แก้ค่าของ enum เดิม ⇒ ไม่มีไฟล์ …000001
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · ไม่มี backfill · ถอยกลับ = ปิดโค้ด (ตารางว่างเฉย ๆ)
--   ตรวจก่อน (นอกไฟล์นี้): SELECT typname FROM pg_type WHERE typname IN ('HrWorkDayClass','HrWorkDayStatus');  -- ต้องได้ 0 แถว
-- CreateEnum
CREATE TYPE "HrWorkDayClass" AS ENUM ('WORKDAY', 'DAY_OFF', 'HOLIDAY', 'UNSCHEDULED');

-- CreateEnum
CREATE TYPE "HrWorkDayStatus" AS ENUM ('WORKED', 'LEAVE', 'ABSENT', 'DAY_OFF', 'HOLIDAY', 'UNSCHEDULED', 'PENDING');

-- AlterTable
ALTER TABLE "HrWorkEntry" ADD COLUMN     "workDayId" TEXT;

-- CreateTable
CREATE TABLE "HrWorkDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "periodKey" TEXT NOT NULL,
    "unitId" TEXT,
    "dayClass" "HrWorkDayClass" NOT NULL,
    "dayStatus" "HrWorkDayStatus" NOT NULL,
    "plannedMin" INTEGER NOT NULL DEFAULT 0,
    "workMin" INTEGER NOT NULL DEFAULT 0,
    "otWorkdayMin" INTEGER NOT NULL DEFAULT 0,
    "holidayWorkMin" INTEGER NOT NULL DEFAULT 0,
    "otHolidayMin" INTEGER NOT NULL DEFAULT 0,
    "holidayPaidMin" INTEGER NOT NULL DEFAULT 0,
    "paidLeaveMin" INTEGER NOT NULL DEFAULT 0,
    "unpaidLeaveMin" INTEGER NOT NULL DEFAULT 0,
    "absentMin" INTEGER NOT NULL DEFAULT 0,
    "lateMin" INTEGER NOT NULL DEFAULT 0,
    "earlyOutMin" INTEGER NOT NULL DEFAULT 0,
    "unplannedMin" INTEGER NOT NULL DEFAULT 0,
    "breakDeductMin" INTEGER NOT NULL DEFAULT 0,
    "leaveDays" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "review" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourcesJson" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "engineVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "builtAt" TIMESTAMP(3) NOT NULL,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrWorkDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrWorkDay_systemId_periodKey_idx" ON "HrWorkDay"("systemId", "periodKey");

-- CreateIndex
CREATE INDEX "HrWorkDay_tenantId_idx" ON "HrWorkDay"("tenantId");

-- CreateIndex
CREATE INDEX "HrWorkDay_runId_idx" ON "HrWorkDay"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "HrWorkDay_employeeId_date_key" ON "HrWorkDay"("employeeId", "date");

-- CreateIndex
CREATE INDEX "HrWorkEntry_workDayId_idx" ON "HrWorkEntry"("workDayId");

-- AddForeignKey
ALTER TABLE "HrWorkEntry" ADD CONSTRAINT "HrWorkEntry_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "HrWorkDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrWorkDay" ADD CONSTRAINT "HrWorkDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- นาทีจำนวนเต็ม 0..1440 ทุกคอลัมน์ · ส่วนวันลา 0..1 (ด่านสุดท้ายในฐาน — ตัวสร้างตรวจก่อนแล้ว)
ALTER TABLE "HrWorkDay" ADD CONSTRAINT "HrWorkDay_minutes_check" CHECK ("plannedMin" BETWEEN 0 AND 1440 AND "workMin" BETWEEN 0 AND 1440 AND "otWorkdayMin" BETWEEN 0 AND 1440 AND "holidayWorkMin" BETWEEN 0 AND 1440 AND "otHolidayMin" BETWEEN 0 AND 1440 AND "holidayPaidMin" BETWEEN 0 AND 1440 AND "paidLeaveMin" BETWEEN 0 AND 1440 AND "unpaidLeaveMin" BETWEEN 0 AND 1440 AND "absentMin" BETWEEN 0 AND 1440 AND "lateMin" BETWEEN 0 AND 1440 AND "earlyOutMin" BETWEEN 0 AND 1440 AND "unplannedMin" BETWEEN 0 AND 1440 AND "breakDeductMin" BETWEEN 0 AND 1440);
ALTER TABLE "HrWorkDay" ADD CONSTRAINT "HrWorkDay_leaveDays_check" CHECK ("leaveDays" >= 0 AND "leaveDays" <= 1);
