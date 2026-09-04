-- AlterTable
ALTER TABLE "AccountFixedAsset" ADD COLUMN     "disposalMethod" TEXT;
-- AlterTable
ALTER TABLE "AccountJournalEntry" ADD COLUMN     "flagNote" TEXT;
-- AlterTable
ALTER TABLE "AccountPeriod" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "reopenedAt" TIMESTAMP(3);
-- CreateTable
CREATE TABLE "AccountVatFiling" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filedById" TEXT,
    "salesVatSatang" INTEGER NOT NULL DEFAULT 0,
    "inputVatSatang" INTEGER NOT NULL DEFAULT 0,
    "payableSatang" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountVatFiling_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "AccountVatFiling_tenantId_systemId_idx" ON "AccountVatFiling"("tenantId", "systemId");
-- CreateIndex
CREATE UNIQUE INDEX "AccountVatFiling_systemId_periodKey_key" ON "AccountVatFiling"("systemId", "periodKey");
