-- AlterTable
ALTER TABLE "AccountProduct" ADD COLUMN     "invItemId" TEXT,
ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "invItemId" TEXT;

-- AlterTable
ALTER TABLE "RentalAsset" ADD COLUMN     "invItemId" TEXT;

-- AlterTable
ALTER TABLE "SchoolCourse" ADD COLUMN     "invItemId" TEXT;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "invItemId" TEXT;

-- CreateIndex
CREATE INDEX "AccountProduct_systemId_invItemId_idx" ON "AccountProduct"("systemId", "invItemId");

-- CreateIndex
CREATE INDEX "MenuItem_unitId_invItemId_idx" ON "MenuItem"("unitId", "invItemId");

-- CreateIndex
CREATE INDEX "RentalAsset_unitId_invItemId_idx" ON "RentalAsset"("unitId", "invItemId");

-- CreateIndex
CREATE INDEX "SchoolCourse_unitId_invItemId_idx" ON "SchoolCourse"("unitId", "invItemId");

-- CreateIndex
CREATE INDEX "TicketType_unitId_invItemId_idx" ON "TicketType"("unitId", "invItemId");

