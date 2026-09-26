-- crm_v2_c — CRM v2 ใบ C3.0 (migration ที่ 3 จาก 3 · a=C1.1 · b=C2.0 · c=C3.0 ตาม RESOLUTIONS R-C.1) · ตารางของทั้งเฟส C3
-- สร้างด้วย `bash scripts/iso.sh env QC_ENV_FILE=.env.qc2 bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script`
-- (QC2 ตรงกับ migration เดิมทุกตัวพอดี — diff ก่อนแก้สคีมา = "empty migration") แล้วแก้มือ 2 อย่างเท่านั้น:
--   1) "CrmCommissionRule"."productIds" + "CrmPortalAccess"."loginMethods" เติม NOT NULL (Prisma ออก list เป็น nullable เสมอ · ตารางใหม่ ไม่มีแถวเดิม)
--   2) ท้ายไฟล์: partial unique index 1 ตัวบน "HrPayAdjustment"."crmCommissionId" (Prisma schema ไม่รองรับ WHERE)
-- additive ล้วน: CREATE TYPE 6 · ADD COLUMN 1 · CREATE TABLE 6 · CREATE [UNIQUE] INDEX · ADD CONSTRAINT (FK) เฉพาะบนตารางใหม่
--   · ไม่มี DROP/RENAME/ALTER COLUMN/CHECK/คำสั่งข้อมูล/trigger/function · ไม่มี ALTER TYPE … ADD VALUE (enum ของเฟส C3 ใหม่ทั้งหมด)
-- 🔴 แตะตารางเดิมตัวเดียว = "HrPayAdjustment": คอลัมน์ nullable ไม่มี default (ไม่ rewrite ตาราง) + partial unique
--    WHERE "crmCommissionId" IS NOT NULL ⇒ แถวเดิมทุกแถวเป็น NULL = ดัชนีว่าง ล้มบน prod ไม่ได้ · ไม่มี FK (HR ไม่พึ่ง CRM)
-- 🔴 "CrmCommission"."refId" NOT NULL DEFAULT '' — unique (dealId, ruleId, userId, refId) กันจ่ายค่าคอมซ้ำได้จริง (NULL ไม่ถูกกันซ้ำ)
-- 🔴 ไม่มี FK "CrmCommission"."dealId" → "CrmDeal" (ลบดีลห้ามล้างประวัติค่าคอม) · FK มีเฉพาะสาย portal (ตารางใหม่ · cascade ตาม PDPA erase)
-- 🔴 เงินเป็น BIGINT (มติ C28) · PortalSession เก็บ "ipHash" ไม่เก็บ IP ดิบ (X8) · token ทุกตัวเก็บเป็น hash (X7)
-- 🔴 ไม่แตะ CustomerSession (R-C.5 → ตารางพี่น้อง PortalSession) · ReportDef (R-E.6) · MemberSavedView · PosSale (C29)
--    · AccountContact / CrmCompanyContact (unique บนแถว prod เดิม → C6.1)

-- CreateEnum
CREATE TYPE "CrmQuotaOwner" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "CrmCommissionBasis" AS ENUM ('PAID', 'WON');

-- CreateEnum
CREATE TYPE "CrmCommissionKind" AS ENUM ('PCT', 'FIXED', 'TIERED');

-- CreateEnum
CREATE TYPE "CrmCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REVERSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CrmPortalRole" AS ENUM ('VIEW', 'APPROVE', 'PAY', 'ADMIN');

-- CreateEnum
CREATE TYPE "CrmPortalRequestKind" AS ENUM ('ISSUE', 'CONTACT_CHANGE', 'PROFILE_CHANGE', 'DOCUMENT_REQUEST');

-- AlterTable
ALTER TABLE "HrPayAdjustment" ADD COLUMN     "crmCommissionId" TEXT;

-- CreateTable
CREATE TABLE "CrmQuota" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "ownerType" "CrmQuotaOwner" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "targetSatang" BIGINT NOT NULL,
    "targetDeals" INTEGER,
    "targetActivities" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCommissionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "CrmCommissionBasis" NOT NULL DEFAULT 'PAID',
    "kind" "CrmCommissionKind" NOT NULL,
    "config" JSONB NOT NULL,
    "pipelineId" TEXT,
    "teamId" TEXT,
    "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "minDealSatang" BIGINT,
    "splitCollaboratorsBp" INTEGER NOT NULL DEFAULT 0,
    "payoutDelayDays" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCommission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountSatang" BIGINT NOT NULL,
    "basisSatang" BIGINT NOT NULL,
    "basis" "CrmCommissionBasis" NOT NULL,
    "status" "CrmCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "periodKey" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "hrPayAdjustmentId" TEXT,
    "refType" TEXT,
    "refId" TEXT NOT NULL DEFAULT '',
    "reversedOfId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CrmCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPortalAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "CrmPortalRole" NOT NULL DEFAULT 'VIEW',
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "loginMethods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),

    CONSTRAINT "CrmPortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPortalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" "CrmPortalRequestKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "kanbanCardId" TEXT,
    "approvalRequestId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmPortalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalAccessId" TEXT NOT NULL,
    "crmContactId" TEXT NOT NULL,
    "crmSystemId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmQuota_systemId_ownerType_ownerId_periodKey_key" ON "CrmQuota"("systemId", "ownerType", "ownerId", "periodKey");

-- CreateIndex
CREATE INDEX "CrmCommissionRule_systemId_active_idx" ON "CrmCommissionRule"("systemId", "active");

-- CreateIndex
CREATE INDEX "CrmCommission_userId_periodKey_idx" ON "CrmCommission"("userId", "periodKey");

-- CreateIndex
CREATE INDEX "CrmCommission_systemId_status_idx" ON "CrmCommission"("systemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCommission_dealId_ruleId_userId_refId_key" ON "CrmCommission"("dealId", "ruleId", "userId", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPortalAccess_inviteTokenHash_key" ON "CrmPortalAccess"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "CrmPortalAccess_contactId_idx" ON "CrmPortalAccess"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPortalAccess_companyId_contactId_key" ON "CrmPortalAccess"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "CrmPortalRequest_companyId_status_idx" ON "CrmPortalRequest"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalSession_portalAccessId_idx" ON "PortalSession"("portalAccessId");

-- CreateIndex
CREATE INDEX "PortalSession_tenantId_expiresAt_idx" ON "PortalSession"("tenantId", "expiresAt");

-- AddForeignKey
ALTER TABLE "CrmPortalAccess" ADD CONSTRAINT "CrmPortalAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CrmCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPortalAccess" ADD CONSTRAINT "CrmPortalAccess_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPortalRequest" ADD CONSTRAINT "CrmPortalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CrmCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPortalRequest" ADD CONSTRAINT "CrmPortalRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "CrmPortalAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ partial unique index (ประกาศเฉพาะที่นี่ — Prisma schema ไม่รองรับ WHERE · ดูคอมเมนต์ใน prisma/schema/payroll.prisma) ═══

-- C3.3: ค่าคอม 1 แถวจ่ายผ่านรายการปรับเงินเดือนได้ 1 รายการเท่านั้น · ตารางเดิม แต่ partial บน "crmCommissionId" ที่เพิ่งเพิ่ม
-- โดยไม่มี default ⇒ แถวเดิมไม่เข้าดัชนี (สแกนตารางครั้งเดียวตอนสร้าง · ล้มไม่ได้)
CREATE UNIQUE INDEX "HrPayAdjustment_crmCommissionId_key" ON "HrPayAdjustment"("crmCommissionId") WHERE "crmCommissionId" IS NOT NULL;
