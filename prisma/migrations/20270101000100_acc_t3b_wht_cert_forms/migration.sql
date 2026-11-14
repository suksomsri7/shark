-- ACC T3.3 / T3.4 / T3.5 (lane 2): 50 ทวิ condition · received flag on certificates customers withheld · additional ภ.ง.ด. filings
-- additive only: nullable columns + a new table
-- (merge T3) "whtCondition" removed from this migration: one column, TEXT code, added by 20270101100100_acc_t3_wht.
--   A DB that already ran the earlier version of this file (INTEGER column) converges via 20270101100050 + 20270101100200.
ALTER TABLE "AccountDocument" ADD COLUMN IF NOT EXISTS "whtCertReceivedAt" TIMESTAMP(3);
ALTER TABLE "AccountDocument" ADD COLUMN IF NOT EXISTS "whtCertReceivedById" TEXT;
ALTER TABLE "AccountDocument" ADD COLUMN IF NOT EXISTS "whtCertReceivedNote" TEXT;
CREATE INDEX IF NOT EXISTS "AccountDocument_systemId_docType_direction_whtCertReceivedAt_idx" ON "AccountDocument"("systemId", "docType", "direction", "whtCertReceivedAt");

CREATE TABLE IF NOT EXISTS "AccountWhtAdditionalFiling" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "form" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filedById" TEXT,
    "totalBaseSatang" INTEGER NOT NULL,
    "totalTaxSatang" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "deltaTaxSatang" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountWhtAdditionalFiling_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountWhtAdditionalFiling_systemId_form_periodKey_seq_key" ON "AccountWhtAdditionalFiling"("systemId", "form", "periodKey", "seq");
CREATE INDEX IF NOT EXISTS "AccountWhtAdditionalFiling_tenantId_systemId_idx" ON "AccountWhtAdditionalFiling"("tenantId", "systemId");
