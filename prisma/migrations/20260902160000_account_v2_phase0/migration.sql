-- WO 0.3 — Schema เฟส 0 ของระบบบัญชี V2 (BLUEPRINT-ACCOUNT-V2 §3 · DESIGN-SPEC-V2 §14.1/§14.2/§14.11)
--
-- 🔴 additive ล้วน 100%: ADD COLUMN (NULL ได้ / มี DEFAULT) · CREATE TYPE · CREATE TABLE · CREATE INDEX
--    ไม่มี DROP · ไม่มี RENAME · ไม่มี NOT NULL ที่ไม่มี DEFAULT · ไม่มี UPDATE/DELETE ข้อมูล
--    เหตุผล (scripts/vercel-build.sh): prod รัน `migrate deploy` **ก่อน** build เสร็จ ⇒ ระหว่างนั้น
--    โค้ดเก่ายังเสิร์ฟอยู่บน DB ที่ migrate แล้ว — อะไรที่ไม่ additive = โค้ดเก่าพังทันที
--    ⇒ แถวเดิมทุกแถวได้ source='MANUAL' · tags='{}' · pinned=false · ที่เหลือ NULL = พฤติกรรมเดิมเป๊ะ
--
-- 📌 บันทึกการตัดสินใจ (A): **ไม่เพิ่มค่า `VOID` ใน enum AccountDocStatus**
--    ของเดิมมี "ยกเลิก" ครบสองความหมายอยู่แล้ว และโค้ดทั้งโมดูลใช้คู่นี้จริง:
--      · `CANCELLED` = ยกเลิกก่อนมีผล (ยกเลิกร่าง)
--      · `VOIDED`    = เคยมีผลแล้วถูกยกเลิก (+ reversal JV) — คู่กับคอลัมน์ `voidedAt` / `voidReason`
--    (ดู account/expense.ts:778-806, service.ts:1642-1649 · ป้ายไทยทั้งคู่ = "ยกเลิก" ที่ service.ts:65-66)
--    เพิ่ม `VOID` = ค่าที่สามที่แปลว่าเรื่องเดียวกัน → รายงาน/ตัวกรอง/posting rule ต้องเช็ค 3 ค่าตลอดไป
--    และ ADD VALUE ถอนคืนไม่ได้ ⇒ จงใจไม่เพิ่ม
--
-- 🔴 ท้ายไฟล์มี **partial unique index** ที่เขียนมือ (Prisma แสดงไม่ได้) — ห้ามลบเวลา regenerate diff
--    เพราะ `prisma migrate diff` มองไม่เห็นมัน จึงไม่มีวันสร้างให้เอง

-- CreateEnum
CREATE TYPE "AccountDocSource" AS ENUM ('MANUAL', 'AI', 'IMPORT', 'INBOX', 'CRM', 'POS', 'RECURRING');

-- CreateEnum
CREATE TYPE "AccountPriceMode" AS ENUM ('EXCL_VAT', 'INCL_VAT', 'NO_VAT');

-- CreateEnum
CREATE TYPE "AccountDiscountMode" AS ENUM ('AMOUNT', 'PERCENT');

-- AlterTable
ALTER TABLE "AccountContact" ADD COLUMN     "bankAccountNote" TEXT,
ADD COLUMN     "defaultPriceMode" "AccountPriceMode",
ADD COLUMN     "defaultWhtRateBp" INTEGER,
ADD COLUMN     "defaultWhtType" TEXT,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "phoneNorm" TEXT;

