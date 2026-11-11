# POS P2.3U — UI สูตร/วัตถุดิบ (BOM) · builder notes

Builder U · VPS (account B) · 10 Oct 2026 · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p2.3u` from `session/pos` **f415d53f** (code 1636da3c = P2.3 S + P2.2U merged) · merged `origin/session/pos` **b14e2581** before final gates (ledger only — no conflicts; P2.4 S / P2.8 S not merged yet at that time).
Contract: prompt `ledger/pos-briefs/pos-prompt-accountB-P2.3U.md` rulings 1–12 · `pos-brief-P2.3.md` §6 · `wo-notes/pos-P2.3.md` §"P2.3U contract" + §"Rule 4 behaviour" · reviews F4/F7/N1/N3.
**No server behaviour change**: S exports (`catalog.setRecipe` / `setRecipeChoiceLines` / `setBomEnabled`, `recipe.recipeCost`, `retryPendingStockCutsAction`) are called unchanged; no edit to `pos/catalog.ts`, `recipe.ts`, `register.ts`, `service.ts`, `inventory/**`, `pos-sale-contract.json`, `prisma/**`.

## Steps (commit per step · explicit paths)
| step | commit | content |
|---|---|---|
| 1 | 07a0c091 | `src/lib/modules/pos/catalog-recipe-actions.ts` ("use server"): `saveRecipeAction` · `setBomEnabledAction` · `recipeCostAction` · `searchRecipeItemsAction` |
| 2 | cf31ab5d | 06 drawer tab view: `products/RecipeSection.tsx` (new) · `products-data.ts` (recipe fields + one `recipeCost` batch per unit + ingredient info + unit inventories) · `ProductPanel.tsx` (tab live) · `components/pos/products/recipe-ui.tsx` (pure helpers) · `pos.recipe.*` th/en · inventory rows |
| 3 | 7dad5a0f | edit mode + banners (backfilled/F4 · archived · not-at-branch · no cost) · `ProductsClient`/`page.tsx` `canEditRecipe` · notes skeleton |
| 4 | ce7bf211 | 06 table: cost/margin columns, stock "ตามสูตร", stat cards low/no-cost live, chips ใกล้หมด · หมด · ยังไม่ใส่ต้นทุน · กำไรคำนวณไม่ได้ |
| 5 | bb89feab | register chip `PendingCutsChip.tsx` + retry (`RegisterScreen` + register `page.tsx` `canRetryStockCuts`) |
| 6a | fb0e5b7d | `src/lib/pos-integrations.ts` INVENTORY `["bomDeduct", true, null]` |
| 6b | 2c3cbe70 | **ORACLE-EDIT (ruling 8)** `scripts/qc-pos-p1.18.mts:314` → `["bomDeduct", true, null]` (count unchanged) |
| 6c | 27c6c8d5 | **ORACLE-EDIT PROPOSAL (beyond ruling 8 — controller decides)** `scripts/qc-pos-p2.3.mts:508` ST4 — see "Proposal" below |
| 7 | — | OptionsDialog (ruling 9): **not built** — see deviation D7 |
| 8 | 92c4906d | `scripts/visual-pos.mts` p2.3u states + fixtures · spec addendum `pos-spec-P1.3-register-ui.md` "Addendum P2.3U" |
| 9 | 7e73e513 | merge `origin/session/pos` b14e2581 (ledger only) |
| notes | (this commit) | this file |

## Components
- `src/lib/modules/pos/catalog-recipe-actions.ts` — thin `"use server"` shell; refusals returned `{ok:false, code (CatalogErrorCode|INTERNAL), message}`.
  - `saveRecipeAction({systemId, productId, lines, choiceLines?, bomEnabled?})` — role gate `pos.product.manage`, then **one prisma tx**: `setRecipe` → `setRecipeChoiceLines` (when sent; variants never send) → `setBomEnabled` (when sent; MENU only) → reads `bomEnabled` back. Replace-all for both writers; any refusal rolls back all.
  - `setBomEnabledAction` (F4 banner) · `recipeCostAction` (result of `recipeCost` unchanged) · `searchRecipeItemsAction` (D1).
- `products-data.ts` (server loader, P2.2U) — per row `recipe`, `recipeChoiceLines`, `bomEnabled`, `recipeGroups`, `recipeVariants`, `recipeCost` (base view: lines + cost keys as returned); `ingredients` (InvItem name/unitLabel/onHand/archived/systemId/kind of every referenced item); `unitInventory` (unit → INVENTORY system via `systemForUnit`).
- `RecipeSection.tsx` — drawer tab (view/edit/banners) per ruling 1–3. Per-size view = `expandRecipe` client-side; cost/margin only from `recipeCost` (base from page batch, choice/variant views via `recipeCostAction`, cached per view). Margin text = `Math.floor(marginBp/100)%` (display only).
- `components/pos/products/recipe-ui.tsx` — pure helpers (`hasRecipe` · `recipeLive` · `recipeBackfilled` · `parseQty` · `parseDelta` · `qtyText` · `deltaText` · `marginPctText` · `recipeRefusalText`) + icons.
- `ProductsClient.tsx` — cost/margin cells (recipe rows only), stock "ตามสูตร", stat cards, filter chips, `onRecipeSaved` (patch row/variant + `router.refresh()`).
- `PendingCutsChip.tsx` + `RegisterScreen.tsx` (hunks in `// POS P2.3U ▸ … ◂`) — chip, retry, toast `recipe.retryDone` (Msg ns `recipe`).
- Page props: products `canEditRecipe = evaluate(pos.product.manage)` · register `canRetryStockCuts = evaluate(pos.settings.manage, unit)`.

## Message keys (`pos.recipe.*`, th + en)
Used from S: `tabTitle editRecipe baseSize bomToggle bomToggleHint qty addIngredient removeIngredient choiceDelta choiceDeltaHint recipeCost grossMargin costByRecipe noCost marginUnknown backfilledBanner archivedIngredient notAtBranch empty saved pendingStockCuts retryStockCuts retryDone errors.{noRecipe,tooMany,qty,delta,notFound}`.
New: `notForKind autoNote bomOffNote bundleNote choiceChip parentRecipe variantLabel mainProduct variantNoChoice backfilledAction bomOnDone notAtBranchHint noCostHint archivedHint costLoading searchPlaceholder searchEmpty searching pickMeta pickCost decrease increase noDelta deltaFor save cancel otherBranch chips.{low,out,noCost,noMargin} errors.{serverValidation,permission,tooManyLines,tooManyDeltas,loadCost,search}` + `pos.products.stat.noMarginSub`. ST7 = 0 (qc-pos-p1.18 phase U).

## testids
See `ledger/pos-briefs/pos-spec-P1.3-register-ui.md` "Addendum P2.3U" (full list). 23 interactive rows (wo `P2.3U`) in `scripts/pos-ui-inventory.json`; `pos-prod-tab-*` note updated (recipe tab live).

## Deviations / decisions (ruling touched)
- **D1 (r1)** Ingredient picker = new thin read action `searchRecipeItemsAction` over the inventory facade `searchItems` (no existing pos.product.manage reader): inventories = those linked to this POS's live units (same set `catalog.setRecipe` accepts; computed in the action from link tables because `inventorySystemsOfPos` is private), SERVICE filtered, ≤ 20, unit cost only for manage/report.view.
- **D2 (r1)** "Replace-all save for both writers" is one atomic action (three S writers in one tx); toggle "ตัดสต็อกตามสูตร" is part of the draft (`setBomEnabled` in the same tx). Draft default: new recipe = on (S first-save rule), existing/backfilled = current flag ⇒ saving a backfilled recipe never flips it (F4); banner button = explicit `setBomEnabled(true)`.
- **D3 (r3)** Banners need per-ingredient archived/inventory, which `recipeCost` lines do not carry ⇒ the page loader reads InvItem display fields (one query) + `systemForUnit` per unit (display-only read, same pattern as P2.2U's channel/category reads). Not-at-branch banner only when the recipe is live (register hides only live recipe rows): base ingredient outside the branch inventory (or branch without inventory) ⇒ "เมนูนี้ไม่ขึ้นที่สาขา <ชื่อ>" + hint.
- **D4 (r4)** "One recipeCost call per page" = one call **per unit group** (all-branch rows at the first branch they are listed in, branch rows at their branch; chunks of 200) — normally 1. Never per row. Drawer choice/variant views call `recipeCostAction` per view (drawer, cached).
- **D5 (r1)** Variants are not table rows (P2.2U loader) ⇒ drawer select "ดูสูตรของ" main/variant; empty own recipe ⇒ parent's lines + note "สูตรของสินค้าหลัก"; editing a variant starts from a copy of the parent's lines, no choice tabs (S ruling 3: a variant with own lines owns no choice deltas).
- **D6 (r6)** Bills drawer cost/margin — not built (ruling: defer to P2.11).
- **D7 (r9)** OptionsDialog choice-level "หมด" — **not built**: the register catalog / `registerProductOptionsAction` expose neither `recipeChoiceLines` nor ingredient on-hand, and `listForUnit.stock[unit]` is the product's portions, not per-ingredient stock ⇒ not computable client-side. Follow-up for S (expose per-choice availability). `qc-pos-p1.12` 72/72 untouched.
- **D8 (r7)** 16 stock-history label — **deferred to P2.11**: `posStockHistoryAction` maps `inventory.recentMovements` rows to `{id,type,qtyDelta,itemName,…}`; the label needs menu name, line qty and receiptNo (PosSale/PosSaleLine join) = new query. No `stock-history-recipe` state.
- **D9 (r1)** `autoNote` text follows the ruling literally ("ขาย 1 แก้ว = …", shown for live MENU recipes); BUNDLE shows `bundleNote`, MENU not live shows `bomOffNote`. Owner wording follow-up for food menus.
- **D10** Drawer tabs ตัวเลือก/สต็อก still disabled with P2.2U's "เร็ว ๆ นี้ · P2.3" label — not in this WO; relabel follow-up.

## ORACLE-EDITs
- Ruling 8 (own commit 2c3cbe70): `scripts/qc-pos-p1.18.mts:314` `["bomDeduct", false, "P2.3"]` → `["bomDeduct", true, null]`; p1.18 81/81, count unchanged.
- **Proposal (beyond ruling 8, own commit 27c6c8d5 — controller decides):** `scripts/qc-pos-p2.3.mts:508` ST4 pinned `["bomDeduct", false, "P2.3"]` "(พลิกใน P2.3U)", so ruling 8 turns it red. Edit pins `["bomDeduct", true, null]`; count unchanged (46). Reject = `git revert 27c6c8d5` ⇒ p2.3 45/46 (ST4) by design.

## Fixtures (visual-pos p2.3u · `scripts/visual-pos.mts`, hunks `// POS P2.3U ▸ … ◂`)
Owner only. Ids `posqc-vis-<pid>-p23u-<round>-*`, QC coffee shop, unit silom: 7 temp InvItems in the QC inventory (beans g ฿0.65 · milk ml ฿0.05 · cup12 ฿2.80 · cup16 ฿3.50 · lid ฿1.20 onHand 3 ⇒ latte portions 3 = low · caramel syrup cost 0 · coke can) + group "ขนาด" S/M/L (fallback names on unique clash) + 4 temp MENUs: ลาเต้สูตร ฿75 (base 18/150/1/1 + deltas M/L) · โค้กสูตรเดิม (1 line, bom off = backfilled) · ชาไทยยังไม่มีสูตร · คาราเมลมัคคิอาโต้ (zero-cost ingredient). Recipes via `catalog.setRecipe/setRecipeChoiceLines/setBomEnabled` as the owner. `register-pending-cuts`: one pending bill = `createSale` inside the script's tx (cash outside shift ฿75, key `posqc-vis-p23u-pend-<pid>-<round>`), `voidSale` right after its last shot (a VOIDED bill + its journal/reversal stay in the shot DB — **QC5** for the controller's real shots (`qc5.sh`), the suites run on QC4 — like other shot bills). Fixture created before the first job of each contiguous P2.3U block, removed after the block / finally / signal; leftovers > 1 h swept (void + delete) before creating.

## `--state` list for the controller (QC5 shots · owner)
- `pnpm exec tsx scripts/visual-pos.mts p2.3u --user owner --page products --states --state products-recipe-view,products-recipe-edit,products-recipe-empty,products-recipe-backfilled,products-recipe-incomplete-cost,products-table-chips` (+ `LOCALE=en`, 1440)
- `pnpm exec tsx scripts/visual-pos.mts p2.3u --user owner --page register --states --state register-pending-cuts` (+ `LOCALE=en`)
- 10 card (bomDeduct live, no new state): `--page settings --states --state settings-shark` (owner) — existing state.
- Products cashier = refusal card (unchanged, `products-readonly` in the P2.2U plan).

## Follow-ups
- F1 OptionsDialog choice-level unavailability needs S data (D7).
- F2 16 history label "ตัดตามสูตร · <menu> ×n · บิล <no>" needs a movement→sale-line read join (P2.11) (D8).
- F3 Bills drawer line cost/margin (P2.11, ruling 6).
- F4 Pending-restore counter + retry for failed void/refund restocks (`pos-refund-*`) — review R1 F7 + R2 N3 (crash window) + N1 (try/catch around the post-batch re-read in `consumeSaleInventory`) — server work, P3 ops (no UI in P2.3U).
- F5 "คัดลอกสูตร" (copy recipe from another product, §6) not built — client copy + save, small follow-up.
- F6 Wording: `autoNote` "แก้ว" for food menus (D9); disabled-tab labels (D10).

## Incident (reported)
During step 3 I ran `pnpm exec tsx scripts/qc-hf-pos-page-authz.mts --help` **without** `iso.sh`/`qc4.sh`/gate lock (output discarded to /dev/null). By code path the suite runs its static part (file reads) and then `loadLegacyQcEnv` — with `QC_ENV_FILE` unset it loads `.env` and exits 1 on the production host mark before any DB call. Not verified (no output kept); no env value was printed. All gate runs used the prescribed wrapper.

## Gates (final · head 7e73e513 = code of this branch after merge b14e2581 · 10 Oct · logs `scratchpad/p23u/runs/final/*.log`, each with `tree=/root/projects/shark-pos-p11 head=…` + `rc=`)
DB = QC4 via `bash scripts/iso.sh [env QC_FORCE=1] bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh …`.
| gate | result | exit |
|---|---|---|
| `qc-pos-p2.3` (QC_FORCE) | 46/46 · PAR 2/2 · residue 0 (with ST4 proposal) | 0 |
| `qc-pos-p2.2` (QC_FORCE) | 42/42 · residue 0 | 0 |
| `qc-pos-p1.18` (QC_FORCE) | 81/81 · phase U · ST7 = 0 (after ORACLE-EDIT :314) | 0 |
| `qc-pos-p1.3` (QC_FORCE) | 128/128 | 0 |
| `qc-pos-p1.16` (QC_FORCE) | 28/28 | 0 |
| `qc-pos-products` | 24/24 | 0 |
| `qc-hf-pos-page-authz` | 56/56 | 0 |
| `qc-pos-p1.12` (QC_FORCE · OptionsDialog) | 72/72 · residue 0 | 0 |
| `scripts/fitness-pos.mts` | 8/8 | 0 |
| `pnpm fitness` no env / QC4 env | 41/41 · 41/41 | 0 · 0 |
| `visual-pos.mts p2.3u --states --dry` (CI=1) products / register / stock | plan printed | 0 · 0 · 0 |
| `pnpm typecheck` (iso + flock /tmp/pos-gate.lock, heap 5632) | 0 errors | 0 |
Pre-commit fitness green on every step commit. During the build: partial `tsc` (scratch tsconfig over the touched files, with a positive control that went red) after steps 2–5 and 8, all rc 0.

## Fix round 1 (review `pos-P2.3U-review.md` · controller rulings 10 Oct 05:5xZ)
Base `wip/pos-p2.3u` 0364d26a (code 7e73e513). Commits (explicit paths):
| id | commit | change |
|---|---|---|
| F1 | 0f7f06ae | `RecipeSection.startEdit` copies only choice deltas whose `choiceId` is in `chips` (choices of linked, non-archived groups). Stale rows (group unlinked/archived, choice archived) are not in the draft ⇒ the next save (replace-all `setRecipeChoiceLines`) **drops them** instead of failing NOT_FOUND forever. They were already ignored by `expandRecipe` (choice not pickable). |
| F2 | 0f7f06ae | `searchRecipeItemsAction`: live POS branches filtered by `canAccessUnit(m, u.id)` before resolving inventories (comment: list mirrors the private `inventorySystemsOfPos`). A branch-limited manager now searches only their branches' inventories. |
| F4 | 0f7f06ae | after a successful **parent** save the drawer clears the cost cache of the parent and of every variant with no own recipe (they inherit the parent's lines). |
| nit banner | 0f7f06ae | `hiddenAt`: an ingredient missing from the ingredient map counts as "not at this branch" (same as `register.ts` `NOT EXISTS InvItem`). |
| F5 | 261ebea0 | `POS-OWNER-PENDING.md` owner line (คลัง): direct `prisma.invItem` display read in `products-data.ts` (facade hides archived; same pattern as `stock-count-actions.ts:260`) + duplicated branch-list logic → P2.11 shared helper. |
| nit ORACLE-EDIT | ac598727 | `oracle-edit(p2.3): wording ST4` — text only at `qc-pos-p2.3.mts:55` (D) and `:524` (label); count 46 unchanged. |
| notes | (this commit) | DB wording (real shots = QC5) + this section. |
- F3 → P2.11 (ruling: en text for VALIDATION needs finer service codes).
- **Rendering impact per `--state`: none.** F1 changes only the edit draft when stale deltas exist (fixture has none); F2 changes results only for branch-limited users (shots use the owner); F4 changes cached cost only after a save (no state saves); the banner nit needs an ingredient missing from the map (fixture items all exist). Visual dry plan unchanged.

### Follow-ups added
- P2.11: S cleanup (or ignore) of `PosRecipeChoiceLine` rows on group unlink / archive (root cause of F1) · en text for VALIDATION refusals (F3) · export a shared POS→inventory branch-list helper (F5 / `inventorySystemsOfPos`).
- P2.14: choice-level sold-out in OptionsDialog (D7).

### Gates (fix round 1 · code head ac598727 · logs `scratchpad/p23u/runs/fix1/*.log`, header `tree=/root/projects/shark-pos-p11 head=ac598727` + `rc=`)
| gate | result | exit |
|---|---|---|
| `qc-pos-p2.3` (QC_FORCE) | 46/46 · residue 0 | 0 |
| `qc-pos-p1.18` (QC_FORCE) | 81/81 · phase U · ST7 = 0 | 0 |
| `qc-pos-p1.3` (QC_FORCE) | 128/128 | 0 |
| `qc-pos-p1.16` (QC_FORCE) | 28/28 | 0 |
| `qc-pos-products` | 24/24 | 0 |
| `qc-hf-pos-page-authz` | 56/56 | 0 |
| `scripts/fitness-pos.mts` | 8/8 | 0 |
| `visual-pos.mts p2.3u --states --dry` (CI=1) products / register / stock | plan unchanged | 0 · 0 · 0 |
| `pnpm typecheck` (iso + flock, heap 5632) | 0 errors | 0 |
Pre-commit fitness green on every commit.
