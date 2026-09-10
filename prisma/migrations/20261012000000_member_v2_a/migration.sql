-- M1.1 — ระบบสมาชิก v2 ชุด A (`member_v2_a`) · พิมพ์เขียว docs/modules/06-member-v2.md §4
--
-- 🔴 additive ล้วน — ตรวจด้วยตาแล้วทั้งไฟล์: ไม่มี DROP TABLE / DROP COLUMN / DROP TYPE
--    ไม่มี ALTER COLUMN ... TYPE และไม่มี SET NOT NULL · คอลัมน์ใหม่ทุกตัว nullable หรือมี DEFAULT
--    ⇒ แถวเดิมทุกแถวของทุกร้านทำงานเหมือนเดิมเป๊ะ (โค้ด v1 ไม่รู้จักคอลัมน์ใหม่เลย)
--
-- สิ่งที่เพิ่ม
--   • enum ใหม่ 13 ชุด (TagColor · Member* · Tier* · Privacy* · AutomationScope)
--   • ค่า enum เดิม 2 ตัว: AiCreditSource.MEMBER_ASSIST (ผู้ช่วย AI ของโมดูลสมาชิก)
--     และ SystemType.BOOKING (ชุดข้อมูล QC ต้องผูก AppSystem ประเภทจอง — ดู wo-notes M1.1 ข้อตัดสิน 3)
--   • ตารางใหม่ 18 ตาราง (ส่วน/ฟิลด์/ค่า/ประวัติ · ที่อยู่ · ยินยอม/PDPA · มุมมอง/แท็ก ·
--     ตัวตนหลายช่องทาง D18 · ที่มา D10 · ระดับสมาชิก D1)
--   • คอลัมน์เพิ่มในตารางเดิม: Customer(29) · MemberActivity · AutomationRule · PosSale ·
--     Appointment · Coupon · MktCampaign · MktRecipient · ChatContact
--
-- 🔴 จุดที่ "เขียนมือ" (ต่างจากผลของ `prisma migrate diff`) มีจุดเดียว:
--    unique ของ `Customer(tenantId, referralCode)` ถูกเปลี่ยนเป็น **partial unique index**
--    (`WHERE "referralCode" IS NOT NULL`) — สมาชิกเดิมหลายล้านคนยังไม่มีโค้ดแนะนำเพื่อน = NULL
--    ถ้าเป็น unique เต็มใบ NULL หลายแถวยังผ่านตามมาตรฐาน Postgres ก็จริง แต่เจตนาของสัญญาคือ
--    "โค้ดต้องไม่ซ้ำเฉพาะเมื่อมีค่า" จึงประกาศให้ตรงเจตนา (แบบเดียวกับ KanbanBoard_tenantId_emailKey_key ของ K3.9)
--
-- 🔴 `ALTER TYPE ... ADD VALUE` 2 บรรทัดข้างล่างต้องไม่ถูก "ใช้งาน" ใน migration เดียวกัน
--    (Postgres ห้ามใช้ค่า enum ใหม่ใน transaction ที่เพิ่งเพิ่มมันเข้าไป) — ในไฟล์นี้ไม่มีการใช้

-- CreateEnum
CREATE TYPE "AutomationScope" AS ENUM ('KANBAN', 'MEMBER_TIER', 'MEMBER_JOURNEY');

-- CreateEnum
CREATE TYPE "TagColor" AS ENUM ('SLATE', 'BLUE', 'GREEN', 'AMBER', 'RED', 'PURPLE');

-- CreateEnum
CREATE TYPE "MemberGender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED', 'MERGED');

-- CreateEnum
CREATE TYPE "MemberSource" AS ENUM ('WALK_IN', 'POS', 'BOOKING', 'LINE_OA', 'LIFF', 'WEB_FORM', 'CHAT', 'REFERRAL', 'IMPORT', 'CRM', 'CAMPAIGN', 'API', 'MARKETPLACE', 'APP', 'OTHER');

-- CreateEnum
CREATE TYPE "MemberLinkMethod" AS ENUM ('PHONE', 'EMAIL', 'CHANNEL_ID', 'MANUAL', 'MERGE', 'ORDER');

-- CreateEnum
CREATE TYPE "MemberFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'MONEY', 'DATE', 'DATETIME', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'FILE', 'LOOKUP');

