-- crm_v2_b — CRM v2 ใบ C2.0 (migration ที่ 2 จาก 3 · a=C1.1 · b=C2.0 · c=C3.0 ตาม RESOLUTIONS R-C.1) · ตารางของทั้งเฟส C2
-- สร้างด้วย `bash scripts/iso.sh bash scripts/qc2.sh bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script`
-- (QC2 ตรงกับ migration เดิมทุกตัวพอดี — diff ก่อนแก้สคีมา = "empty migration") แล้วแก้มือ 2 อย่างเท่านั้น:
--   1) "CrmAssignmentRule"."userIds" เติม NOT NULL (Prisma ออก list เป็น nullable เสมอ · ตารางใหม่ ไม่มีแถวเดิม)
--   2) ท้ายไฟล์: partial unique index 3 ตัว (Prisma schema ไม่รองรับ WHERE) — R3 · R6 · R7a ของผู้คุมงาน 19 ก.ย.
-- additive ล้วน: CREATE TYPE · ALTER TYPE … ADD VALUE · CREATE TABLE · CREATE [UNIQUE] INDEX · ADD COLUMN (nullable/มี default คงที่)
--   · ADD CONSTRAINT (FK) เฉพาะบนตารางใหม่ · ไม่มี DROP/RENAME/ALTER COLUMN/คำสั่งข้อมูล
-- 🔴 ไม่มีคำสั่งที่ล้มได้กับแถว prod เดิม: unique บนตารางเดิมมีตัวเดียว (AutomationRun) และเป็น partial บนคอลัมน์ที่เพิ่งเพิ่ม
--    โดยไม่มี default ⇒ แถวเดิมทุกแถวเป็น NULL = ดัชนีว่าง · unique ผู้ติดต่อหลักของบริษัท + AccountContact(systemId, partyId) → C6.1
-- 🔴 ค่า enum ที่เพิ่มด้วย ADD VALUE (CrmActivitySource.KANBAN) ไม่ถูกใช้เป็น default/cast/เงื่อนไขในไฟล์นี้
-- 🔴 ไม่เพิ่ม PosSale.dealId / MktRecipient.emailMessageId (มติ C29) · ไม่เก็บ token ติดตามแบบตรง (trackTokenHash เท่านั้น)

-- CreateEnum
CREATE TYPE "CrmAssignMode" AS ENUM ('FIXED', 'ROUND_ROBIN', 'TEAM_LEAD', 'LEAST_OPEN');

-- CreateEnum
CREATE TYPE "CrmSeqStepKind" AS ENUM ('EMAIL', 'LINE', 'TASK', 'WAIT', 'SMS');

-- CreateEnum
CREATE TYPE "CrmEnrollStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DONE', 'STOPPED');

-- CreateEnum
CREATE TYPE "CrmEmailStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'BOUNCED', 'FAILED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "CrmEmailEventKind" AS ENUM ('OPEN', 'CLICK', 'BOUNCE', 'COMPLAINT', 'REPLY', 'UNSUBSCRIBE');

-- CreateEnum
CREATE TYPE "CrmWebEventKind" AS ENUM ('PAGEVIEW', 'CLICK', 'FORM_VIEW', 'FORM_SUBMIT', 'IDENTIFY', 'CONSENT');

-- AlterEnum
ALTER TYPE "CrmActivitySource" ADD VALUE 'KANBAN';

-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "crmContactId" TEXT;

-- AlterTable
ALTER TABLE "CrmContact" ADD COLUMN     "trackingOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CrmDeal" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FormDef" ADD COLUMN     "assignRuleId" TEXT,
ADD COLUMN     "createCompanyFromField" TEXT,
ADD COLUMN     "crmSystemId" TEXT,
ADD COLUMN     "scoreOnSubmit" INTEGER,
ADD COLUMN     "spamGuard" JSONB,
ADD COLUMN     "utmCapture" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "pageUrl" TEXT,
ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "utm" JSONB,
ADD COLUMN     "webSessionId" TEXT;

