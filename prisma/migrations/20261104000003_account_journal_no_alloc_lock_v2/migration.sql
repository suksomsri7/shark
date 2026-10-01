-- account_journal_no_alloc_lock_v2 — CRM C5.5-fix3a round 2 (review F1): every caller that may move the sequence takes the lock first
-- Replaces ONE function again: public.account_alloc_journal_no(text, text, text, int) (same signature, same result type, same
--   `SET search_path = pg_catalog, public`). Forward-only fix of 20261104000002_account_journal_no_alloc_lock, which stays as applied.
--   Why: in 000002 only the "gap > 1000" branch took the advisory lock; the "gap ≤ 1000" walk ran lock-free. A walker could step past the
--   floor between a locked healer's read of the sequence and its setval(floor), so the setval moved the sequence BACK and the healer got
--   the walker's number again (23505/P2002 on the money transaction) — reproduced at the boundary (healer reads a gap of exactly 1000:
--   `< 1000` in the healer vs `<= 1000` in the walker) and away from it (healer reads 1001, a second caller walks from 1000).
--   Now: a call whose number is TAKEN and lies below the floor takes pg_advisory_xact_lock keyed per (system, book) BEFORE deciding how to
--   move, then re-reads the floor and the sequence (last_value, is_called) under the lock and moves the sequence only forward:
--   remaining gap ≤ 1000 ⇒ nextval steps; otherwise setval(floor), and only when the next value is still ≤ the floor. One comparison
--   (`<= 1000`) everywhere. The lock is held to the end of the caller's transaction, so a waiter re-reads the floor after the holder's
--   numbers are committed.
--   Free number (the normal case) and a taken number at or above the floor: no lock, never waits.
--   Residual: other sessions' lock-free nextval calls (free numbers) are not blocked; a backwards move would need them to consume the
--   whole remaining gap (> 1000 numbers) between two adjacent statements of the healer — every caller that lands on a taken number
--   below the floor now waits after its one nextval, so only free numbers handed out in that moment count.
--   Waiting: a transaction that heals can wait on another healer of the same book; with other row locks held this can form a cycle that
--   Postgres detects (40P01, one transaction fails with the generic allocation message and can be retried). Only while healing (a
--   restore/import left numbers above the sequence).
-- ADDITIVE · idempotent (CREATE OR REPLACE keeps owner, grants and the pinned search_path) · no table, sequence or row is created,
--   altered or rewritten · no Prisma schema change. Lock taken by this migration: the function's catalog row only. Must be run by the
--   function's owner (the role that ran 20261104000001), like 000002.
CREATE OR REPLACE FUNCTION public.account_alloc_journal_no(p_system text, p_book text, p_prefix text, p_width int) RETURNS bigint
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE r regclass; n bigint; f bigint; v bigint; c boolean; nv bigint; i int;
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
      -- taken number below the floor (healing): lock FIRST, then decide · everything below is re-read under the lock (review F1)
      PERFORM pg_advisory_xact_lock(hashtextextended('account_jno:' || public.account_jno_seq_name(p_system, p_book), 0));
      f := public.account_jno_floor(p_system, p_book);
      EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;
      nv := CASE WHEN c THEN v + 1 ELSE v END;          -- the value the next nextval would return
      IF nv <= f THEN
        IF f - nv <= 1000 THEN
          WHILE nextval(r) < f LOOP END LOOP;            -- small remaining gap: forward-only steps
        ELSE
          PERFORM setval(r, f, true);                    -- next nextval = f + 1 > nv ⇒ forward
        END IF;
      END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'account_alloc_journal_no: no free journal number for system % book % after 8 attempts', p_system, p_book
    USING ERRCODE = 'P0001', HINT = 'C5.4-N allocate-until-free';
END $$;
