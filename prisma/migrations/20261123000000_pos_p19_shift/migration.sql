-- POS P1.9 — กะ · ลิ้นชักเงินสด · X/Z (มติ S1) · additive ล้วน: enum ใหม่ 2 + ตารางใหม่ 3 + คอลัมน์ nullable 1 บน PosSale
-- ส่วนบน = ผลของ `prisma migrate diff --from-schema <schema ก่อน P1.9> --to-schema prisma/schema --script` ทุกบรรทัด
-- ส่วนท้าย = partial unique เขียนมือ (prisma แสดง WHERE ไม่ได้) · ไม่มี FK (id หลวมแบบ PosHeldCart)
-- PosSale."shiftId": nullable ไม่มี default ⇒ metadata-only ไม่ rewrite ตาราง · index ของคอลัมน์นี้ = P6.1 (CREATE INDEX CONCURRENTLY นอก prisma migrate)
-- ไม่มีบล็อก plpgsql/dollar-quote ⇒ prisma รันทีละคำสั่ง · lock_timeout ระดับ session
SET lock_timeout = '3s';

-- CreateEnum
CREATE TYPE "PosShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'FORCE_CLOSED');

-- CreateEnum
CREATE TYPE "PosCashMoveKind" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "shiftId" TEXT;

-- CreateTable
CREATE TABLE "PosShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "shiftNo" INTEGER NOT NULL,
    "status" "PosShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "floatSatang" INTEGER NOT NULL,
    "floatDetail" JSONB,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "expectedCashSatang" INTEGER,
    "countedCashSatang" INTEGER,
    "overShortSatang" INTEGER,
    "countDetail" JSONB,
    "countedByMethod" JSONB,
    "closeNote" TEXT,
    "closeKey" TEXT,
    "zNumber" INTEGER,
    "zReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCashMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "kind" "PosCashMoveKind" NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosShiftCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "shiftSeq" INTEGER NOT NULL DEFAULT 0,
    "zSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosShiftCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosShift_tenantId_unitId_status_idx" ON "PosShift"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PosShift_unitId_shiftNo_key" ON "PosShift"("unitId", "shiftNo");

-- CreateIndex
CREATE UNIQUE INDEX "PosShift_unitId_zNumber_key" ON "PosShift"("unitId", "zNumber");

-- CreateIndex
CREATE INDEX "PosCashMovement_shiftId_idx" ON "PosCashMovement"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "PosCashMovement_tenantId_idempotencyKey_key" ON "PosCashMovement"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PosShiftCounter_unitId_key" ON "PosShiftCounter"("unitId");


-- HandWritten (มติ S1/S4): 1 กะ OPEN ต่อ (สาขา, เครื่อง) — เปิดพร้อมกันได้ผู้ชนะคนเดียว (P2002 → SHIFT_ALREADY_OPEN)
CREATE UNIQUE INDEX "one_open_shift_per_device" ON "PosShift"("unitId", "deviceId") WHERE status = 'OPEN';

RESET lock_timeout;
