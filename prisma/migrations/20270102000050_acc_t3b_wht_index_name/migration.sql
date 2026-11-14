-- ACC T4 step 0 (lane 2): 20270101000100 created an index whose name is longer than 63 bytes; Postgres truncated it to
-- "..._whtCertReceivedAt_id" while Prisma expects "..._whtCertReceivedA_idx" ⇒ `migrate diff` reported a rename on every DB.
-- Rename only when the truncated name exists (idempotent; fresh DBs get the same truncated name from 20270101000100).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AccountDocument_systemId_docType_direction_whtCertReceivedAt_id')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AccountDocument_systemId_docType_direction_whtCertReceivedA_idx') THEN
    ALTER INDEX "AccountDocument_systemId_docType_direction_whtCertReceivedAt_id" RENAME TO "AccountDocument_systemId_docType_direction_whtCertReceivedA_idx";
  END IF;
END $$;
