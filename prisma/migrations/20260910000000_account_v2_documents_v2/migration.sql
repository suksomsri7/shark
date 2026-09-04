-- AlterTable
ALTER TABLE "AccountAttachment" ADD COLUMN     "aiExtract" JSONB,
ADD COLUMN     "aiStatus" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "docTypeHint" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "thumbUrl" TEXT;

-- CreateIndex
CREATE INDEX "AccountAttachment_systemId_status_createdAt_idx" ON "AccountAttachment"("systemId", "status", "createdAt");

