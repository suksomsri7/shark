# Prompt — P2.4 S fix round 4 (hunter H1/H2). Controller (account A, 10 Oct 06:1xZ): branch `wip/pos-p2.4`, head 29ea05d5 (code d4ecad76). Hunt report + binding rulings = `ledger/wo-notes/pos-P2.4-hunt.md` (controller tree `/root/projects/shark-pos`).

---

You are the same P2.4 S builder, tree `/root/projects/shark-pos-c`. Fix exactly H1 + H2 + the docstring nit; add ORACLE-ADD V6a/V6b/V7 with red-before; add the owner lines. Nothing else.

## Fixes
1. **H1** `src/lib/modules/restaurant/pos-tables.ts` `unlinkTableSaleInTx`: (a) `SELECT … FROM "TableSession" WHERE id = $1 FOR UPDATE` first and read `status` under that lock; (b) `pg_advisory_xact_lock(hashtext('restaurant-table:' || tableId))` — the same key string as `restaurant/table.ts:176,227` — before the "another OPEN session on this table" check and the reopen; lock order session → items (never items first).
2. **H2** same function: the item `updateMany` filters by `tenantId` + `unitId` + `saleId` only (drop `order.sessionId`); collect the distinct `order.sessionId` of the unlinked rows and reopen every one of them that is CLOSED (each under the H1 locks); a replay with 0 rows stays a no-op.
3. Docstring `pos/table-actions.ts:135` → "newDraft หรือ heldCartId+expectedVersion".
4. **ORACLE-ADD** in `scripts/qc-pos-p2.4.mts`, own commit per check, red-before log each (`scratchpad/p24/runs/red-before-fix4-<id>.log` on the pre-fix code, then the fix commit):
   - **V6a** partial bill X (I1) on an OPEN session with a later round I2; open a tx that calls `unlinkTableSaleInTx(X)` and sleeps ≈2.5 s before commit while quote+submit of I2 runs ⇒ session OPEN, I1 `saleId` null, the table quote lists I1.
   - **V6b** full-close bill + void; hold `unlinkTableSaleInTx` open while `registerOpenTable` runs on the same table ⇒ exactly one OPEN session, open returns `created:false`.
   - **V7** partial bill on A (HELD draft keeps it open) → legacy `mergeSession(B ← A)` → void X + drain ⇒ I1 `saleId` null and B's quote lists I1.
   Count 46 → 49; no existing assertion changed.
5. Owner lines in `ledger/POS-OWNER-PENDING.md` (P2.4 section) from the hunt report's "Owner notes": บัญชี (priceSource null on table lines · void ⇒ food back to unpaid, re-bill = new receipt) · คลัง (ingredients cut at bill time, cancelled-after-cooking waste not recorded · legacy เช็คบิล door cuts no inventory) · ร้านอาหาร (PENDING QR items included in the POS bill · void after re-seat leaves food on a closed session · paid intent after TABLE_ITEMS_CHANGED stays unconsumed).
6. Notes `ledger/wo-notes/pos-P2.4.md`: "fix round 4" section (H1/H2 with file:line, V6/V7 red-before paths, gates).

## Gates (fix head; logs `scratchpad/p24/runs/fix4-*.log` with `tree=/root/projects/shark-pos-c head=<sha>` headers; same command forms as before, never `export CI`)
`qc-pos-p2.4` forced ×2 + unforced (49/49, PAR, residue 0) · `--no-db` · `qc-pos-p1.3` · `qc-pos-p1.8` · `qc-pos-p1.16` · `qc-restaurant` · `qc-restaurant-money` · `qc-restaurant-pay` · `qc-restaurant-void` · `qc-pos-account` · fitness ±env · fitness-pos · typecheck. Merge `origin/session/pos` first if it moved (ledger only expected).

## Done =
Commits (explicit paths) + push `wip/pos-p2.4`; report ≤15 lines: head SHA (ledger + code), per-H change with file:line, V6/V7 red-before paths, gate counts. Rules as before (no `.env*`, no servers/build/deploy/Telegram, no `pkill -f`, never other trees). Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
