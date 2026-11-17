-- HF-TENANT: unique keys of HrSalaryProfile / HrPayrollRun become tenant-scoped. Index statements only.
-- Create-before-drop; idempotent; no-op on databases that already carry the HR V2 indexes.

CREATE UNIQUE INDEX IF NOT EXISTS "HrSalaryProfile_tenantId_systemId_employeeId_key"
  ON "HrSalaryProfile"("tenantId", "systemId", "employeeId");
DROP INDEX IF EXISTS "HrSalaryProfile_systemId_employeeId_key";

-- Only where main's FULL unique still exists (= V2's 20261202000000 has not run).
-- On a V2 database a full unique would break "re-run after REVERSED".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes
             WHERE schemaname = current_schema() AND tablename = 'HrPayrollRun'
               AND indexname = 'HrPayrollRun_systemId_periodKey_key') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "HrPayrollRun_tenantId_systemId_periodKey_key"
      ON "HrPayrollRun"("tenantId", "systemId", "periodKey");
    DROP INDEX "HrPayrollRun_systemId_periodKey_key";
  END IF;
END $$;
