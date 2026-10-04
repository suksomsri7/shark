-- POS P1.9b — ผู้จัดการนับเงินย้อนหลังของกะที่ระบบบังคับปิด (Q9.4 · มติ R1) · additive ล้วน: ตารางใหม่ 1 + ดัชนี 3
-- ทั้งไฟล์ (ใต้ SET) = ผลของ `prisma migrate diff --from-schema <schema ที่ a4bc5d44> --to-schema prisma/schema --script` ทุกบรรทัด (ไม่ต้องใช้ DB)
-- ไม่แตะ "PosShift" (R1/R3) · ไม่มี FK (shiftId = id หลวมแบบ PosCashMovement) · ไม่มี DROP/RENAME/SET NOT NULL
-- ไม่มีบล็อก plpgsql/dollar-quote ⇒ prisma รันทีละคำสั่ง · lock_timeout ระดับ session
SET lock_timeout = '3s';

-- CreateTable
CREATE TABLE "PosShiftRecount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "zNumber" INTEGER NOT NULL,
    "expectedCashSatang" INTEGER NOT NULL,
    "countedCashSatang" INTEGER NOT NULL,
    "varianceSatang" INTEGER NOT NULL,
    "countDetail" JSONB,
    "note" TEXT NOT NULL,
    "recountedByUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosShiftRecount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosShiftRecount_shiftId_key" ON "PosShiftRecount"("shiftId");

-- CreateIndex
CREATE INDEX "PosShiftRecount_tenantId_unitId_createdAt_idx" ON "PosShiftRecount"("tenantId", "unitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosShiftRecount_tenantId_idempotencyKey_key" ON "PosShiftRecount"("tenantId", "idempotencyKey");
