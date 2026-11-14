-- ACC T3 merge (lane 1 × lane 2) — converge "AccountDocument"."whtCondition" to TEXT code from any starting state:
--   (a) fresh DB / lane-1 DB: column is TEXT already, no legacy column → only the safety steps run (no-op)
--   (b) lane-2 DB: 20270101100050 renamed the INTEGER column to "whtConditionBoxLegacy" → copy box → code, drop it
--   (c) a DB where the INTEGER column is still named "whtCondition" (e.g. 100050 skipped/applied out of order before
--       the lane-2 migration ran): convert the type in place
-- Box 1 = WITHHOLD · 2 = PAY_ALWAYS · 3 = PAY_ONCE · 4 = OTHER (wht-forms.WHT_CONDITIONS). Idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'AccountDocument' AND column_name = 'whtCondition' AND data_type = 'integer'
  ) THEN
    ALTER TABLE "AccountDocument" ALTER COLUMN "whtCondition" TYPE TEXT USING (
      CASE "whtCondition" WHEN 1 THEN 'WITHHOLD' WHEN 2 THEN 'PAY_ALWAYS' WHEN 3 THEN 'PAY_ONCE' WHEN 4 THEN 'OTHER' ELSE NULL END
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'AccountDocument' AND column_name = 'whtConditionBoxLegacy'
  ) THEN
    ALTER TABLE "AccountDocument" ADD COLUMN IF NOT EXISTS "whtCondition" TEXT;
    EXECUTE $q$
      UPDATE "AccountDocument" SET "whtCondition" =
        CASE "whtConditionBoxLegacy" WHEN 1 THEN 'WITHHOLD' WHEN 2 THEN 'PAY_ALWAYS' WHEN 3 THEN 'PAY_ONCE' WHEN 4 THEN 'OTHER' END
      WHERE "whtCondition" IS NULL AND "whtConditionBoxLegacy" IS NOT NULL
    $q$;
    ALTER TABLE "AccountDocument" DROP COLUMN "whtConditionBoxLegacy";
  END IF;
END $$;
ALTER TABLE "AccountDocument" ADD COLUMN IF NOT EXISTS "whtCondition" TEXT;
