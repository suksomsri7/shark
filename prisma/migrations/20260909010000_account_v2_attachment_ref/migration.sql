-- AlterTable
ALTER TABLE "AccountAttachment" ADD COLUMN     "refId" TEXT,
ADD COLUMN     "refType" TEXT;

-- CreateIndex
CREATE INDEX "AccountAttachment_systemId_refType_refId_idx" ON "AccountAttachment"("systemId", "refType", "refId");

