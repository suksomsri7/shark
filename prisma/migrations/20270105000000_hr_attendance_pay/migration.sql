-- HR H3.2 ▸ หัวรายการหักสาย/ออกก่อน/ขาดงาน (HrAttendanceDeduction) — additive ล้วน: 1 ตารางใหม่ · 2 unique · 2 index · CHECK
--   ไม่ ALTER ตาราง/enum เดิม (LATE_RULE · ABSENT_RULE มีใน "HrPaySource" แล้ว — H1.3) · ไม่มี FK (ลิงก์อ่อนถึง HrPayAdjustment.id)
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · ไม่มี backfill · ถอยกลับ = ปิดโค้ด (ตารางว่างเฉย ๆ · โค้ดเดิมไม่รู้จัก)
--   ตรวจก่อน (นอกไฟล์นี้): SELECT to_regclass('"HrAttendanceDeduction"');  -- ต้องได้ NULL
-- CreateTable
CREATE TABLE "HrAttendanceDeduction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "workPeriodKey" TEXT NOT NULL,
    "rule" "HrPaySource" NOT NULL,
    "gen" INTEGER NOT NULL,
    "kind" "HrPayItemKind" NOT NULL,
    "entitledSatang" INTEGER NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "baseSalarySatang" INTEGER NOT NULL,
    "normalDayMin" INTEGER NOT NULL,
    "policyJson" JSONB NOT NULL,
    "linesJson" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "refundOfIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "endCode" TEXT,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrAttendanceDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrAttendanceDeduction_adjustmentId_key" ON "HrAttendanceDeduction"("adjustmentId");

-- CreateIndex
CREATE INDEX "HrAttendanceDeduction_systemId_workPeriodKey_idx" ON "HrAttendanceDeduction"("systemId", "workPeriodKey");

-- CreateIndex
CREATE INDEX "HrAttendanceDeduction_tenantId_idx" ON "HrAttendanceDeduction"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrAttendanceDeduction_tenantId_employeeId_workPeriodKey_rul_key" ON "HrAttendanceDeduction"("tenantId", "employeeId", "workPeriodKey", "rule", "gen");


-- CHECK (ด่านสุดท้ายในฐาน — แอปตรวจก่อน) · เงิน = สตางค์จำนวนเต็ม · นาทีต่อวันปกติ 60–720
ALTER TABLE "HrAttendanceDeduction" ADD CONSTRAINT "HrAttendanceDeduction_gen_check" CHECK ("gen" >= 1);
ALTER TABLE "HrAttendanceDeduction" ADD CONSTRAINT "HrAttendanceDeduction_entitled_check" CHECK ("entitledSatang" >= 0);
ALTER TABLE "HrAttendanceDeduction" ADD CONSTRAINT "HrAttendanceDeduction_amount_check" CHECK ("amountSatang" > 0);
ALTER TABLE "HrAttendanceDeduction" ADD CONSTRAINT "HrAttendanceDeduction_base_check" CHECK ("baseSalarySatang" >= 0);
ALTER TABLE "HrAttendanceDeduction" ADD CONSTRAINT "HrAttendanceDeduction_normal_check" CHECK ("normalDayMin" BETWEEN 60 AND 720);
ALTER TABLE "HrAttendanceDeduction" ADD CONSTRAINT "HrAttendanceDeduction_kind_check" CHECK ("kind" IN ('DEDUCTION', 'ALLOWANCE'));
ALTER TABLE "HrAttendanceDeduction" ADD CONSTRAINT "HrAttendanceDeduction_rule_check" CHECK ("rule" IN ('LATE_RULE', 'ABSENT_RULE'));
ALTER TABLE "HrAttendanceDeduction" ADD CONSTRAINT "HrAttendanceDeduction_end_check" CHECK ("endCode" IS NULL OR "endCode" IN ('SUPERSEDED', 'POLICY_OFF'));
