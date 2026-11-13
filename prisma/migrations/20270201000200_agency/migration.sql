-- TRIPS A1.1 · migration agency — ชั้นเอเจนซี่ 26 ตาราง (agency.prisma · 5 ตาราง global + 21 tenant) + ผู้ให้บริการ 4 ตาราง (supplier.prisma) + TripPassengerLink
--   + คอลัมน์ nullable บน TripPickupZone · TripBooking · TripMoneyEvent · SellBasket + SQL มือท้ายไฟล์ (CHECK · NND · partial · trigger สมุด)
-- ใบสั่ง ledger/trips-briefs/A1.1.md §2 §3 + มติผู้คุม R1–R11 · ส่วน CREATE TABLE/INDEX/ALTER ADD COLUMN ตรวจทีละบรรทัดเทียบ
--   `prisma migrate diff --from-schema <schema 4db90ad9e> --to-schema prisma/schema --script` (schema→schema · ไม่ใช้ migrate dev/db pull/ฐานข้อมูล · มติ R11)
-- additive ล้วน: ไม่มี DROP/RENAME/ALTER TYPE/ALTER COLUMN/SET NOT NULL/UPDATE/DELETE/INSERT · ไม่มี enum ใหม่ · ไม่มี FK เข้า/ออกตารางใหม่และ 4 ตารางที่แตะ
-- ตารางเดิมแตะได้แค่ ADD COLUMN (nullable · metadata อย่างเดียว) + ADD CONSTRAINT CHECK (แถวเดิมเป็น NULL ผ่าน) + CREATE INDEX
-- BIGINT เฉพาะยอดรวมจากหลายการจอง (มติ R4) · ที่เหลือ int4
-- lock_timeout: รอล็อกไม่เกิน 5 วิ แล้วล้ม (ไม่ต่อคิวขวางผู้เขียนอื่น) — ล้มกลางทาง: `prisma migrate resolve --rolled-back 20270201000200_agency` ก่อนลองใหม่ (ผู้คุม)
-- 🔴 `prisma migrate diff` (ฐาน → schema) เสนอ DROP INDEX ของ NULLS NOT DISTINCT 5 ชื่อเสมอ — ห้ามรับ (มติ R7):
--    TripDeparture_productId_optionId_startsAt_key · TripPrice_dims_key · TripLinkStat_unitId_day_channel_linkId_key · AgentRate_dims_key · TripSupplierCost_dims_key

SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "AgentIdentity" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "taxIdHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUser" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLogin" (
    "id" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "activeAgentAccountId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "uaHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLoginCode" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "identityId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'AGENT',
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tierId" TEXT,
    "partyId" TEXT NOT NULL,
    "crmCompanyId" TEXT,
    "accountContactId" TEXT,
    "unitIds" TEXT[],
    "legalName" TEXT NOT NULL,
    "payeeType" TEXT NOT NULL,
    "taxIdEnc" TEXT,
    "taxIdLast4" TEXT,
    "branchCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'TH',
    "treaty" BOOLEAN,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "bankAccountEnc" TEXT,
    "bankLast4" TEXT,
    "contact" JSONB,
    "licenceNo" TEXT,
    "licenceExpiry" DATE,
    "logoFileId" TEXT,
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAccountMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedByAgentUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAccountMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentContract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "fileId" TEXT,
    "signedAt" TIMESTAMP(3),
    "signEvidence" JSONB,
    "termsSnapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRateCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerKind" TEXT NOT NULL,
    "tierId" TEXT,
    "agentAccountId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validFrom" DATE,
    "validTo" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "label" JSONB,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "productKind" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionId" TEXT,
    "paxTypeId" TEXT,
    "cabinTypeId" TEXT,
    "mode" TEXT NOT NULL,
    "valueBp" INTEGER,
    "valueMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "minSellMinor" INTEGER,
    "markupCapBp" INTEGER,
    "bookFrom" DATE,
    "bookTo" DATE,
    "travelFrom" DATE,
    "travelTo" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "requestedByAgentUserId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "holdId" TEXT,
    "bookingId" TEXT,
    "productKind" TEXT,
    "productId" TEXT,
    "slotId" TEXT,
    "qty" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "approvalId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "salesUserId" TEXT,
    "productKind" TEXT,
    "productId" TEXT,
    "showBrand" BOOLEAN NOT NULL DEFAULT true,
    "discountBp" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdByAgentUserId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAllotmentBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "productKind" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionId" TEXT,
    "qtyPerSlot" INTEGER NOT NULL,
    "releaseDaysBefore" INTEGER,
    "requestFirst" BOOLEAN,
    "freeSale" BOOLEAN,
    "holdHours" INTEGER,
    "validFrom" DATE,
    "validTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAllotmentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAllotment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "productKind" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "slotDate" DATE NOT NULL,
    "qty" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "held" INTEGER NOT NULL DEFAULT 0,
    "returnedToPublic" INTEGER NOT NULL DEFAULT 0,
    "releaseAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedQty" INTEGER,
    "blockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAllotment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStopSell" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT,
    "productKind" TEXT NOT NULL,
    "slotId" TEXT,
    "productId" TEXT,
    "channel" TEXT,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "liftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentStopSell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWebhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretBox" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveredAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "responseCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMediaAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productKind" TEXT,
    "productId" TEXT,
    "fileId" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "unitId" TEXT,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "bookingKind" TEXT,
    "bookingId" TEXT,
    "statementId" TEXT,
    "settlesStatementId" TEXT,
    "commissionId" TEXT,
    "entitledAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "refEntryId" TEXT,
    "requestId" TEXT,
    "approvalId" TEXT,
    "accountDocId" TEXT,
    "slipId" TEXT,
    "runId" TEXT,
    "whtCertDocId" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentBalance" (
    "agentAccountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "balanceSatang" BIGINT NOT NULL DEFAULT 0,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentBalance_pkey" PRIMARY KEY ("agentAccountId")
);

