# Prompt — P2.6 S hunter **re-check** (read-only, resume). Controller (account B, 14 Oct 13:3xZ).

Your H1–H7 were folded into fix round 1 (rulings in `pos-P2.6-review.md` "Hunter findings folded in"). New head `wip/pos-p2.6` **2b781ea0**, code **7d5339c8** (tree `/root/projects/shark-pos-c`, read via `git -C … show/diff`; step commits `git -C /root/projects/shark-pos-c log --oneline 2e6328db..7d5339c8`; builder table in `…show 2b781ea0:ledger/wo-notes/pos-P2.6.md` "Fix round 1"). Same rules (read-only, no DB/checkout/pnpm). English, ≤ 40 lines.

Hunt again, money/stock only, on the fixed code:
1. For each of H1–H7: closed / partially / open, with the file:line of the fix and the one input that still breaks it, if any.
2. New holes the fixes may have opened: `stockTaken` null handling (pre-column rounds, legacy table rounds, void after a partial cancel, cancel then void of the same line = double restore?); the round-row lock vs legacy board (`advanceItem` item → round) and vs `voidSaleByActor` locks; the heal routing-time guard (`updatedAt` bumped by the consume itself? — ghost tickets vs lost tickets); `isOutOfStock` kept by a stale mark; A11 race left as a guard.
3. Anything that lets a customer be charged for a line that never reaches the kitchen, or a kitchen cook a line that is not paid/accepted, or a counter end the day ≠ sold − restored.

Report: verdict (`CLEAN` | `FINDINGS`), H1–H7 status table, new findings N1..Nn (severity, file:line, input → wrong money/stock, smallest fix). Write `scratchpad/p26-h/REPORT-2.md` and return it verbatim.
