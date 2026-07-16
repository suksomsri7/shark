-- AlterTable
ALTER TABLE "InvMovement" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "InvLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvLocationStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvLocationStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvLocation_tenantId_idx" ON "InvLocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InvLocation_systemId_name_key" ON "InvLocation"("systemId", "name");

-- CreateIndex
CREATE INDEX "InvLocationStock_tenantId_idx" ON "InvLocationStock"("tenantId");

-- CreateIndex
CREATE INDEX "InvLocationStock_systemId_locationId_idx" ON "InvLocationStock"("systemId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "InvLocationStock_itemId_locationId_key" ON "InvLocationStock"("itemId", "locationId");
