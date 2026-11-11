-- POS P2.3 — สูตร/วัตถุดิบ (BOM) ของเมนู: PosProduct.bomEnabled (opt-in · มติ Q1/CD2) + PosRecipeChoiceLine (ส่วนต่างของสูตรต่อตัวเลือก · มติ Q2/CD3) · เพิ่มล้วน
-- ที่มา: prisma migrate diff --from-schema <schema ก่อน P2.3 (session/pos 7f633a26)> --to-schema prisma/schema --script (ไม่ได้ diff จากฐาน)
--   แก้มือ: CREATE TABLE / CREATE INDEX / ADD COLUMN ใส่ IF NOT EXISTS · FK ย้ายเข้า CREATE TABLE (ชื่อ/กติกาเดิมของ prisma · รันซ้ำได้ทั้งไฟล์)
--   เขียนมือ (prisma มองไม่เห็น — 🔴 ห้ามลบ): CHECK "PosRecipeChoiceLine_qtyDelta_check" (ส่วนต่างต้องไม่เป็นศูนย์) ใน CREATE TABLE
-- 🔴 ไม่มี DROP/RENAME/UPDATE/DELETE/INSERT · ไม่มี backfill (สูตรเมนูเดิมคง bomEnabled false = ยังไม่ตัดสต็อก) ·
--    ADD COLUMN NOT NULL DEFAULT false = metadata-only บน PG ≥ 11 (ไม่ rewrite ตาราง)
SET lock_timeout = '3s';

-- AlterTable
ALTER TABLE "PosProduct" ADD COLUMN IF NOT EXISTS "bomEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable (+ CHECK เขียนมือ: ส่วนต่าง 0 ไม่มีความหมาย · FK productId → PosProduct ON DELETE CASCADE แบบ RecipeLine)
CREATE TABLE IF NOT EXISTS "PosRecipeChoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "choiceId" TEXT NOT NULL,
    "invItemId" TEXT NOT NULL,
    "qtyDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosRecipeChoiceLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PosRecipeChoiceLine_qtyDelta_check" CHECK ("qtyDelta" <> 0),
    CONSTRAINT "PosRecipeChoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosRecipeChoiceLine_tenantId_idx" ON "PosRecipeChoiceLine"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosRecipeChoiceLine_invItemId_idx" ON "PosRecipeChoiceLine"("invItemId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PosRecipeChoiceLine_productId_choiceId_invItemId_key" ON "PosRecipeChoiceLine"("productId", "choiceId", "invItemId");

RESET lock_timeout;
