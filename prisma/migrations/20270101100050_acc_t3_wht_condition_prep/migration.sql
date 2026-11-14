-- ACC T3 merge (lane 1 × lane 2) — "AccountDocument"."whtCondition" has ONE representation: TEXT code
--   WITHHOLD | PAY_ALWAYS | PAY_ONCE | OTHER (box 1–4 on the 50 ทวิ via wht-forms.whtConditionOf).
-- A DB that ran the earlier lane-2 migration has it as INTEGER (box 1–4); 20270101100100 then adds it as TEXT
-- without IF NOT EXISTS. So, only when the column exists AND is an integer, move it aside here; 20270101100200
-- copies the boxes into the TEXT column as codes and drops the aside column.
-- Idempotent: no-op on a fresh DB (column absent) and on a DB where the column is already TEXT.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'AccountDocument' AND column_name = 'whtCondition' AND data_type = 'integer'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'AccountDocument' AND column_name = 'whtConditionBoxLegacy'
  ) THEN
    ALTER TABLE "AccountDocument" RENAME COLUMN "whtCondition" TO "whtConditionBoxLegacy";
  END IF;
END $$;
