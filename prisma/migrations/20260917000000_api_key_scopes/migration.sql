-- AlterEnum
ALTER TYPE "ActorType" ADD VALUE 'API_KEY';

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "rotatedFromId" TEXT,
ADD COLUMN     "scopesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "systemId" TEXT;

-- CreateTable
CREATE TABLE "ApiIdempotency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "idemKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" INTEGER,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiIdempotency_expiresAt_idx" ON "ApiIdempotency"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiIdempotency_tenantId_idx" ON "ApiIdempotency"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiIdempotency_keyId_idemKey_key" ON "ApiIdempotency"("keyId", "idemKey");

-- CreateIndex
CREATE INDEX "ApiKey_tenantId_systemId_idx" ON "ApiKey"("tenantId", "systemId");

