-- เครดิตผู้ช่วย AI 2 ชั้น (Phase 4 · ledger/MOBILE_PLAN.md) — additive ทั้งหมด ปลอดภัยบน prod
CREATE TYPE "AiUsageKind" AS ENUM ('SESSION', 'WEEK');

CREATE TABLE "AiUsageWindow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "AiUsageKind" NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageWindow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsageWindow_tenantId_kind_windowStart_key" ON "AiUsageWindow"("tenantId", "kind", "windowStart");
CREATE INDEX "AiUsageWindow_tenantId_kind_windowStart_idx" ON "AiUsageWindow"("tenantId", "kind", "windowStart");
