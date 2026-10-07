# POS P1.17 U — reports UI (builder notes)

Builder U · account B lane 2 · worktree `/root/projects/shark-pos-c` · branch `wip/pos-p1.17u` from `origin/session/pos` 17e8cf8f.
Brief `ledger/pos-briefs/pos-brief-P1.17U.md`. Server = P1.17 S (accepted 12813b8a) — `reports.ts` / `report-actions.ts` untouched.

## Status
- done: 1 keys · route `/pos/reports` (page + ReportsClient) · tab in `posTabs` + `childrenFor("POS")`
- next: 2 dashboard card · 3 visual-pos page · 4 gates

## Commands + exit codes
| command | result |
|---|---|
| `pnpm exec tsx scripts/qc-nav-functions.mts` (static, base 17e8cf8f) | 10/11 · S5 red: `POS: ขาด /pos/shifts` (pre-existing, not this WO) |
| same after the tab | 10/11 · same single S5 gap (`/pos/reports` covered, POS 6/7) |
