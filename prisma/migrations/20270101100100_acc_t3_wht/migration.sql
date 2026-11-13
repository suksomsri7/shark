-- ACC T3.1 · T3.2 · T3.6 · T3.7 (เลน 1) — หัก ณ ที่จ่าย: รหัสประเภทเงินได้ขยาย · ฐานของงวด · e-WHT/ตัวแทน · ออกภาษีให้ · ธงผู้ขาย — additive ทั้งหมด
ALTER TABLE "AccountDocument" ADD COLUMN "whtIncomeCode" TEXT;
ALTER TABLE "AccountDocument" ADD COLUMN "whtCondition" TEXT;
ALTER TABLE "AccountDocumentLine" ADD COLUMN "whtIncomeCode" TEXT;
ALTER TABLE "AccountDocumentPayment" ADD COLUMN "whtIncomeType" "AccountWhtIncomeType";
ALTER TABLE "AccountDocumentPayment" ADD COLUMN "whtIncomeCode" TEXT;
ALTER TABLE "AccountDocumentPayment" ADD COLUMN "whtBaseSatang" INTEGER;
ALTER TABLE "AccountDocumentPayment" ADD COLUMN "whtChannel" TEXT;
ALTER TABLE "AccountDocumentPayment" ADD COLUMN "whtCondition" TEXT;
ALTER TABLE "AccountDocumentPayment" ADD COLUMN "whtBorneSatang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AccountDocumentPayment" ADD COLUMN "ewhtRef" TEXT;
ALTER TABLE "AccountContact" ADD COLUMN "whtAgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountContact" ADD COLUMN "whtRecipient" TEXT;
