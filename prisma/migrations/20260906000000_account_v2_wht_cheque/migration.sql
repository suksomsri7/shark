-- AlterTable
ALTER TABLE "AccountCheque" ADD COLUMN     "depositedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AccountDocument" ADD COLUMN     "whtFiledPeriodKey" TEXT;

-- CreateTable
CREATE TABLE "AccountWhtFiling" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "form" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filedById" TEXT,
    "totalBaseSatang" INTEGER NOT NULL,
    "totalTaxSatang" INTEGER NOT NULL,
    "certCount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountWhtFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountWhtFiling_tenantId_systemId_idx" ON "AccountWhtFiling"("tenantId", "systemId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountWhtFiling_systemId_form_periodKey_key" ON "AccountWhtFiling"("systemId", "form", "periodKey");

-- CreateIndex
CREATE INDEX "AccountDocument_systemId_docType_whtFiledPeriodKey_idx" ON "AccountDocument"("systemId", "docType", "whtFiledPeriodKey");

