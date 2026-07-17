-- CreateTable
CREATE TABLE "AiTrainingSample" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userText" TEXT NOT NULL,
    "toolCallsJson" JSONB NOT NULL DEFAULT '[]',
    "replyText" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTrainingSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiTrainingSample_tenantId_createdAt_idx" ON "AiTrainingSample"("tenantId", "createdAt");

