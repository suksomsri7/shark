-- HR H1.3 ▸ โมเดลเงินและกฎหมาย (additive ล้วน · ไม่มีการลบ/เปลี่ยนชนิด/เปลี่ยนชื่อ · ไม่แตะ enum เดิม ⇒ ไฟล์เดียวพอ)
--   6 enum ใหม่ (HrReviewNoteKind · HrOnboardingKind · HrLawKind · HrLawStatus · HrWorkEntryKind · HrPaySource)
--   4 ตารางใหม่: HrLawTable (ตารางกลางของทั้ง SHARK — ไม่มี tenantId/systemId) · HrWorkEntry · HrReviewNote · HrOnboardingTask
--   HrPayrollRun +7 (engineVersion INTEGER NOT NULL DEFAULT 1 ⇒ รอบเดิมทุกรอบ = 1 · อีก 6 ช่องว่างได้) · HrPayrollItem +2 (ytdJson · lawRowIds [])
--   HrPayAdjustment +2 (sourceType · sourceRef ว่างได้ ไม่มีค่าปริยาย · ไม่ backfill — แถว CRM ยังใช้ crmCommissionId อย่างเดียว)
--   unique/CHECK แบบมีเงื่อนไข 9 ตัวท้ายไฟล์ = SQL ดิบ (Prisma ประกาศ WHERE/CHECK ไม่ได้) · ไม่แตะ HrPayAdjustment_crmCommissionId_key
--   และ HrPayrollRun_systemId_periodKey_live_key · ทั้งไฟล์รันในธุรกรรมเดียวของ migrate deploy
-- pre-check (ก่อน deploy — อ่านอย่างเดียว):
--   SELECT migration_name FROM "_prisma_migrations" WHERE migration_name IN ('20261201000000_hr_pin_hash',
--     '20261202000000_hr_payroll_run_live_unique','20261203000000_hr_link_unique_requester','20261204000000_hr_org_axis',
--     '20261205000000_hr_time_leave_model','20261205000001_hr_judgement_enums') AND finished_at IS NOT NULL;   -- ต้องได้ 6 แถว
--   SELECT typname FROM pg_type WHERE typname IN ('HrLawKind','HrLawStatus','HrWorkEntryKind','HrPaySource',
--     'HrReviewNoteKind','HrOnboardingKind');                                                                -- ต้องได้ 0 แถว
--   SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN
--     ('HrLawTable','HrWorkEntry','HrReviewNote','HrOnboardingTask');                                       -- ต้องได้ 0 แถว
--   SELECT count(*) FROM "HrPayAdjustment" WHERE "crmCommissionId" IS NOT NULL;   -- ข้อมูลเท่านั้น (CHECK ผ่านเพราะ sourceRef ใหม่ = ว่าง)
--   SELECT count(*) FROM "HrPayrollRun";   -- ข้อมูลเท่านั้น (ค่าปริยาย engineVersion ของ PG ≥ 11 = fast default ไม่เขียนตารางใหม่)
-- ตรวจหลัง deploy: จำนวนแถว HrPayrollRun / HrPayrollItem / HrPayAdjustment เท่าเดิม · 4 ตารางใหม่ว่าง · ทุกรอบ engineVersion = 1
-- แถวกฎหมาย 4 แถว DRAFT = สคริปต์ scripts/hr-seed-law-draft.mts (dry-run ก่อน · --apply บน prod ต้องได้ GO จากเจ้าของ) — ไม่อยู่ในไฟล์นี้

-- CreateEnum
CREATE TYPE "HrReviewNoteKind" AS ENUM ('NOTE', 'VERBAL_WARNING', 'WRITTEN_WARNING', 'REVIEW');

-- CreateEnum
CREATE TYPE "HrOnboardingKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "HrLawKind" AS ENUM ('SSO', 'TAX_BRACKET', 'DEDUCTION', 'OT', 'MIN_WAGE');

-- CreateEnum
CREATE TYPE "HrLawStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "HrWorkEntryKind" AS ENUM ('WORK', 'OT_WORKDAY', 'HOLIDAY_WORK', 'OT_HOLIDAY', 'HOLIDAY_PAID', 'LEAVE_PAID', 'LEAVE_UNPAID', 'ABSENT', 'LATE', 'EARLY_OUT');

-- CreateEnum
CREATE TYPE "HrPaySource" AS ENUM ('MANUAL', 'CRM_COMMISSION', 'POS_SALE_LINE', 'OT_REQUEST', 'LATE_RULE', 'ABSENT_RULE', 'INVENTORY_ISSUE');

-- AlterTable
ALTER TABLE "HrPayAdjustment" ADD COLUMN     "sourceRef" TEXT,
ADD COLUMN     "sourceType" "HrPaySource";

-- AlterTable
ALTER TABLE "HrPayrollRun" ADD COLUMN     "accountSystemId" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "bankFileKey" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "engineVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "filingJson" JSONB;

-- AlterTable
ALTER TABLE "HrPayrollItem" ADD COLUMN     "lawRowIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ytdJson" JSONB;

