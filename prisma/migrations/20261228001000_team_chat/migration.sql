-- team_chat (B27 · แชททีมแบบ WhatsApp · มติเจ้าของ 15 พ.ย. 2026) — additive ล้วน: 2 enum + 3 ตาราง (TeamThread · TeamThreadMember · TeamMessage)
-- CreateEnum
CREATE TYPE "TeamThreadKind" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "TeamThreadRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "TeamThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "TeamThreadKind" NOT NULL,
    "name" TEXT,
    "photoFileId" TEXT,
    "createdById" TEXT NOT NULL,
    "directKey" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamThreadMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamThreadRole" NOT NULL DEFAULT 'MEMBER',
    "lastReadAt" TIMESTAMP(3),
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "TeamThreadMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamThread_tenantId_lastMessageAt_idx" ON "TeamThread"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamThread_tenantId_directKey_key" ON "TeamThread"("tenantId", "directKey");

-- CreateIndex
CREATE INDEX "TeamThreadMember_tenantId_userId_leftAt_idx" ON "TeamThreadMember"("tenantId", "userId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamThreadMember_threadId_userId_key" ON "TeamThreadMember"("threadId", "userId");

-- CreateIndex
CREATE INDEX "TeamMessage_threadId_createdAt_idx" ON "TeamMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamMessage_tenantId_createdAt_idx" ON "TeamMessage"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamThreadMember" ADD CONSTRAINT "TeamThreadMember_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TeamThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TeamThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

