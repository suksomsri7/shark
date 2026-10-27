-- SVC R0.1 · migration svc_r0 — schema กลาง additive ล้วน (ledger/SVC-CORE-CONTRACT.md §1.2 §2.2 §3.2 §4.2 §5.2)
-- ส่วนบน: สร้างด้วย `prisma migrate diff --from-schema <schema@33e8272c> --to-schema prisma/schema --script`
--   (migrate dev ใช้ไม่ได้: ฐาน qc-svc มี migration HR 7 ตัวที่ไม่อยู่ใน branch นี้ ⇒ prisma ขอ reset — ไม่ตอบ)
--   แก้มือ 2 จุด: TenantIntegration.unitIds/secretNames เป็น NOT NULL (Prisma สร้าง list เป็น nullable · แบบอย่าง crm_v2_b/c)
-- ส่วนล่าง: SQL มือที่ Prisma เขียนเองไม่ได้ (btree_gist · EXCLUDE · partial unique)
--   🔴 ใบ migration ถัดไป (B.0/D.0) ต้องลบบรรทัด DROP INDEX/CONSTRAINT ที่ prisma อาจสร้างให้ของพวกนี้

-- AlterEnum
ALTER TYPE "UnitType" ADD VALUE 'DORM';

-- AlterTable
ALTER TABLE "HotelRoomType" ADD COLUMN     "amenities" JSONB,
ADD COLUMN     "areaSqm" DECIMAL(65,30),
ADD COLUMN     "monthlyRateSatang" INTEGER,
ADD COLUMN     "rentMode" TEXT NOT NULL DEFAULT 'NIGHTLY';

-- AlterTable
ALTER TABLE "HotelRoom" ADD COLUMN     "buildingId" TEXT,
ADD COLUMN     "floorNo" INTEGER,
ADD COLUMN     "hkStatus" TEXT NOT NULL DEFAULT 'CLEAN',
ADD COLUMN     "rentMode" TEXT;

-- CreateTable
CREATE TABLE "ChatLinkCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT,
    "purpose" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeLast4" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByChatContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMessageLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "partyId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomBuilding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floors" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "RoomBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomOccupancy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publicFields" JSONB NOT NULL DEFAULT '{}',
    "secretBox" TEXT,
    "secretNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "onFailure" TEXT NOT NULL DEFAULT 'MANUAL',
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "quota" JSONB,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCallLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "ms" INTEGER NOT NULL,
    "code" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSlip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "partyId" TEXT,
    "fileId" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "transRef" TEXT,
    "expectedSatang" INTEGER NOT NULL,
    "amountSatang" INTEGER,
    "payerName" TEXT,
    "bankCode" TEXT,
    "transferredAt" TIMESTAMP(3),
    "checks" JSONB NOT NULL,
    "verifierIntegrationId" TEXT,
    "verifierResult" JSONB,
    "status" TEXT NOT NULL,
    "reviewReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
    "setById" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettingValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "appliedById" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "legalLevel" TEXT NOT NULL,
    "legalCode" TEXT,
    "reason" TEXT,
    "approvalId" TEXT,
    "actorId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatLinkCode_tenantId_codeHash_key" ON "ChatLinkCode"("tenantId", "codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMessageLog_tenantId_dedupeKey_key" ON "ServiceMessageLog"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "TenantIntegration_tenantId_kind_idx" ON "TenantIntegration"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "TenantIntegration_tenantId_kind_provider_label_key" ON "TenantIntegration"("tenantId", "kind", "provider", "label");

-- CreateIndex
CREATE INDEX "IntegrationCallLog_tenantId_integrationId_at_idx" ON "IntegrationCallLog"("tenantId", "integrationId", "at");

-- CreateIndex
CREATE INDEX "PaymentSlip_tenantId_unitId_status_createdAt_idx" ON "PaymentSlip"("tenantId", "unitId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentSlip_refType_refId_idx" ON "PaymentSlip"("refType", "refId");

-- CreateIndex
CREATE INDEX "SettingValue_tenantId_scope_scopeId_idx" ON "SettingValue"("tenantId", "scope", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "SettingValue_tenantId_key_scope_scopeId_effectiveFrom_key" ON "SettingValue"("tenantId", "key", "scope", "scopeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SettingProfile_unitId_domain_key" ON "SettingProfile"("unitId", "domain");

-- AddForeignKey
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "RoomBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomOccupancy" ADD CONSTRAINT "RoomOccupancy_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════ SQL มือ (CC §3.2 §5.2) ═══════════════

-- กันจองซ้อนระดับ DB: ห้องเดียว ช่วงวัน [start, end) ที่ active ห้ามทับกัน
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "RoomOccupancy" ADD CONSTRAINT "RoomOccupancy_no_overlap"
  EXCLUDE USING gist ("roomId" WITH =, daterange("startDate", "endDate", '[)') WITH &&) WHERE (active);

-- สลิปซ้ำต่อร้าน (ใบที่ REJECTED ไม่นับ)
CREATE UNIQUE INDEX "PaymentSlip_tenantId_imageHash_active_key" ON "PaymentSlip"("tenantId", "imageHash") WHERE "status" <> 'REJECTED';

CREATE UNIQUE INDEX "PaymentSlip_tenantId_transRef_active_key" ON "PaymentSlip"("tenantId", "transRef") WHERE "transRef" IS NOT NULL AND "status" <> 'REJECTED';
