-- ACC T1.4 + T1.5 — สถานะภาษีซื้อ + วันที่ใบกำกับ/วันที่ลงภาษีซื้อ/ข้อความเคลมข้ามเดือน (additive · nullable)
-- CreateEnum
CREATE TYPE "AccountInputVatStatus" AS ENUM ('CLAIM', 'PENDING', 'NO_CLAIM');

-- AlterTable
ALTER TABLE "AccountDocument" ADD COLUMN "inputVatStatus" "AccountInputVatStatus",
ADD COLUMN "vendorInvoiceDate" TIMESTAMP(3),
ADD COLUMN "inputVatClaimDate" TIMESTAMP(3),
ADD COLUMN "inputVatLateNote" TEXT;

-- AlterTable
ALTER TABLE "AccountDocumentLine" ADD COLUMN "inputVatStatus" "AccountInputVatStatus",
ADD COLUMN "inputVatReason" TEXT;
