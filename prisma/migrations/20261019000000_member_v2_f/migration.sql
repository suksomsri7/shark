-- M2.6 (member_v2_f) — บัตรกำนัล (Gift Card): GiftCard / GiftCardTxn / GiftCardSettings + PosSale.giftCardId
-- additive ล้วน (CREATE TYPE/TABLE/INDEX + ADD COLUMN nullable) — บิลเดิมทุกใบได้ giftCardId = NULL = พฤติกรรมเดิมเป๊ะ

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "GiftCardTxnType" AS ENUM ('SELL', 'USE', 'RELOAD', 'TRANSFER', 'EXPIRE', 'REFUND', 'ADJUST');

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "giftCardId" TEXT;

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "pinFailedCount" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "initialSatang" INTEGER NOT NULL,
    "balanceSatang" INTEGER NOT NULL,
    "buyerCustomerId" TEXT,
    "ownerCustomerId" TEXT,
    "recipientContact" JSONB,
    "message" TEXT,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "saleId" TEXT,
    "accountingDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardTxn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "type" "GiftCardTxnType" NOT NULL,
    "satang" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "byUserId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardTxn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accountingLink" BOOLEAN NOT NULL DEFAULT false,
    "expiryMonths" INTEGER NOT NULL DEFAULT 24,
    "denominations" INTEGER[] DEFAULT ARRAY[100000, 200000, 500000]::INTEGER[],
    "transferable" BOOLEAN NOT NULL DEFAULT true,
    "reloadable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GiftCard_ownerCustomerId_idx" ON "GiftCard"("ownerCustomerId");

-- CreateIndex
CREATE INDEX "GiftCard_systemId_status_idx" ON "GiftCard"("systemId", "status");

-- CreateIndex
CREATE INDEX "GiftCard_systemId_expiresAt_idx" ON "GiftCard"("systemId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_tenantId_number_key" ON "GiftCard"("tenantId", "number");

-- CreateIndex
CREATE INDEX "GiftCardTxn_giftCardId_createdAt_idx" ON "GiftCardTxn"("giftCardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardTxn_tenantId_idempotencyKey_key" ON "GiftCardTxn"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardSettings_systemId_key" ON "GiftCardSettings"("systemId");

-- AddForeignKey
ALTER TABLE "GiftCardTxn" ADD CONSTRAINT "GiftCardTxn_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

