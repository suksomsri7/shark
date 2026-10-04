# P1.1b Part A — round R3 (controller rulings on the hunter's report on 6668635c · 4 Oct 2026)

Same builder, same tree `/root/projects/shark-pos-b`, branch `wip/pos-p1.1b`. **First run `git pull --ff-only origin wip/pos-p1.1b`.** All rules of the first prompt still apply.

## H1 — BLOCKER: price divergence when a re-link or a new row races a price change on the same source
`catalog.ts` `rowIdsOfAccountProductTx` (~:824) cannot see an uncommitted `InvItem.accountProductId` link. The link and create paths read the AccountProduct price, and the SERVICE `InvItem.priceSatang` price, with a plain read (`strictApOf` ~:674, `createShopProduct` C9b `catalog-legacy.ts` ~:293, `ensureForInvItem` ~:1426, `linkInvItemAccountProduct` ~:365, `writeInvItemFromAccountProduct` ~:373).

**Ruling:** in every sync and create path, read the price-source rows with `SELECT … FOR SHARE`, after the PosProduct row locks (AccountProduct, plus InvItem when it is the SERVICE price source). Price writers already hold FOR NO KEY UPDATE / UPDATE on those rows, so the second transaction waits and sees the new price. Do not take the tenant lock in price writers. State in the notes why no lock cycle is added.

**Test `S2.R3.1`** (ORACLE-ADD block, 2 connections):
1. conn1: `BEGIN; UPDATE "AccountProduct" SET "salePrice"=… WHERE id=A`, left uncommitted.
2. conn2: `inventory.linkAccountProduct(ctx, Y, A)` in the background.
3. conn1 commits.
4. After both finish, `verifyCatalog` reports 0 drift for Y's rows.

Repeat with `shop.createProduct({invItemId: Y})` as conn2 (`S2.R3.2`). Both checks must be red on 6668635c.

## H2 — SHOULD-FIX: setPrice locks extra siblings out of order after writing the source
`catalog.ts` ~:1315-1319. **Ruling:** re-query the sibling set right after the first lock and BEFORE any legacy write. If the set grew, release everything by throwing BUSY (the existing retry or Thai busy message) instead of locking out of order. Test `S2.R3.3`: 3 lanes (setPrice P · link Y→A committing between them · account.updateProduct(A)) × 5 rounds. Assert `pg_stat_database.deadlocks` delta 0 and equal prices at the end.

## Deferred (notes only)
- Backfill vs. a concurrent edit on a not-yet-linked row (hunter #3) → P6.1 runbook: backfill runs in the window, then `--verify` must report 0 before dual-write goes live. That line is already in the runbook; add "re-run `--verify` after backfill".
- `/pos/products` audit actor (hunter #4) stays deferred to P2.4. The ruling from R2 stands: the P1.3 S5.12 freeze wins.

## Done =
- Forced ×2 + unforced: all green (175 + the new S2.R3.* checks).
- R.1/R.2 residue green; S2.42 still 13/6.
- Typecheck 0; fitness both modes.
- Module suites for the touched files: restaurant, shop, inventory, account, booking, qc-pos-*.

Append an "R3" section to `ledger/wo-notes/pos-P1.1b.md`, push, then stop. The controller re-runs the full set via autorun.
