-- WO 1.9 — เอกสารประจำ (recurring) + ประวัติการสร้างต่องวด (BLUEPRINT §0.3 ข้อ 7)
--
-- 🔴 additive ล้วน: enum ใหม่ + ตารางใหม่ 2 ตาราง เท่านั้น
--    ไม่มี ALTER คอลัมน์เดิม / ไม่มี DROP ⇒ ระบบเดิมทุกส่วนทำงานเหมือนเดิมเป๊ะ
--    (บทเรียน 1 ก.ย.: เพิ่มคอลัมน์ในตารางที่ใช้งานอยู่ = พังทั้งตาราง — รอบนี้จึงไม่แตะตารางเดิมเลย)
--
-- 🔴 หัวใจกันเอกสารซ้ำอยู่ที่ UNIQUE("ruleId","periodKey") ของ AccountRecurringRun
--    cron ยิงซ้ำกี่ครั้ง / สองเครื่องยิงพร้อมกัน ก็ได้เอกสารงวดละ 1 ใบเสมอ (ฐานข้อมูลเป็นคนตัดสิน ไม่ใช่โค้ด)

-- CreateEnum
CREATE TYPE "AccountRecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateTable
CREATE TABLE "AccountRecurringRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docType" "AccountDocType" NOT NULL,
    "contactId" TEXT,
    "templateJson" JSONB NOT NULL DEFAULT '{}',
    "frequency" "AccountRecurringFrequency" NOT NULL,
    "dayOfMonth" INTEGER,
    "weekday" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "leadDays" INTEGER NOT NULL DEFAULT 0,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountRecurringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountRecurringRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountRecurringRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountRecurringRule_systemId_active_nextRunAt_idx" ON "AccountRecurringRule"("systemId", "active", "nextRunAt");

-- CreateIndex
CREATE INDEX "AccountRecurringRule_tenantId_systemId_idx" ON "AccountRecurringRule"("tenantId", "systemId");

-- CreateIndex
CREATE INDEX "AccountRecurringRun_systemId_createdAt_idx" ON "AccountRecurringRun"("systemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountRecurringRun_ruleId_periodKey_key" ON "AccountRecurringRun"("ruleId", "periodKey");

-- AddForeignKey
ALTER TABLE "AccountRecurringRule" ADD CONSTRAINT "AccountRecurringRule_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRecurringRun" ADD CONSTRAINT "AccountRecurringRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AccountRecurringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