-- CreateEnum
CREATE TYPE "MemberLookupTarget" AS ENUM ('PRODUCT', 'SERVICE', 'EMPLOYEE', 'UNIT', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "MemberConsentSource" AS ENUM ('SIGNUP_FORM', 'LIFF', 'STAFF', 'IMPORT', 'API', 'CUSTOMER_SELF');

-- CreateEnum
CREATE TYPE "TierChangeReason" AS ENUM ('RULE_UPGRADE', 'RULE_DOWNGRADE', 'RULE_KEEP', 'MANUAL', 'PAID_PLAN', 'PLAN_EXPIRED', 'MERGE', 'INITIAL');

-- CreateEnum
CREATE TYPE "TierBenefitType" AS ENUM ('DISCOUNT_PCT', 'DISCOUNT_FIXED', 'POINT_MULTIPLIER', 'WELCOME_VOUCHER', 'BIRTHDAY_GIFT', 'FREE_SERVICE', 'PRIORITY_BOOKING', 'NO_POINT_EXPIRY', 'CANCEL_FEE_DISCOUNT', 'EXCLUSIVE_ITEMS');

-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('EXPORT', 'DELETE');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DONE', 'REJECTED');

-- AlterEnum
ALTER TYPE "AiCreditSource" ADD VALUE 'MEMBER_ASSIST';

-- AlterEnum
ALTER TYPE "SystemType" ADD VALUE 'BOOKING';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "stampEventId" TEXT;

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "journeyStats" JSONB,
ADD COLUMN     "memberSystemId" TEXT,
ADD COLUMN     "scope" "AutomationScope" NOT NULL DEFAULT 'KANBAN',
ADD COLUMN     "tierDefId" TEXT;

-- AlterTable
ALTER TABLE "ChatContact" ADD COLUMN     "linkedBy" "MemberLinkMethod";

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "perMemberCode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saveToWallet" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stackWithVoucher" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "avatarFileId" TEXT,
ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" "MemberGender",
ADD COLUMN     "homeUnitId" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "lineUserId" TEXT,
ADD COLUMN     "locale" TEXT DEFAULT 'th',
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "preferredChannel" TEXT,
ADD COLUMN     "privacyVersion" INTEGER,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "reviewAvg" DECIMAL(3,2),
ADD COLUMN     "source" "MemberSource",
ADD COLUMN     "sourceChannel" TEXT,
ADD COLUMN     "sourceDetail" JSONB,
ADD COLUMN     "spent12mSatang" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tierDefId" TEXT,
ADD COLUMN     "tierPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tierReviewAt" TIMESTAMP(3),
ADD COLUMN     "tierSince" TIMESTAMP(3),
ADD COLUMN     "titleTh" TEXT,
ADD COLUMN     "visits12m" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MemberActivity" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "data" JSONB;

-- AlterTable
ALTER TABLE "MktCampaign" ADD COLUMN     "attachVoucherTemplateId" TEXT,
ADD COLUMN     "holdoutPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "journeyId" TEXT,
ADD COLUMN     "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "segmentId" TEXT,
ADD COLUMN     "stats" JSONB,
ADD COLUMN     "variantB" JSONB;

-- AlterTable
ALTER TABLE "MktRecipient" ADD COLUMN     "holdout" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "saleSatang" BIGINT,
ADD COLUMN     "usedAt" TIMESTAMP(3),
ADD COLUMN     "variant" TEXT;

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "attributionId" TEXT,
ADD COLUMN     "giftCardTxnId" TEXT,
ADD COLUMN     "stampEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tierDiscountSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voucherUseIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MemberSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "columns" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "MemberFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" JSONB,
    "unique" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "showInList" BOOLEAN NOT NULL DEFAULT false,
    "showOnCard" BOOLEAN NOT NULL DEFAULT false,
    "customerEditable" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "trackHistory" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFieldValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,4),
    "valueDate" TIMESTAMP(3),
    "valueBool" BOOLEAN,
    "valueOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valueRef" TEXT,
    "valueFileId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFieldValueHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changedById" TEXT,
    "changedVia" "MemberConsentSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberFieldValueHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAddress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'HOME',
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "subdistrict" TEXT,
    "district" TEXT,
    "province" TEXT,
    "postcode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'TH',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "source" "MemberConsentSource" NOT NULL,
    "policyVersion" INTEGER,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPrivacyPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPrivacyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSensitivePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "roles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "hrPositions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hrDepartments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sameUnitOnly" BOOLEAN NOT NULL DEFAULT false,
    "logAccess" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberSensitivePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAccessLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hrEmployeeId" TEXT,
    "hrPosition" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "page" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPrivacyRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedVia" "MemberConsentSource" NOT NULL,
    "approvalRequestId" TEXT,
    "fileId" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSavedView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'PRIVATE',
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "columns" JSONB NOT NULL DEFAULT '[]',
    "sort" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" "TagColor",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberChannelIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "contactId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "linkedBy" "MemberLinkMethod" NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberChannelIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "MemberSource" NOT NULL,
    "campaignId" TEXT,
    "unitId" TEXT,
    "target" TEXT NOT NULL,
    "utm" JSONB,
    "qrFileId" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "signups" INTEGER NOT NULL DEFAULT 0,
    "firstPurchases" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcquisitionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAttribution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "touch" TEXT NOT NULL,
    "source" "MemberSource" NOT NULL,
    "linkId" TEXT,
    "campaignId" TEXT,
    "staffUserId" TEXT,
    "referrerCustomerId" TEXT,
    "unitId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTierDef" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" "TagColor" NOT NULL DEFAULT 'SLATE',
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "paidPlanId" TEXT,
    "legacyTier" "MemberTier",
    "keepRuleId" TEXT,
    "upgradeRuleId" TEXT,
    "reviewCron" TEXT DEFAULT '0 3 1 * *',
    "graceDays" INTEGER NOT NULL DEFAULT 30,
    "notifyBeforeDays" INTEGER NOT NULL DEFAULT 30,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberTierDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTierBenefit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tierDefId" TEXT NOT NULL,
    "type" "TierBenefitType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberTierBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTierHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromTierDefId" TEXT,
    "toTierDefId" TEXT,
    "reason" "TierChangeReason" NOT NULL,
    "ruleId" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "byUserId" TEXT,
    "approvalRequestId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberTierHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberSection_tenantId_idx" ON "MemberSection"("tenantId");

