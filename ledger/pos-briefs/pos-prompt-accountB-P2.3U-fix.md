# Prompt — P2.3U fix round 1. Controller (account A, 10 Oct 05:5xZ): branch `wip/pos-p2.3u`, head 0364d26a (code 7e73e513). Review = `ledger/wo-notes/pos-P2.3U-review.md` (verdict MERGEABLE-AFTER-FIXES; rulings at the end are binding).

---

You are the same P2.3U builder, tree `/root/projects/shark-pos-p11` (shared node_modules with the controller tree — never `pnpm install` / `prisma generate` there; no schema change in this round). Fix exactly the rulings below, nothing else.

## Fixes
1. **F1** `RecipeSection.tsx` `startEdit`: copy into the draft only `recipeChoiceLines` rows whose `choiceId` is in the current `chips` set (choices of linked, non-archived groups). Stale rows are therefore dropped on the next save (replace-all) — say so in the notes.
2. **F2** `catalog-recipe-actions.ts` `searchRecipeItemsAction`: filter the live POS branches by `canAccessUnit(m, u.id)` before reading inventory; one-line comment that the branch list mirrors the private `inventorySystemsOfPos`.
3. **F4** after a successful parent save, clear the cost cache for the parent **and** every variant that has no recipe of its own.
4. **F5** add the owner line (direct `prisma.invItem` read in `products-data.ts`, why, same pattern as `stock-count-actions.ts:260`) to `ledger/POS-OWNER-PENDING.md` under the คลัง owner.
5. **Nit banner** `RecipeSection.tsx:169`: a missing ingredient counts as "not at this branch" (same rule as `register.ts:690`).
6. **Nit ORACLE-EDIT** `scripts/qc-pos-p2.3.mts:55` and `:524`: wording only ("bomDeduct ยัง false" → what the check now asserts). Own commit `oracle-edit(p2.3): wording ST4`, count stays 46.
7. **Notes** `ledger/wo-notes/pos-P2.3U.md`: fix the DB wording (real shots run on QC5), add a "fix round 1" section (what changed per F-id, rendering impact per `--state` — expected none), follow-ups: P2.11 rows (S cleanup of choice deltas on unlink/archive · en text for VALIDATION · shared branch-list helper), P2.14 (choice-level sold-out in OptionsDialog).

## Gates (all on the fix head, logs under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p23u/runs/fix1/`, header `tree=/root/projects/shark-pos-p11 head=<sha>`)
- typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`
- suites (QC4, form `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts`, never `export CI`): `qc-pos-p2.3` (46/46) · `qc-pos-p1.18` (81/81, ST7 = 0) · `qc-pos-products` · `qc-pos-page-authz` · `qc-pos-fitness-pos` · `qc-pos-p1.3` · `qc-pos-p1.16`.
- visual `--dry` rc 0 (no qc5.sh in p11; same form as the first round).
- `git -C /root/projects/shark-pos-p11 status --short` clean after commit.

## Rules
Same as the first round: `'use client'` imports only `*-shared`/pure + actions; `"use server"` async-only; th + en keys for any new string (ST7 = 0); no S behaviour change (no edits under `src/lib/modules/pos/**` except none expected); no `.env*`, no servers/build/deploy/Telegram, no `pkill -f`, never touch other trees/processes, no DB writes outside the suites. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p23u/`.

## Done =
Commits (explicit paths; the ORACLE-EDIT in its own commit) + push `wip/pos-p2.3u`; report ≤15 lines: head SHA (ledger + code), per-F change, gate counts with log paths, list of `--state` whose rendering changed (expected: none). Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
