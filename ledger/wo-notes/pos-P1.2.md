# P1.2 builder S notes: options · variants · bundles · weighed (server + migration, no UI) · cloud run · 4 Oct 2026

Brief: `ledger/pos-briefs/pos-brief-P1.2.md` (R1–R16 · owner chose the defaults for P1–P7). Oracle: `scripts/qc-pos-p1.2.mts` (46 checks, not edited).
Branch: `wip/pos-p1.2`, local `p12-local`, stacked on `origin/wip/pos-p1.9` 473e1227. P1.9 behaviour is unchanged: shift binding, `shiftId` in createSale, and void SHIFT_CLOSED are not touched.
There is no DB in this container, so no DB suite was run and no `migrate deploy` was attempted. The DB oracle is a CONTROLLER-RUN.

## Commits (pushed to `wip/pos-p1.2`)
| sha | step |
|---|---|
| 64200952 | 1 · migration + schema + `scope.ts` |
| fa3ca14c | 2 · catalog writers R5 R6 R8 R9 |
| 4d58e160 | 3–5 · register R1–R3 R6 R7 R11–R14 · consumption R8 · pure helpers R10 R13 |

Steps 3–5 are one commit because they depend on each other's types (`register.ts` needs the new `register-shared` types and the `scan-shared` helpers).

## Migration `prisma/migrations/20261124000000_pos_p12_options/migration.sql` (additive only)
- `ALTER TABLE "PosSaleLine" ADD COLUMN "components" JSONB, ADD COLUMN "weightGrams" INTEGER` (both nullable).
- `ALTER TABLE "PosProduct" ADD COLUMN "scalePlu" TEXT, ADD COLUMN "soldByWeight" BOOLEAN NOT NULL DEFAULT false`. A constant default is metadata-only on PG ≥ 11.
- `CREATE TABLE "PosSaleLineOption"` with columns `id, tenantId, saleId, lineId, choiceId, groupId, groupName, choiceName, priceDeltaSatang`.
  - Indexes on `tenantId`, `saleId` and `lineId`.
  - FK `lineId → PosSaleLine(id) ON DELETE CASCADE`, so other suites' cleanups that delete lines keep working.
- Hand-written partial unique index: `PosProduct_systemId_scalePlu_active_key ON "PosProduct"("systemId","scalePlu") WHERE "archivedAt" IS NULL AND "scalePlu" IS NOT NULL`.
- The file is wrapped in `SET lock_timeout='3s' … RESET`. It has no DROP, RENAME, NOT NULL without a default, or ADD VALUE.
- **Verified without a DB:** `prisma migrate diff --from-schema <473e1227 schema> --to-schema prisma/schema --script` gives exactly the upper block of the file, statement for statement. Only the partial index is hand-written.
- `src/lib/core/scope.ts`: added `PosSaleLineOption: tenant`, because fitness F1.1 needs every model registered.
- `prisma generate` was run, so the shared node_modules client now includes the new model and columns.

