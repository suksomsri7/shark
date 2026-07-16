-- CreateEnum
CREATE TYPE "AiProposalStatus" AS ENUM ('PENDING', 'EXECUTED', 'REJECTED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AiProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AiProposalStatus" NOT NULL DEFAULT 'PENDING',
    "resultNote" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiProposal_tenantId_conversationId_status_createdAt_idx" ON "AiProposal"("tenantId", "conversationId", "status", "createdAt");