-- AlterTable
ALTER TABLE "AccountDocument" ADD COLUMN     "discountMode" "AccountDiscountMode",
ADD COLUMN     "priceMode" "AccountPriceMode",
ADD COLUMN     "salesUserId" TEXT,
ADD COLUMN     "source" "AccountDocSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "AccountFinance" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AccountLedger" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AccountProduct" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AccountContactGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountContactGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountContactGroupMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountContactGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountContactGroup_systemId_sortOrder_idx" ON "AccountContactGroup"("systemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountContactGroup_systemId_name_key" ON "AccountContactGroup"("systemId", "name");

-- CreateIndex
CREATE INDEX "AccountContactGroupMember_systemId_contactId_idx" ON "AccountContactGroupMember"("systemId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountContactGroupMember_groupId_contactId_key" ON "AccountContactGroupMember"("groupId", "contactId");

-- CreateIndex
CREATE INDEX "AccountContact_systemId_phoneNorm_idx" ON "AccountContact"("systemId", "phoneNorm");

-- CreateIndex
CREATE INDEX "AccountContact_systemId_taxId_branchCode_idx" ON "AccountContact"("systemId", "taxId", "branchCode");

-- CreateIndex
CREATE INDEX "AccountDocument_systemId_docType_source_idx" ON "AccountDocument"("systemId", "docType", "source");

-- CreateIndex
CREATE INDEX "AccountFinance_systemId_pinned_archivedAt_idx" ON "AccountFinance"("systemId", "pinned", "archivedAt");

-- CreateIndex
CREATE INDEX "AccountLedger_systemId_pinned_archivedAt_idx" ON "AccountLedger"("systemId", "pinned", "archivedAt");

-- CreateIndex
CREATE INDEX "AccountProduct_systemId_pinned_archivedAt_idx" ON "AccountProduct"("systemId", "pinned", "archivedAt");

-- AddForeignKey
ALTER TABLE "AccountContactGroupMember" ADD CONSTRAINT "AccountContactGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccountContactGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountContactGroupMember" ADD CONSTRAINT "AccountContactGroupMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- ผู้ติดต่อซ้ำ: ห้ามมีเลขผู้เสียภาษี + รหัสสาขา ซ้ำกัน "ในกลุ่มที่ยังใช้งานอยู่" ของระบบเดียวกัน
--
-- ทำไมต้อง partial (WHERE) และทำไมต้องเขียนมือ:
--   · `taxId IS NOT NULL` — ผู้ติดต่อที่ยังไม่กรอกเลขภาษีมีได้หลายราย (NULL ใน pg ไม่ชนกันอยู่แล้ว
--     แต่เขียนไว้ให้ index เล็กและอ่านออกว่าเจตนาคืออะไร)
--   · `archivedAt IS NULL` — ของที่ "เก็บเข้ากรุ" แล้วต้องคงอยู่ได้ ทั้งที่เลขภาษีเดิมถูกใช้ซ้ำโดยรายใหม่
--     (เช่น สร้างผิดแล้วเก็บทิ้ง แล้วสร้างใหม่ด้วยเลขเดิม — ต้องทำได้)
--   · Prisma `@@unique` ไม่มี `where` ⇒ ถ้าประกาศใน schema จะกลายเป็น unique เต็มตาราง = ผิดเจตนา
--     schema จึงประกาศแค่ `@@index([systemId, taxId, branchCode])` (มีคอมเมนต์ชี้มาที่ไฟล์นี้)
--
-- ⚠️ ถ้าวันใดข้อมูลเก่ามีคู่ซ้ำอยู่แล้ว คำสั่งนี้จะล้ม (= migration ล้ม = build ล้ม) โดยตั้งใจ:
--    ต้องรวมรายการซ้ำก่อน ไม่ใช่ปล่อยผ่านเงียบ ๆ (ตรวจก่อนด้วย:
--      SELECT "systemId","taxId","branchCode",count(*) FROM "AccountContact"
--       WHERE "taxId" IS NOT NULL AND "archivedAt" IS NULL
--       GROUP BY 1,2,3 HAVING count(*) > 1;)
CREATE UNIQUE INDEX "AccountContact_systemId_taxId_branchCode_active_key"
  ON "AccountContact" ("systemId", "taxId", "branchCode")
  WHERE "taxId" IS NOT NULL AND "archivedAt" IS NULL;
