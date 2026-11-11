-- POS P1.2 — ตัวเลือก · ตัวแปร · ชุด/คอมโบ · สินค้าชั่ง · additive ล้วน:
--   ตารางใหม่ 1 (PosSaleLineOption + FK ไป PosSaleLine ON DELETE CASCADE) · คอลัมน์ nullable 2 บน PosSaleLine ·
--   คอลัมน์ 2 บน PosProduct (Boolean มี DEFAULT ค่าคงที่ = metadata-only บน PG ≥ 11 ไม่ rewrite ตาราง · String nullable)
-- ส่วนบน = ผลของ `prisma migrate diff --from-schema <schema ก่อน P1.2 (473e1227)> --to-schema prisma/schema --script` ทุกบรรทัด (ไม่ต้องใช้ DB)
-- ส่วนท้าย = partial unique เขียนมือ (prisma แสดง WHERE ไม่ได้)
-- ไม่มีบล็อก plpgsql/dollar-quote ⇒ prisma รันทีละคำสั่ง · lock_timeout ระดับ session
SET lock_timeout = '3s';

-- AlterTable
ALTER TABLE "PosSaleLine" ADD COLUMN     "components" JSONB,
ADD COLUMN     "weightGrams" INTEGER;

-- AlterTable
ALTER TABLE "PosProduct" ADD COLUMN     "scalePlu" TEXT,
ADD COLUMN     "soldByWeight" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PosSaleLineOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "choiceId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "choiceName" TEXT NOT NULL,
    "priceDeltaSatang" INTEGER NOT NULL,

    CONSTRAINT "PosSaleLineOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosSaleLineOption_tenantId_idx" ON "PosSaleLineOption"("tenantId");

-- CreateIndex
CREATE INDEX "PosSaleLineOption_saleId_idx" ON "PosSaleLineOption"("saleId");

-- CreateIndex
CREATE INDEX "PosSaleLineOption_lineId_idx" ON "PosSaleLineOption"("lineId");

-- AddForeignKey
ALTER TABLE "PosSaleLineOption" ADD CONSTRAINT "PosSaleLineOption_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "PosSaleLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- HandWritten (R9): รหัสป้ายชั่ง (PLU) ไม่ซ้ำในแถวที่ยังขายอยู่ของระบบ POS เดียว — แข่งกันได้ผู้ชนะคนเดียว (P2002 → CONFLICT ที่ catalog.ts)
--   แถวเดิมทุกแถว scalePlu = NULL ⇒ ไม่มีวันชนตอนสร้าง (สแกน PosProduct ครั้งเดียวภายใต้ lock_timeout 3s)
CREATE UNIQUE INDEX "PosProduct_systemId_scalePlu_active_key" ON "PosProduct"("systemId", "scalePlu") WHERE "archivedAt" IS NULL AND "scalePlu" IS NOT NULL;

RESET lock_timeout;
