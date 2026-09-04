-- CreateEnum
CREATE TYPE "AccountBankStatementLineStatus" AS ENUM ('UNMATCHED', 'SUGGESTED', 'MATCHED', 'CREATED', 'SKIPPED');

-- AlterTable
ALTER TABLE "AccountJournalLine" ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "reconciledStatementLineId" TEXT;

-- CreateTable
CREATE TABLE "AccountBankStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "financeId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,
    "openingBalanceSatang" INTEGER,
    "closingBalanceSatang" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountBankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountBankStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "financeId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "txDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "refNo" TEXT,
    "amountSatang" INTEGER NOT NULL,
    "balanceAfterSatang" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "status" "AccountBankStatementLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedLineId" TEXT,
    "matchedEntryId" TEXT,
    "suggestedLineId" TEXT,
    "suggestedEntryId" TEXT,
    "suggestedHint" TEXT,
    "createdEntryId" TEXT,
    "skipReason" TEXT,
    "matchedAt" TIMESTAMP(3),
    "matchedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountBankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountBankStatement_systemId_financeId_periodKey_idx" ON "AccountBankStatement"("systemId", "financeId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBankStatement_financeId_periodKey_key" ON "AccountBankStatement"("financeId", "periodKey");

-- CreateIndex
CREATE INDEX "AccountBankStatementLine_systemId_statementId_txDate_idx" ON "AccountBankStatementLine"("systemId", "statementId", "txDate");

-- CreateIndex
CREATE INDEX "AccountBankStatementLine_systemId_financeId_status_idx" ON "AccountBankStatementLine"("systemId", "financeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBankStatementLine_financeId_fingerprint_key" ON "AccountBankStatementLine"("financeId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBankStatementLine_financeId_matchedLineId_key" ON "AccountBankStatementLine"("financeId", "matchedLineId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountJournalLine_reconciledStatementLineId_key" ON "AccountJournalLine"("reconciledStatementLineId");

-- CreateIndex
CREATE INDEX "AccountJournalLine_systemId_accountId_reconciledAt_idx" ON "AccountJournalLine"("systemId", "accountId", "reconciledAt");

-- AddForeignKey
ALTER TABLE "AccountBankStatementLine" ADD CONSTRAINT "AccountBankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "AccountBankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

