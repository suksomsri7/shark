-- WO 3.1 — Party (INTEGRATION-MAP §F.1-7 · DESIGN-SPEC-V2 §14.3)
-- ตัวตนกลางระดับ tenant (Party) + คอลัมน์ partyId (nullable, additive) บน AccountContact/Customer/
-- CrmContact/ChatContact/HrEmployee/Supplier/PatientRecord/HotelReservation/TicketOrder/SchoolEnrollment
-- ทุกอย่างที่นี่ additive ล้วน: CREATE TYPE / CREATE TABLE / ADD COLUMN (nullable) / CREATE INDEX
-- ไม่มี DROP / RENAME / NOT NULL ไร้ default / UPDATE-DELETE ข้อมูล — สร้างจาก:
--   prisma migrate diff --from-config-datasource --to-schema prisma/schema --script
-- CreateEnum
CREATE TYPE "PartyKind" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "PartyMergeReason" AS ENUM ('TAX_ID', 'PHONE', 'NAME_SIMILAR');

-- CreateEnum
CREATE TYPE "PartyMergeStatus" AS ENUM ('OPEN', 'MERGED', 'DISMISSED');

-- AlterTable
ALTER TABLE "AccountContact" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "ChatContact" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "CrmContact" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "HotelReservation" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "HrEmployee" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "PatientRecord" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "SchoolEnrollment" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "partyId" TEXT;

-- AlterTable
ALTER TABLE "TicketOrder" ADD COLUMN     "partyId" TEXT;

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "PartyKind" NOT NULL DEFAULT 'PERSON',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phoneNorm" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "branchCode" TEXT DEFAULT '00000',
    "address" TEXT,
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyMergeCandidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyAId" TEXT NOT NULL,
    "partyBId" TEXT NOT NULL,
    "reason" "PartyMergeReason" NOT NULL,
    "status" "PartyMergeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyMergeCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Party_tenantId_taxId_idx" ON "Party"("tenantId", "taxId");

-- CreateIndex
CREATE INDEX "Party_tenantId_phoneNorm_idx" ON "Party"("tenantId", "phoneNorm");

-- CreateIndex
CREATE INDEX "Party_tenantId_email_idx" ON "Party"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Party_tenantId_mergedIntoId_idx" ON "Party"("tenantId", "mergedIntoId");

-- CreateIndex
CREATE INDEX "PartyMergeCandidate_tenantId_status_idx" ON "PartyMergeCandidate"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PartyMergeCandidate_tenantId_partyAId_partyBId_key" ON "PartyMergeCandidate"("tenantId", "partyAId", "partyBId");

-- CreateIndex
CREATE INDEX "AccountContact_partyId_idx" ON "AccountContact"("partyId");

-- CreateIndex
CREATE INDEX "ChatContact_partyId_idx" ON "ChatContact"("partyId");

-- CreateIndex
CREATE INDEX "CrmContact_partyId_idx" ON "CrmContact"("partyId");

-- CreateIndex
CREATE INDEX "Customer_partyId_idx" ON "Customer"("partyId");

-- CreateIndex
CREATE INDEX "HotelReservation_partyId_idx" ON "HotelReservation"("partyId");

-- CreateIndex
CREATE INDEX "HrEmployee_partyId_idx" ON "HrEmployee"("partyId");

-- CreateIndex
CREATE INDEX "PatientRecord_partyId_idx" ON "PatientRecord"("partyId");

-- CreateIndex
CREATE INDEX "SchoolEnrollment_partyId_idx" ON "SchoolEnrollment"("partyId");

-- CreateIndex
CREATE INDEX "Supplier_partyId_idx" ON "Supplier"("partyId");

-- CreateIndex
CREATE INDEX "TicketOrder_partyId_idx" ON "TicketOrder"("partyId");

