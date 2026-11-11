-- POS P1.13 — ใบกำกับภาษีเต็มรูป (สำเนาผู้ซื้อบนบิล · เลขเอกสาร · ผู้ซื้อที่จำไว้ต่อสมาชิก · ABB ถูกแทน) · CD5: เพิ่มอย่างเดียว
-- สร้างจาก prisma migrate diff --from-schema <schema ก่อน P1.13> --to-schema prisma/schema --script (ไม่ได้ diff จากฐาน)
-- แตะ schema บัญชี 1 คอลัมน์ (AccountDocument.supersededByDocId · nullable) — บันทึกใน ledger/POS-OWNER-PENDING.md
-- AlterTable
ALTER TABLE "AccountDocument" ADD COLUMN     "supersededByDocId" TEXT;

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "taxInvoice" JSONB,
ADD COLUMN     "taxInvoiceDocId" TEXT;

-- CreateTable
CREATE TABLE "PosBuyerProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL DEFAULT '00000',
    "address" TEXT NOT NULL,
    "email" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosBuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosBuyerProfile_customerId_key" ON "PosBuyerProfile"("customerId");

-- CreateIndex
CREATE INDEX "PosBuyerProfile_tenantId_taxId_idx" ON "PosBuyerProfile"("tenantId", "taxId");

