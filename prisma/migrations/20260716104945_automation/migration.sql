-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('NOTIFY', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('OK', 'FAILED');

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minAmountSatang" INTEGER,
    "actionType" "AutomationActionType" NOT NULL,
    "actionConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" "AutomationRunStatus" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_event_enabled_idx" ON "AutomationRule"("tenantId", "event", "enabled");

-- CreateIndex
CREATE INDEX "AutomationRun_tenantId_createdAt_idx" ON "AutomationRun"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AppNotification_tenantId_readAt_createdAt_idx" ON "AppNotification"("tenantId", "readAt", "createdAt");
