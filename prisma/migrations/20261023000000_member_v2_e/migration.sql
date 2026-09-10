-- CreateEnum
CREATE TYPE "VoucherKind" AS ENUM ('FIXED', 'PERCENT', 'FREE_SERVICE', 'FREE_ITEM');

-- CreateEnum
CREATE TYPE "VoucherOrigin" AS ENUM ('TIER', 'BIRTHDAY', 'JOURNEY', 'CAMPAIGN', 'REDEEM', 'COMPENSATION', 'REFERRAL', 'STAMP', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VoucherBatchStatus" AS ENUM ('PENDING', 'ISSUED', 'REJECTED');

-- CreateTable
CREATE TABLE "VoucherTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "VoucherKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "validDays" INTEGER NOT NULL,
    "origin" "VoucherOrigin" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "templateId" TEXT,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "VoucherKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "origin" "VoucherOrigin" NOT NULL,
    "originRef" JSONB,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "usedAt" TIMESTAMP(3),
    "usedRef" JSONB,
    "cancelledAt" TIMESTAMP(3),
    "approvalRequestId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherIssueBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "status" "VoucherBatchStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "totalSatang" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherIssueBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoucherTemplate_systemId_idx" ON "VoucherTemplate"("systemId");

-- CreateIndex
CREATE INDEX "Voucher_customerId_status_idx" ON "Voucher"("customerId", "status");

-- CreateIndex
CREATE INDEX "Voucher_systemId_expiresAt_idx" ON "Voucher"("systemId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_tenantId_code_key" ON "Voucher"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_tenantId_idempotencyKey_key" ON "Voucher"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "VoucherIssueBatch_systemId_status_idx" ON "VoucherIssueBatch"("systemId", "status");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VoucherTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

