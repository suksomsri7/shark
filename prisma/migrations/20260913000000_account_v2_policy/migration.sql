-- AlterTable
ALTER TABLE "AccountSettings" ADD COLUMN     "autoCloseNotify" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoClosePeriods" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "convertPoTo" TEXT,
ADD COLUMN     "convertQtTo" TEXT,
ADD COLUMN     "copyNotesOnConvert" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "copyTagsOnConvert" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "defaultExpenseAccountCode" TEXT,
ADD COLUMN     "defaultPriceMode" "AccountPriceMode",
ADD COLUMN     "defaultPurchaseAccountCode" TEXT,
ADD COLUMN     "defaultSalesAccountCode" TEXT,
ADD COLUMN     "dupContactPolicy" TEXT,
ADD COLUMN     "dupProductPolicy" TEXT,
ADD COLUMN     "emailReportDaily" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailReportRecipients" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "emailReportWeekly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lockBeforeDate" TIMESTAMP(3),
ADD COLUMN     "periodCloseDay" INTEGER,
ADD COLUMN     "vatTiming" "AccountVatTiming" NOT NULL DEFAULT 'ON_ISSUE',
ADD COLUMN     "whtDefaults" JSONB NOT NULL DEFAULT '[]';


-- ─────────── backfill จาก docConfig เดิม (WO 8.2) ───────────
-- 🔴 ก่อนหน้านี้ "จุดรับรู้ภาษีขาย" เก็บใน AccountSettings.docConfig->>'taxPointBasis'
--    ถ้าไม่ย้ายค่าขึ้นคอลัมน์ ร้านที่ตั้ง ON_PAYMENT ไว้จะเด้งกลับ ON_ISSUE เงียบ ๆ = VAT ผิดงวด
UPDATE "AccountSettings"
   SET "vatTiming" = 'ON_PAYMENT'
 WHERE "docConfig" ->> 'taxPointBasis' = 'ON_PAYMENT';

-- นโยบายชื่อซ้ำของผู้ติดต่อ เดิมอยู่ docConfig->>'dupNamePolicy' ("warn" | "block")
UPDATE "AccountSettings"
   SET "dupContactPolicy" = 'BLOCK'
 WHERE "docConfig" ->> 'dupNamePolicy' = 'block';
UPDATE "AccountSettings"
   SET "dupContactPolicy" = 'WARN'
 WHERE "docConfig" ->> 'dupNamePolicy' = 'warn';

