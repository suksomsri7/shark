-- Q8 calendar_q8 — เผื่อเวลาเดินทาง (docs/modules/32-secretary-calendar.md §16) · additive ล้วน · SQL จาก prisma migrate diff
-- CreateTable
CREATE TABLE "CalTravelRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "typeKey" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalTravelRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalTravelDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalTravelDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalTravelRule_tenantId_idx" ON "CalTravelRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CalTravelRule_userId_tenantId_typeKey_key" ON "CalTravelRule"("userId", "tenantId", "typeKey");

-- CreateIndex
CREATE INDEX "CalTravelDismissal_tenantId_idx" ON "CalTravelDismissal"("tenantId");

-- CreateIndex
CREATE INDEX "CalTravelDismissal_dismissedAt_idx" ON "CalTravelDismissal"("dismissedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalTravelDismissal_userId_tenantId_pairKey_key" ON "CalTravelDismissal"("userId", "tenantId", "pairKey");

