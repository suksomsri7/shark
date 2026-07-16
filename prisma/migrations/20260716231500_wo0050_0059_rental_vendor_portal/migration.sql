-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('BOOKED', 'PICKED_UP', 'RETURNED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "UnitType" ADD VALUE 'RENTAL';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "portalToken" TEXT;

-- CreateTable
CREATE TABLE "RentalAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "dailyRateSatang" INTEGER NOT NULL DEFAULT 0,
    "depositSatang" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalBooking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'BOOKED',
    "depositHeldSatang" INTEGER NOT NULL DEFAULT 0,
    "lateFeeSatang" INTEGER NOT NULL DEFAULT 0,
    "totalSatang" INTEGER NOT NULL DEFAULT 0,
    "posSaleId" TEXT,
    "pickedUpAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalAsset_tenantId_unitId_active_idx" ON "RentalAsset"("tenantId", "unitId", "active");

-- CreateIndex
CREATE INDEX "RentalBooking_tenantId_unitId_status_idx" ON "RentalBooking"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "RentalBooking_assetId_startDate_idx" ON "RentalBooking"("assetId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_portalToken_key" ON "Supplier"("portalToken");

-- AddForeignKey
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RentalAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