## What was built
- **catalog.ts** (the only writer, F15.1):
  - `createOptionGroup(ctx,{unitId,name,nameEn?,minSelect,maxSelect,choices[]})→{id}`.
    - Unit not on this POS gives NOT_FOUND.
    - Not `0≤min≤max, max≥1` gives VALIDATION. So do 1–50 choices, duplicate choice names, or a non-integer delta.
    - Writes an audit row `MenuOptionGroup`.
  - `setProductOptionGroups(ctx,id,groupIds[])`.
    - Replaces the whole set in the given order. Calling it with the same set writes nothing (idempotent).
    - A variant row gives VALIDATION.
    - A group of another tenant, archived, on a unit not on this POS, or on a unit the actor cannot access gives NOT_FOUND.
    - A MENU row with a `MenuItem` twin also replaces `MenuItemOptionGroup` (the menu item's unit) in the same tx, writing tables directly so there is no ping-pong.
  - `setRecipe(ctx,id,[{invItemId,qty≥1}])`.
    - BUNDLE only; anything else gives VALIDATION.
    - Each item must be sellable through this POS (otherwise NOT_FOUND), not archived, and not a SERVICE.
    - Duplicate components give VALIDATION.
    - Everything is validated before any write.
  - `createProduct` accepts `parentId`, `soldByWeight` and `scalePlu`.
    - Parent in another system or not found gives NOT_FOUND.
    - Parent archived, parent is a variant, parent kind not PRODUCT/MENU, or child kind BUNDLE gives VALIDATION.
  - `updateProduct` accepts `soldByWeight` and `scalePlu`.
  - Both writers: `soldByWeight` is PRODUCT only, and `scalePlu` must be `^\d{5}$` and needs `soldByWeight`. A PLU clash gives CONFLICT, checked under the tenant lock (lock taken before the row lock).
  - `restore` checks for a PLU clash.
  - `listForUnit` view gains `variants:[{id}]` (visible, non-archived children), `parentId`, `soldByWeight` and `scalePlu`.
  - Facade `catalog.createOptionGroup/setProductOptionGroups/setRecipe` added in `index.ts`.
- **register.ts**:
  - Line input gains `options[{choiceId}]`; `priceDeltaSatang` and `name` are accepted and ignored.
    - VALIDATION for: other keys, duplicates, a non-array, more than 20 entries, options on a custom line, or open price together with options.
  - Weighed line input: `weighedBarcode` or `weightGrams`.
    - Both, or either on a custom or open-price line, gives VALIDATION.
    - Grams outside 1–99999 gives INVALID_LINE. qty ≠ 1 gives INVALID_LINE.
  - `regPrice` checks, in order:
    - PRODUCT_NOT_FOUND, then PRODUCT_UNAVAILABLE, then **VARIANT_REQUIRED**.
    - Then live options through `regResolveOptions`, in the R2 order: OPTIONS_INVALID, then OPTION_UNAVAILABLE, then OPTIONS_REQUIRED, then OPTIONS_INVALID for max.
    - Then the weighed rules: WEIGHT_REQUIRED; a label PLU that is not this product, or a label that cannot be read, gives VALIDATION; a non-weighed product with weight gives VALIDATION.
    - Unit price = base + Σdelta. A negative unit price gives INVALID_LINE.
  - Manual weight needs `pos.sale.priceOverride` (P4).
  - Quote line gains `optionsSatang`, `options[]` and `weightGrams`.
  - Variants:
    - Variants use the parent's groups (P6) and inherit the parent's price when their own is null (P5).
    - An archived parent hides its children: they become unsellable and scan gives none.
  - Grid and search show parents only.
  - `RegisterProduct` gains `parentId`, `variantCount` and `soldByWeight`.
  - Scan:
    - Scanning a parent that has children gives `choose` with the children.
    - Otherwise R11 applies: exact barcode first, then the weighed label (PLU among visible `soldByWeight` rows), giving `one` plus `weighed{code,grams,priceSatang}`.
  - `registerProductOptions` (R7) and `registerProductOptionsAction` (use server, catch, no throw).
  - Submit sends `options`, `components` and `weightGrams` to createSale.
  - R14 idempotency:
    - Plain product lines are grouped by (productId, sorted choiceId set).
    - Weighed lines are matched one-to-one: manual grams or WEIGHT label grams must equal stored `weightGrams`; a PRICE label must equal stored unit − Σ stored deltas.
    - P1.3 payloads compare exactly as before.
  - `registerStatus` pending also counts bundle lines until every `pos-consume-<sale>-<line>-<invItem>` key exists.
- **service.ts createSale** (additive line fields `options? components? weightGrams?`; legacy callers send nothing and see no change):
  - Validation runs only when the fields are present.
  - Lines that have options get an explicit id, and `PosSaleLineOption` rows are written in the same tx.
  - One consumption helper, `lineConsumption`, used for post-commit consumption, the BLOCK in-tx path, and the same keys:
    - An itemId line consumes `weightGrams ?? qty` with the old key.
    - Components consume `qty × line.qty` with the key `…-<invItemId>`.
  - BLOCK oversell checks the summed need, including components and grams, under the row lock. Void restore is movement-based and so covers components unchanged.
  - `samePayload` also compares `weightGrams`; it is empty for legacy callers, so legacy comparisons are unchanged.
- **scan-shared.ts** (pure; no new imports): `ean13CheckDigit` (malformed input gives −1), `weighedBarcodeSettings`, `parseWeighedBarcode`, `weighedPriceSatang`, `weighedGramsFromPrice` (both round half up).
- **register-shared.ts**:
  - `cartAddProduct(cart,pid,key,options?)` merges only an identical choice multiset and never merges into a weighed line.
  - New `cartAddWeighed(cart,pid,key,{weighedBarcode}|{weightGrams},options?)` for builder U.
  - `cartToQuoteInput` and `quoteInputToCart` carry options and weight.
  - Four new codes map to `errors.*`.
- **held-cart.ts**: when the recall probe re-quotes line by line, it now keeps options and weight, so option and weighed lines are not wrongly flagged as unavailable.
- **messages (th/en)**: added only `pos.register.errors.{optionsInvalid,optionUnavailable,variantRequired,weightRequired}`. I reworded `errors.optionsRequired`, which used to say "can't be sold from here yet" and is now false. `options.*` and `variants.title` are left to builder U.

## Results (this container)
- `pnpm typecheck` (NODE_OPTIONS=5632): **exit 0** after each step.
- `pnpm fitness`: unset DATABASE_URL gives **41/41**; with env gives **41/41**. `fitness-pos` gives **8/8**.
  - F15.2 contract matches; the new line fields are optional input, so the snapshot was not regenerated.
  - No baseline was raised.
- `qc-pos-p1.2 --no-db`: **8/10**. E1–E5, C1, C2 and S3 are green. S1 and S2 are red only because of UI work: the `options.*`/`variants.title` keys and their use in the screen, the picker, test ids, and `pick`. That is builder U's job.
  - Base before my work was 1/10.
- `qc-pos-p1.4 --no-db` 13/13 · `qc-pos-p1.5 --no-db` 5/5 · `qc-pos-p1.9 --no-db` 8/8. `qc-pos-p1.3` and `qc-pos-p1.6` have no `--no-db` mode; they wait for a DB and were stopped by timeout.

## Expected on the DB run (CONTROLLER-RUN)
This is what I expect from walking each check against the code; none of it has been run.
- **Green expected: 35 of the 36 DB checks.** With the 8 green pure checks, the full DB run should give **43/46**; the 3 reds are R1, S1 and S2.
  - All of P1 O1–O11 M1 M2 V1–V5 B1–B4 W1–W5 I1–I3 H1 X1 Z1 Z2.
  - Reasoning, briefly:
    - Fixtures use the new writer keys.
    - Options resolve live, so M1 sees the edited delta while the O2 snapshot keeps 500.
    - Variant price inheritance and the parent's groups give V3 7,500 / 6,500.
    - Bundle consumption keys are per component (B2), and void is movement-based (B3).
    - B4 pending uses the jsonb component keys.
    - Weighed: 1234 g @35,000 = 43,190; the PRICE label 4,321 gives 123 g; stock 5000 → 3766 → 3643.
    - R14 grouping gives I1 duplicated and I2/I3 conflict.
    - Cleanup deletes `posSaleLineOption` by sale (FK cascade as a backstop). Audit rows target product, group or sale ids that the oracle cleans.
- **Expected red on DB: P1.2-R1 (oracle defect, not a code issue).**
  - The assertion is `dataRefusals.length >= 8` (`scripts/qc-pos-p1.2.mts:1435`).
  - The file has only **7** `asData(...)` calls (lines 890, 904, 928, 929, 963, 1129, 1349), and none is in a loop. So R1 can never be green.
  - The refusals themselves should all be correct data: `{ok:false, code, message}` with no throw.
  - Proposed ORACLE-EDIT: `>= 7`, or add one more `asData`, for example on the O3 `c` result or the W5 `e` result.
- S1 and S2 stay red until builder U.

## Open questions / notes for controller and builder U
1. **R1 oracle count** (above). It needs a controller ORACLE-EDIT.
2. **Rules I invented** (not specified in the brief):
   - Child kind BUNDLE gives VALIDATION.
   - `scalePlu` requires `soldByWeight`.
   - `soldByWeight` is PRODUCT only.
   - Recipe components cannot be SERVICE or archived.
   - A MENU twin's groups must be on the menu item's unit; otherwise VALIDATION. Restaurant groups are per unit, so this keeps `MenuItemOptionGroup` coherent.
   - A PRICE label on a product with price/kg 0 gives INVALID_LINE, because no gram figure can be derived.
   - `createSale` `weightGrams` needs qty 1.
3. Weighed lines may carry options; deltas are added per unit. No oracle covers this.
4. Builder U:
   - Use `cartAddProduct(cart, id, key, choiceIds)` and `cartAddWeighed(...)`.
   - `registerScan` `one` may carry `weighed` (call `cartAddWeighed` with `{weighedBarcode: weighed.code}`).
   - `RegisterProduct.soldByWeight`: open a weight entry; manual entry needs `canOverridePrice`.
   - `variantCount > 0`: picker.
   - `cartToPriceInput` (the instant client total) does not know option deltas or weighed prices, so the quote is the source of truth for those lines.
   - Message keys `options.*` and `variants.title` are still to add.
5. The P1.3 money regression (S3.x) and the restaurant/hotel money suites should be unaffected:
   - Legacy createSale callers send no new fields.
   - BLOCK and post-commit consumption produce identical parts and keys for itemId lines.
   - The pending SQL is unchanged for itemId lines.
   - Please still run the COMMON §7 money set, `qc-pos-account` and `qc-restaurant-money`.
6. The migration's partial index is created non-concurrently on `PosProduct`, under a 3 s `lock_timeout`, matching P1.5/P1.9 style. If QC4 or prod `PosProduct` is large, consider CONCURRENTLY outside `prisma migrate`, as M1 did.

## R2 — server fixes after review+hunt (controller §R2 rulings F1–F6) · cloud run · 4 Oct 2026
Branch: local `p12-local`, pushed to **`wip/pos-p1.2-r2`** only (`wip/pos-p1.2` left at a0b7401c for the pinned VPS run).
First merged `origin/wip/pos-p1.9` e05664af (P1.9 R2) as a merge commit. It merged cleanly (auto-merge in `pos/index.ts`, `service.ts`, `pos.json` th/en); typecheck 0 afterwards.
No schema change and no migration in R2. There is no DB in this container, so the DB checks are a CONTROLLER-RUN.

| fix | commit | what | evidence |
|---|---|---|---|
| F1 (S1) | 732f7a0d | `regVisibleWhere`: a BUNDLE is visible/sellable only when every `RecipeLine` InvItem is in `s.unitInv`. A unit with no inventory sees only component-free bundles. This covers grid, search, category counts, scan, quote/submit (PRODUCT_NOT_FOUND) and `registerProductOptions`. `regPrice` re-checks the recipe it actually loaded. `createSale`: lines with `components` must have every component in the unit's INVENTORY system, else VALIDATION (covers non-register callers; today only the register sends components). | S.R2.1 (DB) · S.R2.8 (static) |
| F2 (S2) | 32def0c8 | `createSale`: a sale with any option line gives **every** line an explicit id `c<time36 ×9><12 hex><4-digit index>`. All the same length, lowercase+digits, so `orderBy id` = cart order in any collation. Sales without options keep the default cuid (legacy callers unchanged). | S.R2.2 |
| F3 (S3) | 10327065 | `regPrice`: a PRICE label with embedded price < 1 satang, or derived grams < 1, gives `INVALID_LINE` with lineIndex at quote and submit (was ok at quote, then a VALIDATION throw from createSale at submit). | S.R2.3 |
| F4 (N3) | 4a180d49 | `createProduct`: a variant with null own price must have the parent's `soldByWeight`; otherwise VALIDATION. `updateProduct`: changing `soldByWeight` on such a child away from the parent gives VALIDATION. **Also (my addition, keeps the invariant):** changing `soldByWeight` on a parent that has price-inheriting children of the other kind gives VALIDATION. `setPrice` cannot set null, so it needs no guard. | S.R2.4 |
| F5 (N5) | 732107fd | `HeldCartNoticeCode` gains `PERMISSION_DENIED`. The recall probe maps a per-line PERMISSION_DENIED (typed weight, recaller without `pos.sale.priceOverride`) to it instead of PRODUCT_UNAVAILABLE. Minimal UI needed for the fix: RegisterScreen's existing notice list shows the new key `pos.register.held.noticeNeedsPermission` (th+en). | S.R2.5 (DB) · S.R2.7 (static) |
| F6 (N6) | d8ee743e | `registerScan` with several matches: parents that have sellable variants are dropped from `choose`. **Edge rules I chose:** exactly 1 left gives `one`; 0 left (every match was a parent) gives `choose` over those parents' sellable variants, the same as scanning one parent; no variants gives `none`. | S.R2.6 |
| tests | b6baa052 | `S.R2` block, `// ORACLE-ADD (controller R2 ruling)` | below |

### New checks (46 → **54**)
- **DB (CONTROLLER-RUN):**
  - S.R2.1 X4 · S.R2.2 · S.R2.3 X4 · S.R2.4 · S.R2.5 X3 · S.R2.6.
  - They run after X1 and before R1, in the order 1 2 3 5 6 4. S.R2.4 runs last because it gives the pork product variants.
  - Each has its own fixture guard: the result shows `fixture:` and the check is red, not a crash. A try/catch marks any unreached S.R2 id red with the reason.
  - No `asData`, so the R1 count is unchanged.
  - All rows go through `sb.*`: products, the InvItem in INV-Z, and recipe lines on sb products. The held cart and sales are in sandbox unit S. The existing cleanup removes all of them, so Z1/Z2 should hold.
- **Static, also in `--no-db`:** S.R2.7 (F5: code · probe · th/en key · used in the UI) and S.R2.8 (F1: `regVisibleWhere` references RecipeLine + BUNDLE).
  - In normal mode they run after `runDb`, so a "not seeded" DB failure cannot overwrite them.
- **Expected red on 0b4b5cca / green now:**
  - Static: **verified**. A detached worktree of 0b4b5cca with the new oracle gives `--no-db` 8/12, with S.R2.7 and S.R2.8 red (plus the known S1/S2). This head gives 10/12; only S1/S2 are red, and those are builder U's.
  - DB reasoning (not run):
    - R2.1 base: the cross-inventory bundle quotes ok, so red.
    - R2.2 base: the lines are PLAIN cuid, LATTE uuid, TEA cuid. A uuid can sort between two same-sale cuids only by sharing the `c<timestamp>` prefix, so the base is red essentially deterministically.
    - R2.3 base: quote ok with 0 g, so red.
    - R2.4 base: the per-piece child is created, so red.
    - R2.5 base: notice PRODUCT_UNAVAILABLE, so red.
    - R2.6 base: choose returns 3 including the parent, so red.
- **Expected full DB run on this head:** 54 checks; red only on S1 and S2 (builder U). R1 is now `>= 7` after the controller edit.

### Results (this container, after every fix)
- typecheck (5632) exit 0.
- fitness (no DB env) 41/41; fitness-pos 8/8.
- esbuild syntax ok.
- `qc-pos-p1.2 --no-db` 8/10 before the S.R2 block and 10/12 after it; `--list` 54.
- `qc-pos-p1.4 --no-db` 13/13 · `p1.5` 5/5 · `p1.9` 13/13.

### Notes for the controller
- F1 also changes **visibility** of such bundles in `registerCatalog`, scan and `registerProductOptions`. It does not change `catalog.listForUnit` (back office), which still lists them.
- F5 adds one UI line and one message key. This is the minimum needed for the cashier to see the new state; the styling is unchanged for builder U.
- The F4 parent-side guard and the F6 edge rules (1 left gives `one`; 0 left gives the variants) are my choices. Please ratify or adjust them.
