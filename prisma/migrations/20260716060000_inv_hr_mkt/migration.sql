-- CreateEnum
CREATE TYPE "HrLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HrLeaveType" AS ENUM ('SICK', 'PERSONAL', 'VACATION', 'OTHER');

-- CreateEnum
CREATE TYPE "HrAttendanceKind" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "InvMovementType" AS ENUM ('IN', 'OUT', 'ADJUST', 'TRANSFER');

-- CreateEnum
CREATE TYPE "MktCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MktChannel" AS ENUM ('LINE', 'EMAIL', 'SMS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SystemType" ADD VALUE 'INVENTORY';
ALTER TYPE "SystemType" ADD VALUE 'HR';
ALTER TYPE "SystemType" ADD VALUE 'MARKETING';

-- CreateTable
CREATE TABLE "HrEmployee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "position" TEXT,
    "pinCode" TEXT,
    "linkedUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "HrAttendanceKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "HrAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeave" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "HrLeaveType" NOT NULL DEFAULT 'PERSONAL',
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "status" "HrLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL DEFAULT 'ชิ้น',
    "category" TEXT,
    "costSatang" INTEGER NOT NULL DEFAULT 0,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "accountProductId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InvMovementType" NOT NULL,
    "qtyDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "costSatang" INTEGER NOT NULL DEFAULT 0,
    "sourceModule" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MktCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MktChannel" NOT NULL DEFAULT 'LINE',
    "status" "MktCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "message" TEXT NOT NULL DEFAULT '',
    "segmentJson" JSONB NOT NULL DEFAULT '{}',
    "couponCode" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MktCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MktRecipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT,
    "contact" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MktRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrEmployee_systemId_active_idx" ON "HrEmployee"("systemId", "active");

-- CreateIndex
CREATE INDEX "HrEmployee_tenantId_idx" ON "HrEmployee"("tenantId");

-- CreateIndex
CREATE INDEX "HrAttendance_systemId_employeeId_at_idx" ON "HrAttendance"("systemId", "employeeId", "at");

-- CreateIndex
CREATE INDEX "HrLeave_systemId_status_idx" ON "HrLeave"("systemId", "status");

-- CreateIndex
CREATE INDEX "HrLeave_systemId_employeeId_fromDate_idx" ON "HrLeave"("systemId", "employeeId", "fromDate");

-- CreateIndex
CREATE INDEX "InvItem_systemId_onHand_idx" ON "InvItem"("systemId", "onHand");

-- CreateIndex
CREATE INDEX "InvItem_tenantId_idx" ON "InvItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InvItem_systemId_sku_key" ON "InvItem"("systemId", "sku");

-- CreateIndex
CREATE INDEX "InvMovement_systemId_itemId_createdAt_idx" ON "InvMovement"("systemId", "itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvMovement_tenantId_idempotencyKey_key" ON "InvMovement"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MktCampaign_systemId_status_idx" ON "MktCampaign"("systemId", "status");

-- CreateIndex
CREATE INDEX "MktCampaign_tenantId_idx" ON "MktCampaign"("tenantId");

-- CreateIndex
CREATE INDEX "MktRecipient_campaignId_idx" ON "MktRecipient"("campaignId");

-- AddForeignKey
ALTER TABLE "HrAttendance" ADD CONSTRAINT "HrAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeave" ADD CONSTRAINT "HrLeave_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvMovement" ADD CONSTRAINT "InvMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InvItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MktRecipient" ADD CONSTRAINT "MktRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MktCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