-- CreateTable
CREATE TABLE "AgentStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "openingSatang" BIGINT NOT NULL DEFAULT 0,
    "salesSatang" BIGINT NOT NULL,
    "passThroughSatang" BIGINT NOT NULL,
    "commissionSatang" BIGINT NOT NULL,
    "commissionVatSatang" BIGINT NOT NULL,
    "whtSatang" BIGINT NOT NULL,
    "cancelledSatang" BIGINT NOT NULL,
    "adjustmentSatang" BIGINT NOT NULL DEFAULT 0,
    "otherSatang" BIGINT NOT NULL DEFAULT 0,
    "paidDuringPeriodSatang" BIGINT NOT NULL,
    "totalSatang" BIGINT NOT NULL,
    "paidSatang" BIGINT NOT NULL DEFAULT 0,
    "whtCertSatang" BIGINT,
    "billingNoteDocId" TEXT,
    "whtCertDocId" TEXT,
    "receiveUnitId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "overdueAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "bookingKind" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingUnitId" TEXT NOT NULL,
    "baseSatang" INTEGER NOT NULL,
    "rateBp" INTEGER,
    "commissionSatang" INTEGER NOT NULL,
    "vatSatang" INTEGER NOT NULL DEFAULT 0,
    "whtMode" TEXT NOT NULL DEFAULT 'NONE',
    "whtRateBp" INTEGER NOT NULL DEFAULT 0,
    "whtSatang" INTEGER,
    "clawbackSatang" INTEGER NOT NULL DEFAULT 0,
    "clawbackRunId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "fxRateMicros" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "earnedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "settleMode" TEXT NOT NULL,
    "runId" TEXT,
    "whtCertDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommissionRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalCommissionSatang" BIGINT NOT NULL DEFAULT 0,
    "totalVatSatang" BIGINT NOT NULL DEFAULT 0,
    "totalWhtSatang" BIGINT NOT NULL DEFAULT 0,
    "totalPaidSatang" BIGINT NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommissionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommissionPayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "financeAccountId" TEXT,
    "commissionSatang" BIGINT NOT NULL,
    "vatSatang" BIGINT NOT NULL,
    "whtSatang" BIGINT NOT NULL,
    "clawbackNettedSatang" BIGINT NOT NULL,
    "paidSatang" BIGINT NOT NULL,
    "whtMode" TEXT NOT NULL,
    "whtRateBp" INTEGER NOT NULL,
    "accountDocId" TEXT,
    "whtCertDocId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSupplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "accountContactId" TEXT,
    "payeeType" TEXT NOT NULL,
    "peerLinkId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "defaultChannel" TEXT,
    "paymentTerms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSupplierCost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionId" TEXT,
    "paxTypeId" TEXT,
    "mode" TEXT NOT NULL,
    "valueMinor" INTEGER,
    "valueBp" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "travelFrom" DATE,
    "travelTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripSupplierCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSupplierRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "responseTokenHash" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondBy" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "confirmationRef" TEXT,
    "declineReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestSnapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripSupplierRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSupplierPayable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "paidSatang" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCRUED',
    "accountDocId" TEXT,
    "paidAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripSupplierPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPassengerLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'PAX_FORM',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "issuedByKind" TEXT NOT NULL,
    "issuedById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPassengerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentIdentity_taxIdHash_idx" ON "AgentIdentity"("taxIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentIdentity_publicCode_key" ON "AgentIdentity"("publicCode");

-- CreateIndex
CREATE INDEX "AgentUser_identityId_idx" ON "AgentUser"("identityId");

-- CreateIndex
CREATE INDEX "AgentLogin_agentUserId_idx" ON "AgentLogin"("agentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentLogin_kind_providerId_subject_key" ON "AgentLogin"("kind", "providerId", "subject");

-- CreateIndex
CREATE INDEX "AgentSession_agentUserId_idx" ON "AgentSession"("agentUserId");

-- CreateIndex
CREATE INDEX "AgentSession_expiresAt_idx" ON "AgentSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_tokenHash_key" ON "AgentSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentLoginCode_target_expiresAt_idx" ON "AgentLoginCode"("target", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentLoginCode_expiresAt_idx" ON "AgentLoginCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTier_tenantId_code_key" ON "AgentTier"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AgentAccount_identityId_idx" ON "AgentAccount"("identityId");

-- CreateIndex
CREATE INDEX "AgentAccount_tenantId_status_idx" ON "AgentAccount"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAccount_tenantId_code_key" ON "AgentAccount"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAccount_tenantId_identityId_key" ON "AgentAccount"("tenantId", "identityId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAccount_inviteTokenHash_key" ON "AgentAccount"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "AgentAccountMember_agentUserId_idx" ON "AgentAccountMember"("agentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAccountMember_agentAccountId_agentUserId_key" ON "AgentAccountMember"("agentAccountId", "agentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentContract_agentAccountId_version_key" ON "AgentContract"("agentAccountId", "version");

-- CreateIndex
CREATE INDEX "AgentRateCard_tenantId_ownerKind_idx" ON "AgentRateCard"("tenantId", "ownerKind");

-- CreateIndex
CREATE INDEX "AgentRateCard_tierId_idx" ON "AgentRateCard"("tierId");

-- CreateIndex
CREATE INDEX "AgentRateCard_agentAccountId_idx" ON "AgentRateCard"("agentAccountId");

-- CreateIndex
CREATE INDEX "AgentRate_rateCardId_idx" ON "AgentRate"("rateCardId");

-- CreateIndex
CREATE INDEX "AgentRate_tenantId_productKind_productId_idx" ON "AgentRate"("tenantId", "productKind", "productId");

-- CreateIndex
CREATE INDEX "AgentRequest_tenantId_status_expiresAt_idx" ON "AgentRequest"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentRequest_agentAccountId_idx" ON "AgentRequest"("agentAccountId");

-- CreateIndex
CREATE INDEX "AgentRequest_holdId_idx" ON "AgentRequest"("holdId");

-- CreateIndex
CREATE INDEX "AgentRequest_tenantId_productKind_slotId_idx" ON "AgentRequest"("tenantId", "productKind", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRequest_tenantId_idempotencyKey_key" ON "AgentRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentLink_agentAccountId_idx" ON "AgentLink"("agentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentLink_tenantId_code_key" ON "AgentLink"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AgentApiKey_agentAccountId_idx" ON "AgentApiKey"("agentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentApiKey_keyHash_key" ON "AgentApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "AgentAllotmentBlock_tenantId_agentAccountId_idx" ON "AgentAllotmentBlock"("tenantId", "agentAccountId");

-- CreateIndex
CREATE INDEX "AgentAllotmentBlock_productKind_productId_idx" ON "AgentAllotmentBlock"("productKind", "productId");

-- CreateIndex
CREATE INDEX "AgentAllotment_productKind_slotId_idx" ON "AgentAllotment"("productKind", "slotId");

-- CreateIndex
CREATE INDEX "AgentAllotment_tenantId_agentAccountId_slotDate_idx" ON "AgentAllotment"("tenantId", "agentAccountId", "slotDate");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAllotment_agentAccountId_productKind_slotId_key" ON "AgentAllotment"("agentAccountId", "productKind", "slotId");

-- CreateIndex
CREATE INDEX "AgentStopSell_tenantId_productKind_slotId_idx" ON "AgentStopSell"("tenantId", "productKind", "slotId");

-- CreateIndex
CREATE INDEX "AgentWebhook_agentAccountId_idx" ON "AgentWebhook"("agentAccountId");

-- CreateIndex
CREATE INDEX "AgentWebhookDelivery_tenantId_status_idx" ON "AgentWebhookDelivery"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWebhookDelivery_webhookId_eventId_key" ON "AgentWebhookDelivery"("webhookId", "eventId");

-- CreateIndex
CREATE INDEX "AgentMediaAsset_tenantId_productId_idx" ON "AgentMediaAsset"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "AgentLedgerEntry_agentAccountId_statementId_idx" ON "AgentLedgerEntry"("agentAccountId", "statementId");

-- CreateIndex
CREATE INDEX "AgentLedgerEntry_agentAccountId_unitId_idx" ON "AgentLedgerEntry"("agentAccountId", "unitId");

-- CreateIndex
CREATE INDEX "AgentLedgerEntry_settlesStatementId_idx" ON "AgentLedgerEntry"("settlesStatementId");

-- CreateIndex
CREATE INDEX "AgentLedgerEntry_bookingId_idx" ON "AgentLedgerEntry"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentLedgerEntry_agentAccountId_seq_key" ON "AgentLedgerEntry"("agentAccountId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "AgentLedgerEntry_tenantId_idempotencyKey_key" ON "AgentLedgerEntry"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentBalance_tenantId_idx" ON "AgentBalance"("tenantId");

-- CreateIndex
CREATE INDEX "AgentStatement_agentAccountId_periodKey_idx" ON "AgentStatement"("agentAccountId", "periodKey");

-- CreateIndex
CREATE INDEX "AgentStatement_tenantId_status_dueAt_idx" ON "AgentStatement"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStatement_tenantId_code_key" ON "AgentStatement"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AgentCommission_agentAccountId_status_earnedAt_idx" ON "AgentCommission"("agentAccountId", "status", "earnedAt");

-- CreateIndex
CREATE INDEX "AgentCommission_runId_idx" ON "AgentCommission"("runId");

-- CreateIndex
CREATE INDEX "AgentCommission_tenantId_status_earnedAt_idx" ON "AgentCommission"("tenantId", "status", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommission_bookingKind_bookingId_agentAccountId_key" ON "AgentCommission"("bookingKind", "bookingId", "agentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommissionRun_tenantId_code_key" ON "AgentCommissionRun"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommissionRun_tenantId_idempotencyKey_key" ON "AgentCommissionRun"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentCommissionPayout_agentAccountId_idx" ON "AgentCommissionPayout"("agentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommissionPayout_runId_agentAccountId_unitId_key" ON "AgentCommissionPayout"("runId", "agentAccountId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommissionPayout_tenantId_idempotencyKey_key" ON "AgentCommissionPayout"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TripSupplier_tenantId_status_idx" ON "TripSupplier"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TripSupplier_tenantId_code_key" ON "TripSupplier"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TripSupplierCost_supplierId_productId_idx" ON "TripSupplierCost"("supplierId", "productId");

-- CreateIndex
CREATE INDEX "TripSupplierRequest_status_respondBy_idx" ON "TripSupplierRequest"("status", "respondBy");

-- CreateIndex
CREATE INDEX "TripSupplierRequest_bookingId_idx" ON "TripSupplierRequest"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "TripSupplierRequest_responseTokenHash_key" ON "TripSupplierRequest"("responseTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "TripSupplierRequest_tenantId_idempotencyKey_key" ON "TripSupplierRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TripSupplierPayable_supplierId_status_dueAt_idx" ON "TripSupplierPayable"("supplierId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripSupplierPayable_tenantId_idempotencyKey_key" ON "TripSupplierPayable"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TripPassengerLink_passengerId_createdAt_idx" ON "TripPassengerLink"("passengerId", "createdAt");

-- CreateIndex
CREATE INDEX "TripPassengerLink_tenantId_unitId_bookingId_idx" ON "TripPassengerLink"("tenantId", "unitId", "bookingId");

-- CreateIndex
CREATE INDEX "TripPassengerLink_expiresAt_idx" ON "TripPassengerLink"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripPassengerLink_tokenHash_key" ON "TripPassengerLink"("tokenHash");



-- ═════════════════════════ SQL มือ (ใบสั่ง A1.1 §3 ข้อ 3 · CC §B.0) — 🔴 ห้ามลบ · Prisma ประกาศ CHECK/partial/NULLS NOT DISTINCT/trigger ไม่ได้ ═════════════════════════

-- CHECK ชุดค่า (ใบสั่ง §3.1 · ชื่อ "<Table>_<col>_check" · nullable = IS NULL OR …)
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'CLOSED'));
ALTER TABLE "AgentUser" ADD CONSTRAINT "AgentUser_role_check" CHECK ("role" IN ('OWNER', 'ADMIN', 'SALES', 'ACCOUNTING'));
ALTER TABLE "AgentUser" ADD CONSTRAINT "AgentUser_status_check" CHECK ("status" IN ('ACTIVE', 'DISABLED', 'ERASED'));
ALTER TABLE "AgentLogin" ADD CONSTRAINT "AgentLogin_kind_check" CHECK ("kind" IN ('EMAIL', 'LINE'));
ALTER TABLE "AgentTier" ADD CONSTRAINT "AgentTier_code_check" CHECK ("code" IN ('A', 'B', 'C'));
ALTER TABLE "AgentAccount" ADD CONSTRAINT "AgentAccount_kind_check" CHECK ("kind" IN ('AGENT', 'OTA', 'PEER'));
ALTER TABLE "AgentAccount" ADD CONSTRAINT "AgentAccount_status_check" CHECK ("status" IN ('INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'));
ALTER TABLE "AgentAccount" ADD CONSTRAINT "AgentAccount_payeeType_check" CHECK ("payeeType" IN ('TH_JURISTIC', 'TH_FOUNDATION', 'TH_PERSON', 'FOREIGN'));
ALTER TABLE "AgentAccountMember" ADD CONSTRAINT "AgentAccountMember_role_check" CHECK ("role" IN ('OWNER', 'ADMIN', 'SALES', 'ACCOUNTING'));
ALTER TABLE "AgentContract" ADD CONSTRAINT "AgentContract_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'SUPERSEDED'));
ALTER TABLE "AgentRateCard" ADD CONSTRAINT "AgentRateCard_ownerKind_check" CHECK ("ownerKind" IN ('TIER', 'AGENT'));
ALTER TABLE "AgentRateCard" ADD CONSTRAINT "AgentRateCard_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'ARCHIVED'));
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_productKind_check" CHECK ("productKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_mode_check" CHECK ("mode" IN ('COMMISSION_PCT', 'COMMISSION_FIXED', 'NET', 'MARKUP'));
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_kind_check" CHECK ("kind" IN ('BOOKING', 'PRICE_OVERRIDE', 'CREDIT_INCREASE', 'ALLOTMENT'));
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'));
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_productKind_check" CHECK ("productKind" IS NULL OR "productKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentLink" ADD CONSTRAINT "AgentLink_productKind_check" CHECK ("productKind" IS NULL OR "productKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentAllotmentBlock" ADD CONSTRAINT "AgentAllotmentBlock_productKind_check" CHECK ("productKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentAllotment" ADD CONSTRAINT "AgentAllotment_productKind_check" CHECK ("productKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentStopSell" ADD CONSTRAINT "AgentStopSell_productKind_check" CHECK ("productKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentStopSell" ADD CONSTRAINT "AgentStopSell_channel_check" CHECK ("channel" IS NULL OR "channel" IN ('WEB', 'LIFF', 'EMBED', 'COUNTER', 'POS', 'AGENT_PORTAL', 'AGENT_LINK', 'AGENT_API', 'OTA', 'API', 'IMPORT', 'CHAT_AI'));
ALTER TABLE "AgentMediaAsset" ADD CONSTRAINT "AgentMediaAsset_productKind_check" CHECK ("productKind" IS NULL OR "productKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentWebhookDelivery" ADD CONSTRAINT "AgentWebhookDelivery_status_check" CHECK ("status" IN ('PENDING', 'OK', 'FAILED', 'DEAD'));
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_kind_check" CHECK ("kind" IN ('CHARGE', 'CHARGE_PASS_THROUGH', 'COMMISSION_NETTED', 'COMMISSION_VAT', 'WHT_GROSSUP', 'CANCELLATION', 'PAYMENT', 'WALLET_TOPUP', 'COMMISSION_EARNED', 'COMMISSION_PAID', 'WHT_WITHHELD', 'COMMISSION_CLAWBACK', 'ADJUSTMENT', 'REFUND_TO_AGENT'));
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_bookingKind_check" CHECK ("bookingKind" IS NULL OR "bookingKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_status_check" CHECK ("status" IN ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'VOID'));
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_bookingKind_check" CHECK ("bookingKind" IN ('TRIP', 'TICKET', 'HOTEL'));
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_status_check" CHECK ("status" IN ('PENDING', 'EARNED', 'SETTLING', 'SETTLED', 'CLAWED_BACK', 'VOID'));
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_settleMode_check" CHECK ("settleMode" IN ('PAYOUT', 'NETTED'));
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_whtMode_check" CHECK ("whtMode" IN ('FLAT', 'M50_1', 'NONE'));
ALTER TABLE "AgentCommissionRun" ADD CONSTRAINT "AgentCommissionRun_status_check" CHECK ("status" IN ('DRAFT', 'SETTLING', 'PAID', 'VOID'));
ALTER TABLE "AgentCommissionPayout" ADD CONSTRAINT "AgentCommissionPayout_status_check" CHECK ("status" IN ('PENDING', 'PAID', 'FAILED', 'VOID'));
ALTER TABLE "AgentCommissionPayout" ADD CONSTRAINT "AgentCommissionPayout_whtMode_check" CHECK ("whtMode" IN ('FLAT', 'M50_1', 'NONE'));
ALTER TABLE "TripSupplier" ADD CONSTRAINT "TripSupplier_payeeType_check" CHECK ("payeeType" IN ('TH_JURISTIC', 'TH_FOUNDATION', 'TH_PERSON', 'FOREIGN'));
ALTER TABLE "TripSupplier" ADD CONSTRAINT "TripSupplier_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));
ALTER TABLE "TripSupplier" ADD CONSTRAINT "TripSupplier_defaultChannel_check" CHECK ("defaultChannel" IS NULL OR "defaultChannel" IN ('EMAIL', 'LINE', 'LINK', 'PEER'));
ALTER TABLE "TripSupplierCost" ADD CONSTRAINT "TripSupplierCost_mode_check" CHECK ("mode" IN ('NET', 'PCT_OF_RETAIL'));
ALTER TABLE "TripSupplierRequest" ADD CONSTRAINT "TripSupplierRequest_channel_check" CHECK ("channel" IN ('EMAIL', 'LINE', 'LINK', 'PEER'));
ALTER TABLE "TripSupplierRequest" ADD CONSTRAINT "TripSupplierRequest_status_check" CHECK ("status" IN ('DRAFT', 'SENT', 'VIEWED', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'CANCELLED'));
ALTER TABLE "TripSupplierPayable" ADD CONSTRAINT "TripSupplierPayable_status_check" CHECK ("status" IN ('ACCRUED', 'BILLED', 'PAID', 'VOID'));
ALTER TABLE "TripPassengerLink" ADD CONSTRAINT "TripPassengerLink_purpose_check" CHECK ("purpose" IN ('PAX_FORM'));
ALTER TABLE "TripPassengerLink" ADD CONSTRAINT "TripPassengerLink_issuedByKind_check" CHECK ("issuedByKind" IN ('STAFF', 'AGENT', 'SYSTEM'));

-- CHECK ตัวเลข (ใบสั่ง §3.2 · ชื่อ "<Table>_<col>_check" · nullable = IS NULL OR …) — >= 0
ALTER TABLE "AgentLoginCode" ADD CONSTRAINT "AgentLoginCode_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "AgentTier" ADD CONSTRAINT "AgentTier_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "AgentRateCard" ADD CONSTRAINT "AgentRateCard_priority_check" CHECK ("priority" >= 0);
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_valueMinor_check" CHECK ("valueMinor" IS NULL OR "valueMinor" >= 0);
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_minSellMinor_check" CHECK ("minSellMinor" IS NULL OR "minSellMinor" >= 0);
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_markupCapBp_check" CHECK ("markupCapBp" IS NULL OR "markupCapBp" >= 0);
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_priority_check" CHECK ("priority" >= 0);
ALTER TABLE "AgentAllotmentBlock" ADD CONSTRAINT "AgentAllotmentBlock_qtyPerSlot_check" CHECK ("qtyPerSlot" >= 0);
ALTER TABLE "AgentAllotmentBlock" ADD CONSTRAINT "AgentAllotmentBlock_releaseDaysBefore_check" CHECK ("releaseDaysBefore" IS NULL OR "releaseDaysBefore" >= 0);
ALTER TABLE "AgentAllotment" ADD CONSTRAINT "AgentAllotment_qty_check" CHECK ("qty" >= 0);
ALTER TABLE "AgentAllotment" ADD CONSTRAINT "AgentAllotment_used_check" CHECK ("used" >= 0);
ALTER TABLE "AgentAllotment" ADD CONSTRAINT "AgentAllotment_held_check" CHECK ("held" >= 0);
ALTER TABLE "AgentAllotment" ADD CONSTRAINT "AgentAllotment_returnedToPublic_check" CHECK ("returnedToPublic" >= 0);
ALTER TABLE "AgentAllotment" ADD CONSTRAINT "AgentAllotment_releasedQty_check" CHECK ("releasedQty" IS NULL OR "releasedQty" >= 0);
ALTER TABLE "AgentBalance" ADD CONSTRAINT "AgentBalance_lastSeq_check" CHECK ("lastSeq" >= 0);
ALTER TABLE "AgentBalance" ADD CONSTRAINT "AgentBalance_version_check" CHECK ("version" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_salesSatang_check" CHECK ("salesSatang" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_passThroughSatang_check" CHECK ("passThroughSatang" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_commissionSatang_check" CHECK ("commissionSatang" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_commissionVatSatang_check" CHECK ("commissionVatSatang" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_whtSatang_check" CHECK ("whtSatang" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_paidDuringPeriodSatang_check" CHECK ("paidDuringPeriodSatang" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_paidSatang_check" CHECK ("paidSatang" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_whtCertSatang_check" CHECK ("whtCertSatang" IS NULL OR "whtCertSatang" >= 0);
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_version_check" CHECK ("version" >= 0);
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_baseSatang_check" CHECK ("baseSatang" >= 0);
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_commissionSatang_check" CHECK ("commissionSatang" >= 0);
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_vatSatang_check" CHECK ("vatSatang" >= 0);
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_whtSatang_check" CHECK ("whtSatang" IS NULL OR "whtSatang" >= 0);
ALTER TABLE "AgentCommissionRun" ADD CONSTRAINT "AgentCommissionRun_totalCommissionSatang_check" CHECK ("totalCommissionSatang" >= 0);
ALTER TABLE "AgentCommissionRun" ADD CONSTRAINT "AgentCommissionRun_totalVatSatang_check" CHECK ("totalVatSatang" >= 0);
ALTER TABLE "AgentCommissionRun" ADD CONSTRAINT "AgentCommissionRun_totalWhtSatang_check" CHECK ("totalWhtSatang" >= 0);
ALTER TABLE "AgentCommissionRun" ADD CONSTRAINT "AgentCommissionRun_totalPaidSatang_check" CHECK ("totalPaidSatang" >= 0);
ALTER TABLE "AgentCommissionPayout" ADD CONSTRAINT "AgentCommissionPayout_commissionSatang_check" CHECK ("commissionSatang" >= 0);
ALTER TABLE "AgentCommissionPayout" ADD CONSTRAINT "AgentCommissionPayout_vatSatang_check" CHECK ("vatSatang" >= 0);
ALTER TABLE "AgentCommissionPayout" ADD CONSTRAINT "AgentCommissionPayout_whtSatang_check" CHECK ("whtSatang" >= 0);
ALTER TABLE "AgentCommissionPayout" ADD CONSTRAINT "AgentCommissionPayout_clawbackNettedSatang_check" CHECK ("clawbackNettedSatang" >= 0);
ALTER TABLE "AgentCommissionPayout" ADD CONSTRAINT "AgentCommissionPayout_paidSatang_check" CHECK ("paidSatang" >= 0);
ALTER TABLE "AgentWebhook" ADD CONSTRAINT "AgentWebhook_failCount_check" CHECK ("failCount" >= 0);
ALTER TABLE "AgentWebhookDelivery" ADD CONSTRAINT "AgentWebhookDelivery_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "AgentMediaAsset" ADD CONSTRAINT "AgentMediaAsset_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "TripSupplierCost" ADD CONSTRAINT "TripSupplierCost_valueMinor_check" CHECK ("valueMinor" IS NULL OR "valueMinor" >= 0);
ALTER TABLE "TripSupplierRequest" ADD CONSTRAINT "TripSupplierRequest_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "TripSupplierPayable" ADD CONSTRAINT "TripSupplierPayable_amountSatang_check" CHECK ("amountSatang" >= 0);
ALTER TABLE "TripSupplierPayable" ADD CONSTRAINT "TripSupplierPayable_paidSatang_check" CHECK ("paidSatang" >= 0);
-- >= 1
ALTER TABLE "AgentContract" ADD CONSTRAINT "AgentContract_version_check" CHECK ("version" >= 1);
ALTER TABLE "AgentRateCard" ADD CONSTRAINT "AgentRateCard_version_check" CHECK ("version" >= 1);
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_qty_check" CHECK ("qty" IS NULL OR "qty" >= 1);
ALTER TABLE "AgentAllotmentBlock" ADD CONSTRAINT "AgentAllotmentBlock_holdHours_check" CHECK ("holdHours" IS NULL OR "holdHours" >= 1);
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_seq_check" CHECK ("seq" >= 1);
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_fxRateMicros_check" CHECK ("fxRateMicros" IS NULL OR "fxRateMicros" >= 1);
-- 0–10000 (basis point)
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_valueBp_check" CHECK ("valueBp" IS NULL OR ("valueBp" >= 0 AND "valueBp" <= 10000));
ALTER TABLE "AgentLink" ADD CONSTRAINT "AgentLink_discountBp_check" CHECK ("discountBp" IS NULL OR ("discountBp" >= 0 AND "discountBp" <= 10000));
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_rateBp_check" CHECK ("rateBp" IS NULL OR ("rateBp" >= 0 AND "rateBp" <= 10000));
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_whtRateBp_check" CHECK ("whtRateBp" >= 0 AND "whtRateBp" <= 10000);
ALTER TABLE "AgentCommissionPayout" ADD CONSTRAINT "AgentCommissionPayout_whtRateBp_check" CHECK ("whtRateBp" >= 0 AND "whtRateBp" <= 10000);
ALTER TABLE "TripSupplierCost" ADD CONSTRAINT "TripSupplierCost_valueBp_check" CHECK ("valueBp" IS NULL OR ("valueBp" >= 0 AND "valueBp" <= 10000));
-- ช่วงอื่น
ALTER TABLE "AgentWebhookDelivery" ADD CONSTRAINT "AgentWebhookDelivery_responseCode_check" CHECK ("responseCode" IS NULL OR ("responseCode" >= 100 AND "responseCode" <= 599));
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_clawbackSatang_check" CHECK ("clawbackSatang" >= 0 AND "clawbackSatang"::bigint <= "commissionSatang"::bigint + "vatSatang"::bigint);

-- CHECK ข้ามคอลัมน์ (ใบสั่ง §3.3 · ชื่อตรงตัว · แต่ละตัวตั้งให้แถวที่ผิด "ข้อเดียว" ไม่ชนข้ออื่น)
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_publicCode_format_check" CHECK ("publicCode" ~ '^AG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$');
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_taxIdHash_format_check" CHECK ("taxIdHash" IS NULL OR "taxIdHash" ~ '^v1:[0-9a-f]{64}$');
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_displayName_len_check" CHECK (char_length(btrim("displayName")) BETWEEN 1 AND 120);
ALTER TABLE "AgentUser" ADD CONSTRAINT "AgentUser_displayName_len_check" CHECK (char_length(btrim("displayName")) BETWEEN 1 AND 120);
ALTER TABLE "AgentLogin" ADD CONSTRAINT "AgentLogin_email_norm_check" CHECK ("kind" <> 'EMAIL' OR ("providerId" = 'email' AND "subject" = lower("subject")));
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_idle_check" CHECK ("idleExpiresAt" <= "expiresAt");
ALTER TABLE "AgentAccount" ADD CONSTRAINT "AgentAccount_identity_check" CHECK ("identityId" IS NOT NULL OR "status" IN ('INVITED', 'CLOSED'));
ALTER TABLE "AgentAccount" ADD CONSTRAINT "AgentAccount_last4_check" CHECK (("taxIdLast4" IS NULL OR "taxIdLast4" ~ '^[0-9A-Z]{4}$') AND ("bankLast4" IS NULL OR "bankLast4" ~ '^[0-9]{4}$'));
ALTER TABLE "AgentAccount" ADD CONSTRAINT "AgentAccount_country_check" CHECK ("country" ~ '^[A-Z]{2}$');
ALTER TABLE "AgentAccount" ADD CONSTRAINT "AgentAccount_branchCode_check" CHECK ("branchCode" IS NULL OR "branchCode" ~ '^[0-9]{5}$');
ALTER TABLE "AgentContract" ADD CONSTRAINT "AgentContract_dates_check" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");
ALTER TABLE "AgentRateCard" ADD CONSTRAINT "AgentRateCard_dates_check" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");
ALTER TABLE "AgentAllotmentBlock" ADD CONSTRAINT "AgentAllotmentBlock_dates_check" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");
ALTER TABLE "TripSupplierCost" ADD CONSTRAINT "TripSupplierCost_dates_check" CHECK ("travelTo" IS NULL OR "travelTo" >= "travelFrom");
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_dates_check" CHECK (("bookTo" IS NULL OR "bookTo" >= "bookFrom") AND ("travelTo" IS NULL OR "travelTo" >= "travelFrom"));
ALTER TABLE "AgentRateCard" ADD CONSTRAINT "AgentRateCard_owner_check" CHECK (("ownerKind" = 'TIER' AND "tierId" IS NOT NULL AND "agentAccountId" IS NULL) OR ("ownerKind" = 'AGENT' AND "agentAccountId" IS NOT NULL AND "tierId" IS NULL));
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_value_check" CHECK (("mode" <> 'COMMISSION_PCT' OR "valueBp" IS NOT NULL) AND ("mode" NOT IN ('COMMISSION_FIXED', 'NET') OR "valueMinor" IS NOT NULL) AND ("mode" <> 'MARKUP' OR "valueBp" IS NOT NULL OR "valueMinor" IS NOT NULL));
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "AgentRate" ADD CONSTRAINT "AgentRate_fixed_currency_check" CHECK ("mode" <> 'COMMISSION_FIXED' OR "currency" = 'THB');
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_hold_check" CHECK (("kind" = 'BOOKING') = ("holdId" IS NOT NULL));
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_expiry_check" CHECK ("holdId" IS NOT NULL OR "expiresAt" IS NOT NULL);
ALTER TABLE "AgentLink" ADD CONSTRAINT "AgentLink_product_check" CHECK (("productKind" IS NULL) = ("productId" IS NULL));
ALTER TABLE "AgentLink" ADD CONSTRAINT "AgentLink_code_check" CHECK ("code" ~ '^[A-Za-z0-9_-]{2,32}$');
ALTER TABLE "AgentMediaAsset" ADD CONSTRAINT "AgentMediaAsset_product_check" CHECK (("productKind" IS NULL) = ("productId" IS NULL));
ALTER TABLE "AgentStopSell" ADD CONSTRAINT "AgentStopSell_window_check" CHECK ("to" IS NULL OR "to" > "from");
ALTER TABLE "AgentAllotment" ADD CONSTRAINT "AgentAllotment_counters_check" CHECK ("used"::bigint + "held"::bigint + "returnedToPublic"::bigint <= "qty");
ALTER TABLE "AgentAllotment" ADD CONSTRAINT "AgentAllotment_released_check" CHECK (("releasedAt" IS NULL) = ("releasedQty" IS NULL));
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_currency_check" CHECK ("currency" = 'THB');
-- เครื่องหมาย: บวก = CHARGE CHARGE_PASS_THROUGH WHT_GROSSUP COMMISSION_PAID WHT_WITHHELD COMMISSION_CLAWBACK REFUND_TO_AGENT · ลบ = COMMISSION_NETTED COMMISSION_VAT PAYMENT WALLET_TOPUP COMMISSION_EARNED · CANCELLATION/ADJUSTMENT ไม่บังคับ (≠ 0) · ไม่ลงยอด 0
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_sign_check" CHECK ("amountSatang" <> 0 AND ("kind" NOT IN ('CHARGE', 'CHARGE_PASS_THROUGH', 'WHT_GROSSUP', 'COMMISSION_PAID', 'WHT_WITHHELD', 'COMMISSION_CLAWBACK', 'REFUND_TO_AGENT') OR "amountSatang" > 0) AND ("kind" NOT IN ('COMMISSION_NETTED', 'COMMISSION_VAT', 'PAYMENT', 'WALLET_TOPUP', 'COMMISSION_EARNED') OR "amountSatang" < 0));
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_booking_check" CHECK (("bookingKind" IS NULL) = ("bookingId" IS NULL));
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_unit_check" CHECK ("bookingId" IS NULL OR "unitId" IS NOT NULL);
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_refs_check" CHECK (("kind" NOT IN ('CHARGE', 'CHARGE_PASS_THROUGH') OR "bookingId" IS NOT NULL) AND ("kind" NOT IN ('COMMISSION_NETTED', 'COMMISSION_VAT', 'WHT_GROSSUP', 'COMMISSION_EARNED', 'COMMISSION_CLAWBACK') OR "commissionId" IS NOT NULL) AND ("kind" NOT IN ('COMMISSION_PAID', 'WHT_WITHHELD') OR "runId" IS NOT NULL) AND ("kind" NOT IN ('ADJUSTMENT') OR ("approvalId" IS NOT NULL AND "reason" IS NOT NULL)));
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_settles_check" CHECK ("settlesStatementId" IS NULL OR "kind" IN ('PAYMENT', 'WALLET_TOPUP', 'REFUND_TO_AGENT', 'ADJUSTMENT'));
-- สูตรใบแจ้งยอด (ใบสั่ง §2.3 · ภาพ 13ง = 8,612,115 สตางค์): ค่าคงที่ total = opening + Σ amountSatang ของรายการที่ statementId = ใบนี้ ตรวจด้วย scripts/trips-agency-invariants.mts
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_total_check" CHECK ("totalSatang" = "openingSatang" + "salesSatang" + "passThroughSatang" - "commissionSatang" - "commissionVatSatang" + "whtSatang" + "cancelledSatang" + "adjustmentSatang" + "otherSatang" - "paidDuringPeriodSatang");
ALTER TABLE "AgentStatement" ADD CONSTRAINT "AgentStatement_period_check" CHECK ("periodTo" >= "periodFrom");
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_wht_check" CHECK ("whtSatang" IS NOT NULL OR "whtMode" = 'M50_1');
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_currency_check" CHECK ("currency" = 'THB' OR "fxRateMicros" IS NOT NULL);
ALTER TABLE "AgentWebhook" ADD CONSTRAINT "AgentWebhook_url_check" CHECK ("url" ~ '^https://');
ALTER TABLE "AgentApiKey" ADD CONSTRAINT "AgentApiKey_last4_check" CHECK (char_length("last4") = 4);
ALTER TABLE "TripSupplierCost" ADD CONSTRAINT "TripSupplierCost_value_check" CHECK (("mode" <> 'NET' OR "valueMinor" IS NOT NULL) AND ("mode" <> 'PCT_OF_RETAIL' OR "valueBp" IS NOT NULL));
ALTER TABLE "TripSupplierPayable" ADD CONSTRAINT "TripSupplierPayable_paid_check" CHECK ("paidSatang" <= "amountSatang");
-- ตารางเดิม (คอลัมน์ใหม่ nullable ⇒ แถวเดิมผ่าน)

-- UNIQUE NULLS NOT DISTINCT (PG ≥ 15) — 🔴 `prisma migrate diff` เสนอ DROP ทั้งสองตัวเสมอ ห้ามรับ (มติ R7)
CREATE UNIQUE INDEX "AgentRate_dims_key" ON "AgentRate"("rateCardId", "productKind", "productId", "optionId", "paxTypeId", "cabinTypeId", "bookFrom", "travelFrom") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "TripSupplierCost_dims_key" ON "TripSupplierCost"("supplierId", "productId", "optionId", "paxTypeId", "travelFrom") NULLS NOT DISTINCT;

-- partial unique: กุญแจถือที่ของตะกร้า (หนี้ T0.6 R12) · ใบแจ้งยอดต่อ (เอเจนซี่, งวด) ไม่นับใบ VOID (มติ R1)
CREATE UNIQUE INDEX "AgentStatement_agentAccountId_periodKey_key" ON "AgentStatement"("agentAccountId", "periodKey") WHERE "status" <> 'VOID';

-- partial index: คำขอหมดอายุที่ไม่มี hold (TC5) · โควตาที่ยังไม่คืน · webhook ที่ต้องส่งซ้ำ
CREATE INDEX "AgentRequest_expiresAt_pending_idx" ON "AgentRequest"("expiresAt") WHERE "status" = 'PENDING' AND "holdId" IS NULL;
CREATE INDEX "AgentAllotment_releaseAt_open_idx" ON "AgentAllotment"("releaseAt") WHERE "releasedAt" IS NULL;
CREATE INDEX "AgentWebhookDelivery_nextAttemptAt_open_idx" ON "AgentWebhookDelivery"("nextAttemptAt") WHERE "status" IN ('PENDING', 'FAILED');

-- ดัชนีเส้นทางร้อน (มติผู้คุม R9 · DESIGN-REVIEW O4 · trips ไม่มี migration อีกจน L1.1) — ส่วน partial (ที่เหลือของ O4 ประกาศเป็น @@index ใน schema)
CREATE INDEX "AgentStopSell_tenantId_productKind_productId_open_idx" ON "AgentStopSell"("tenantId", "productKind", "productId") WHERE "liftedAt" IS NULL;
CREATE INDEX "AgentStatement_dueAt_open_idx" ON "AgentStatement"("dueAt") WHERE "status" IN ('ISSUED', 'PARTIAL');
CREATE INDEX "TripSupplierPayable_dueAt_open_idx" ON "TripSupplierPayable"("dueAt") WHERE "status" IN ('ACCRUED', 'BILLED');

-- สมุดเอเจนซี่ต่อท้ายอย่างเดียว (ใบสั่ง §3.4 · CC §I.2 · มติ R1) — ป้องกันบั๊ก ไม่ใช่ผู้ประสงค์ร้าย (role ของแอปเป็นเจ้าของตาราง)
--   เทียบทั้งแถว ⇒ คอลัมน์ในอนาคตถูกคุมอัตโนมัติ (ห้ามเพิ่มคอลัมน์ json ในตารางนี้) · ไม่ guard TRUNCATE · Prisma ไม่เห็น trigger ⇒ ไม่เกิด drift
--   r1: search_path ตรึง pg_catalog, public + อ้างตาราง/ชนิดแบบ public."…" (แบบฟังก์ชัน plpgsql อื่นของ repo) · ผูก/ย้าย statementId ได้เฉพาะใบที่ agentAccountId + tenantId ตรงกับรายการ
CREATE FUNCTION "agent_ledger_entry_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE n public."AgentLedgerEntry";
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('shark.ledger_purge', true) = 'on' THEN RETURN OLD; END IF;                 -- ล้างฐาน QC (SET LOCAL ใน tx)
    IF EXISTS (SELECT 1 FROM public."Tenant" t WHERE t."id" = OLD."tenantId" AND t."status" = 'PENDING_DELETE') THEN RETURN OLD; END IF;  -- platform/pdpa.ts purgeTenantRows
    RAISE EXCEPTION 'AGENT_LEDGER_APPEND_ONLY' USING ERRCODE = '23001';
  END IF;
  IF NEW."statementId" IS NOT NULL AND NEW."statementId" IS DISTINCT FROM OLD."statementId"
     AND NOT EXISTS (SELECT 1 FROM public."AgentStatement" s WHERE s."id" = NEW."statementId" AND s."agentAccountId" = OLD."agentAccountId" AND s."tenantId" = OLD."tenantId") THEN
    RAISE EXCEPTION 'AGENT_LEDGER_APPEND_ONLY' USING ERRCODE = '23001';                            -- ผูก/ย้ายได้เฉพาะใบของบัญชีและร้านเดียวกัน (r1)
  END IF;
  n := NEW;
  IF OLD."statementId" IS NULL THEN n."statementId" := OLD."statementId";                         -- ผูกใบครั้งแรก
  ELSIF NEW."statementId" IS DISTINCT FROM OLD."statementId"
        AND EXISTS (SELECT 1 FROM public."AgentStatement" s WHERE s."id" = OLD."statementId" AND s."status" = 'VOID') THEN
    n."statementId" := OLD."statementId";                                                        -- ใบเดิม VOID ⇒ ย้าย/ปลดได้
  END IF;
  IF OLD."settledAt" IS NULL THEN n."settledAt" := OLD."settledAt"; END IF;                       -- ตั้งครั้งเดียว (หักกลบ)
  IF OLD."whtCertDocId" IS NULL THEN n."whtCertDocId" := OLD."whtCertDocId"; END IF;              -- ตั้งครั้งเดียว
  IF OLD."accountDocId" IS NULL THEN n."accountDocId" := OLD."accountDocId"; END IF;              -- ตั้งครั้งเดียว (บัญชีลงหลัง commit)
  IF n IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'AGENT_LEDGER_APPEND_ONLY' USING ERRCODE = '23001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AgentLedgerEntry_append_only" BEFORE UPDATE OR DELETE ON "AgentLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "agent_ledger_entry_guard"();

-- ═════════════════════════ ตารางเดิม (r1 · ย้ายมาท้ายไฟล์: ล็อกบนตารางที่มีข้อมูลถือสั้นที่สุดก่อน commit) ═════════════════════════
-- ADD COLUMN nullable ไม่มี default (metadata อย่างเดียว) · CHECK อ่านเฉพาะคอลัมน์ใหม่ ⇒ แถวเดิม (NULL) ผ่าน · ดัชนี TripMoneyEvent ×2 · SellBasket partial unique · TripHold partial (O4)
ALTER TABLE "SellBasket" ADD COLUMN     "holdIdempotencyKey" TEXT,
ADD COLUMN     "holdRequestHash" TEXT;
ALTER TABLE "TripPickupZone" ADD COLUMN     "active" BOOLEAN,
ADD COLUMN     "areas" JSONB,
ADD COLUMN     "basis" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "windowMin" INTEGER;
ALTER TABLE "TripBooking" ADD COLUMN     "agentRef" TEXT,
ADD COLUMN     "voucherOptions" JSONB;
ALTER TABLE "TripMoneyEvent" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "refEventId" TEXT,
ADD COLUMN     "reference" TEXT;

ALTER TABLE "TripPickupZone" ADD CONSTRAINT "TripPickupZone_kind_check" CHECK ("kind" IS NULL OR "kind" IN ('ZONE', 'SELF'));
ALTER TABLE "TripPickupZone" ADD CONSTRAINT "TripPickupZone_basis_check" CHECK ("basis" IS NULL OR "basis" IN ('PER_BOOKING'));
ALTER TABLE "TripPickupZone" ADD CONSTRAINT "TripPickupZone_windowMin_check" CHECK ("windowMin" IS NULL OR ("windowMin" >= 0 AND "windowMin" <= 720));
ALTER TABLE "TripPickupZone" ADD CONSTRAINT "TripPickupZone_v2_check" CHECK ("kind" IS NULL OR ("windowMin" IS NOT NULL AND "active" IS NOT NULL AND "basis" IS NOT NULL));
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_agentRef_check" CHECK ("agentRef" IS NULL OR char_length("agentRef") BETWEEN 1 AND 64);
ALTER TABLE "SellBasket" ADD CONSTRAINT "SellBasket_holdKey_pair_check" CHECK (("holdIdempotencyKey" IS NULL) = ("holdRequestHash" IS NULL));

CREATE INDEX "TripMoneyEvent_tenantId_unitId_createdAt_idx" ON "TripMoneyEvent"("tenantId", "unitId", "createdAt");
CREATE INDEX "TripMoneyEvent_tenantId_unitId_receivedAt_idx" ON "TripMoneyEvent"("tenantId", "unitId", "receivedAt");
CREATE UNIQUE INDEX "SellBasket_tenantId_holdIdempotencyKey_key" ON "SellBasket"("tenantId", "holdIdempotencyKey") WHERE "holdIdempotencyKey" IS NOT NULL;
CREATE INDEX "TripHold_agentAccountId_active_idx" ON "TripHold"("agentAccountId") WHERE "status" = 'ACTIVE' AND "agentAccountId" IS NOT NULL;

RESET lock_timeout;