-- CreateTable
CREATE TABLE "HrReviewNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "HrReviewNoteKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "periodLabel" TEXT,
    "score" INTEGER,
    "authorUserId" TEXT,
    "visibleToEmployee" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "HrReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrOnboardingTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "HrOnboardingKind" NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "templateKey" TEXT,
    "kanbanCardId" TEXT,

    CONSTRAINT "HrOnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLawTable" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "HrLawKind" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "json" JSONB NOT NULL,
    "status" "HrLawStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceKey" TEXT NOT NULL,
    "note" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "supersedesId" TEXT,

    CONSTRAINT "HrLawTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrWorkEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "HrWorkEntryKind" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "unitId" TEXT,
    "rosterEntryId" TEXT,
    "attendanceInId" TEXT,
    "attendanceOutId" TEXT,
    "leaveId" TEXT,
    "otRequestId" TEXT,
    "holidayId" TEXT,
    "runId" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "HrWorkEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrReviewNote_tenantId_idx" ON "HrReviewNote"("tenantId");

-- CreateIndex
CREATE INDEX "HrReviewNote_systemId_employeeId_createdAt_idx" ON "HrReviewNote"("systemId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "HrOnboardingTask_tenantId_idx" ON "HrOnboardingTask"("tenantId");

-- CreateIndex
CREATE INDEX "HrOnboardingTask_systemId_employeeId_kind_idx" ON "HrOnboardingTask"("systemId", "employeeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "HrLawTable_sourceKey_key" ON "HrLawTable"("sourceKey");

-- CreateIndex
CREATE INDEX "HrLawTable_kind_effectiveFrom_idx" ON "HrLawTable"("kind", "effectiveFrom");

-- CreateIndex
CREATE INDEX "HrWorkEntry_tenantId_idx" ON "HrWorkEntry"("tenantId");

-- CreateIndex
CREATE INDEX "HrWorkEntry_systemId_periodKey_idx" ON "HrWorkEntry"("systemId", "periodKey");

-- CreateIndex
CREATE INDEX "HrWorkEntry_systemId_employeeId_date_idx" ON "HrWorkEntry"("systemId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "HrWorkEntry_runId_idx" ON "HrWorkEntry"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "HrWorkEntry_employeeId_date_kind_key" ON "HrWorkEntry"("employeeId", "date", "kind");

-- CreateIndex
CREATE INDEX "HrPayAdjustment_systemId_sourceType_idx" ON "HrPayAdjustment"("systemId", "sourceType");

-- AddForeignKey
ALTER TABLE "HrReviewNote" ADD CONSTRAINT "HrReviewNote_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrOnboardingTask" ADD CONSTRAINT "HrOnboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrWorkEntry" ADD CONSTRAINT "HrWorkEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══ HR H1.3 ▸ SQL ดิบ (Prisma ประกาศไม่ได้) ═══

-- แหล่งที่มาของรายการเพิ่ม/หัก: 1 แหล่งต่อร้าน = 1 แถวตลอดไป (แถว REJECTED ยังจอง) · partial ⇒ แถวที่ไม่มี sourceRef ไม่ชนกัน
CREATE UNIQUE INDEX "HrPayAdjustment_tenant_source_key" ON "HrPayAdjustment"("tenantId", "sourceType", "sourceRef") WHERE "sourceRef" IS NOT NULL;

-- มี sourceRef ต้องบอก sourceType
ALTER TABLE "HrPayAdjustment" ADD CONSTRAINT "HrPayAdjustment_sourceRef_type_check" CHECK ("sourceRef" IS NULL OR "sourceType" IS NOT NULL);

-- 1 แถว = ลิงก์เดียว (ไม่ให้แถวเดียวกันกันซ้ำด้วย 2 กุญแจ — crmCommissionId ยังเป็นของ CRM)
ALTER TABLE "HrPayAdjustment" ADD CONSTRAINT "HrPayAdjustment_one_link_check" CHECK ("crmCommissionId" IS NULL OR "sourceRef" IS NULL);

-- กฎหมาย: ACTIVE ได้แถวเดียวต่อชนิดต่อวันเริ่มใช้
CREATE UNIQUE INDEX "HrLawTable_kind_effectiveFrom_active_key" ON "HrLawTable"("kind", "effectiveFrom") WHERE "status" = 'ACTIVE';

-- กฎหมาย: ACTIVE ต้องมีผู้รับรอง (เวลา + id หรือชื่อนักบัญชี)
ALTER TABLE "HrLawTable" ADD CONSTRAINT "HrLawTable_active_signoff_check" CHECK ("status" <> 'ACTIVE' OR ("approvedAt" IS NOT NULL AND ("approvedById" IS NOT NULL OR "approvedByName" IS NOT NULL)));

-- งานรับเข้า/ออก: แม่แบบเดียวกันใช้กับพนักงานคนเดิมได้ครั้งเดียว
CREATE UNIQUE INDEX "HrOnboardingTask_employeeId_kind_templateKey_key" ON "HrOnboardingTask"("employeeId", "kind", "templateKey") WHERE "templateKey" IS NOT NULL;

-- นาทีต่อวัน 0..1440
ALTER TABLE "HrWorkEntry" ADD CONSTRAINT "HrWorkEntry_minutes_check" CHECK ("minutes" >= 0 AND "minutes" <= 1440);

-- คะแนนประเมิน 1..5 หรือว่าง
ALTER TABLE "HrReviewNote" ADD CONSTRAINT "HrReviewNote_score_check" CHECK ("score" IS NULL OR ("score" >= 1 AND "score" <= 5));

-- รุ่นเครื่องคิดเงินเดือนเริ่มที่ 1
ALTER TABLE "HrPayrollRun" ADD CONSTRAINT "HrPayrollRun_engineVersion_check" CHECK ("engineVersion" >= 1);
