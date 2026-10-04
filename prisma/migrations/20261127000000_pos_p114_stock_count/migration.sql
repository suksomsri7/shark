-- POS P1.14 — ตรวจนับสต็อกจากหน้าขาย (มติ R1) · additive ล้วน: enum ใหม่ 2 + ตารางใหม่ 3 + ดัชนี 7 + partial unique 1
-- ส่วนบน (ใต้ SET) = ผลของ `prisma migrate diff --from-schema <schema ก่อน P1.14> --to-schema prisma/schema --script` ทุกบรรทัด (ไม่ต้องใช้ DB)
-- ส่วนท้าย = partial unique เขียนมือ (prisma แสดง WHERE ไม่ได้ · แบบ PosProduct_systemId_scalePlu_active_key) = 1 รอบ OPEN ต่อคลัง × ที่เก็บ
-- ไม่แตะตาราง Inv* / PosSale* / PosProduct / PosShift* · ไม่มี FK (id หลวมแบบ PosShift) · ไม่มี DROP/RENAME/SET NOT NULL
-- ไม่มีบล็อก plpgsql/dollar-quote ⇒ prisma รันทีละคำสั่ง · lock_timeout ระดับ session
SET lock_timeout = '3s';

-- CreateEnum
CREATE TYPE "PosStockCountStatus" AS ENUM ('OPEN', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosStockCountScope" AS ENUM ('ALL', 'CATEGORY');

-- CreateTable
CREATE TABLE "PosStockCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "inventorySystemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "countNo" INTEGER NOT NULL,
    "scope" "PosStockCountScope" NOT NULL,
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blind" BOOLEAN NOT NULL DEFAULT false,
    "status" "PosStockCountStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "openKey" TEXT NOT NULL,
    "confirmKey" TEXT,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelKey" TEXT,
    "cancelledByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosStockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosStockCountLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "snapshotQty" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "expectedAtCount" INTEGER,
    "countedAt" TIMESTAMP(3),
    "varianceQty" INTEGER,
    "costSatang" INTEGER,
    "movementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosStockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosStockCountEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "code" TEXT,
    "byUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosStockCountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosStockCount_tenantId_unitId_status_idx" ON "PosStockCount"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PosStockCount_tenantId_openKey_key" ON "PosStockCount"("tenantId", "openKey");

-- CreateIndex
CREATE UNIQUE INDEX "PosStockCount_unitId_countNo_key" ON "PosStockCount"("unitId", "countNo");

-- CreateIndex
CREATE INDEX "PosStockCountLine_tenantId_idx" ON "PosStockCountLine"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PosStockCountLine_countId_itemId_key" ON "PosStockCountLine"("countId", "itemId");

-- CreateIndex
CREATE INDEX "PosStockCountEntry_countId_idx" ON "PosStockCountEntry"("countId");

-- CreateIndex
CREATE UNIQUE INDEX "PosStockCountEntry_tenantId_idempotencyKey_key" ON "PosStockCountEntry"("tenantId", "idempotencyKey");


-- CreateIndex (เขียนมือ · R4: การแข่งเปิดรอบที่ที่เก็บเดียวกันตัดสินที่ดัชนีนี้)
CREATE UNIQUE INDEX "PosStockCount_open_location_key" ON "PosStockCount"("inventorySystemId", "locationId") WHERE "status" = 'OPEN';
