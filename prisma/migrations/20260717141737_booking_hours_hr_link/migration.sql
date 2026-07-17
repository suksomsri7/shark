-- AlterTable
ALTER TABLE "BookingStaff" ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "BookingHours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "openMin" INTEGER NOT NULL DEFAULT 600,
    "closeMin" INTEGER NOT NULL DEFAULT 1200,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingHours_tenantId_unitId_idx" ON "BookingHours"("tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingHours_unitId_weekday_key" ON "BookingHours"("unitId", "weekday");
