-- AlterTable
ALTER TABLE "InvMovement" ADD COLUMN     "lotCode" TEXT;

-- CreateTable
CREATE TABLE "InvLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "expiryDate" DATE,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvLot_tenantId_idx" ON "InvLot"("tenantId");

-- CreateIndex
CREATE INDEX "InvLot_systemId_expiryDate_idx" ON "InvLot"("systemId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "InvLot_itemId_lotCode_key" ON "InvLot"("itemId", "lotCode");
