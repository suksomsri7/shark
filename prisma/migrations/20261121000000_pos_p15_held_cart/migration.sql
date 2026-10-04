-- POS P1.5 — พักบิล / เรียกคืน (PosHeldCart · มติ H1) · additive ล้วน: enum ใหม่ 1 + ตารางใหม่ 1 + index 1 · ไม่แตะตารางเดิม · ไม่มี FK (id หลวมแบบ PosProduct)
-- ตรงกับผลของ `prisma migrate diff --from-schema <schema ก่อน P1.5> --to-schema prisma/schema --script` ทุกบรรทัด
-- CreateEnum
CREATE TYPE "PosHeldCartStatus" AS ENUM ('HELD', 'RECALLED', 'DISCARDED');

-- CreateTable
CREATE TABLE "PosHeldCart" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "label" TEXT,
    "cartJson" JSONB NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "approxTotalSatang" INTEGER NOT NULL,
    "heldByUserId" TEXT NOT NULL,
    "recalledAt" TIMESTAMP(3),
    "recalledByUserId" TEXT,
    "status" "PosHeldCartStatus" NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PosHeldCart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosHeldCart_unitId_status_createdAt_idx" ON "PosHeldCart"("unitId", "status", "createdAt");

