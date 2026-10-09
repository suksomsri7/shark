-- CreateTable
CREATE TABLE "PosPaymentIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "qrPayload" TEXT,
    "beamChargeId" TEXT,
    "beamRef" TEXT,
    "deviceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "confirmedVia" TEXT,
    "confirmedByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "saleId" TEXT,
    "lateWebhook" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosPaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosPaymentIntent_tenantId_unitId_status_createdAt_idx" ON "PosPaymentIntent"("tenantId", "unitId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PosPaymentIntent_beamChargeId_idx" ON "PosPaymentIntent"("beamChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "PosPaymentIntent_tenantId_idempotencyKey_key" ON "PosPaymentIntent"("tenantId", "idempotencyKey");

