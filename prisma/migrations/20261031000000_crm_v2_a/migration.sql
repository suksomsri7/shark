-- crm_v2_a — CRM v2 ใบ C1.1 (migration แรกของ RUN CRM v2 · 1 ใน 3: a=C1.1 · b=C2.0 · c=C3.0 ตาม RESOLUTIONS R-C.1)
-- สร้างด้วย `bash scripts/iso.sh bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script`
-- (ฐาน QC ตรงกับ 143 migration เดิมพอดี — diff ก่อนแก้สคีมา = "empty migration") แล้วแก้มือเพียงอย่างเดียว:
--   ย้าย DROP INDEX สองบรรทัดของ unique เดิม MemberSection/MemberField (systemId, key) จากต้นไฟล์ไปไว้ "หลัง"
--   CREATE UNIQUE INDEX (systemId, objectKey, key) ของทั้งสองตาราง (MASTER-PLAN §6 แถว C1.1: ADD COLUMN → CREATE UNIQUE → DROP)
-- additive ล้วน: CREATE TYPE · ALTER TYPE … ADD VALUE · CREATE TABLE · CREATE [UNIQUE] INDEX · ADD COLUMN (nullable/มี default)
--   · ADD CONSTRAINT (FK) เฉพาะบนตารางใหม่ · + DROP INDEX 2 ตัวข้างต้น (ไม่มีโค้ดใช้ selector systemId_key ของสองตารางนี้)
-- 🔴 ไม่มีคอลัมน์ไหนใช้ค่า enum ที่เพิ่งเพิ่มด้วย ADD VALUE เป็น default (Postgres ห้ามใช้ในทรานแซกชันเดียวกัน)
-- 🔴 ห้ามใส่ unique AccountContact(systemId, partyId) — prod อาจมีแถวซ้ำอยู่แล้ว (ผู้คุมงาน · หนี้ C6.1)

-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURE');

