-- WO 3.3 — modal เพิ่ม/แก้ไขผู้ติดต่อ พื้นฐาน/ขั้นสูง (DESIGN-SPEC-V2 §7.2 · ภาพ g5)
--
-- additive ล้วน: ADD COLUMN (nullable ทั้งหมด ยกเว้น tags ที่มี DEFAULT '[]') + CREATE INDEX
-- ไม่มี DROP / RENAME / NOT NULL ไร้ default / UPDATE-DELETE ข้อมูล
-- ส่วน ALTER/CreateIndex ด้านล่างสร้างจาก:
--   prisma migrate diff --from-config-datasource --to-schema prisma/schema --script
-- (รันด้วย DIRECT_URL ของ Neon branch `wo-acc-v2-qc` เท่านั้น — .env = prod ห้ามแตะ)
--
-- 🔴 ไม่มี data migration ที่นี่โดยตั้งใจ: การเติมเลขที่ (`code`) ให้แถวเก่าทำด้วยสคริปต์
--    `scripts/acc-v2-contact-code-backfill.mts` (DB QC) — prod ค่อยรันทีหลังเมื่อเฟส 3 ปิด
--    ระหว่างที่ยังไม่ backfill: `code` = NULL → หน้ารายการถอยไปใช้เลขที่คำนวณสดของ WO 3.2 (ไม่พัง)

-- AlterTable
ALTER TABLE "AccountContact" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "apAccountCode" TEXT,
ADD COLUMN     "arAccountCode" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'TH',
ADD COLUMN     "district" TEXT,
ADD COLUMN     "fax" TEXT,
ADD COLUMN     "legalEntityType" TEXT,
ADD COLUMN     "lineId" TEXT,
ADD COLUMN     "officeType" TEXT,
ADD COLUMN     "personTitle" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "subdistrict" TEXT,
ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "taxIdCountry" TEXT DEFAULT 'TH',
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE INDEX "AccountContact_systemId_code_idx" ON "AccountContact"("systemId", "code");

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 partial unique index (เขียนมือ — `prisma migrate diff` มองไม่เห็น partial index)
--    เหตุผลเดียวกับ AccountContact_systemId_taxId_branchCode_active_key ของ migration
--    20260902160000_account_v2_phase0: ถ้าประกาศ @@unique ใน schema ตรง ๆ จะกลายเป็น unique
--    เต็มตาราง = ผู้ติดต่อที่ถูกปิดใช้งานแล้วจะกันเลขเดิมไว้ตลอดกาล ซึ่งไม่ใช่ที่ต้องการ
--
--    ตัวนี้คือ "ของจริง" ที่กันเลขที่ซ้ำตอนสร้างพร้อมกันหลายคน (race) — ตรรกะใน service
--    (nextContactCode + retry) พึ่งพาให้ index นี้โยน P2002 ขึ้นมา ไม่ใช่กันเองด้วย SELECT
--    ⚠️ ห้ามลบบล็อกนี้ออกจาก migration เวลาสร้าง migration ใหม่ด้วย diff
--
--    ตอนสร้าง index ยังไม่มีแถวไหนมี code (คอลัมน์เพิ่งเกิด) ⇒ ไม่มีทางล้มจากข้อมูลเดิม
CREATE UNIQUE INDEX "AccountContact_systemId_code_active_key"
  ON "AccountContact" ("systemId", "code")
  WHERE "code" IS NOT NULL AND "archivedAt" IS NULL;
