-- account_journal_no_alloc_lock — CRM C5.5-fix3a (hunt 2b H2b-2): the self-healing allocator's slow path is serialised per (system, book)
-- Replaces ONE function of 20261104000001_account_journal_no_sequence: public.account_alloc_journal_no (same signature, same result type).
--   Old slow path (gap > 1000): `SELECT last_value` then `setval` as two statements with no lock. Two healers of one book could interleave
--   (T_a reads 3 · T_b setval(5000) + nextval 5001 + inserts · T_a setval(5000) ⇒ the sequence moves BACK and T_a gets 5001 again ⇒
--   23505 on the money transaction). New slow path: pg_advisory_xact_lock keyed per (system, book), then the floor AND the sequence are
--   re-read under the lock; the sequence is moved only forward (nextval steps when the remaining gap is ≤ 1000, setval only when the next
--   value is still ≤ the floor). The lock is held to the end of the caller's transaction, so a second healer waits for the first one's
--   numbers to be committed and then sees them in the floor. Fast path (free number) and the ≤ 1000 step path stay lock-free.
-- ADDITIVE · idempotent (CREATE OR REPLACE, same signature, search_path pinned exactly like the original) · no table, sequence or row is
--   created, altered or rewritten · no Prisma schema change. Lock taken by this migration: the function's catalog row only.
--   Old code (count+1, before C5.4-N) never calls this function; C5.4-N code calls it with the same arguments.
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
      IF f - n <= 1000 THEN
        WHILE n < f LOOP n := nextval(r); END LOOP;
      ELSE
        -- slow path (H2b-2): one healer per (system, book) at a time · everything below is re-read under the lock
        PERFORM pg_advisory_xact_lock(hashtextextended('account_jno:' || public.account_jno_seq_name(p_system, p_book), 0));
        f := public.account_jno_floor(p_system, p_book);
        EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;
        nv := CASE WHEN c THEN v + 1 ELSE v END;          -- the value the next nextval would return
        IF nv <= f THEN
          IF f - nv < 1000 THEN
            WHILE nextval(r) < f LOOP END LOOP;            -- small remaining gap: forward-only steps
          ELSE
            PERFORM setval(r, f, true);                    -- next nextval = f + 1 > nv ⇒ forward
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'account_alloc_journal_no: no free journal number for system % book % after 8 attempts', p_system, p_book
    USING ERRCODE = 'P0001', HINT = 'C5.4-N allocate-until-free';
END $$;
