-- CreateEnum
CREATE TYPE "OpsLevel" AS ENUM ('ERROR', 'WARN', 'INFO');

-- CreateTable
CREATE TABLE "OpsEvent" (
    "id" TEXT NOT NULL,
    "level" "OpsLevel" NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAlertState" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lastAlertAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsAlertState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsEvent_level_createdAt_idx" ON "OpsEvent"("level", "createdAt");

-- CreateIndex
CREATE INDEX "OpsEvent_source_createdAt_idx" ON "OpsEvent"("source", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAlertState_source_key" ON "OpsAlertState"("source");
