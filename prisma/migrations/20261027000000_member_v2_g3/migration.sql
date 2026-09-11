-- member_v2_g3 — journey อัตโนมัติ (M3.3 · ระบบสมาชิก v2)
-- additive ทั้งใบ: เพิ่มค่า enum + เพิ่มคอลัมน์ (nullable/มี default) + index + FK บนคอลัมน์ใหม่ · ไม่มี DROP/RENAME/DELETE
--
-- 🔴 แถวเดิมของ AutomationRule/AutomationRun (กฎ POS/คลัง/บอร์ดงาน/ระดับสมาชิก) ทำงานเหมือนเดิมเป๊ะ
--    คอลัมน์ใหม่ทุกตัวไม่มีใครอ่านในเส้นทางเดิม (เอนจิน v1 กรอง scope = KANBAN อยู่แล้ว)
-- 🔴 FK ผูกที่ `journeyId` (คอลัมน์ใหม่ · ทุกแถวเดิมเป็น NULL) **ไม่ใช่** `ruleId`:
--    แถวเดิมไม่มีตัวไหนถูกตรวจ/ลบตอนผูก FK และสัญญา K2.9 "ลบกฎบอร์ดแล้ว run เก่ายังอยู่" คงเดิม
-- 🔴 `AutomationRun_ruleId_customerId_eventKey_key` คือ **ตัวกันวน** ของ journey:
--    event เดิมที่ถูกส่งซ้ำ/ยิงพร้อมกัน สร้างแถวได้ครั้งเดียว (จบใน SQL คำสั่งเดียว ไม่ใช่อ่านแล้วค่อยเขียน)
--    แถวเก่าทั้งหมดมี customerId/eventKey = NULL ⇒ Postgres ถือว่า NULL ไม่ชนกันเอง = ไม่มีแถวไหนขัด

-- AlterEnum (PostgreSQL 12+ รันในทรานแซกชันได้ · ใบนี้ไม่ได้ "ใช้" ค่าใหม่ในคำสั่งเดียวกัน)
ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'WAITING';
ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'HOLDOUT';
ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "holdoutPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reentryDays" INTEGER,
ADD COLUMN     "trigger" JSONB;

-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "eventKey" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "journeyId" TEXT,
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "stepIndex" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_ruleId_customerId_eventKey_key" ON "AutomationRun"("ruleId", "customerId", "eventKey");

-- CreateIndex
CREATE INDEX "AutomationRun_tenantId_status_scheduledAt_idx" ON "AutomationRun"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AutomationRun_ruleId_customerId_createdAt_idx" ON "AutomationRun"("ruleId", "customerId", "createdAt");

-- AddForeignKey (คอลัมน์ใหม่ทุกแถวเป็น NULL ⇒ ไม่มีแถวเดิมให้ตรวจ)
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
