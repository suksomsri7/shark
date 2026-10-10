# POS P2.3U — UI สูตร/วัตถุดิบ (BOM) · builder notes

Builder U · VPS (account B) · 10 Oct 2026 · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p2.3u` from `session/pos` **f415d53f** (code 1636da3c = P2.3 S + P2.2U merged).
Contract: prompt `ledger/pos-briefs/pos-prompt-accountB-P2.3U.md` rulings 1–12 · `pos-brief-P2.3.md` §6 · `wo-notes/pos-P2.3.md` §"P2.3U contract" + §"Rule 4 behaviour".
No server behaviour change: S exports are called as-is from one new `"use server"` file.

## Progress (checkpoint)
| step | commit | content |
|---|---|---|
| 1 | 07a0c091 | `catalog-recipe-actions.ts` |
| 2 | cf31ab5d | drawer tab view (`RecipeSection`) + loader + messages + inventory rows |
| 3 | (this) | edit mode + banners |
