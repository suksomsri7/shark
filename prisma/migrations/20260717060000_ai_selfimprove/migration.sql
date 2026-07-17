-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userText" TEXT NOT NULL,
    "replyText" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPromptTweak" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPromptTweak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiFeedback_tenantId_createdAt_idx" ON "AiFeedback"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AiFeedback_rating_createdAt_idx" ON "AiFeedback"("rating", "createdAt");

-- CreateIndex
CREATE INDEX "AiPromptTweak_status_createdAt_idx" ON "AiPromptTweak"("status", "createdAt");