-- CreateEnum
CREATE TYPE "CrmScoreBand" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "CrmContactRole" AS ENUM ('DECISION_MAKER', 'INFLUENCER', 'COORDINATOR', 'BILLING', 'TECHNICAL', 'END_USER', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmForecastCategory" AS ENUM ('PIPELINE', 'BEST_CASE', 'COMMIT', 'OMITTED');

-- CreateEnum
CREATE TYPE "CrmDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CrmActivitySource" AS ENUM ('MANUAL', 'AUTO', 'EMAIL', 'CHAT', 'CALENDAR', 'PORTAL', 'WEB', 'API', 'RULE');

-- CreateEnum
CREATE TYPE "CrmPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "CrmCompanySize" AS ENUM ('MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "CrmPipelineKind" AS ENUM ('SALES', 'RENEWAL', 'SERVICE');

-- CreateEnum
CREATE TYPE "CrmVisibility" AS ENUM ('OWN', 'TEAM', 'ALL');

-- CreateEnum
CREATE TYPE "CustomParent" AS ENUM ('CUSTOMER', 'CONTACT', 'COMPANY', 'DEAL', 'NONE');

-- CreateEnum
CREATE TYPE "CustomRecordType" AS ENUM ('CONTACT', 'COMPANY', 'DEAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MemberAddressOwner" AS ENUM ('CUSTOMER', 'CONTACT', 'COMPANY');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('LEAD', 'MEMBER');

-- AlterEnum
ALTER TYPE "AutomationScope" ADD VALUE 'CRM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CrmActivityType" ADD VALUE 'CHAT';
ALTER TYPE "CrmActivityType" ADD VALUE 'SMS';
ALTER TYPE "CrmActivityType" ADD VALUE 'WHATSAPP';
ALTER TYPE "CrmActivityType" ADD VALUE 'VISIT';
ALTER TYPE "CrmActivityType" ADD VALUE 'WEB';
ALTER TYPE "CrmActivityType" ADD VALUE 'PORTAL';

-- AlterEnum
ALTER TYPE "CrmLifecycleStage" ADD VALUE 'CHURNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "KanbanLinkType" ADD VALUE 'DEAL';
ALTER TYPE "KanbanLinkType" ADD VALUE 'COMPANY';
ALTER TYPE "KanbanLinkType" ADD VALUE 'CUSTOM_RECORD';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MemberLookupTarget" ADD VALUE 'CONTACT';
ALTER TYPE "MemberLookupTarget" ADD VALUE 'COMPANY';
ALTER TYPE "MemberLookupTarget" ADD VALUE 'DEAL';
ALTER TYPE "MemberLookupTarget" ADD VALUE 'CUSTOM';

-- AlterEnum
ALTER TYPE "PartyMergeReason" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "crmSystemId" TEXT,
ADD COLUMN     "pipelineId" TEXT;

-- AlterTable
ALTER TABLE "ClinicVisit" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "CrmActivity" ADD COLUMN     "aiNextStep" TEXT,
ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "attendees" JSONB,
ADD COLUMN     "body" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "customRecordId" TEXT,
ADD COLUMN     "direction" "CrmDirection",
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "kanbanCardId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" "CrmPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "recordingFileId" TEXT,
ADD COLUMN     "remindAt" TIMESTAMP(3),
ADD COLUMN     "source" "CrmActivitySource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceRef" TEXT,
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "CrmContact" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedBy" TEXT,
ADD COLUMN     "attributionId" TEXT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "department" TEXT,
ADD COLUMN     "emailBouncedAt" TIMESTAMP(3),
ADD COLUMN     "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "leadStatus" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "lineUserId" TEXT,
ADD COLUMN     "locale" TEXT DEFAULT 'th',
ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "nextActivityAt" TIMESTAMP(3),
ADD COLUMN     "portalAccessAt" TIMESTAMP(3),
ADD COLUMN     "previousEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scoreBand" "CrmScoreBand",
ADD COLUMN     "scoreUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "sourceChannel" TEXT,
ADD COLUMN     "sourceDetail" JSONB,
ADD COLUMN     "sourceKind" "MemberSource",
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "titleTh" TEXT;

-- AlterTable
ALTER TABLE "CrmDeal" ADD COLUMN     "collaboratorUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'THB',
ADD COLUMN     "discountBp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "forecastCategory" "CrmForecastCategory" NOT NULL DEFAULT 'PIPELINE',
ADD COLUMN     "invoiceDocId" TEXT,
ADD COLUMN     "kanbanCardId" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lostReasonId" TEXT,
ADD COLUMN     "nextActivityAt" TIMESTAMP(3),
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "paidSatang" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "pendingApprovalRequestId" TEXT,
ADD COLUMN     "pendingLines" JSONB,
ADD COLUMN     "probabilityOverride" INTEGER,
ADD COLUMN     "reopenedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceDetail" JSONB,
ADD COLUMN     "sourceKind" "MemberSource",
ADD COLUMN     "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stalledAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "wonValueSatang" BIGINT;

-- AlterTable
ALTER TABLE "CrmPipeline" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "autoInvoiceOnWon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoWonOnPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'THB',
ADD COLUMN     "kind" "CrmPipelineKind" NOT NULL DEFAULT 'SALES',
ADD COLUMN     "stageOnQuoteAcceptedId" TEXT,
ADD COLUMN     "stageOnQuoteRejectedId" TEXT,
ADD COLUMN     "teamIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CrmStage" ADD COLUMN     "color" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "requireFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requireLines" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireQuotation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staleDays" INTEGER;

-- AlterTable
ALTER TABLE "MemberActivity" ADD COLUMN     "crmCompanyId" TEXT,
ADD COLUMN     "crmContactId" TEXT,
ADD COLUMN     "dealId" TEXT;

-- AlterTable
ALTER TABLE "MemberAddress" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "ownerType" "MemberAddressOwner" NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "MemberField" ADD COLUMN     "objectKey" TEXT NOT NULL DEFAULT 'customer',
ADD COLUMN     "portalEditable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portalVisible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MemberSavedView" ADD COLUMN     "objectKey" TEXT NOT NULL DEFAULT 'customer',
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "MemberSection" ADD COLUMN     "objectKey" TEXT NOT NULL DEFAULT 'customer';

-- AlterTable
ALTER TABLE "QueueTicket" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "RentalBooking" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "partyId" TEXT;

-- CreateTable
CREATE TABLE "CrmCompany" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "branchCode" TEXT DEFAULT '00000',
    "industry" TEXT,
    "size" "CrmCompanySize",
    "website" TEXT,
    "emailDomain" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "lineOaId" TEXT,
    "lifecycleStage" "CrmLifecycleStage" NOT NULL DEFAULT 'LEAD',
    "score" INTEGER NOT NULL DEFAULT 0,
    "ownerUserId" TEXT,
    "teamId" TEXT,
    "parentCompanyId" TEXT,
    "accountContactId" TEXT,
    "memberCustomerId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "logoFileId" TEXT,
    "annualRevenueSatang" BIGINT,
    "employeeCount" INTEGER,
    "foundedYear" INTEGER,
    "lastActivityAt" TIMESTAMP(3),
    "openDealCount" INTEGER NOT NULL DEFAULT 0,
    "wonValueSatang" BIGINT NOT NULL DEFAULT 0,
    "outstandingSatang" BIGINT NOT NULL DEFAULT 0,
    "mergedIntoId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCompanyContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "CrmContactRole" NOT NULL DEFAULT 'OTHER',
    "jobTitle" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCompanyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDealContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "CrmContactRole" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDealContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDealLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPriceSatang" INTEGER NOT NULL,
    "discountBp" INTEGER NOT NULL DEFAULT 0,
    "vatRateBp" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDealLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDealStageHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "byUserId" TEXT,
    "bySource" "CrmActivitySource" NOT NULL DEFAULT 'MANUAL',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "note" TEXT,

    CONSTRAINT "CrmDealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLostReason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmLostReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmVisibilityPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "role" "Role",
    "teamId" TEXT,
    "pipelineId" TEXT,
    "entity" TEXT NOT NULL,
    "visibility" "CrmVisibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmVisibilityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFileLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmFileLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContactConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "policyVersion" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "CrmContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomObject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelPlural" TEXT NOT NULL,
    "icon" TEXT,
    "parentType" "CustomParent" NOT NULL DEFAULT 'NONE',
    "relation" TEXT NOT NULL DEFAULT 'ONE_TO_MANY',
    "titleFieldKey" TEXT NOT NULL,
    "showAsTab" BOOLEAN NOT NULL DEFAULT true,
    "portalVisible" BOOLEAN NOT NULL DEFAULT false,
    "allowAttachments" BOOLEAN NOT NULL DEFAULT true,
    "allowActivities" BOOLEAN NOT NULL DEFAULT true,
    "unitScoped" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "templateKey" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "parentType" "CustomParent" NOT NULL,
    "parentId" TEXT,
    "partyId" TEXT,
    "title" TEXT NOT NULL,
    "unitId" TEXT,
    "ownerUserId" TEXT,
    "createdById" TEXT,
    "status" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRecordValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordType" "CustomRecordType" NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,4),
    "valueDate" TIMESTAMP(3),
    "valueBool" BOOLEAN,
    "valueOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valueRef" TEXT,
    "valueFileId" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRecordValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRecordValueHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomRecordValueHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadUserId" TEXT,
    "unitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "acceptingLeads" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmCompany_tenantId_idx" ON "CrmCompany"("tenantId");

-- CreateIndex
CREATE INDEX "CrmCompany_systemId_taxId_idx" ON "CrmCompany"("systemId", "taxId");

-- CreateIndex
CREATE INDEX "CrmCompany_systemId_emailDomain_idx" ON "CrmCompany"("systemId", "emailDomain");

-- CreateIndex
CREATE INDEX "CrmCompany_systemId_ownerUserId_idx" ON "CrmCompany"("systemId", "ownerUserId");

-- CreateIndex
CREATE INDEX "CrmCompany_systemId_teamId_idx" ON "CrmCompany"("systemId", "teamId");

-- CreateIndex
CREATE INDEX "CrmCompany_systemId_lifecycleStage_idx" ON "CrmCompany"("systemId", "lifecycleStage");

-- CreateIndex
CREATE INDEX "CrmCompany_systemId_name_idx" ON "CrmCompany"("systemId", "name");

-- CreateIndex
CREATE INDEX "CrmCompany_systemId_accountContactId_idx" ON "CrmCompany"("systemId", "accountContactId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCompany_systemId_partyId_key" ON "CrmCompany"("systemId", "partyId");

-- CreateIndex
CREATE INDEX "CrmCompanyContact_contactId_idx" ON "CrmCompanyContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCompanyContact_companyId_contactId_key" ON "CrmCompanyContact"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "CrmDealContact_contactId_idx" ON "CrmDealContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDealContact_dealId_contactId_key" ON "CrmDealContact"("dealId", "contactId");

-- CreateIndex
CREATE INDEX "CrmDealLine_dealId_sortOrder_idx" ON "CrmDealLine"("dealId", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmDealStageHistory_dealId_enteredAt_idx" ON "CrmDealStageHistory"("dealId", "enteredAt");

-- CreateIndex
CREATE INDEX "CrmDealStageHistory_toStageId_enteredAt_idx" ON "CrmDealStageHistory"("toStageId", "enteredAt");

-- CreateIndex
CREATE INDEX "CrmLostReason_tenantId_idx" ON "CrmLostReason"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLostReason_systemId_key_key" ON "CrmLostReason"("systemId", "key");

-- CreateIndex
CREATE INDEX "CrmVisibilityPolicy_tenantId_idx" ON "CrmVisibilityPolicy"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmVisibilityPolicy_systemId_role_teamId_pipelineId_entity_key" ON "CrmVisibilityPolicy"("systemId", "role", "teamId", "pipelineId", "entity");

-- CreateIndex
CREATE INDEX "CrmFileLink_systemId_entityType_entityId_idx" ON "CrmFileLink"("systemId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CrmFileLink_tenantId_idx" ON "CrmFileLink"("tenantId");

-- CreateIndex
CREATE INDEX "CrmContactConsent_contactId_channel_createdAt_idx" ON "CrmContactConsent"("contactId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "CrmContactConsent_tenantId_idx" ON "CrmContactConsent"("tenantId");

-- CreateIndex
CREATE INDEX "CustomObject_tenantId_idx" ON "CustomObject"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomObject_systemId_key_key" ON "CustomObject"("systemId", "key");

-- CreateIndex
CREATE INDEX "CustomRecord_objectId_parentId_idx" ON "CustomRecord"("objectId", "parentId");

-- CreateIndex
CREATE INDEX "CustomRecord_objectId_title_idx" ON "CustomRecord"("objectId", "title");

-- CreateIndex
CREATE INDEX "CustomRecord_partyId_idx" ON "CustomRecord"("partyId");

-- CreateIndex
CREATE INDEX "CustomRecord_objectId_updatedAt_idx" ON "CustomRecord"("objectId", "updatedAt");

-- CreateIndex
CREATE INDEX "CustomRecord_tenantId_idx" ON "CustomRecord"("tenantId");

-- CreateIndex
CREATE INDEX "CustomRecordValue_fieldId_valueText_idx" ON "CustomRecordValue"("fieldId", "valueText");

-- CreateIndex
CREATE INDEX "CustomRecordValue_fieldId_valueNumber_idx" ON "CustomRecordValue"("fieldId", "valueNumber");

-- CreateIndex
CREATE INDEX "CustomRecordValue_fieldId_valueDate_idx" ON "CustomRecordValue"("fieldId", "valueDate");

-- CreateIndex
CREATE INDEX "CustomRecordValue_fieldId_valueRef_idx" ON "CustomRecordValue"("fieldId", "valueRef");

-- CreateIndex
CREATE INDEX "CustomRecordValue_tenantId_idx" ON "CustomRecordValue"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRecordValue_recordId_fieldId_key" ON "CustomRecordValue"("recordId", "fieldId");

-- CreateIndex
CREATE INDEX "CustomRecordValueHistory_recordId_fieldId_createdAt_idx" ON "CustomRecordValueHistory"("recordId", "fieldId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomRecordValueHistory_tenantId_idx" ON "CustomRecordValueHistory"("tenantId");

-- CreateIndex
CREATE INDEX "Team_tenantId_archivedAt_idx" ON "Team"("tenantId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Team_tenantId_name_key" ON "Team"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX "TeamMember_tenantId_idx" ON "TeamMember"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "Appointment_partyId_idx" ON "Appointment"("partyId");

-- CreateIndex
CREATE INDEX "ClinicVisit_partyId_idx" ON "ClinicVisit"("partyId");

-- CreateIndex
CREATE INDEX "CrmActivity_systemId_ownerUserId_startAt_idx" ON "CrmActivity"("systemId", "ownerUserId", "startAt");

-- CreateIndex
CREATE INDEX "CrmActivity_systemId_dueAt_doneAt_idx" ON "CrmActivity"("systemId", "dueAt", "doneAt");

-- CreateIndex
CREATE INDEX "CrmActivity_companyId_idx" ON "CrmActivity"("companyId");

-- CreateIndex
CREATE INDEX "CrmActivity_systemId_type_startAt_idx" ON "CrmActivity"("systemId", "type", "startAt");

-- CreateIndex
CREATE INDEX "CrmActivity_customRecordId_idx" ON "CrmActivity"("customRecordId");

-- CreateIndex
CREATE INDEX "CrmContact_systemId_ownerUserId_idx" ON "CrmContact"("systemId", "ownerUserId");

-- CreateIndex
CREATE INDEX "CrmContact_systemId_teamId_idx" ON "CrmContact"("systemId", "teamId");

-- CreateIndex
CREATE INDEX "CrmContact_systemId_score_idx" ON "CrmContact"("systemId", "score");

-- CreateIndex
CREATE INDEX "CrmContact_systemId_companyId_idx" ON "CrmContact"("systemId", "companyId");

-- CreateIndex
CREATE INDEX "CrmContact_systemId_leadStatus_idx" ON "CrmContact"("systemId", "leadStatus");

-- CreateIndex
CREATE INDEX "CrmContact_systemId_lastActivityAt_idx" ON "CrmContact"("systemId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "CrmContact_tenantId_email_idx" ON "CrmContact"("tenantId", "email");

-- CreateIndex
CREATE INDEX "CrmContact_systemId_mergedIntoId_idx" ON "CrmContact"("systemId", "mergedIntoId");

-- CreateIndex
CREATE INDEX "CrmDeal_systemId_ownerUserId_kind_expectedCloseAt_idx" ON "CrmDeal"("systemId", "ownerUserId", "kind", "expectedCloseAt");

-- CreateIndex
CREATE INDEX "CrmDeal_systemId_teamId_kind_idx" ON "CrmDeal"("systemId", "teamId", "kind");

-- CreateIndex
CREATE INDEX "CrmDeal_systemId_expectedCloseAt_idx" ON "CrmDeal"("systemId", "expectedCloseAt");

-- CreateIndex
CREATE INDEX "CrmDeal_systemId_stalledAt_idx" ON "CrmDeal"("systemId", "stalledAt");

-- CreateIndex
CREATE INDEX "CrmDeal_systemId_companyId_idx" ON "CrmDeal"("systemId", "companyId");

-- CreateIndex
CREATE INDEX "CrmDeal_systemId_forecastCategory_expectedCloseAt_idx" ON "CrmDeal"("systemId", "forecastCategory", "expectedCloseAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberField_systemId_objectKey_key_key" ON "MemberField"("systemId", "objectKey", "key");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSection_systemId_objectKey_key_key" ON "MemberSection"("systemId", "objectKey", "key");

-- DropIndex (ย้ายมาไว้ตรงนี้ด้วยมือ — ต้องอยู่หลัง CREATE UNIQUE ใหม่ทั้งสองตาราง · ดูหัวไฟล์)
DROP INDEX "MemberField_systemId_key_key";

-- DropIndex
DROP INDEX "MemberSection_systemId_key_key";

-- CreateIndex
CREATE INDEX "QueueTicket_partyId_idx" ON "QueueTicket"("partyId");

-- CreateIndex
CREATE INDEX "RentalBooking_partyId_idx" ON "RentalBooking"("partyId");

-- CreateIndex
CREATE INDEX "ShopOrder_partyId_idx" ON "ShopOrder"("partyId");

-- AddForeignKey
ALTER TABLE "CrmCompanyContact" ADD CONSTRAINT "CrmCompanyContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CrmCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCompanyContact" ADD CONSTRAINT "CrmCompanyContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealContact" ADD CONSTRAINT "CrmDealContact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealContact" ADD CONSTRAINT "CrmDealContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealLine" ADD CONSTRAINT "CrmDealLine_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealStageHistory" ADD CONSTRAINT "CrmDealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRecord" ADD CONSTRAINT "CustomRecord_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "CustomObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRecordValue" ADD CONSTRAINT "CustomRecordValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "MemberField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

