-- S1.1 เลขา AI — migration `secretary_a` (additive ล้วน · SECRETARY RUN 4 พ.ย. 2026)
-- ที่มา: `prisma migrate diff --from-schema <prisma/schema @4c8709be> --to-schema prisma/schema --script` (schema→schema · ไม่แตะฐาน)
--   Prisma 7.8 ไม่มี --shadow-database-url/--from-url แล้ว · และใช้ฐาน QC เป็น shadow = ล้างฐานทิ้ง ⇒ ไม่ใช้ --from-migrations
--   ตรวจไขว้กับฐาน wo-sec-qc ด้วย --from-config-datasource (อ่านอย่างเดียว) ก่อน deploy
-- แก้มือ 2 กลุ่ม:
--   (1) list 4 คอลัมน์เป็น NOT NULL (Prisma สร้าง scalar list เป็น nullable · แบบอย่าง svc_r0 / crm_v2_b / crm_v2_c):
--       AiScheduledTask.days/channels · AiRoom.systems · AiSecretary.languages
--   (2) FK 3 ตัวท้ายไฟล์ที่ไม่มี relation ใน Prisma (ฝั่งตรงข้ามอยู่ใน core.prisma FROZEN / chat.prisma นอกใบ):
--       AiSecretary.userId → User · UserPhone.userId → User · ChatConversationHelper.conversationId → ChatConversation (Cascade ทั้งหมด)
--       ⇒ migrate diff (DB → schema) จะเสนอลบ 3 FK นี้ทุกครั้ง — migration ถัดไปต้องตัดทิ้ง ห้ามลบ FK

-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "authorUserId" TEXT;

-- AlterTable
ALTER TABLE "AiTrainingSample" ADD COLUMN     "editedReply" TEXT,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "proposalId" TEXT,
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "stepsJson" JSONB;

-- AlterTable
ALTER TABLE "AiMemory" ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "AiScheduledTask" ADD COLUMN     "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "days" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "ownerUserId" TEXT;

-- AlterTable
ALTER TABLE "SupportCase" ADD COLUMN     "category" TEXT,
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "AiRoom" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "systems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "contextJson" JSONB,
    "jobsCounted" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRoomMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seeHistory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AiRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRoomJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRoomJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSystemAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'DRAFT',
    "setById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSystemAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiApprovalRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limitSatang" INTEGER,
    "setById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiActionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT,
    "userId" TEXT NOT NULL,
    "approverId" TEXT,
    "module" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "proposalId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "undoableUntil" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJobCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "jobs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJobCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiLesson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "sourceRoomId" TEXT,
    "sourceUserId" TEXT NOT NULL,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "unitAccess" JSONB NOT NULL DEFAULT '[]',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoutingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "channel" TEXT,
    "mode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "onDutyAt" TIMESTAMP(3) NOT NULL,
    "offDutyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversationHelper" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calledById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatConversationHelper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSecretary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Shark',
    "suffix" TEXT NOT NULL DEFAULT 'ครับ',
    "tone" TEXT NOT NULL DEFAULT 'polite',
    "languages" TEXT[] NOT NULL DEFAULT ARRAY['th']::TEXT[],
    "prefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSecretary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPhone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiNotifyPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiNotifyPref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiRoom_conversationId_key" ON "AiRoom"("conversationId");

-- CreateIndex
CREATE INDEX "AiRoom_tenantId_startedById_updatedAt_idx" ON "AiRoom"("tenantId", "startedById", "updatedAt");

-- CreateIndex
CREATE INDEX "AiRoom_tenantId_closedAt_idx" ON "AiRoom"("tenantId", "closedAt");

-- CreateIndex
CREATE INDEX "AiRoomMember_userId_idx" ON "AiRoomMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRoomMember_roomId_userId_key" ON "AiRoomMember"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRoomJob_messageId_key" ON "AiRoomJob"("messageId");

-- CreateIndex
CREATE INDEX "AiRoomJob_status_leaseUntil_idx" ON "AiRoomJob"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "AiRoomJob_roomId_createdAt_idx" ON "AiRoomJob"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSystemAccess_tenantId_module_key" ON "AiSystemAccess"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "AiApprovalRule_tenantId_key_key" ON "AiApprovalRule"("tenantId", "key");

-- CreateIndex
CREATE INDEX "AiActionLog_tenantId_createdAt_idx" ON "AiActionLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AiActionLog_roomId_idx" ON "AiActionLog"("roomId");

-- CreateIndex
CREATE INDEX "AiActionLog_proposalId_idx" ON "AiActionLog"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "AiJobCounter_tenantId_month_key" ON "AiJobCounter"("tenantId", "month");

-- CreateIndex
CREATE INDEX "AiLesson_tenantId_kind_status_idx" ON "AiLesson"("tenantId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvite_codeHash_key" ON "StaffInvite"("codeHash");

-- CreateIndex
CREATE INDEX "StaffInvite_tenantId_phone_idx" ON "StaffInvite"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "StaffInvite_tenantId_acceptedAt_idx" ON "StaffInvite"("tenantId", "acceptedAt");

-- CreateIndex
CREATE INDEX "ChatRoutingRule_tenantId_systemId_enabled_order_idx" ON "ChatRoutingRule"("tenantId", "systemId", "enabled", "order");

-- CreateIndex
CREATE INDEX "ChatShift_tenantId_userId_offDutyAt_idx" ON "ChatShift"("tenantId", "userId", "offDutyAt");

-- CreateIndex
CREATE INDEX "ChatConversationHelper_userId_idx" ON "ChatConversationHelper"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversationHelper_conversationId_userId_key" ON "ChatConversationHelper"("conversationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiSecretary_userId_key" ON "AiSecretary"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPhone_userId_key" ON "UserPhone"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPhone_phone_key" ON "UserPhone"("phone");

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_createdAt_idx" ON "PhoneOtp"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneOtp_expiresAt_idx" ON "PhoneOtp"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiNotifyPref_userId_tenantId_kind_key" ON "AiNotifyPref"("userId", "tenantId", "kind");

-- AddForeignKey
ALTER TABLE "AiRoom" ADD CONSTRAINT "AiRoom_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRoomMember" ADD CONSTRAINT "AiRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "AiRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRoomJob" ADD CONSTRAINT "AiRoomJob_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "AiRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (เขียนมือ · ดูหัวไฟล์)
ALTER TABLE "AiSecretary" ADD CONSTRAINT "AiSecretary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (เขียนมือ · ดูหัวไฟล์)
ALTER TABLE "UserPhone" ADD CONSTRAINT "UserPhone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (เขียนมือ · ดูหัวไฟล์)
ALTER TABLE "ChatConversationHelper" ADD CONSTRAINT "ChatConversationHelper_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
