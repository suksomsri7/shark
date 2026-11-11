-- POS P3-SKEL โครงเชื่อมภายนอก (บรีฟ §3 · มติ §10-9): CREATE เท่านั้น — 4 ตารางใหม่ · สถานะเป็น TEXT (ไม่มี enum ใหม่) · ไม่แตะตารางเดิม (ไม่มี ALTER/UPDATE/DELETE/DROP)
-- ① PosIntegrationCredential — ค่าที่เจ้าของวางจากแพลตฟอร์ม/ผู้ให้บริการ (ค่าลับปิดกล่องใน "secretBox") · unique (tenantId, kind, provider, scopeKey)
-- ② PosPaymentSlip — สลิปโอนที่แนบ (ไฟล์ส่วนตัว) · unique (tenantId, idempotencyKey) + (tenantId, "transRef") (NULL ไม่ชนกัน = เฉพาะที่กรอก)
-- ③ PosPrintAgent — ตัวช่วยพิมพ์ LAN · "tokenHash" unique (โทเคนดิบไม่เคยถูกเก็บ)
-- ④ PosPrintJob — งานพิมพ์ผ่าน relay · unique (tenantId, idempotencyKey) · ดัชนี (agentId, status, createdAt)
SET lock_timeout = '5s';

CREATE TABLE "PosIntegrationCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "channelId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "publicFields" JSONB NOT NULL DEFAULT '{}',
    "secretBox" TEXT,
    "secretNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosIntegrationCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosPaymentSlip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "saleId" TEXT,
    "paymentId" TEXT,
    "intentId" TEXT,
    "fileId" TEXT,
    "contentType" TEXT,
    "bytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "verifiedVia" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "transRef" TEXT,
    "amountSatang" INTEGER,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosPaymentSlip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosPrintAgent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "printers" JSONB NOT NULL DEFAULT '[]',
    "createdByUserId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosPrintAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosPrintJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "bytes" BYTEA,
    "byteLength" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosPrintJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosIntegrationCredential_tenantId_kind_provider_scopeKey_key" ON "PosIntegrationCredential"("tenantId", "kind", "provider", "scopeKey");
CREATE INDEX "PosIntegrationCredential_tenantId_systemId_unitId_idx" ON "PosIntegrationCredential"("tenantId", "systemId", "unitId");
CREATE UNIQUE INDEX "PosPaymentSlip_tenantId_idempotencyKey_key" ON "PosPaymentSlip"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "PosPaymentSlip_tenantId_transRef_key" ON "PosPaymentSlip"("tenantId", "transRef");
CREATE INDEX "PosPaymentSlip_tenantId_saleId_idx" ON "PosPaymentSlip"("tenantId", "saleId");
CREATE INDEX "PosPaymentSlip_tenantId_intentId_idx" ON "PosPaymentSlip"("tenantId", "intentId");
CREATE INDEX "PosPaymentSlip_purgeAfter_idx" ON "PosPaymentSlip"("purgeAfter");
CREATE UNIQUE INDEX "PosPrintAgent_tokenHash_key" ON "PosPrintAgent"("tokenHash");
CREATE INDEX "PosPrintAgent_tenantId_unitId_idx" ON "PosPrintAgent"("tenantId", "unitId");
CREATE UNIQUE INDEX "PosPrintJob_tenantId_idempotencyKey_key" ON "PosPrintJob"("tenantId", "idempotencyKey");
CREATE INDEX "PosPrintJob_agentId_status_createdAt_idx" ON "PosPrintJob"("agentId", "status", "createdAt");
CREATE INDEX "PosPrintJob_status_expiresAt_idx" ON "PosPrintJob"("status", "expiresAt");