-- CreateTable
CREATE TABLE "CrmScoreRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "conditions" JSONB,
    "points" INTEGER NOT NULL,
    "expiresDays" INTEGER,
    "maxPerDay" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmScoreRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmScoreLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "ruleId" TEXT,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "eventKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "expired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmScoreLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAssignmentRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "mode" "CrmAssignMode" NOT NULL,
    "userIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "teamId" TEXT,
    "rrCursor" INTEGER NOT NULL DEFAULT 0,
    "maxOpenPerUser" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
    "stopOnWon" BOOLEAN NOT NULL DEFAULT true,
    "stopOnLost" BOOLEAN NOT NULL DEFAULT true,
    "businessDaysOnly" BOOLEAN NOT NULL DEFAULT true,
    "sendWindow" JSONB,
    "maxActive" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stats" JSONB,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSequenceStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "kind" "CrmSeqStepKind" NOT NULL,
    "templateId" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "waitDays" INTEGER,
    "waitHours" INTEGER,
    "taskTitle" TEXT,
    "taskType" "CrmActivityType",
    "channel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "dealId" TEXT,
    "enrolledById" TEXT,
    "enrolledBy" TEXT NOT NULL,
    "sequenceVersion" INTEGER NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextAt" TIMESTAMP(3),
    "status" "CrmEnrollStatus" NOT NULL DEFAULT 'ACTIVE',
    "stoppedReason" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "stats" JSONB,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEmailMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "direction" "CrmDirection" NOT NULL,
    "messageId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "threadKey" TEXT NOT NULL,
    "fromAddr" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccAddrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bccAddrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "snippet" TEXT,
    "attachments" JSONB,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "status" "CrmEmailStatus" NOT NULL,
    "providerId" TEXT,
    "providerError" TEXT,
    "sequenceStepId" TEXT,
    "campaignId" TEXT,
    "templateId" TEXT,
    "trackTokenHash" TEXT NOT NULL,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "firstOpenedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "routing" JSONB,
    "matchedBy" TEXT,
    "purgedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmEmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEmailEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "kind" "CrmEmailEventKind" NOT NULL,
    "providerEventId" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmEmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "category" TEXT,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmEmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEmailUserSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromName" TEXT,
    "fromAddr" TEXT,
    "replyToMode" TEXT NOT NULL DEFAULT 'SHARK',
    "replyToAddr" TEXT,
    "copyToAddr" TEXT,
    "copyMode" TEXT NOT NULL DEFAULT 'NONE',
    "signatureHtml" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmEmailUserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmMailProvider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tokenRef" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmMailProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "records" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTrackedLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "campaignId" TEXT,
    "linkId" TEXT,
    "channel" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicks" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmTrackedLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTrackedClick" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "contactId" TEXT,
    "emailId" TEXT,
    "webSessionId" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmTrackedClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmWebSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "contactId" TEXT,
    "consentVersion" INTEGER,
    "consentAt" TIMESTAMP(3),
    "firstUrl" TEXT,
    "referrer" TEXT,
    "utm" JSONB,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "identifiedBy" TEXT,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "CrmWebSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmWebEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "CrmWebEventKind" NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "durationSec" INTEGER,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmWebEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDealPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "satang" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDealPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmUserPref" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifications" JSONB NOT NULL DEFAULT '{}',
    "quietHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmUserPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "fileId" TEXT,
    "options" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmScoreRule_systemId_event_idx" ON "CrmScoreRule"("systemId", "event");

-- CreateIndex
CREATE INDEX "CrmScoreRule_tenantId_idx" ON "CrmScoreRule"("tenantId");

-- CreateIndex
CREATE INDEX "CrmScoreLog_contactId_createdAt_idx" ON "CrmScoreLog"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmScoreLog_expiresAt_expired_idx" ON "CrmScoreLog"("expiresAt", "expired");

