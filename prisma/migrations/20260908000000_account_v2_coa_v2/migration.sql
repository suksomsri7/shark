-- AlterTable
ALTER TABLE "AccountLedger" ADD COLUMN     "defaultWhtRateBp" INTEGER,
ADD COLUMN     "defaultWhtType" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "level" INTEGER,
ADD COLUMN     "sortOrder" INTEGER,
ADD COLUMN     "vatTreatment" TEXT;

