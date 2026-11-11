# P2.3 S review — `wip/pos-p2.3` 14dec332 (code 276a1934) · reviewer S (read-only) · 10 Oct 2026

**Verdict: MERGEABLE-AFTER-FIXES.** F1 must be fixed. F2 and F3 need a controller ruling (fix now or record the behaviour). F4–F8 are follow-ups.
The oracle diff `7f633a26...wip/pos-p2.3 -- scripts/qc-pos-p2.3.mts` is **empty** (no ORACLE-EDIT). The contract sha is `7a418de1…97cd`, unchanged.

## Findings
- **F1 Medium — retry cuts stock that was already refunded.** `service.ts:897-930` (pendingStockParts keeps every PAID sale) + `refund-consumer.ts:158` (silently skips parts with no OUT).
  - Input: sale "latte M ×2"; the post-commit cut fails. A partial refund of 1 latte with restock follows (the sale stays PAID, `refundedSatang>0`, `refund.ts:558`); the consumer finds no OUT, returns nothing, and the event closes. The manager then runs `retryPendingStockCuts`, which cuts the full ×2 (beans −48, milk −400, cup16 −2, lid −2).
  - Result: one latte's ingredients are lost for good (they were physically returned) and COGS is overstated by one recipe cost. This path is new: before P2.3 a failed cut was never retried.
  - Smallest fix: add `AND s."refundedSatang" = 0` to `saleWhere` in pendingStockParts and note it in the P2.3U contract. Alternative: after the retry cuts a sale, re-run the restock step for that sale's REFUND docs (keys are idempotent).
- **F2 Medium (controller) — retry scope does not match the counter.** The counter counts today only (`register.ts:2510`, `since: dayStart`); the retry scans all time, oldest first, up to 200 (`service.ts:955,965`).
  - So "ตัดสต็อกค้าง 3 บิล" can cut 200 older bills first, including HF-INV-1-era failures the owner already fixed with a stock count. A stock count applies a delta, so those items get reduced twice.
  - §9 Q8 is satisfied word for word, but the N shown ≠ the bills cut. Fix: pass the same `since` (or a bounded window / last-count date) to the retry, or U shows the all-time count.
- **F3 Medium (deviation 7) — bundle tiles change on deploy with no opt-in.** `register.ts:775,779` and `catalog.ts:1038` compute portions from raw `onHand` and ignore the C2 AUTO/off trackStock rule that PRODUCT tiles follow.
  - Any P1.2 bundle with an untracked component (onHand 0 and never moved, or negative under ALLOW) now shows greyed "หมด" (`ProductCard.tsx:32,77`); OptionsDialog disables such variants under BLOCK. Display-only; no suite pinned it.
  - Fix: treat untracked components as unknown (`onHandOf → undefined` ⇒ portions null), or keep portions to live MENU until P2.3U rules on bundles.
- **F4 Low (deviation 1 vs §9 Q1/CD2) — saving a backfilled recipe does not turn BOM on.** CD2 says the owner turns BOM on by saving a recipe in 06, but backfilled โค้ก already has 1 line, so a save keeps `bomEnabled=false` (`catalog.ts:1885`).
  - Fix: in the P2.3U contract, 06 calls `setBomEnabled(true)` explicitly from the backfilled-banner state, or the controller re-rules R2. Record it in the notes.
- **F5 Low (deviation 11) — longer lock wait inside the cashier's submit.** `consumeBatch` locks through `lockItemsInTx` with the 15 s account-doc budget (`inventory/service.ts:137,166,759`), not the 5 s wrapper budget.
  - It runs awaited inside submit (`register.ts:2253`, `service.ts:808`). A contended hot ingredient (milk) can hold the response about 2×15 s plus the retry, against about 2×5 s per part before. Fix: pass the 5 s budget, or accept and note it.
- **F6 Low — a void can race a cut that retry starts.** `consumeSaleInventory` checks PAID (`service.ts:867`), then runs the batch. If a void commits in between, `restoreVoidedInventory` (`:1082`) finds no OUT and the batch then cuts a VOIDED sale permanently; retry makes this window reachable.
  - Fix: re-read the status after `consumeBatch`; if it is not PAID, call `restoreVoidedInventory` (keys are idempotent).
- **F7 Low (existed before P2.3) — a failed void restore is only logged.** It runs post-commit (`service.ts:1082`, `returnStockAtOriginalCost` onError = console). No pending/retry for `pos-refund-<sale>-<mv>`, so the stock gap is silent. Follow-up P2.4/P3: pending-restore counter plus retry.
- **F8 Info.** Typecheck, fitness and p24 logs have no `head=` line in the file (SUMMARY.txt has `head=276a1934`). Merge 536d60da also brought `scripts/qc-pos-p2.8.mts` and ledger files from f71990b6 (no app code). Bundle refusal message text changed (`assertRecipeItem`); no suite pins it. The account owner has no line about the void GL amount change (item 5).

