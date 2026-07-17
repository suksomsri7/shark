-- AlterTable
ALTER TABLE "SupportCase" ADD COLUMN     "caseNo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopLastReadAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN     "attachmentsJson" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "SupportCase_tenantId_caseNo_key" ON "SupportCase"("tenantId", "caseNo");

