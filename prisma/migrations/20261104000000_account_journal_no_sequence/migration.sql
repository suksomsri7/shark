-- account_journal_no_sequence — CRM C5.4-N (journal-voucher numbering race R9-7 / R10-9 / R11-2 · owner decision P20 (a))
-- Journal-voucher numbers come from ONE Postgres SEQUENCE per (system, book) instead of `count + 1` (gl.ts nextJournalNo).
--   nextval never waits and never collides; a rolled-back transaction leaves a gap (allowed by P20 — legal documents keep their
--   gapless AccountDocSequence counters, unchanged here). Display format unchanged: <SV|PV|RV|PY|JV>-<yyyy>-<mm>-<n ≥4 digits>,
--   n does NOT reset monthly (owner Q1 pending, default taken — see ledger/wo-notes/crm-C5.4-N.md).
-- ADDITIVE · idempotent (CREATE OR REPLACE / IF NOT EXISTS / ensure is a no-op when the sequence exists) · no table is altered,
--   rewritten or renumbered · no Prisma schema change. Locks taken: AccessShareLock on "AccountLedger"/"AccountJournalEntry"
--   (plain SELECTs — never blocks a writer); new sequences are new catalog objects. Safe on a live database.
-- Old code ignores every object below (it keeps counting rows) until the new code is deployed.

-- name of the sequence of (system, book): acc_jno_<systemId>_<book> (cuid ids are [a-z0-9]{25}; anything else → md5 so the
-- identifier stays ≤ 63 chars and needs no quoting)
CREATE OR REPLACE FUNCTION account_jno_seq_name(p_system text, p_book text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'acc_jno_' || CASE WHEN p_system ~ '^[a-z0-9]{1,40}$' THEN p_system ELSE md5(p_system) END || '_' || lower(p_book)
$$;

-- highest numeric suffix already used by this (system, book) in ANY period (sequence numbers do not reset monthly)
CREATE OR REPLACE FUNCTION account_jno_floor(p_system text, p_book text) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(MAX((substring("docNo" FROM '(\d+)$'))::bigint), 0)
  FROM "AccountJournalEntry"
  WHERE "systemId" = p_system AND "book" = p_book::"AccountJournalBook" AND "docNo" ~ '\d+$'
$$;

-- make sure the sequence exists; when it is created now, start it above every number the book already uses (+ margin)
--   Two transactions creating the same sequence at once: the second waits for the first's commit on the catalog key, then
--   gets unique_violation — caught here (sub-transaction only on this rare path) and the now-visible sequence is returned.
CREATE OR REPLACE FUNCTION account_jno_ensure(p_system text, p_book text, p_margin bigint DEFAULT 0) RETURNS regclass
LANGUAGE plpgsql AS $$
DECLARE n text := account_jno_seq_name(p_system, p_book); r regclass; f bigint;
BEGIN
  r := to_regclass(quote_ident(n));
  IF r IS NOT NULL THEN RETURN r; END IF;
  BEGIN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I AS bigint MINVALUE 1 START WITH 1 CACHE 1 NO CYCLE', n);
    r := to_regclass(quote_ident(n));
    f := account_jno_floor(p_system, p_book) + GREATEST(p_margin, 0);
    IF f > 0 THEN PERFORM setval(r, f, true); END IF;   -- next nextval = f + 1
  EXCEPTION WHEN unique_violation OR duplicate_table THEN
    r := to_regclass(quote_ident(n));                    -- created and committed by a concurrent first posting
  END;
  RETURN r;
END $$;

-- allocate the next number of (system, book) — consuming, non-transactional, never waits
CREATE OR REPLACE FUNCTION account_next_journal_no(p_system text, p_book text) RETURNS bigint
LANGUAGE sql AS $$ SELECT nextval(account_jno_ensure(p_system, p_book)) $$;

-- non-consuming preview (manual-JV modal) — reads the sequence, writes nothing, creates nothing
CREATE OR REPLACE FUNCTION account_peek_journal_no(p_system text, p_book text) RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE r regclass := to_regclass(quote_ident(account_jno_seq_name(p_system, p_book))); v bigint; c boolean;
BEGIN
  IF r IS NULL THEN RETURN account_jno_floor(p_system, p_book) + 1; END IF;
  EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;
  RETURN CASE WHEN c THEN v + 1 ELSE v END;
END $$;

-- drop the 5 sequences of a system (tenant purge · QC teardown)
CREATE OR REPLACE FUNCTION account_jno_drop(p_system text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I', account_jno_seq_name(p_system, b));
  END LOOP;
END $$;

-- pre-create the 5 books of every system that has a chart of accounts. Margin 100 for systems that posted in the last day:
-- absorbs the count+1 numbers old code may still hand out between this migration and the code deploy (one-time visible jump of
-- ≤ 100 in those books — accepted, controller ruling Q5). Systems created later get their sequences lazily (account_jno_ensure).
DO $$
DECLARE s record; b text; m bigint;
BEGIN
  FOR s IN SELECT DISTINCT "systemId" AS id FROM "AccountLedger" LOOP
    m := CASE WHEN EXISTS (SELECT 1 FROM "AccountJournalEntry" e WHERE e."systemId" = s.id AND e."createdAt" > now() - interval '1 day') THEN 100 ELSE 0 END;
    FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP
      PERFORM account_jno_ensure(s.id, b, m);
    END LOOP;
  END LOOP;
END $$;
