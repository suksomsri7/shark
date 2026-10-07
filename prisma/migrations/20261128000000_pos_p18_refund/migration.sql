-- POS P1.8 — คืนเงินบางส่วน · ใบลดหนี้ (มติ R1 R2 R4) · additive ล้วน: enum ใหม่ 1 + คอลัมน์ใหม่ 6 (nullable หรือมี DEFAULT) + ตารางใหม่ 1 + unique 1
-- ส่วนล่าง (ใต้ SET) = ผลของ `prisma migrate diff --from-schema <schema ก่อน P1.8> --to-schema prisma/schema --script` ทุกบรรทัด
--   (diff จาก QC4 ตรง ๆ มี DROP INDEX ของ CRM ที่สร้างมือนอก prisma 3 ตัวด้วย — ตัดทิ้ง ไม่ใช่ของใบนี้)
-- ไม่มี FK · ไม่มี index บน refSaleId/refLineId (P6.1 สร้าง CONCURRENTLY) · ไม่มี DROP/RENAME/SET NOT NULL/ALTER TYPE ADD VALUE
-- ADD COLUMN ... NOT NULL DEFAULT <ค่าคงที่> บน PG ≥ 11 = แก้ catalog อย่างเดียว ไม่เขียนแถวเดิมใหม่
SET lock_timeout = '3s';
-- CreateEnum
CREATE TYPE "PosSaleDocType" AS ENUM ('SALE', 'REFUND');

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "docType" "PosSaleDocType" NOT NULL DEFAULT 'SALE',
ADD COLUMN     "reasonCode" TEXT,
ADD COLUMN     "refSaleId" TEXT,
ADD COLUMN     "refundedSatang" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PosSaleLine" ADD COLUMN     "refLineId" TEXT,
ADD COLUMN     "restock" BOOLEAN;

-- CreateTable
CREATE TABLE "PosDocCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "docType" "PosSaleDocType" NOT NULL,
    "period" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosDocCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosDocCounter_unitId_docType_period_key" ON "PosDocCounter"("unitId", "docType", "period");

