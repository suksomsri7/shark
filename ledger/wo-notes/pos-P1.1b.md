# WO P1.1b — Part A builder notes (account B · VPS · tree `/root/projects/shark-pos-b` · branch `wip/pos-p1.1b`)

> Contract: `ledger/pos-briefs/pos-brief-P1.1b.md` G1–G13 + Addendum (1 Oct 22:00) + Addendum 2 (3 Oct, rulings 1–14) · oracle `scripts/qc-pos-p1.1.mts` group S2 (not edited unless listed under ORACLE-EDITs)
> DB = QC4 only (`.env.qc` / `.env.qc4` host `ep-frosty-lab`, checked 4 Oct)

## Progress log (append-only, newest last)
- 4 Oct · merge `origin/session/pos` (P1.3 accepted, b1816f02) → 51a5e7d6, no conflicts · typecheck exit 0 · fitness 40/40 · pushed.
- 4 Oct · "before" regression run (G13) on an untouched copy of 51a5e7d6 (scratch worktree, same QC4): 32 suites, results kept for the after-compare (acc-v2-products/invitem/pos-lines are red on QC4 already on the base: seed differs; qc-ai-actions has 1 CRASH on the base).
- 4 Oct · step 1 = catalog.ts groundwork + `catalog-legacy.ts` + restaurant menu/order doors (9277cfab). Typecheck 0 · fitness 40/40 · qc-restaurant / -money (6/6) / -pay (19/19) / -void (11/11) identical to before.
- 4 Oct · step 2 = shop (createProduct/updateProduct → catalog-legacy; shop/actions refusals → ?err=). Typecheck 0 · fitness 40/40 · qc-shop 15/15 · qc-shop-refund 12/12 = before. Shared hot file touched: `scripts/fitness.mts` F2.1 ALLOWED_EDGES +`inventory→pos` +`account→pos` (one append-only block `// POS P1.1b ▸ … ◂`) — needed because G2/S2.30 make inventory/service.ts and account/product.ts import pos/catalog-legacy.
