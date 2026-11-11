# P2.3U review: head 0364d26a (code 7e73e513, base f415d53f)

**Verdict: MERGEABLE-AFTER-FIXES.** There are two Medium findings, each with a fix of one or two lines. The rest of the work matches rulings 1–12. Gates match the logs. Both ORACLE-EDITs are clean.

## Findings
- **F1 (Medium): saving a recipe that has stale choice deltas fails every time, and the UI offers no way to fix it.**
  - Cause: `RecipeSection.tsx:178` (`startEdit`) copies **all** `p.recipeChoiceLines` into the draft. These come from `listForUnit`, which does not filter them (`catalog.ts:1032`). The edit tabs only show choices of linked, non-archived groups (`RecipeSection.tsx:94-97`, `:330-338`). Nothing in S deletes `PosRecipeChoiceLine` rows when a group is unlinked (`setProductOptionGroups`, `catalog.ts:1837`) or archived (`catalog-legacy.ts:241`).
  - Input: latte has an M delta. The owner unlinks or archives the "ขนาด" group, or archives choice M, then opens "แก้สูตร" and saves.
  - Result: `save()` sends the hidden M rows back. `setRecipeChoiceLines` throws NOT_FOUND (`catalog.ts:2007`). The whole transaction rolls back and shows `errors.notFound`. That recipe can never be saved again from 06.
  - Fix: in `startEdit`, keep only deltas whose `choiceId` is in `chips`. Replace-all then drops the dead rows, which `expandRecipe` ignores anyway. Add a fixture or QC check if cheap.
- **F2 (Medium): the ingredient search is not limited to the caller's branches.**
  - Cause: `catalog-recipe-actions.ts:150-155` builds the inventory set from every live POS unit. The only gate is the role-level `assertCan(pos.product.manage)` with no unit (`:41`).
  - Input: a manager limited to branch A calls `searchRecipeItemsAction` directly. The 06 page gate needs access to all branches, but a server action does not go through that gate.
  - Result: the action returns name, SKU, `onHand` and `costSatang` (`:163-164`) for branch B's inventory.
  - Fix: filter `live` by `canAccessUnit(m, u.id)`.
- **F3 (Low):** in the `en` UI, a VALIDATION refusal shows the service's Thai message inside `errors.serverValidation` (`recipe-ui.tsx:54-56`). Ruling 1 says to "map service codes", but S only has the code VALIDATION. Accept as is, or map the known S messages later (P2.11).
- **F4 (Low):** after a parent save, `RecipeSection.tsx:232` clears only the `${targetId}|*` cost cache. The drawer stays mounted (`key = open.id|unit`), so an inherited variant's view (`${variantId}|`) keeps showing the old cost. Fix: when the parent is saved, also clear the keys of variants with `recipe.length === 0`.
- **F5 (Low):** D3 reads `prisma.invItem` directly in `products-data.ts:251`. This is acceptable: facade `getItemsByIds` hides archived items, so it cannot feed the archived banner, and `stock-count-actions.ts:260` already does the same. But no `POS-OWNER-PENDING.md` line was added; add one. `searchRecipeItemsAction:150-154` also duplicates the private `inventorySystemsOfPos` (`catalog.ts:409`) through prisma link tables. It is the same set today and could drift later.
- **Nits:**
  - The ST4 text at `qc-pos-p2.3.mts:55` and the label at `:524` still say "bomDeduct ยัง false" after the predicate edit at `:509`.
  - `hiddenAt` (`RecipeSection.tsx:169`) treats an ingredient missing from the map as visible. The register hides it (`register.ts:690`, `NOT EXISTS InvItem`).
  - The notes say the voided fixture bill stays "in QC4". Real shots run on QC5.

## ORACLE-EDIT judgement
- 2c3cbe70 `qc-pos-p1.18.mts:314` is OK: one fact `["bomDeduct", true, null]` in its own commit, count unchanged (81/81, phase U).
- 27c6c8d5 `qc-pos-p2.3.mts:508-509` is OK: one predicate in its own commit, count 46, consistent with ruling 8. The controller has already accepted it. Fix the stale wording at `:55` and `:524` when convenient.

## Verified OK
1. **Actions.** The file is `"use server"` with async functions only. `saveRecipeAction` opens **one** `prisma.$transaction` (`:76-85`) and passes `tx` to `setRecipe` (`:78`), then `setRecipeChoiceLines` (`:79`), then `setBomEnabled` (`:80`). `inTx` reuses the caller's tx (`catalog.ts:144-146`), so any refusal rolls back all three. Each writer re-checks `requireRowWrite(PERM_MANAGE)` (`catalog.ts:1908`, `:1983`, `:2034`), so STAFF are refused by the service. Refusals come back unchanged through `refusalOf` (`:28-32`). Search uses facade `searchItems` only for inventory, excludes SERVICE, caps at 20 rows and returns cost only to manage/report.view (`:157-164`). The unit scope is not enforced (F2).
2. **Drawer.**
   - Chips are base plus each choice of the linked groups (`RecipeSection.tsx:94-97`, `:530-541`). Per-size lines use `expandRecipe` client-side (`:99`).
   - The cost column appears only when `costSatang` is present (`:158`, `:554`); the footer is shown only under `seeCost` (`:570`). `marginPctText = Math.floor(bp/100)` (`recipe-ui.tsx:26`). The `costComplete false` and `marginBp null` chips are at `:581-592`.
   - The inherited variant shows the "parentRecipe" note (`:512-516`).
   - The UI sends the full replace-all set; the remove button deletes a row, and an empty qty is a validation error rather than a removal (`:207-230`). The stepper is an integer ≥ 1 (`:194-195`, `parseQty`); deltas are signed integers ≠ 0 (`parseDelta`).
   - `wantBom = draft.bom && lines>0` (`:226`), so clearing a recipe still saves. A backfilled draft keeps the stored flag (`:180`), and the banner button calls `setBomEnabledAction(true)` explicitly (`:244-257`), satisfying F4.
   - Banner sources: `archived` comes from `ingredients[].archived` (loader), `notAtBranch` from `ingredients[].systemId` vs `unitInventory` (`:164-172`, same rule as `register.ts:682-690`), and `noCost` from `costComplete` (`:294`).
