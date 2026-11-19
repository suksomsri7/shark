-- help-cases (15 พ.ย. 2026) — ขั้นของเคส + ประวัติขั้น · additive ล้วน (status เดิมคงอยู่)
CREATE TYPE "SupportCaseStage" AS ENUM ('RECEIVED', 'CHECKING', 'FIXING', 'NEED_INFO', 'AWAITING_CONFIRM', 'CLOSED');

ALTER TABLE "SupportCase" ADD COLUMN "stage" "SupportCaseStage" NOT NULL DEFAULT 'RECEIVED';

-- เคสเดิม: ปิดแล้ว = CLOSED · ทีมตอบแล้ว (PENDING) = CHECKING · ที่เหลือ = RECEIVED (ค่าเริ่ม)
UPDATE "SupportCase" SET "stage" = 'CLOSED' WHERE "status" = 'RESOLVED';
UPDATE "SupportCase" SET "stage" = 'CHECKING' WHERE "status" = 'PENDING';

CREATE TABLE "SupportStageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStage" "SupportCaseStage",
    "toStage" "SupportCaseStage" NOT NULL,
    "actorSide" "SupportAuthorSide" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportStageEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportStageEvent_tenantId_caseId_createdAt_idx" ON "SupportStageEvent"("tenantId", "caseId", "createdAt");
ALTER TABLE "SupportStageEvent" ADD CONSTRAINT "SupportStageEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
