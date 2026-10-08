-- account_journal_no_sequence — CRM C5.4-N (journal-voucher numbering race R9-7 / R10-9 / R11-2 · owner decision P20 (a))
-- Journal-voucher numbers come from ONE Postgres SEQUENCE per (system, book) instead of `count + 1` (old gl.ts nextJournalNo).
--   nextval never waits and never collides; a rolled-back transaction leaves a gap (allowed by P20 — legal documents keep their
--   gapless AccountDocSequence counters, unchanged here). Display format unchanged: <SV|PV|RV|PY|JV>-<yyyy>-<mm>-<n ≥4 digits>,
--   n does NOT reset monthly (owner Q1 pending, default taken — see ledger/wo-notes/crm-C5.4-N.md).
-- Round 2 (review M1/M3/n1/n3/n8): allocate-until-free (account_alloc_journal_no) · search_path pinned + every object schema-qualified ·
--   floor ignores over-long digit tails instead of aborting · the pre-create block is bounded (recently active systems only, hard cap) and
--   takes no subtransaction · every other system gets its sequences at setup (autocommit, app code) or lazily (fallback).
-- ADDITIVE · idempotent (CREATE OR REPLACE / IF NOT EXISTS / create is a no-op when the sequence exists) · no table is altered, rewritten
--   or renumbered · no Prisma schema change. Locks: AccessShareLock on "AccountJournalEntry" (plain SELECTs — never blocks a writer) + one
--   lock per NEW sequence (invisible to others). Old code ignores every object below (it keeps counting rows) until the new code is deployed.
-- Replaces folder 20261104000000_account_journal_no_sequence (round 1, applied on QC2 only — never on production).

-- name of the sequence of (system, book): acc_jno_<systemId>_<book> (cuid ids are [a-z0-9]{25}; anything else → md5 so the
-- identifier stays ≤ 63 chars and needs no quoting)
CREATE OR REPLACE FUNCTION public.account_jno_seq_name(p_system text, p_book text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT 'acc_jno_' || CASE WHEN p_system ~ '^[a-z0-9]{1,40}$' THEN p_system ELSE md5(p_system) END || '_' || lower(p_book)
$$;

-- the display's number part: padStart(width, "0") — identical to gl.ts journalNoDisplay (longer numbers are never truncated)
CREATE OR REPLACE FUNCTION public.account_jno_pad(p_n bigint, p_width int) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN length(p_n::text) >= p_width THEN p_n::text ELSE lpad(p_n::text, p_width, '0') END
$$;

-- highest numeric suffix already used by this (system, book) in ANY period (sequence numbers do not reset monthly).
-- Tails longer than 18 digits cannot come from a bigint sequence and would overflow ::bigint — they are ignored, not fatal (n8).
CREATE OR REPLACE FUNCTION public.account_jno_floor(p_system text, p_book text) RETURNS bigint
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(MAX((substring(e."docNo" FROM '(\d{1,18})$'))::bigint), 0)
  FROM public."AccountJournalEntry" e
  WHERE e."systemId" = p_system AND e."book" = p_book::public."AccountJournalBook" AND e."docNo" ~ '(^|\D)\d{1,18}$'
$$;

-- create the sequence if missing, starting above every number the book already uses (+ margin). No exception block (no subtransaction):
-- used by the migration below, where nothing else creates these sequences concurrently (old code does not know them).
CREATE OR REPLACE FUNCTION public.account_jno_create(p_system text, p_book text, p_margin bigint DEFAULT 0) RETURNS regclass
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE n text := public.account_jno_seq_name(p_system, p_book); r regclass; f bigint;
BEGIN
  r := to_regclass('public.' || quote_ident(n));
  IF r IS NOT NULL THEN RETURN r; END IF;
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I AS bigint MINVALUE 1 START WITH 1 CACHE 1 NO CYCLE', n);
  r := to_regclass('public.' || quote_ident(n));
  f := public.account_jno_floor(p_system, p_book) + GREATEST(p_margin, 0);
  IF f > 0 THEN PERFORM setval(r, f, true); END IF;   -- next nextval = f + 1
  RETURN r;
END $$;

-- make sure the sequence exists (app: setup path in autocommit, or the in-transaction fallback).
--   Two transactions creating the same sequence at once: the second waits for the first's commit on the catalog key, then gets
--   unique_violation — caught here (sub-transaction only on this create path) and the now-visible sequence is returned.
CREATE OR REPLACE FUNCTION public.account_jno_ensure(p_system text, p_book text, p_margin bigint DEFAULT 0) RETURNS regclass
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE r regclass;
BEGIN
  r := to_regclass('public.' || quote_ident(public.account_jno_seq_name(p_system, p_book)));
  IF r IS NOT NULL THEN RETURN r; END IF;
  BEGIN
    r := public.account_jno_create(p_system, p_book, p_margin);
  EXCEPTION WHEN unique_violation OR duplicate_table THEN
    r := to_regclass('public.' || quote_ident(public.account_jno_seq_name(p_system, p_book)));  -- created by a concurrent first posting
  END;
  RETURN r;
END $$;

-- the 5 books of one system — called by the app at setup time, in autocommit, BEFORE any money transaction. Returns how many were created.
CREATE OR REPLACE FUNCTION public.account_jno_ensure_system(p_system text) RETURNS int
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE b text; c int := 0;
BEGIN
  FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP
    IF to_regclass('public.' || quote_ident(public.account_jno_seq_name(p_system, b))) IS NULL THEN
      PERFORM public.account_jno_ensure(p_system, b);
      c := c + 1;
    END IF;
  END LOOP;
  RETURN c;
END $$;

-- bare allocation (kept for probes/tools; the app uses account_alloc_journal_no)
CREATE OR REPLACE FUNCTION public.account_next_journal_no(p_system text, p_book text) RETURNS bigint
LANGUAGE sql SET search_path = pg_catalog, public AS $$ SELECT nextval(public.account_jno_ensure(p_system, p_book)) $$;

-- M1 · allocate-until-free: the next sequence value whose formatted number (p_prefix || pad(n, p_width)) is NOT already in the table.
--   A taken number means a row was written outside the sequence (old count+1 code between migration and deploy · import · restore ·
--   a recreated sequence): the sequence is moved above the table's highest number of the book — only forward (nextval steps for a gap
--   ≤ 1000; setval only when the sequence is still below the floor) — and the next value is taken. Bounded: 8 attempts, then a clear error.
--   A NULL sequence (concurrent account_jno_drop) is re-ensured, never returned (n1).
CREATE OR REPLACE FUNCTION public.account_alloc_journal_no(p_system text, p_book text, p_prefix text, p_width int) RETURNS bigint
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE r regclass; n bigint; f bigint; v bigint; i int;
BEGIN
  FOR i IN 1..8 LOOP
    r := public.account_jno_ensure(p_system, p_book);
    CONTINUE WHEN r IS NULL;
    n := nextval(r);
    IF NOT EXISTS (SELECT 1 FROM public."AccountJournalEntry" e
                   WHERE e."systemId" = p_system AND e."docNo" = p_prefix || public.account_jno_pad(n, p_width)) THEN
      RETURN n;
    END IF;
    f := public.account_jno_floor(p_system, p_book);
    IF f > n THEN
      IF f - n <= 1000 THEN
        WHILE n < f LOOP n := nextval(r); END LOOP;
      ELSE
        EXECUTE format('SELECT last_value FROM %s', r) INTO v;
        IF v < f THEN PERFORM setval(r, f, true); END IF;
      END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'account_alloc_journal_no: no free journal number for system % book % after 8 attempts', p_system, p_book
    USING ERRCODE = 'P0001', HINT = 'C5.4-N allocate-until-free';
