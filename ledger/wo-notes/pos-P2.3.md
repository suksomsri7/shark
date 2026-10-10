# POS P2.3 S — สูตร/วัตถุดิบ (BOM) ของเมนู · builder notes

Builder S · VPS (account B) · 10 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.3` from `session/pos` **7f633a26** (merged `origin/session/pos` **f71990b6** before step 3 — ledger + P2.8 oracle + `qc5.sh`, no conflicts; re-merge before final gates = up to date).
Contract: `ledger/pos-briefs/pos-brief-P2.3.md` §2 R1–R10 · §3 · §9 Q1–Q10 · prompt `pos-prompt-accountB-P2.3-S.md` rulings 1–12 · oracle `scripts/qc-pos-p2.3.mts` (45 checks, not edited — no ORACLE-EDIT).
Waited for gates61 on tree c: 00:21:14Z → DONE 00:35:38Z (≈ 15 min) before touching the tree.

## Migration (QC4 only)
`prisma/migrations/20261205100000_pos_p23_recipe/migration.sql` — from `prisma migrate diff --from-schema <7f633a26 prisma/schema> --to-schema prisma/schema --script`, hand-edited:
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosProduct" ADD COLUMN IF NOT EXISTS "bomEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "PosRecipeChoiceLine" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "productId" TEXT NOT NULL, "choiceId" TEXT NOT NULL, "invItemId" TEXT NOT NULL,
    "qtyDelta" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosRecipeChoiceLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PosRecipeChoiceLine_qtyDelta_check" CHECK ("qtyDelta" <> 0),
    CONSTRAINT "PosRecipeChoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PosRecipeChoiceLine_tenantId_idx" ON "PosRecipeChoiceLine"("tenantId");
CREATE INDEX IF NOT EXISTS "PosRecipeChoiceLine_invItemId_idx" ON "PosRecipeChoiceLine"("invItemId");
CREATE UNIQUE INDEX IF NOT EXISTS "PosRecipeChoiceLine_productId_choiceId_invItemId_key" ON "PosRecipeChoiceLine"("productId", "choiceId", "invItemId");
RESET lock_timeout;
```
Deploy (`bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy`, 10 Oct 00:37Z):
```
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-frosty-lab-aoylqlv8.c-2.ap-southeast-1.aws.neon.tech"
166 migrations found in prisma/migrations
Applying migration `20261205100000_pos_p23_recipe`
All migrations have been successfully applied.   (exit 0)
```
QC5 not touched (controller deploys there before screenshots). `pnpm exec prisma generate` in tree c (own node_modules).

## Steps (commit per step · explicit paths)
| step | commit | content | oracle (QC_FORCE) |
|---|---|---|---|
| red-before | 7f633a26 | — | 4/45 (Q1 Q2 PAR + Z1 Z2) · exit 1 |
| 1 | d35ed95d | schema + migration + `scope.ts` + `POS_MODELS.posRecipeChoiceLine` + `recipe-shared.ts` (`expandRecipe`, `RECIPE_MAX_COMPONENTS`, `recipeOwnerId`, `recipePortions`) | `--no-db` 5/8 (ST1 E1–E4) |
| 2 | 65da56d9 | `catalog.ts` setRecipe MENU · `setRecipeChoiceLines` · `setBomEnabled` · listForUnit `bomEnabled`/`recipeChoiceLines`/portions · `recipe.ts loadRowRecipes` · facade `catalog.*` | 18/45 (M1–M8 green) |
| merge | 536d60da | `origin/session/pos` f71990b6 | — |
| 3 | 95e4d2f5 | `inventory.consumeBatch` (+ facade hunk) · `consumeSaleInventory` → batch · void at original OUT cost via `returnStockAtOriginalCost` (refund consumer reuses it) | 18/45 (C1 non-recipe half · C5 · V5 water half green) · p1.8 49/49 · shop-refund 12/12 · clinic-refund 13/13 · pos-inventory 25/25 |
| 4 | 18453d0e | register components (expandRecipe) / visibility / portions | 38/45 |
| 5 | ee227f94 | `recipeCost` · `pendingStockParts` · `retryPendingStockCuts` · `retryPendingStockCutsAction` | 43/45 |
| 6 | 276a1934 | `pos.recipe.*` th/en · POS-OWNER-PENDING P2.3 lines | `--no-db` 8/8 |

