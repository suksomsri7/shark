-- Mobile Phase 0 (ledger/MOBILE_PLAN.md M-01) — additive ทั้งหมด ปลอดภัยบน prod
ALTER TABLE "AiConversation" ADD COLUMN "lastReadAt" TIMESTAMP(3);
ALTER TABLE "AiConversation" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "SupportCase" ADD COLUMN "conversationId" TEXT;

CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "expoToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDevice_expoToken_key" ON "PushDevice"("expoToken");
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");
CREATE INDEX "PushDevice_tenantId_idx" ON "PushDevice"("tenantId");
