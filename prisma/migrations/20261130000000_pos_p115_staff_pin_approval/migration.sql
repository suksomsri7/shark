-- POS P1.15 — PIN พนักงาน (PosStaffPin) · snapshot คำขออนุมัติ POS (PosApprovalPayload) · PosHeldCart.approvedRequestId
-- เพิ่มอย่างเดียว (CD5) · สร้างจาก prisma migrate diff --from-schema <schema ก่อน P1.15> --to-schema prisma/schema --script

-- AlterTable
ALTER TABLE "PosHeldCart" ADD COLUMN     "approvedRequestId" TEXT;

-- CreateTable
CREATE TABLE "PosStaffPin" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "setById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosStaffPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosApprovalPayload" (
    "requestId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosApprovalPayload_pkey" PRIMARY KEY ("requestId")
);

-- CreateIndex
CREATE INDEX "PosStaffPin_tenantId_unitId_idx" ON "PosStaffPin"("tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "PosStaffPin_unitId_userId_key" ON "PosStaffPin"("unitId", "userId");

-- CreateIndex
CREATE INDEX "PosApprovalPayload_tenantId_kind_idx" ON "PosApprovalPayload"("tenantId", "kind");