-- CreateIndex
CREATE INDEX "CrmAssignmentRule_systemId_sortOrder_idx" ON "CrmAssignmentRule"("systemId", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmAssignmentRule_tenantId_idx" ON "CrmAssignmentRule"("tenantId");

-- CreateIndex
CREATE INDEX "CrmSequence_systemId_active_idx" ON "CrmSequence"("systemId", "active");

-- CreateIndex
CREATE INDEX "CrmSequence_tenantId_idx" ON "CrmSequence"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSequenceStep_sequenceId_version_index_key" ON "CrmSequenceStep"("sequenceId", "version", "index");

-- CreateIndex
CREATE INDEX "CrmSequenceEnrollment_status_nextAt_idx" ON "CrmSequenceEnrollment"("status", "nextAt");

-- CreateIndex
CREATE INDEX "CrmSequenceEnrollment_contactId_idx" ON "CrmSequenceEnrollment"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailMessage_messageId_key" ON "CrmEmailMessage"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailMessage_trackTokenHash_key" ON "CrmEmailMessage"("trackTokenHash");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_contactId_sentAt_idx" ON "CrmEmailMessage"("contactId", "sentAt");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_threadKey_sentAt_idx" ON "CrmEmailMessage"("threadKey", "sentAt");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_systemId_direction_sentAt_idx" ON "CrmEmailMessage"("systemId", "direction", "sentAt");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_systemId_matchedBy_idx" ON "CrmEmailMessage"("systemId", "matchedBy");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_scheduledAt_status_idx" ON "CrmEmailMessage"("scheduledAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailEvent_providerEventId_key" ON "CrmEmailEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "CrmEmailEvent_emailId_at_idx" ON "CrmEmailEvent"("emailId", "at");

-- CreateIndex
CREATE INDEX "CrmEmailEvent_kind_at_idx" ON "CrmEmailEvent"("kind", "at");

-- CreateIndex
CREATE INDEX "CrmEmailTemplate_tenantId_idx" ON "CrmEmailTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailTemplate_systemId_name_key" ON "CrmEmailTemplate"("systemId", "name");

-- CreateIndex
CREATE INDEX "CrmEmailUserSetting_tenantId_idx" ON "CrmEmailUserSetting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailUserSetting_systemId_userId_key" ON "CrmEmailUserSetting"("systemId", "userId");

-- CreateIndex
CREATE INDEX "CrmMailProvider_tenantId_idx" ON "CrmMailProvider"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmMailProvider_systemId_userId_kind_key" ON "CrmMailProvider"("systemId", "userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_tenantId_domain_key" ON "EmailDomain"("tenantId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "CrmTrackedLink_code_key" ON "CrmTrackedLink"("code");

-- CreateIndex
CREATE INDEX "CrmTrackedLink_systemId_createdAt_idx" ON "CrmTrackedLink"("systemId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmTrackedClick_linkId_at_idx" ON "CrmTrackedClick"("linkId", "at");

-- CreateIndex
CREATE INDEX "CrmWebSession_systemId_visitorId_idx" ON "CrmWebSession"("systemId", "visitorId");

-- CreateIndex
CREATE INDEX "CrmWebSession_contactId_startedAt_idx" ON "CrmWebSession"("contactId", "startedAt");

-- CreateIndex
CREATE INDEX "CrmWebSession_lastSeenAt_idx" ON "CrmWebSession"("lastSeenAt");

-- CreateIndex
CREATE INDEX "CrmWebEvent_sessionId_at_idx" ON "CrmWebEvent"("sessionId", "at");

-- CreateIndex
CREATE INDEX "CrmDealPayment_refType_refId_idx" ON "CrmDealPayment"("refType", "refId");

-- CreateIndex
CREATE INDEX "CrmDealPayment_systemId_status_idx" ON "CrmDealPayment"("systemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDealPayment_dealId_refType_refId_key" ON "CrmDealPayment"("dealId", "refType", "refId");

-- CreateIndex
CREATE INDEX "CrmUserPref_tenantId_idx" ON "CrmUserPref"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmUserPref_systemId_userId_key" ON "CrmUserPref"("systemId", "userId");

-- CreateIndex
CREATE INDEX "CrmImportJob_status_leaseUntil_idx" ON "CrmImportJob"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "CrmImportJob_systemId_createdAt_idx" ON "CrmImportJob"("systemId", "createdAt");

-- AddForeignKey
ALTER TABLE "CrmScoreLog" ADD CONSTRAINT "CrmScoreLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSequenceStep" ADD CONSTRAINT "CrmSequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "CrmSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSequenceEnrollment" ADD CONSTRAINT "CrmSequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "CrmSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSequenceEnrollment" ADD CONSTRAINT "CrmSequenceEnrollment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmEmailEvent" ADD CONSTRAINT "CrmEmailEvent_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "CrmEmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTrackedClick" ADD CONSTRAINT "CrmTrackedClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CrmTrackedLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWebEvent" ADD CONSTRAINT "CrmWebEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CrmWebSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealPayment" ADD CONSTRAINT "CrmDealPayment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ partial unique index (ประกาศเฉพาะที่นี่ — Prisma schema ไม่รองรับ WHERE · ดูคอมเมนต์ใน prisma/schema) ═══

-- R3 (C2.2): ผู้ติดต่อ 1 คนมี enrollment ที่ ACTIVE ได้ 1 แถวต่อ sequence · ลงใหม่ได้หลัง DONE/STOPPED
-- (CrmEnrollStatus สร้างด้วย CREATE TYPE ในไฟล์นี้ — ไม่ใช่ค่าที่เพิ่มด้วย ADD VALUE จึงใช้ในเงื่อนไขได้ · ตารางใหม่)
CREATE UNIQUE INDEX "CrmSequenceEnrollment_sequenceId_contactId_active_key" ON "CrmSequenceEnrollment"("sequenceId", "contactId") WHERE "status" = 'ACTIVE';

-- R6 (C2.8 X4): event เดิมให้คะแนนตามกฎเดิมได้ครั้งเดียว · แถวให้คะแนนมือ (ruleId/eventKey = NULL) ไม่ถูกตรวจ · ตารางใหม่
CREATE UNIQUE INDEX "CrmScoreLog_ruleId_eventKey_key" ON "CrmScoreLog"("ruleId", "eventKey") WHERE "ruleId" IS NOT NULL AND "eventKey" IS NOT NULL;

-- R7a (C2.1 X4): ตัวกันวนของกฎ CRM · ตารางเดิม แต่ partial บน "crmContactId" ที่เพิ่งเพิ่มโดยไม่มี default ⇒ แถวเดิมไม่เข้าดัชนี
-- unique(ruleId, customerId, eventKey) ของสมาชิก/บอร์ดงานคงเดิม
CREATE UNIQUE INDEX "AutomationRun_ruleId_crmContactId_eventKey_key" ON "AutomationRun"("ruleId", "crmContactId", "eventKey") WHERE "crmContactId" IS NOT NULL;