## Ruling 9 (void original cost) — no CONTROLLER-DECISION needed
No existing suite pins current-average void: after step 3 `qc-pos-p1.8` 49/49, `qc-shop-refund` 12/12 (RF-1.6 avg unchanged — stock received before the sale ⇒ OUT cost = avg), `qc-clinic-refund` 13/13, `qc-pos-inventory` 25/25. Void key unchanged (`pos-refund-<sale>-<movement>`).

## Deviations / decisions (numbered)
1. **MENU `bomEnabled` on save** — empty→non-empty sets `true`, `[]` sets `false`, editing a non-empty recipe keeps the current flag (an owner who switched BOM off via `setBomEnabled` stays off). Audit `pos.product.recipe` carries `bomEnabled` before/after for MENU only; BUNDLE audits are byte-identical to P1.2.
2. **FK inline in `CREATE TABLE`** (not a `DO $$` block): the oracle forbids `UPDATE`/`DELETE` words inside DO blocks and `ON DELETE CASCADE` is required ⇒ inline constraint keeps the file re-runnable (`IF NOT EXISTS`).
3. **`recipe.ts` in two commits**: `loadRowRecipes` landed in step 2 (listForUnit needs it); `recipeCost` in step 5.
4. **Ruling 4 helper** = `service.pendingStockParts(db, {tenantId, unitId, since?, saleIds?})` (one SQL: parts by `lineConsumption` keys, joined to `InvItem` in the unit's inventory with kind ≠ SERVICE, no movement for the key). Used by `registerStatus.pendingStockCount` (today, unchanged window) and `retryPendingStockCuts` (all time, oldest first ≤ 200, recount of the scanned set for `stillPending`). Same skip rule as `consumeBatch`. Unit without inventory ⇒ nothing pending.
5. **`retryPendingStockCuts`** — audit `pos.stock.retry` (actorId = caller, targetType BusinessUnit, after `{scanned, cut, stillPending}`) only when ≥ 1 pending sale was scanned; a no-op call writes nothing. Refusals returned, never thrown; unexpected = `INTERNAL`. The action does not require `pos.sale.create` (a non-selling manager may press it); `pos.settings.manage` decided in the service.
6. **`recipeCost` access** — needs unit access + one of `pos.sale.create` / `pos.product.manage` / `pos.report.view`; cost/margin keys only with manage/report. Product of another unit / other tenant/system ⇒ `NOT_FOUND`. Variant price = own ?? parent. Lines of a not-live recipe (e.g. backfilled โค้ก) are still returned (06 shows them).
7. **Portions also on BUNDLE tiles** (R9 "live recipe rows"): bundle tiles/listForUnit stock used to be `null`/`{}`; now min ⌊onHand/qty⌋ over the unit's inventory (clamped at 0). No existing suite pinned the old value.
8. **BUNDLE components order** — now `expandRecipe` order (invItemId asc) instead of RecipeLine createdAt; keys/quantities unchanged (qc-pos-p1.2 B2 compares sorted).
9. **Choice ingredients at quote** — every picked choice line's item (positive or negative delta) must be in the unit inventory else `PRODUCT_NOT_FOUND`; tile hiding uses the base recipe only (choices are unknown before picking).
10. **`consumeSaleInventory` returns `boolean`** (true = nothing failed); existing callers ignore it.
11. **`consumeBatch` tx options** `{timeout 20 s, maxWait 10 s}` (same as `createSale.withTx`) so 10 parallel batches don't expire waiting for the pool; one `withStockRetry` on the whole batch; GL posted for every returned movement (incl. BLOCK-path rows already cut in the sale tx — GL idempotent per movement) + AccountProduct sync per distinct item.
12. **`setRecipeChoiceLines` on a variant** — variants cannot link groups ⇒ only `[]` is accepted (non-empty = `NOT_FOUND`); choice lines are read from the owner row (ruling 3).
13. `src/lib/outbox-consumers.ts` **not touched** — void stock restore runs in `voidSale` (post-commit), the `pos.sale.voided` consumer is accounting-only; refund consumer change is inside `pos/refund-consumer.ts`.
14. `qc-pos-p1.1` not run (not in the gate list; it runs backfill paths on QC4 — left as CONTROLLER-RUN if wanted).

## Foreign-module hunks
- `src/lib/modules/inventory/service.ts` — block `// POS P2.3 ▸ … ◂` before ADJUST: `consumeBatch` + types (`ConsumeBatchInput/Part/Result/Skip`). Uses existing private helpers (`lockItemsInTx`, `consumeInTx`, `withStockRetry`, `postMovementGl`, `syncLinkedAccountProduct`). No change to existing functions.
- `src/lib/modules/inventory/index.ts` — 3 lines after the `// POS P2.3 ▸` marker: `export { consumeBatch }` + types. Owner line in `POS-OWNER-PENDING.md`.
- `src/lib/modules/inventory/service.ts` (fix round 1 · F5) — `lockItemsInTx(tx, ctx, itemIds, wait?)`: optional 4th arg = lock budget (`"5s"` wrapper | `"15s"` account-doc, default `"15s"` ⇒ every existing 3-arg caller unchanged); `consumeBatch` passes `"5s"`. Owner line extended in `POS-OWNER-PENDING.md`.
- `src/lib/core/scope.ts` — `PosRecipeChoiceLine: tenant`.
- `src/messages/{th,en}/pos.json` — new block `recipe.*` (same 38 keys, en has no Thai).

## Rule 4 behaviour (for P2.3U)
A sale whose every remaining part is SERVICE / outside the unit's inventory is **not** pending (not counted, not retried). `consumeBatch` skips the same parts and reports them in `skipped`.

## P2.3U contract (screen inputs — no JSX in S)
- **06 drawer tab "สูตรและวัตถุดิบ"** — read `catalog.listForUnit(ctx, unitId)` items: `recipe[] {invItemId, qty}` (this row) · `recipeChoiceLines[] {choiceId, invItemId, qtyDelta}` (this row) · `bomEnabled` · `optionGroups[].choices[]` (chip row "ขนาด S/M/L…") · `stock[unitId]` (portions when live) · `parentId` (variant ⇒ show parent's recipe when own `recipe` is empty — owner rule). Per-size view = `expandRecipe({lines, choiceLines, choiceIds:[picked]})` client-side (`recipe-shared.ts`, pure).
- **Cost / margin** — `recipeCost({tenantId, systemId, actor}, productIds, {unitId, choiceIds?})` (server; wrap in an action for U) → `items[] {productId, bomEnabled, basePriceSatang, lines[{invItemId, name, unitLabel, qty, unitCostSatang?, costSatang?}], costSatang?, costComplete?, marginBp?}`; no cost/margin keys at all without `pos.product.manage`/`pos.report.view`. Footer "ต้นทุนตามสูตร ฿…" = `costSatang`; "กำไรขั้นต้น N%" = rounded display of `marginBp` (floor bp); `costComplete false` ⇒ chip "ยังไม่ใส่ต้นทุน"; `marginBp null` ⇒ "กำไรคำนวณไม่ได้".
- **Writers** — `catalog.setRecipe(ctx, productId, lines)` (MENU/BUNDLE · ≤ 50 · int ≥ 1 · first save turns BOM on · `[]` off) · `catalog.setRecipeChoiceLines(ctx, productId, rows)` (≤ 100 · int ≠ 0 · |v| ≤ 1 000 000 · replace-all) · `catalog.setBomEnabled(ctx, productId, on)` (toggle "ตัดสต็อกตามสูตร"; on without lines = VALIDATION "ยังไม่มีสูตร"). Errors = `CatalogError.code` (`VALIDATION NOT_FOUND PERMISSION_DENIED`). U needs thin `"use server"` actions for the three writers + recipeCost (not in S).
- **Backfilled banner** — row kind MENU, `bomEnabled false`, `recipe.length ≥ 1` ⇒ "สูตรจากเมนูเดิม: <item> ×1 — ยังไม่ตัดสต็อก" (`recipe.backfilledBanner`).
  - **fix round 1 · F4 (accepted as contract):** saving a backfilled recipe does **not** turn BOM on (R2 unchanged: an edit keeps the flag). From the backfilled-banner state 06 calls `catalog.setBomEnabled(ctx, productId, true)` **explicitly** (banner action / toggle "ตัดสต็อกตามสูตร"), before or after `setRecipe`.
- **Bundle tile badge (fix round 1 · F3):** BUNDLE portions follow the PRODUCT tile C2 rule — any component untracked (trackStock off, or AUTO with onHand 0 and no movement) ⇒ `stockLeft` null (no badge, as P1.2); tracked negative ⇒ 0 / หมด. MENU `bomEnabled` portions use raw on-hand (owner opted in).
- **Cost chips** — only for recipe rows (`recipe.length ≥ 1`); `recipeCost` returns non-recipe rows too (cost 0 / margin 10000) — U ignores them.
- **Pending-restore (fix round 1 · F7, pre-existing, follow-up):** a failed void/refund restock (`returnStockAtOriginalCost` onError) is only logged — U shows nothing in P2.3U; counter + retry for `pos-refund-*` keys = P3 ops (POS-MASTER-PLAN unchanged).
- **86 / portions display** — register tile `stockLeft` (portions of the base recipe) + `soldOutReason "NO_STOCK"` at 0 (display only; quote not refused under ALLOW); `REGISTER_LOW_STOCK = 5` ⇒ "เหลือ N". 06 table chips from `stock[unit]` (ใกล้หมด/หมด) + `recipeCost` (ยังไม่ใส่ต้นทุน / กำไรคำนวณไม่ได้).
- **"ตัดสต็อกค้าง N บิล · ลองอีกครั้ง"** — N = `registerStatus().pendingStockCount` (today, rule 4) · button → `retryPendingStockCutsAction({systemId, unitId})` (fix round 1 · F2: the action passes `since: posDayStart()` ⇒ the retry cuts exactly the bills N counts — today, Bangkok; all-time `since: null` is service-only, never exposed to U; a refunded pending bill is cut then its refund docs' restock re-runs — F1) → `RetryPendingStockCutsResult` (`register-shared.ts`): `{ok:true, scanned, cut, stillPending}` ⇒ toast `recipe.retryDone {cut, left}`; refusals `NOT_FOUND | PERMISSION_DENIED | INTERNAL | UNKNOWN`. Show the button only with `pos.settings.manage`.
- **Banners / warnings** — archived ingredient (`recipe.archivedIngredient`), branch without an ingredient (`recipe.notAtBranch {name}` — the row is hidden on that branch's register), zero-cost ingredient (`recipe.noCost`).
- **16 stock history** — OUT keys `pos-consume-<sale>-<line>-<inv>` ⇒ label `recipe.stockHistoryLabel {menu, n, receiptNo}` (read join).
- **10** — `bomDeduct` flips to live in U (ORACLE-EDIT `qc-pos-p1.18.mts:314` in P2.3U, not S).

## Follow-ups
- F1 Restaurant/web/QR callers pass `components` from `expandRecipe` (P2.4/P2.7/P2.8) — facade exports `expandRecipe` from `@/lib/modules/pos`.
- F2 Cron for `retryPendingStockCuts` (P3). ~~today-window vs all-time~~ — fixed in fix round 1 (review F2: one `posDayStart` window for counter + retry).
- F5 (review F7, pre-existing) pending-restore counter + retry for failed void/refund restocks (`pos-refund-*`) — P3 ops; POS-MASTER-PLAN not changed (controller ruling).
- F6 (review follow-ups) restaurant/QR callers pass `expandRecipe` components (P2.4/P2.8) · choice-level unavailability in OptionsDialog (P2.3U).
- F3 Owner items (คลัง V2): purchase-unit conversion · finer cost precision (POS-OWNER-PENDING lines).
- F4 `qc-pos-p1.1` regression = CONTROLLER-RUN.

## Gates (final · head see report)
Run on code head **276a1934** (after re-merge of `origin/session/pos` f71990b6 = up to date) · 10 Oct 00:56Z → 01:29Z · logs `scratchpad/p23/runs/final/*.log` (each with `tree=/root/projects/shark-pos-c head=276a1934` header) · DB = QC4 via `qc4.sh` + `GATE_LOCK_FILE=/tmp/shark-gate-pos.lock`.
| gate | result | exit |
|---|---|---|
| `qc-pos-p2.3` QC_FORCE run 1 | 45/45 · PAR 2/2 · residue 0 (324 tables) | 0 |
| `qc-pos-p2.3` QC_FORCE run 2 | 45/45 · residue 0 | 0 |
| `qc-pos-p2.3` unforced | 45/45 · residue 0 (C6 deadlocks delta 0 in all three runs — no re-run needed) | 0 |
| red-before (7f633a26, forced) | 4/45 (Q1 Q2 PAR · Z1 Z2) | 1 |
| `qc-pos-p2.2` | 42/42 | 0 |
| `qc-pos-p2.1` | 55/55 | 0 |
| `qc-pos-p1.3` | 128/128 | 0 |
| `qc-pos-p1.8` | 49/49 | 0 |
| `qc-pos-p1.16` | 28/28 | 0 |
| `qc-pos-p1.12` | 72/72 | 0 |
| `qc-pos-p1.6` | 48/48 (call-site registry unchanged) | 0 |
| `qc-pos-p1.2` (extra · bundles) | 55/55 | 0 |
| `qc-pos-inventory` | 25/25 | 0 |
| `qc-shop-refund` | 12/12 | 0 |
| `qc-clinic-refund` | 13/13 | 0 |
| `qc-pos-account` | 16/16 | 0 |
| `qc-account-cpa` | 107/107 | 0 |
| `qc-restaurant-money` | 6/6 | 0 |
| `qc-pos-p2.4 --no-db` | ST4 · L2 · L3 green (3/7 — ST1–ST3/ST5 = P2.4 fail-before, expected) | 1 (expected) |
| `scripts/fitness-pos.mts` | 8/8 | 0 |
| `pnpm fitness` no env | 41/41 | 0 |
| `pnpm fitness` with QC4 env | 41/41 | 0 |
| `pnpm typecheck` (iso + flock /tmp/pos-gate.lock, heap 5632) | 0 errors | 0 |
Pre-commit fitness green on every step commit.

## Fix round 1 (review `pos-P2.3-review.md` · controller rulings 10 Oct 01:4xZ)
Base `wip/pos-p2.3` 14dec332 (code 276a1934). One commit per finding (explicit paths):
| finding | commit | change |
|---|---|---|
| ORACLE-ADD (F1) | `88604d75` | `qc-pos-p2.3` **V6** (only change to the suite): pending sale (createSale in caller tx · latte S ×2) → refund 1 with restock (consumer finds no OUT ⇒ no IN) → `retryPendingStockCuts` ⇒ OUT ×2 + IN of the refund doc at the original OUT cost · net = before − 1 latte · replay adds no rows. **Red-before** on 88604d75 (code 276a1934, forced): 45/46, V6 red — "IN ของใบคืน [] · สต็อกสุทธิ beans-36,cup12-2,lid-2,milk-300" (log `runs/fix1/00-v6-red-before-forced.log`). Green after F1 (`01-f1-p23-forced.log` 46/46). |
| F1 (alt B) | `fdccdf4c` | `consumeSaleInventory` re-reads the sale after a successful `consumeBatch`; `refundedSatang > 0` ⇒ `restockSaleRefunds` = refund-consumer step 2 for every REFUND doc of the sale, same `pos-refund-<refund>-<line>[-<inv>]` keys (idempotent). Step 2 moved from `refund-consumer.ts` into `service.restockRefundDoc` (one implementation, both callers). Pending rule unchanged (no `refundedSatang` filter). Restock failure on this path = `console.error` only (event already closed — same class as F7). |
| F2 | `0f670613` | `posDayStart()` (service.ts) = the one "today" (Bangkok) for `registerStatus.pendingStockCount` and the retry · `retryPendingStockCuts(ctx, unitId, {since})`: omitted ⇒ today · all-time only with explicit `since: null` (service-only) · `retryPendingStockCutsAction` passes `{since: posDayStart()}`. Old failures corrected by a stock count are never re-cut. |
| F3 | `c9a23a19` | `catalog.loadRowPortions` = one portion calculator for register tiles + `listForUnit.stock`. BUNDLE components follow C2 (`effectiveTrackStock` of the component's PRODUCT row in this POS; no row = AUTO): untracked ⇒ portions `null` · tracked negative ⇒ 0. MENU `bomEnabled` keeps raw on-hand (A2 ใบชา 0 ⇒ NO_STOCK unchanged). Not pinned by a suite (display only). |
| F5 | `15c10a0f` | `lockItemsInTx(..., wait?)` optional 4th arg (default 15 s, existing callers unchanged); `consumeBatch` passes 5 s ⇒ contention fails the batch ⇒ pending + retry, never a 15 s cashier wait. |
| F6 | `ac68a221` | same post-batch re-read: `status VOIDED` ⇒ `restoreVoidedInventory` (idempotent keys). **Deviation (noted):** `REFUNDED` (full refund in the window) goes through the F1 refund-doc restock, not the void path — the void path would return stock under `pos-refund-<sale>-<mv>` keys while the consumer may already have returned it under the refund-doc keys (double). |
| F8 | `e3cd9151` | `POS-OWNER-PENDING.md`: two บัญชี lines (F8a void/refund reverses COGS at the original OUT cost, was current average · F8b a retried cut posts COGS on the retry date — same Bangkok day after F2) + F5 note on the inventory line. `head=` header in every fix-run log (typecheck/fitness/p24 included). |
| merge | `0eec926f` | `origin/session/pos` 6f90a2c1 (rule 12 · HF-P1CLOSE UI + P2.6 oracle + ledger). One conflict, `POS-OWNER-PENDING.md` (P2.3 block vs HF-P1CLOSE block) — kept both. No app-code overlap with P2.3. |
- **F4 (accepted as contract):** 06 calls `setBomEnabled(true)` explicitly from the backfilled-banner state — §P2.3U contract above. R2 unchanged.
- **F7 (follow-up, pre-existing):** pending-restore counter + retry → P2.3U contract line + Follow-ups F5; POS-MASTER-PLAN not changed.
- **Extra finding (CONTROLLER-DECISION, not fixed):** `qc-hf-inventory-atomic` AT-24.1 (MAJOR, informational run) is red: it pins the post-commit cut-failure log as `{saleId, itemId, qty}` per part, P2.3 S step 3 logs one line per batch `{saleId, parts, code}` (consumeBatch is all-or-nothing). Introduced by P2.3 S (276a1934), not by this round; suite not in the gate list. Options: ORACLE-EDIT AT-24.1 to the batch shape, or log one line per part on batch failure.

### Gates (fix round 1 · head `0eec926f` · 10 Oct 02:00Z → 02:24Z · logs `scratchpad/p23/runs/fix1/*.log`, each with `tree=/root/projects/shark-pos-c head=0eec926f`)
| gate | result | exit |
|---|---|---|
| `qc-pos-p2.3` QC_FORCE run 1 | 46/46 · PAR 2/2 · residue 0 | 0 |
| `qc-pos-p2.3` QC_FORCE run 2 | 46/46 · residue 0 | 0 |
| `qc-pos-p2.3` unforced | 46/46 · residue 0 (C6 green all three) | 0 |
| V6 red-before (88604d75 = code 276a1934, forced) | 45/46 (V6) | 1 |
| `qc-pos-p1.8` | 49/49 | 0 |
| `qc-pos-p1.2` | 55/55 | 0 |
| `qc-pos-p1.3` | 128/128 | 0 |
| `qc-pos-p1.16` | 28/28 | 0 |
| `qc-pos-p1.12` | 72/72 | 0 |
| `qc-pos-inventory` | 25/25 | 0 |
| `qc-shop-refund` | 12/12 | 0 |
| `qc-clinic-refund` | 13/13 | 0 |
| `qc-pos-account` | 16/16 | 0 |
| `qc-pos-p2.4 --no-db` | ST4 · L2 · L3 green (3/7 — rest = P2.4 fail-before) | 1 (expected) |
| `scripts/fitness-pos.mts` | green | 0 |
| `pnpm fitness` no env / QC4 env | 41/41 · 41/41 | 0 · 0 |
| `pnpm typecheck` (iso + flock /tmp/pos-gate.lock, heap 5632) | 0 errors | 0 |
| extra `qc-hf-inventory-atomic` | 142/143 (AT-24.1 — see extra finding) | 0 |
All suites green on the first run (no re-runs). Pre-commit fitness green on every commit.

## Fix round 2 (controller ruling AT-24.1 · keep the oracle)
- `09e2ca11` — `consumeSaleInventory` logs `[pos] stock cut failed — sale committed without stock movement` `{saleId, itemId, qty, code}` once per item that was not cut: every part on a `consumeBatch` throw (+ the batch summary line) and every `skipped` part (code = SERVICE | NOT_FOUND). Gates on 09e2ca11 (`runs/fix2/`, tree/head/rc headers): `qc-hf-inventory-atomic` 143/143 · `qc-pos-p2.3` forced 46/46 residue 0 · `qc-pos-p1.3` 128/128 · typecheck rc 0 · fitness-pos 8/8.
