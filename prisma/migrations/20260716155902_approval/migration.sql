-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecisionValue" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApproverRole" AS ENUM ('MANAGER', 'OWNER');

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "unitId" TEXT,
    "systemId" TEXT,
    "thresholdSatang" INTEGER,
    "conditionJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "approverRole" "ApproverRole" NOT NULL,
    "approverUserId" TEXT,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "unitId" TEXT,
    "systemId" TEXT,
    "amountSatang" INTEGER,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "currentStepOrder" INTEGER NOT NULL DEFAULT 1,
    "requestedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "decidedById" TEXT NOT NULL,
    "decision" "ApprovalDecisionValue" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalPolicy_tenantId_entityType_active_idx" ON "ApprovalPolicy"("tenantId", "entityType", "active");

-- CreateIndex
CREATE INDEX "ApprovalStep_tenantId_idx" ON "ApprovalStep"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_policyId_order_key" ON "ApprovalStep"("policyId", "order");

-- CreateIndex
CREATE INDEX "ApprovalRequest_tenantId_status_idx" ON "ApprovalRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_tenantId_idempotencyKey_key" ON "ApprovalRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ApprovalDecision_requestId_idx" ON "ApprovalDecision"("requestId");

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ApprovalPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
