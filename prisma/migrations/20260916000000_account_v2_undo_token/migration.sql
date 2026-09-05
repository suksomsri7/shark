-- CreateTable
CREATE TABLE "AccountUndoToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "AccountUndoToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountUndoToken_tenantId_systemId_expiresAt_idx" ON "AccountUndoToken"("tenantId", "systemId", "expiresAt");

-- CreateIndex
CREATE INDEX "AccountUndoToken_userId_expiresAt_idx" ON "AccountUndoToken"("userId", "expiresAt");

