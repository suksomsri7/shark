-- CreateEnum
CREATE TYPE "AccountPaymentRequestMethod" AS ENUM ('PROMPTPAY_STATIC', 'PROMPTPAY_BEAM');

-- CreateEnum
CREATE TYPE "AccountPaymentRequestStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "AccountDocumentPayment" ADD COLUMN     "paymentRequestId" TEXT;

-- CreateTable
CREATE TABLE "AccountPaymentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "financeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "method" "AccountPaymentRequestMethod" NOT NULL,
    "provider" TEXT,
    "providerChargeId" TEXT,
    "qrPayload" TEXT,
    "status" "AccountPaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmountSatang" INTEGER,
    "paymentId" TEXT,
    "statementLineId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPaymentRequest_token_key" ON "AccountPaymentRequest"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPaymentRequest_providerChargeId_key" ON "AccountPaymentRequest"("providerChargeId");

-- CreateIndex
CREATE INDEX "AccountPaymentRequest_systemId_documentId_status_idx" ON "AccountPaymentRequest"("systemId", "documentId", "status");

-- CreateIndex
CREATE INDEX "AccountPaymentRequest_systemId_financeId_status_idx" ON "AccountPaymentRequest"("systemId", "financeId", "status");

-- CreateIndex
CREATE INDEX "AccountPaymentRequest_tenantId_systemId_idx" ON "AccountPaymentRequest"("tenantId", "systemId");

-- CreateIndex
CREATE INDEX "AccountDocumentPayment_systemId_paymentRequestId_idx" ON "AccountDocumentPayment"("systemId", "paymentRequestId");

-- AddForeignKey
ALTER TABLE "AccountPaymentRequest" ADD CONSTRAINT "AccountPaymentRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