3. **Table.** Cost and margin appear on recipe rows only (`ProductsClient.tsx:181-204`). Chip counts come from `stock`/`recipeCost` (`:66-72`, `:268-281`). `recipeCost` runs once per unit group in batches of 200 (`products-data.ts:233-235`). Filters are client-side, so they add no calls. Cashiers get the refusal card before any data is read (`products/page.tsx:59-68`). Cost keys are absent without manage/report, so cells show "—".
4. **Register chip.** The count comes from `status.pendingStockCount` (`RegisterScreen.tsx:2586`). The button requires `canRetryStockCuts = evaluate(pos.settings.manage, unit)` (`register/page.tsx:110`), and the service re-checks it (`service.ts:1049`). The toast is `retryDone {cut, left: stillPending}`; refusals go through `errorFor`. There is no clock text, and the hunks only add code (Msg ns plus `msgNode` ternary), leaving P1.x branches intact.
5. **10 flag.** `pos-integrations.ts` INVENTORY is `["bomDeduct", true, null]` (fb0e5b7d). Each ORACLE-EDIT changes one fact in its own commit.
6. **Deviations.**
   - D7 is correct: `RegisterOptionChoice` has only `unavailable` (86) and no choice lines or ingredient stock (`register-shared.ts:513-517`).
   - D8 is correct: the label needs a sale/line join, which is a new query.
   - D6 is deferred as ruled.
   - D3 uses prisma (F5). D1 uses facade `searchItems` (F2).
7. **Keys, testids and ST7.** All `pos.recipe` keys used are present in th and en, with matching parameters and no Thai in en (script check). There are no Thai literals outside comments in the new UI files. Testids follow ruling 11. `pos-ui-inventory.json` has 24 P2.3U rows, and the spec addendum is in `pos-spec-P1.3-register-ui.md:702`.
8. **Visual states.**
   - The 6 products states and `register-pending-cuts` appear in the `--dry` logs (rc 0); there is no `stock-history-recipe` state, consistent with D8. The new block sits inside `// POS P2.3U ▸ … ◂`; one union-type line has no marker (nit).
   - Fixtures use ids unique per pid and round. A sweep clears leftovers older than 1 h, and cleanup runs after each block, in `finally` and on signals.
   - The voided pending bill is consistent. Void restores only real OUT moves (`service.ts:1190-1204`), and there are none. `pendingStockParts` counts PAID bills only (`service.ts:988`), so the counter returns to 0. Sale and void post journal and reversal through the outbox. `PosSaleLine.productId`/`components` are loose ids, so the later product and item deletes cannot fail on a foreign key.
9. **Gates.** Every log header shows `tree=/root/projects/shark-pos-p11 head=7e73e513`. Results: p2.3 46/46 with PAR 2/2 (with the ST4 edit) · p1.18 81/81 phase U, ST7 0 · p2.2 42 · p1.3 128 · p1.16 28 · products 24 · authz 56 · p1.12 72 · fitness 41/41 ×2 · fitness-pos 8 · typecheck rc 0. The diff from 7e73e513 to 0364d26a outside `ledger` is empty.

## Follow-ups
- P2.11: the 16 history label (D8), bills drawer cost/margin (ruling 6), and mapping VALIDATION messages for en (F3).
- P2.14 / S: choice-level availability for OptionsDialog (D7), and S cleaning or ignoring `PosRecipeChoiceLine` rows on group unlink or archive (the root cause of F1).
- Owners: add a POS-OWNER-PENDING line for the D3 `invItem` display read (F5); pending-restore counter (F7/N1/N3, P3 ops); wording for the `autoNote` "แก้ว" and the disabled-tab labels (D9/D10); "คัดลอกสูตร" (F5 in the notes).

---
## Controller rulings (account A, 10 Oct 05:5xZ) — fix round 1 on `wip/pos-p2.3u`
- F1 ✅ fix: `startEdit` keeps only choice deltas whose `choiceId` is in `chips` (linked, non-archived groups). Root cause (S cleanup on unlink/archive) → P2.11 row, not this card.
- F2 ✅ fix: `searchRecipeItemsAction` filters `live` by `canAccessUnit(m, u.id)`; add a one-line comment that it mirrors `inventorySystemsOfPos`.
- F3 ⏭ P2.11 (en text for VALIDATION needs finer service codes).
- F4 ✅ fix (one-liner): after saving the parent, also clear the cost cache of variants that have no recipe of their own.
- F5 ✅ owner line in `POS-OWNER-PENDING.md` for the direct `prisma.invItem` read (reason: facade hides archived; same pattern as `stock-count-actions.ts:260`). Duplicated branch logic stays; P2.11 row "export a shared helper".
- Nits ✅: ORACLE-EDIT wording-only at `qc-pos-p2.3.mts:55` + `:524` (own commit, count 46 unchanged); banner treats a missing ingredient like the register (`register.ts:690`, hidden ⇒ banner); notes say QC5 for the real shots.
- Visual: vis62 (`--state` P2.3U, head 0364d26a) stands for the new-state review; the **full sweep at merge runs on the fix head** (chain62). Builder lists any `--state` whose rendering changed (expected: none).