END $$;

-- non-consuming preview (manual-JV modal) — reads the sequence, writes nothing, creates nothing
CREATE OR REPLACE FUNCTION public.account_peek_journal_no(p_system text, p_book text) RETURNS bigint
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE r regclass := to_regclass('public.' || quote_ident(public.account_jno_seq_name(p_system, p_book))); v bigint; c boolean;
BEGIN
  IF r IS NULL THEN RETURN public.account_jno_floor(p_system, p_book) + 1; END IF;
  EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;
  RETURN CASE WHEN c THEN v + 1 ELSE v END;
END $$;

-- drop the 5 sequences of a system (tenant purge · QC teardown)
CREATE OR REPLACE FUNCTION public.account_jno_drop(p_system text) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I', public.account_jno_seq_name(p_system, b));
  END LOOP;
END $$;

-- M3 · bounded pre-create: only systems with a journal entry in the last 90 days, the 500 most recently active, 5 books each
--   (≈ 5.13 lock-table entries per system measured ⇒ ≤ ≈ 2 600 entries held to commit = 36 % of the smallest Neon compute's lock table
--   64 × 112 = 7 168; no subtransaction: account_jno_create has no exception block). Margin 100 for systems that posted in the last day
--   (controller ruling Q5; with allocate-until-free it is no longer needed for correctness). Every other system gets its sequences at
--   setup time (app, autocommit) or on its first posting (fallback) — both compute the floor from the table.
DO $$
DECLARE s record; b text; m bigint;
BEGIN
  FOR s IN
    SELECT e."systemId" AS id, max(e."createdAt") AS last_at
    FROM public."AccountJournalEntry" e
    WHERE e."createdAt" > now() - interval '90 days'
    GROUP BY e."systemId"
    ORDER BY max(e."createdAt") DESC
    LIMIT 500
  LOOP
    m := CASE WHEN s.last_at > now() - interval '1 day' THEN 100 ELSE 0 END;
    FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP
      PERFORM public.account_jno_create(s.id, b, m);
    END LOOP;
  END LOOP;
END $$;
