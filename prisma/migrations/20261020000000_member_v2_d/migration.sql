-- M2.3 (member_v2_d) — สแตมป์การ์ด: StampCard / StampCardProgress / StampEvent
-- additive ล้วน (CREATE TYPE/TABLE/INDEX) — ไม่แตะตารางเดิมแม้แต่คอลัมน์เดียว
-- (PosSale.stampEventIds และ Appointment.stampEventId มีอยู่แล้วตั้งแต่ member_v2_a)

-- CreateEnum
CREATE TYPE "StampRuleKind" AS ENUM ('PER_SALE_MIN', 'PER_ITEM', 'PER_VISIT', 'PER_DAY', 'MANUAL');

-- CreateEnum
CREATE TYPE "StampEventType" AS ENUM ('ADD', 'USE', 'EXPIRE', 'VOID', 'MERGE');

-- CreateEnum
CREATE TYPE "StampRewardKind" AS ENUM ('VOUCHER', 'REWARD', 'POINTS', 'DISCOUNT_NEXT');

-- CreateTable
CREATE TABLE "StampCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slots" INTEGER NOT NULL,
    "ruleKind" "StampRuleKind" NOT NULL,
    "ruleConfig" JSONB NOT NULL,
    "rewardKind" "StampRewardKind" NOT NULL,
    "rewardConfig" JSONB NOT NULL,
    "autoRestart" BOOLEAN NOT NULL DEFAULT true,
    "validMonths" INTEGER,
    "tierDefIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StampCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampCardProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "stamps" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rewardVoucherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StampCardProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "type" "StampEventType" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "refType" TEXT,
    "refId" TEXT,
    "byUserId" TEXT,
    "unitId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StampEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StampCard_systemId_active_idx" ON "StampCard"("systemId", "active");

-- CreateIndex
CREATE INDEX "StampCardProgress_customerId_idx" ON "StampCardProgress"("customerId");

-- CreateIndex
CREATE INDEX "StampCardProgress_tenantId_expiresAt_idx" ON "StampCardProgress"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StampCardProgress_cardId_customerId_cycle_key" ON "StampCardProgress"("cardId", "customerId", "cycle");

-- CreateIndex
CREATE INDEX "StampEvent_progressId_createdAt_idx" ON "StampEvent"("progressId", "createdAt");

-- CreateIndex
CREATE INDEX "StampEvent_tenantId_refType_refId_idx" ON "StampEvent"("tenantId", "refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "StampEvent_tenantId_idempotencyKey_key" ON "StampEvent"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "StampCardProgress" ADD CONSTRAINT "StampCardProgress_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "StampCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampEvent" ADD CONSTRAINT "StampEvent_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "StampCardProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

