-- CreateTable
CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "hasDestructive" BOOLEAN NOT NULL DEFAULT false,
    "stepsJson" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiScheduledTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "hourBkk" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiMemory_tenantId_updatedAt_idx" ON "AiMemory"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiPlan_tenantId_conversationId_status_idx" ON "AiPlan"("tenantId", "conversationId", "status");

-- CreateIndex
CREATE INDEX "AiScheduledTask_tenantId_active_idx" ON "AiScheduledTask"("tenantId", "active");

-- CreateIndex
CREATE INDEX "AiScheduledTask_active_hourBkk_idx" ON "AiScheduledTask"("active", "hourBkk");