## Verified OK
1. **Migration.** Exactly the names-table statements: `lock_timeout 3s`, `IF NOT EXISTS` everywhere, inline CHECK, FK with ON DELETE CASCADE (plus Prisma's default ON UPDATE CASCADE), unique index and 2 indexes.
   - No DROP/UPDATE/backfill; the `NOT NULL DEFAULT false` column is metadata-only. Schema matches the SQL; `scope.ts` has `PosRecipeChoiceLine: tenant`; `POS_MODELS.posRecipeChoiceLine` is registered.
2. **Writers.** `setRecipe`: MENU/BUNDLE only, soldByWeight refused, ≤50 lines, int ≥1, duplicate ⇒ VALIDATION, `assertRecipeItem` (NOT_FOUND / archived or SERVICE ⇒ VALIDATION).
   - `bomEnabled`: first save true, `[]` false, an edit keeps the flag (`:1885`). The MENU audit carries `bomEnabled`; the BUNDLE audit keeps the P1.2 `{recipe}` shape.
   - `setRecipeChoiceLines`: shape check before lookups; choice must be in a linked, non-archived group, else NOT_FOUND (`:1966`); replace-all; a variant accepts only `[]`.
   - `setBomEnabled`: on with 0 lines ⇒ "ยังไม่มีสูตร" (`:1996`). All writers go through `requireRowWrite(PERM_MANAGE)`.
3. **Expansion and register.** `expandRecipe` merges per item, drops net ≤0 (base − delta < 0 ⇒ the item is dropped, `recipe-shared.ts:36`), sorts by C order, refuses >50 with INVALID_LINE.
   - Variants fall back to the parent recipe, consistently in SQL (`register.ts:684`) and in `loadRowRecipes`. Non-live MENU ⇒ `[]`.
   - Choice ingredient outside the unit inventory ⇒ PRODUCT_NOT_FOUND at quote (`:1465`), matching ruling Q4; follow-up in U: mark such choices unavailable in OptionsDialog.
   - ALLOW only displays NO_STOCK (quote refuses only UNAVAILABLE). The BLOCK path is unchanged (`service.ts:575-592`). `REGISTER_LOW_STOCK` is still 5.
4. **consumeBatch.** One tx; `lockItemsInTx` on sorted distinct ids; NOT_FOUND/SERVICE parts skipped; one `withStockRetry`; `{20 s, 10 s}`. C6: 10 parallel sales, deadlock delta 0.
   - GL is idempotent: `alreadyPosted("InvMovement#id#event")` (`gl.ts:1084`) + `AccountJournalEntry.idempotencyKey @unique` (`account.prisma:273`) + catch ⇒ no double post for BLOCK-path rows or retries.
   - Keys are unchanged. OUT never changes the average, so the cut order only affects `balanceAfter` (same line order as before).
   - Hand walk: water (avg ฿4) ×1 + latte S ⇒ OUT water −1@400, beans −18@65, cup12 −1@280, lid −1@120, milk −150@5; averages unchanged; GL Dr5000 = 2,720 satang (V5 figure).
5. **Void at original cost.** Both void and refund go through the single `returnStockAtOriginalCost` (`service.ts:1125`): same location, lot and OUT cost.
   - Walk: buy 10@฿10 + 10@฿20 ⇒ avg 1500 satang. Sell 2 ⇒ OUT @1500, 18 left. Buy 10@฿50 ⇒ avg round(77000/28) = 2750. Void ⇒ IN 2@1500 ⇒ avg round(80000/30) = **2667**.
   - GL Dr1200/Cr5000 = 3000 = the original OUT, so COGS nets to 0. The old code reversed 5,500 against the 3,000 cut, 2,500 satang too much.
   - Partial refund returns `c.qty × refundQty`, idempotent per key (`receiveInTx` dup check + unique key). `qc-pos-p1.8`, `qc-shop-refund`, `qc-clinic-refund` green.
6. **Pending and retry.** Counter and retry share one SQL helper with the same skip rule as `consumeBatch` (item in the unit inventory, not SERVICE, no movement for the key), implementing ruling 4.
   - Retry needs `pos.settings.manage` in the service; the action has no `pos.sale.create` guard, which Q8 allows. No audit when the scan finds nothing (ruling 2). Refusals are returned, never thrown.
   - Concurrent ×2 retries cut once: the second waits on the lock, then sees the committed key (`consumeInTx` dupAfterLock) and the unique key.
7. **recipeCost.** Access = unit access + sale.create, product.manage or report.view. Without product.manage/report.view no cost or margin keys (`recipe.ts:115`); no cost field reaches register DTOs.
   - Variant price = own ?? parent. Another unit's product ⇒ NOT_FOUND. Any zero-cost, archived or missing ingredient ⇒ costComplete false.
   - Margin uses **floor** (`:161`), per R8 and the names table (the prompt's "half-up" is not the contract). Non-live recipes are still returned (fine for 06). U must ignore non-recipe rows (they return cost 0 / margin 10000).
8. **Boundaries.** Contract JSON and `createSale` input unchanged; p1.6 registry 48/48. The `inventory/index.ts` hunk is 3 lines inside its marker; POS reaches `consumeBatch` only through the facade (existing `inventory/service` imports predate P2.3).
   - `recipe.ts` has no client importer; actions are async-only; messages th/en 38/38 keys, same placeholders, no Thai in en.
   - Owner lines present: consumeBatch · หน่วยซื้อ · ความละเอียดต้นทุน. Missing: a void note for บัญชี (F8).
9. **Deviations.** Accepted: 2, 3, 4, 5, 6, 8 (keys and quantities unchanged; refund pairing uses the stored snapshot), 9, 10, 12, 13, 14 (p1.1 = CONTROLLER-RUN).
   - Accepted with a fix or ruling: 1 (F4), 7 (F3), 11 (F5). P1.x behaviour changes: 7 (tiles) and 13 (void cost, intended by Q5); 8 is not visible.
10. **Gates.** All final logs ran on 276a1934, 00:56–01:29Z. p2.3 45/45 ×3 (two forced, one unforced), residue 0. Red-before at 7f633a26 = 4/45 (Q1 Q2 Z1 Z2).
    - p1.3 128, p1.2 55, p1.12 72 green on the first run, not after re-runs. p2.4 `--no-db`: ST4, L2, L3 green. typecheck exit 0, fitness 41/41 ±env, fitness-pos 8/8. No gate ran on an older head.

## Follow-ups
- **P2.3U:** retry button N and window match the retry scope (F2) · backfilled save turns BOM on via `setBomEnabled` (F4) · choice-level unavailability in OptionsDialog (deviation 9) · cost chips only for recipe rows · bundle tile badge decision (F3).
- **P2.4/P2.8:** restaurant/QR callers pass `expandRecipe` components (F1 of the notes) · void/cut race guard (F6) · pending-restore retry (F7).
- **Owners:** คลัง V2: consumeBatch lock budget (F5), purchase unit, cost precision · บัญชี: void now reverses COGS at the original OUT cost · บัญชี: a retried cut posts COGS on the retry date (possibly a later period than the revenue).

## Controller rulings (account A · 10 Oct 01:4xZ)
- **F1 fix (alternative B)**: do NOT exclude refunded sales from pending (that would leave the unrefunded part never cut). After `retryPendingStockCuts` cuts a sale, re-run the restock step for that sale's REFUND docs with restock (idempotent `pos-refund-<sale>-<mv>` keys) in the same call; the oracle gets an ORACLE-ADD check (sale cut fails → partial refund w/ restock → retry ⇒ net stock = original − unrefunded part) in its own commit.
- **F2 fix**: retry scope = the counter's scope. `retryPendingStockCuts` takes `since` and the action passes the same `dayStart` the counter uses (today, Bangkok); all-time scanning only when the caller passes `since: null` explicitly (not exposed to U). Notes: owner-era failures already corrected by a stock count are never re-cut.
- **F3 fix**: bundle portions follow the PRODUCT tile C2 rule — untracked components (trackStock off/AUTO never moved) ⇒ unknown ⇒ portions `null` (tile shows nothing, as P1.2); negative on-hand under ALLOW ⇒ 0 as today for tracked items.
- **F4 accept** as P2.3U contract: 06 backfilled-banner state calls `setBomEnabled(true)` explicitly; R2 unchanged (edit keeps the flag). Record in notes §P2.3U contract.
- **F5 fix**: `consumeBatch` uses the 5 s lock budget (same as the old per-part path); a timeout ⇒ pending + retry (designed fallback), never a longer cashier wait.
- **F6 fix**: after `consumeBatch` re-read `PosSale.status`; if not PAID ⇒ `restoreVoidedInventory` (idempotent keys). One commit.
- **F7 follow-up** (pre-existing): pending-restore counter + retry → P2.3U line in notes + `POS-MASTER-PLAN.md` not changed (P3 ops).
- **F8 fix**: owner lines for บัญชี in `POS-OWNER-PENDING.md`: (a) void/refund now reverses COGS at the original OUT cost (was current average); (b) a retried cut posts COGS on the retry date. Add `head=` headers to typecheck/fitness/p24 logs on the fix run.
- Fix round = one commit per fix (F1, F2, F3, F5, F6, F8 + notes) on `wip/pos-p2.3`; gates after: `qc-pos-p2.3` forced ×2 + unforced (residue 0) · p1.8 · p1.2 · p1.3 · p1.16 · p1.12 · inventory · shop-refund · clinic-refund · pos-account · typecheck · fitness ±env · fitness-pos. Reviewer R2 on the diff only.
