# HF-GC2 review: head bea20b66 (code 9153edbf · gates at 76188470) · read-only · 14 Oct
**VERDICT: MERGEABLE.** FU-1 and F3 are both fixed, and I found no path left that books a wrong amount.
- The code diff 071402d8..9153edbf is `giftcard/service.ts` (+29/−10) plus the oracle (+107).
- No schema change, no `account/**` change, no new `createSale` call site.

## Findings (all Info; none blocking)
- **F1 Info** · service.ts:1057–1058 now takes `FOR UPDATE`. The old `UPDATE` only took the weaker `FOR NO KEY UPDATE`.
  - The new lock also conflicts with the FK `KEY SHARE` lock. So `GiftCardTxn` inserts on that card (FK at giftcard.prisma:67) briefly wait behind the expiry transaction.
  - Amounts and ordering are unaffected, and there is no deadlock: every writer locks the card before inserting its txn row.
  - Optional smaller footprint: `FOR NO KEY UPDATE` reads under the same lock with less blocking.
- **F2 Info** · The notes ("Oracle HT2.9") say reload blocks "at the `PosSale.giftCardId` FK key-share". `PosSale.giftCardId` has no FK (pos.prisma:79; the migration only adds the GiftCardTxn FK). Reload actually blocks at the card `updateMany` (:787–790). Wording only; the outcome is the same.
- **F3 Info** · HT2.8 runs the global `expireDue(2001-01-02)`, which sweeps all tenants.
  - The foreign-card guard (qc-hf-tx.mts ≈648–651) counts first. If another tenant has a card due, the check fails without running.
  - Real cards cannot be due by 2001, because `sell` enforces `minExpiry ≥ now + months`.
  - The one remaining risk is two QC lanes running HT2.8 at the same moment on QC4. One lane's sweep could expire the other lane's card, so `expired === 1` could go red. That gives a flaky red, never a false green. Acceptable.

## Verified OK
1. **expireDue** (:1052–1094)
   - The per-card transaction starts with `SELECT "balanceSatang","accountingDocId","status" … FOR UPDATE` (:1057). The model has no `@@map`, so the "GiftCard" table and column names are correct.
   - A card that is not ACTIVE returns `null` before any write and is not counted (:1060).
   - The ACTIVE `updateMany` predicate is kept (:1061–1065).
   - `leftover` comes from the locked row (:1066). The EXPIRE txn `satang` uses it (:1073), and so does `postGiftCardExpire` (:1092).
   - The JV gate uses the locked `res.accountingDocId` (:1086).
   - The idempotency key `giftcard-expire-<id>`, the `{expired}` count and the return shape are unchanged.
   - Walk-through, use ∥ expire:
     - A use that commits after the `findMany`: under READ COMMITTED, `FOR UPDATE` waits and then returns the committed row, so leftover = the balance after the use. If the use drained the card to 0, it is DEPLETED and gets skipped.
     - A use that arrives after the expiry lock: its `updateMany … status ACTIVE, gte` waits, then matches 0 rows and throws `GiftCardStateError`.
     - Each side takes one lock on the same row, so there is no deadlock.
2. **reload** (:784–800)
   - The card write is now `updateMany` with `status in (ACTIVE, DEPLETED)`. When `count === 0`, it re-reads the status on the same transaction and throws `GiftCardStateError` inside the `$transaction`.
   - The error messages are identical to the pre-check (:745/:748 vs :795–796).
   - The retry loop rethrows non-P2002 errors, so the `createSale(…, callerTx(tx))` sale rolls back with it.
   - `balanceAfter` comes from `findUniqueOrThrow` on the same transaction after the write (:800), so HF-GC H1 still holds.
   - No new `createSale` call site (HT6 and p1.6 are green).
   - Same-key replay after unsuspend: no txn row exists yet, so it posts once. The second call returns the same txnId and saleId (HT2.9).
3. **Builder deviation: accepted.** `UPDATE … RETURNING` returns the value after the SET (0). Getting the old value needs `RETURNING OLD`, which only exists in PostgreSQL 18. Two statements under one row lock inside one transaction are equally safe, and this was the first option the brief listed.
4. **Oracle**
   - The diff adds only HT2.8 and HT2.9 (CHECKS 20 → 22).
   - Deterministic: `holdLock` only acts after `pg_blocking_pids` shows a waiter on A's pid for at least minMs, and "blocked" is part of the pass condition. So the race happens on every run, and a missed race fails red instead of passing vacuously.
   - HT2.8 asserts EXPIRE 7000, one JV with Dr = Cr = 7000, and USE + EXPIRE = 10000.
   - HT2.9 asserts the error name, SUSPENDED with balance 10000, RELOAD 0 and sale 0. After the replay: RELOAD 1, sale 1, ACTIVE 13000.
   - Red-before is 20/22 with exactly HT2.8 red (EXPIRE 10000) and HT2.9 red (ACTIVE 13000). Both show "A กั้น เห็น" (the lock was held as intended), residue 0.
5. **Owner lines** FU-1 and F3 are struck through as closed by HF-GC2, with new closing lines citing :1052–1094 and :784–800. The silent `catch {}` in `expireDue` stays open for the owner to decide. F2, FU-2 and FU-4 are unchanged.
6. **Gates** (notes table, head=76188470 dirty=0) All match the request:
   - typecheck rc 0
   - fitness 50/50 with and without env
   - fitness-pos 8/8
   - hf-tx 22/22 forced and unforced (residue 0)
   - p1.6 48 · account 16 · p1.3 128 · p1.1 180 · p2.8 61/61
   - m2.x skipped

   The merge 9153edbf..76188470 changes nothing outside the ledger. I did not open the raw gate logs (they are in the builder's scratch, outside my read scope), so this is checked against the notes only.

Report saved at `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/hfgc-r/REPORT-GC2.md`.

## Controller rulings (account B, 14 Oct 14:1xZ)
1. MERGEABLE as is. F1 Info (`FOR UPDATE` vs `FOR NO KEY UPDATE` on the expiry lock) accepted — amounts/order unaffected; follow-up nit for the next giftcard card. F2 Info wording only. F3 Info: HT2.8 flaky-red (never false-green) only if two lanes run it at once on QC4 — accepted.
2. Merge locally → gates74 on p11 (hf-tx 22 · account · p1.6 · p1.1 · p1.3 · p2.8 · fitness ±env · fitness-pos · typecheck) → push only after green (no ledger commit on top of the merge before then).
