-- POS P1.11 — ใบเสร็จออนไลน์ /r/<token> · แจ้งปัญหาบิล · คำขอใบกำกับเต็มรูป (CD5: เพิ่มอย่างเดียว)
-- สร้างจาก prisma migrate diff --from-schema <schema ก่อน P1.11> --to-schema prisma/schema --script (ไม่ได้ diff จากฐาน)
-- CreateEnum
CREATE TYPE "PosReceiptIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PosTaxInvoiceRequestStatus" AS ENUM ('REQUESTED', 'ISSUED', 'REJECTED');

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "publicToken" TEXT;

-- CreateTable
CREATE TABLE "PosReceiptIssue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "contact" TEXT,
    "status" "PosReceiptIssueStatus" NOT NULL DEFAULT 'OPEN',
    "kanbanCardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosReceiptIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosTaxInvoiceRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL DEFAULT '00000',
    "address" TEXT NOT NULL,
    "email" TEXT,
    "status" "PosTaxInvoiceRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "accountDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTaxInvoiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosReceiptIssue_tenantId_saleId_createdAt_idx" ON "PosReceiptIssue"("tenantId", "saleId", "createdAt");

-- CreateIndex
CREATE INDEX "PosTaxInvoiceRequest_tenantId_saleId_idx" ON "PosTaxInvoiceRequest"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "PosTaxInvoiceRequest_tenantId_status_createdAt_idx" ON "PosTaxInvoiceRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_publicToken_key" ON "PosSale"("publicToken");