-- CreateIndex
CREATE INDEX "MemberSection_systemId_sortOrder_idx" ON "MemberSection"("systemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSection_systemId_key_key" ON "MemberSection"("systemId", "key");

-- CreateIndex
CREATE INDEX "MemberField_tenantId_idx" ON "MemberField"("tenantId");

-- CreateIndex
CREATE INDEX "MemberField_systemId_sectionId_sortOrder_idx" ON "MemberField"("systemId", "sectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MemberField_systemId_key_key" ON "MemberField"("systemId", "key");

-- CreateIndex
CREATE INDEX "MemberFieldValue_tenantId_idx" ON "MemberFieldValue"("tenantId");

-- CreateIndex
CREATE INDEX "MemberFieldValue_fieldId_valueText_idx" ON "MemberFieldValue"("fieldId", "valueText");

-- CreateIndex
CREATE INDEX "MemberFieldValue_fieldId_valueNumber_idx" ON "MemberFieldValue"("fieldId", "valueNumber");

-- CreateIndex
CREATE INDEX "MemberFieldValue_fieldId_valueDate_idx" ON "MemberFieldValue"("fieldId", "valueDate");

-- CreateIndex
CREATE UNIQUE INDEX "MemberFieldValue_customerId_fieldId_key" ON "MemberFieldValue"("customerId", "fieldId");

-- CreateIndex
CREATE INDEX "MemberFieldValueHistory_tenantId_idx" ON "MemberFieldValueHistory"("tenantId");

-- CreateIndex
CREATE INDEX "MemberFieldValueHistory_customerId_fieldId_createdAt_idx" ON "MemberFieldValueHistory"("customerId", "fieldId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberAddress_tenantId_idx" ON "MemberAddress"("tenantId");

-- CreateIndex
CREATE INDEX "MemberAddress_customerId_idx" ON "MemberAddress"("customerId");

-- CreateIndex
CREATE INDEX "MemberConsent_tenantId_idx" ON "MemberConsent"("tenantId");

-- CreateIndex
CREATE INDEX "MemberConsent_tenantId_channel_granted_idx" ON "MemberConsent"("tenantId", "channel", "granted");

-- CreateIndex
CREATE UNIQUE INDEX "MemberConsent_customerId_channel_key" ON "MemberConsent"("customerId", "channel");

-- CreateIndex
CREATE INDEX "MemberPrivacyPolicy_tenantId_idx" ON "MemberPrivacyPolicy"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPrivacyPolicy_systemId_version_key" ON "MemberPrivacyPolicy"("systemId", "version");

-- CreateIndex
CREATE INDEX "MemberSensitivePolicy_tenantId_idx" ON "MemberSensitivePolicy"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSensitivePolicy_systemId_targetType_targetId_key" ON "MemberSensitivePolicy"("systemId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "MemberAccessLog_tenantId_idx" ON "MemberAccessLog"("tenantId");

-- CreateIndex
CREATE INDEX "MemberAccessLog_customerId_createdAt_idx" ON "MemberAccessLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberAccessLog_userId_createdAt_idx" ON "MemberAccessLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberPrivacyRequest_tenantId_status_idx" ON "MemberPrivacyRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MemberPrivacyRequest_customerId_createdAt_idx" ON "MemberPrivacyRequest"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberSavedView_tenantId_idx" ON "MemberSavedView"("tenantId");

-- CreateIndex
CREATE INDEX "MemberSavedView_systemId_scope_idx" ON "MemberSavedView"("systemId", "scope");

-- CreateIndex
CREATE INDEX "MemberTag_tenantId_idx" ON "MemberTag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTag_systemId_name_key" ON "MemberTag"("systemId", "name");

-- CreateIndex
CREATE INDEX "MemberChannelIdentity_customerId_idx" ON "MemberChannelIdentity"("customerId");

-- CreateIndex
CREATE INDEX "MemberChannelIdentity_tenantId_channel_idx" ON "MemberChannelIdentity"("tenantId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "MemberChannelIdentity_tenantId_channel_externalId_key" ON "MemberChannelIdentity"("tenantId", "channel", "externalId");

-- CreateIndex
CREATE INDEX "AcquisitionLink_systemId_active_idx" ON "AcquisitionLink"("systemId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AcquisitionLink_tenantId_code_key" ON "AcquisitionLink"("tenantId", "code");

-- CreateIndex
CREATE INDEX "MemberAttribution_tenantId_source_idx" ON "MemberAttribution"("tenantId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAttribution_customerId_touch_key" ON "MemberAttribution"("customerId", "touch");

-- CreateIndex
CREATE INDEX "MemberTierDef_tenantId_idx" ON "MemberTierDef"("tenantId");

-- CreateIndex
CREATE INDEX "MemberTierDef_systemId_sortOrder_idx" ON "MemberTierDef"("systemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTierDef_systemId_key_key" ON "MemberTierDef"("systemId", "key");

-- CreateIndex
CREATE INDEX "MemberTierBenefit_tierDefId_idx" ON "MemberTierBenefit"("tierDefId");

-- CreateIndex
CREATE INDEX "MemberTierBenefit_tenantId_idx" ON "MemberTierBenefit"("tenantId");

-- CreateIndex
CREATE INDEX "MemberTierHistory_customerId_createdAt_idx" ON "MemberTierHistory"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberTierHistory_tenantId_reason_idx" ON "MemberTierHistory"("tenantId", "reason");

-- CreateIndex
CREATE INDEX "Customer_tenantId_tierDefId_idx" ON "Customer"("tenantId", "tierDefId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_source_idx" ON "Customer"("tenantId", "source");

-- CreateIndex
CREATE INDEX "Customer_tenantId_lastActivityAt_idx" ON "Customer"("tenantId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Customer_tenantId_birthDate_idx" ON "Customer"("tenantId", "birthDate");

-- CreateIndex
-- 🔴 เขียนมือ (ไม่ได้มาจาก `prisma migrate diff`): เติม `WHERE "referralCode" IS NOT NULL`
--    ให้เป็น **partial unique index** · ชื่อ index ต้องเป็นชื่อเดียวกับที่ Prisma ตั้งจาก
--    `@@unique([tenantId, referralCode])` เป๊ะ ไม่งั้น migrate diff จะเห็น drift ทุกครั้ง
CREATE UNIQUE INDEX "Customer_tenantId_referralCode_key" ON "Customer"("tenantId", "referralCode") WHERE "referralCode" IS NOT NULL;

-- CreateIndex
CREATE INDEX "MemberActivity_customerId_module_createdAt_idx" ON "MemberActivity"("customerId", "module", "createdAt");

