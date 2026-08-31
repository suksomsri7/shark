-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "detectedLang" TEXT,
ADD COLUMN     "translatedAt" TIMESTAMP(3),
ADD COLUMN     "translatedBody" TEXT,
ADD COLUMN     "translatedLang" TEXT;

-- AlterTable
ALTER TABLE "ChatSetting" ADD COLUMN     "aiSuggestEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staffLang" TEXT NOT NULL DEFAULT 'th',
ADD COLUMN     "translateEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChatAiSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "suggestedBody" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "costMicro" INTEGER NOT NULL DEFAULT 0,
    "sourcesUsed" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "sentMessageId" TEXT,
    "similarity" INTEGER,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAnswerExample" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "channel" "ChatChannelType" NOT NULL,
    "lang" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "sourceMessageId" TEXT,
    "fromSuggestionId" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAnswerExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatAiSuggestion_systemId_conversationId_createdAt_idx" ON "ChatAiSuggestion"("systemId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAiSuggestion_systemId_outcome_createdAt_idx" ON "ChatAiSuggestion"("systemId", "outcome", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAnswerExample_systemId_archivedAt_createdAt_idx" ON "ChatAnswerExample"("systemId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAnswerExample_systemId_channel_lang_idx" ON "ChatAnswerExample"("systemId", "channel", "lang");
