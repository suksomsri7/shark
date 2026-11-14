-- ACC T4.1 / T4.3 / T4.6 (lane 2): JV approver · asset tax class (land = no depreciation) · books start date
-- additive only: nullable columns
ALTER TABLE "AccountJournalEntry" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "AccountJournalEntry" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "AccountFixedAsset" ADD COLUMN IF NOT EXISTS "taxClass" TEXT;
ALTER TABLE "AccountSettings" ADD COLUMN IF NOT EXISTS "booksStartDate" TIMESTAMP(3);
