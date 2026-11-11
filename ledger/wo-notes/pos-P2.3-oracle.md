# POS P2.3 — oracle notes (`scripts/qc-pos-p2.3.mts`)

Oracle writer · VPS (account B) · 9 Oct 2026 · tree `/root/projects/shark-pos-p11` (lane 3) · branch `wip/pos-p2.3-oracle` from `session/pos` **b694aea0**.
Contract: `ledger/pos-briefs/pos-brief-P2.3.md` §2 R1–R10, §3, §4, §5 CD1–CD6, **§9 controller rulings (binding)**. U half (06 drawer/table, tile badges, bills drawer, 16 history, `bomDeduct` flip) is not tested here.

**45 checks** = ST (4) static · E (5: E1–E4 pure, E5 variant via register) · M (8) writers · Q (7, of which **Q1 Q2 = PAR**) · C (7) consume · K (5) cost · A (2) portions · V (5) returns · Z (2).
Modes: `--list` (no DB) · `--no-db` (ST1–ST4 + E1–E4; never loads prisma) · DB run SKIPs (exit 0 + reasons) until the P2.3 objects exist · `QC_FORCE=1` runs anyway (red by reason, no crash; every check is wrapped — a throw is a red check, not a crashed suite) · `QC_ALL=1` prints every reason instead of the first 8.
Fixtures (module functions): temp tenant `posqc-p23-<rand>` (+ `-t2`), users `posqc-p23-<rand>-{owner,mgr,staff,staffr}@qc.invalid` with real Memberships (OWNER `*` · MANAGER [A] · STAFF [A] `pos.sale.create pos.sale.read` · STAFFR [A] `pos.sale.create pos.report.view`). POS on units **A + B**; INVENTORY **I1** linked to A; **I2** linked to no unit of this POS; ACCOUNT (VAT book) linked to the POS; T2 has its own inventory. Items via `inventory.createItem/receive` (beans g 65 · milk ml 5 · cup12 ใบ 280 · cup16 ใบ 350 · lid ชิ้น 120 · oat ml 9 · tea g **0** · choc g 30 (archived after its recipe is set) · old (archived) · water ขวด 400 · coke 1200 · svc SERVICE · i2 · t2). Option groups via `catalog.createOptionGroup` (ขนาด S/M/L min1 · นม ปกติ/โอ๊ต/ไม่ใส่นม · ท็อปปิ้ง ช็อตเพิ่ม · an unlinked group). MENU rows via `catalog.createProduct` (ลาเต้ ฿75 all-branch · ชาร้อน · อเมริกาโน่ · เอสเปรสโซ unit A · นมสดปั่น · คาปูชิโน่ · ชาไทย · มอคค่า · no-price · มัทฉะ (+ variant มัทฉะเย็น in E5)) · BUNDLE เซ็ตแก้ว (cup12 1 + lid 2) · weighed PRODUCT. **Backfilled โค้ก MENU** through the legacy door `catalog-legacy.createMenuItem` (MenuItem.invItemId → RecipeLine qty 1) — the real P1.1b shape. Device + open shift on A. Prisma direct only for Tenant/BusinessUnit/User/Membership/AccountSystemLink (same as p1.18/p2.1); raw SQL only for `xmin`, `pg_stat_database`, `information_schema`, fingerprint and cleanup. `finally` wipes both tenants (every table with `tenantId`) + users; Z1 counts residue, Z2 scans for rows of this run outside the temp tenants (fingerprint of other tenants = info).

## CONTROLLER-DECISION (read first — the oracle encodes my proposal for each)
1. **ctx shape of the two new server functions.** §9 says `retryPendingStockCuts(ctx, unitId)` and §2 R8 `recipeCost(ctx, productIds, {unitId, choiceIds?})`; both need an actor, so the oracle calls them with **`ctx = {tenantId, systemId, actor}`** (`actor` = the register-style `{userId, role, unitAccess, permissions}` that actions build from the session). Refusals `{ok:false, code, message}` (`PERMISSION_DENIED` / `NOT_FOUND`), never throw.
2. **Audit names.** `setRecipe` keeps `pos.product.recipe` and adds `bomEnabled` to `before`/`after` (R2). `setBomEnabled` writes the **same action `pos.product.recipe`** with `before.bomEnabled`/`after.bomEnabled` (M8 counts it). `setRecipeChoiceLines` writes **`pos.product.recipeChoices`** (M5). `retryPendingStockCuts` writes `pos.stock.retry` (§9, actorId = caller). All: unchanged input ⇒ no write, no audit; refused ⇒ no audit.
3. **Variant ownership (R1, E5).** Owner row = the variant if it has ≥ 1 own RecipeLine, else its parent. `bomEnabled` **and** choice lines are read from the owner row. ⇒ a variant without own rows sells the parent's base + the parent's choice deltas; a variant with own rows sells exactly its own rows (no deltas — variants cannot link option groups, so they cannot own choice lines). Saving a non-empty recipe on the variant sets the variant's `bomEnabled = true`.
4. **Skipped SERVICE/missing parts stay "pending" forever.** `registerStatus.pendingStockCount` (register.ts:2403) counts a line until every component key exists; `consumeBatch` skips SERVICE/missing parts (R5) ⇒ such a sale is counted pending and `retryPendingStockCuts` would report it in `stillPending` forever. The oracle runs C7 **before** C5 so it is not affected and does not pin either behaviour. Proposal: pending + retry ignore parts whose item is SERVICE / not in the unit's inventory (same skip rule as `consumeBatch`). Controller to rule; any later pin = ORACLE-EDIT.
5. **Validation order of `setRecipeChoiceLines` (M6).** Shape first (array ≤ 100 rows, exact keys, `qtyDelta` int ≠ 0 and |v| ≤ 1 000 000, no duplicate (choice, item)) ⇒ `VALIDATION` — 101 rows with fake item ids is `VALIDATION`, not `NOT_FOUND`. Then lookups: choice not in a group linked to the owner row / unknown ⇒ `NOT_FOUND`; item outside the POS's inventories ⇒ `NOT_FOUND`; SERVICE/archived item ⇒ `VALIDATION`. Non-MENU/BUNDLE row ⇒ `VALIDATION` (M2).
6. **Contract pin (ST4).** `scripts/pos-sale-contract.json` must be byte-identical to b694aea0 (sha256 `eaced8dc…08eed`). If P2.2 S (merged first per §9 Q9) changes that file, ST4 needs a controller ORACLE-EDIT re-pin — not a builder fix.
7. **C6 deadlock delta is DB-wide.** `pg_stat_database.deadlocks` counts all of QC4; another lane deadlocking during the 10-sale burst gives a false red. On a red C6 with all other C6 conditions green, rerun before judging.
8. **Cost visibility (K3 · Q10).** Without `pos.product.manage`/`pos.report.view` the whole `recipeCost` payload has **no key matching /cost|margin/i** (so `costComplete` and `marginBp` are hidden too, not only `costSatang`). Lines still carry `invItemId name unitLabel qty`.
9. **Void return path (V5 · §9 Q5).** V5 asserts per OUT movement one IN with the same item, `qtyDelta = −OUT.qtyDelta`, `costSatang = OUT.costSatang`, `locationId = OUT.locationId`, and GL Dr 1200 of those INs = Σ original cost (2720). It does **not** pin the void IN key (`pos-refund-<sale>-<movement>` today). `qc-shop-refund` / `qc-clinic-refund` describe their *own* restores "at current cost" and receive stock before the sale (avg unchanged at void time) — expected unaffected; if any suite pins current-avg void, stop and report (per §9 Q5).
10. **Owner-pending lines (ST3).** `ledger/POS-OWNER-PENDING.md` must contain lines mentioning `P2.3` and: `consumeBatch` (inventory-owner note for the facade hunk) · `หน่วยซื้อ` (Q6 purchase unit) · `ความละเอียดต้นทุน` (Q6 cost precision). Wording otherwise free.

## Drift (brief vs code at b694aea0)
- `catalog.ts:1826` refuses every non-BUNDLE `setRecipe` ("สูตรเมนูมาในรอบถัดไป") — M1/M3/M4/M7 red on base (M4 gets VALIDATION before the item check).
- `register.ts:1374` builds `components` only for BUNDLE; `regVisibleWhere` (:668–682) and `bundleBlocked` (:1301–1312) gate only BUNDLE ⇒ a MENU with a recipe is visible on a unit without inventory (Q4 red on base).
- `register.ts:739` `stockLeft` only for tracked PRODUCT rows ⇒ MENU tiles `null` (A1/A2 red). `listForUnit.stock` is `{}` for MENU rows.
- `service.ts:789` / `register.ts:2150` call `consumeSaleInventory` only when a line has `itemId` or `components`; `:843–871` loops `inventory.consume` per part (one tx each) ⇒ C1 red even for the non-recipe 2-line sale (2 xmins). R5/§9 Q7 want one `consumeBatch` for every sale.
- `service.ts:965–1005` `restoreVoidedInventory` returns at the **current** average cost (`:993`) — V5 shows water back at 607 instead of 400 on base.
- `inventory/index.ts:13–24` re-exports read functions only; no batch consume exists.
- AuditLog column is `actorId` (no `userId`).
- `inventory.createItem` creates a PRODUCT catalog row for every new InvItem in a POS-sold inventory (P1.1b) ⇒ ingredients show up as unpriced PRODUCT rows on the register; the oracle sells only priced rows.
- BLOCK path (`service.ts:555–580`) already sums Σ parts per item and names the item — Q5 needs only MENU components to reach it.
- Restaurant checkout passes no `components` (out of scope, P2.4).

## Names table (exactly as the oracle calls them — builder S must match)
| # | name | shape / where |
|---|---|---|
| 1 | `PosProduct.bomEnabled` | `Boolean @default(false)` + a list field of type `PosRecipeChoiceLine[]` (name free) |
| 2 | `model PosRecipeChoiceLine` | fields exactly `id String @id · tenantId String · productId String · product PosProduct @relation(fields: [productId], references: [id], onDelete: Cascade) · choiceId String · invItemId String · qtyDelta Int · createdAt DateTime · updatedAt DateTime` · `@@unique([productId, choiceId, invItemId])` · `@@index([tenantId])` · `@@index([invItemId])` · RecipeLine unchanged |
| 3 | migration | one dir **`20261205100000_pos_p23_recipe`**: `SET/RESET lock_timeout` · `ALTER TABLE "PosProduct" ADD COLUMN [IF NOT EXISTS] "bomEnabled" BOOLEAN NOT NULL DEFAULT false` · `CREATE TABLE [IF NOT EXISTS] "PosRecipeChoiceLine" (…all 8 columns, "qtyDelta" INTEGER NOT NULL…)` · `CHECK ("qtyDelta" <> 0)` (inline or `ADD CONSTRAINT … CHECK`) · unique index on `("productId","choiceId","invItemId")` · indexes `("tenantId")`, `("invItemId")` · `FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE` · `DO $$` blocks allowed only for `ALTER TABLE "PosRecipeChoiceLine" ADD CONSTRAINT` · nothing else (no DROP/UPDATE/DELETE/INSERT/RENAME/ALTER COLUMN) |
| 4 | registrations | `core/scope.ts` `PosRecipeChoiceLine: tenant` · `pos-qc-env` `POS_MODELS.posRecipeChoiceLine {model: "PosRecipeChoiceLine", …}` (not in `POS_FUTURE_MODELS`) · `src/messages/{th,en}/pos.json` non-empty `recipe.*` block, same key set, th Thai, en no Thai |
| 5 | `pos/recipe-shared.ts` (pure, client-safe) | `expandRecipe({lines: {invItemId, qty}[], choiceLines: {choiceId, invItemId, qtyDelta}[], choiceIds: string[]}) → {ok: true, components: {invItemId, qty}[]} \| {ok: false, code: "INVALID_LINE", message}` — base + Σ deltas of picked choices, merged per item, drop net ≤ 0, sorted by `invItemId` ascending (code-unit order = `COLLATE "C"`), components keys exactly `invItemId qty`; > 50 after merge/drop ⇒ `INVALID_LINE` with a Thai message containing "50" (brief: "สูตรรวมตัวเลือกมีวัตถุดิบเกิน 50 รายการ"); unknown/unpicked choice ids no effect; never mutates input · `RECIPE_MAX_COMPONENTS = 50` |
| 6 | `pos/catalog.ts` | `setRecipe(ctx, productId, lines)` accepts MENU (+ BUNDLE); first non-empty save ⇒ `bomEnabled=true`, `[]` ⇒ `false` · `setRecipeChoiceLines(ctx: CatalogCtx, productId, [{choiceId, invItemId, qtyDelta}]) → {id, …}` replace-all, ≤ 100 rows · `setBomEnabled(ctx: CatalogCtx, productId, on: boolean)` (MENU only; on with 0 lines ⇒ VALIDATION message contains **"ยังไม่มีสูตร"**) · errors thrown as `CatalogError` with `.code` (oracle reads `.code`) |
| 7 | `listForUnit` view | `bomEnabled: boolean` · `recipeChoiceLines: {choiceId, invItemId, qtyDelta}[]` · `recipe` (existing) · `stock[unitId]` = portions for live recipes |
| 8 | `pos/recipe.ts` | `recipeCost({tenantId, systemId, actor}, productIds: string[], {unitId, choiceIds?}) → {ok: true, items: Item[]}` (items in `productIds` order) · `Item = {productId, bomEnabled, basePriceSatang, lines: Line[], costSatang, costComplete, marginBp}` · `Line = {invItemId, name, unitLabel, qty, unitCostSatang, costSatang}` · cost = qty × `InvItem.costSatang` · `costComplete=false` if any ingredient cost 0 / archived / missing · `marginBp = floor((base − cost)·10000/base)`, null when base null/0 or incomplete · no cost/margin keys at all without `pos.product.manage` or `pos.report.view` |
| 9 | `inventory/service.ts` + `inventory/index.ts` | `consumeBatch(ctx: {tenantId, systemId}, {sourceModule, refType, refId, parts: [{itemId, qty, idempotencyKey}]}) → {movementIds: string[], skipped: [{itemId, key, reason: "NOT_FOUND" \| "SERVICE"}]}` — one tx, `lockItemsInTx` sorted, `consumeInTx` per part with its own key, replay returns the same ids, GL + AccountProduct sync after commit · facade re-export inside a `// POS P2.3 ▸ … ◂` marker (≤ 8 lines after the marker) · POS files import it **only** from `@/lib/modules/inventory` |
| 10 | `pos/service.ts` | `consumeSaleInventory` calls `consumeBatch(` and no `.consume(` · `retryPendingStockCuts({tenantId, systemId, actor}, unitId) → {ok: true, scanned, cut, stillPending}` (perm `pos.settings.manage` at the unit · audit `pos.stock.retry` · idempotent: all cut ⇒ `cut 0`, no new movement) · void returns at original OUT cost/location/lot |
| 11 | `pos/register-actions.ts` | `retryPendingStockCutsAction` (calls `retryPendingStockCuts`, has `catch`; "use server" files export async functions only) |
| 12 | register behaviour | `components = expandRecipe(...)` for BUNDLE and MENU with `bomEnabled` (else `[]`; line `itemId` null) · ingredient outside unit inventory ⇒ hidden + `PRODUCT_NOT_FOUND` (lineIndex) · tile `stockLeft = min ⌊onHand/qty⌋` (base recipe) and `soldOutReason NO_STOCK` at 0 (quote still OK) · BLOCK ⇒ `STOCK_INSUFFICIENT` message naming the ingredient |
| 13 | movement keys (unchanged) | OUT `pos-consume-<sale>-<line>` (itemId lines) · `pos-consume-<sale>-<line>-<invItemId>` (components) · refund IN `pos-refund-<refund>-<refundLine>[-<inv>]` |
| 14 | refusal codes | existing only: `VALIDATION NOT_FOUND PERMISSION_DENIED PRODUCT_NOT_FOUND INVALID_LINE STOCK_INSUFFICIENT` |
| 15 | unchanged | `pos-sale-contract.json` (sha pin) · `pos-integrations` `["bomDeduct", false, "P2.3"]` at S |

## Expected red on b694aea0 (forced run, QC4 `ep-frosty-lab-aoylqlv8-pooler…`, 9 Oct 22:2xZ)
`QC_FORCE=1` → **4/45 green: Q1 Q2 (PAR) + Z1 Z2**; residue 0 (321 tables, Tenant 0, users 0); no harness crash; exit 1.
- ST1–ST4: model/column/migration/scope/POS_MODELS/messages/exports/facade marker/owner lines/`retryPendingStockCutsAction` missing (ST4: contract sha + bomDeduct already green parts).
- E1–E4: `expandRecipe` missing · E5/M1/M3/M7/Q7: MENU `setRecipe` → VALIDATION "สูตรเมนูมาในรอบถัดไป" · M2/M5/M6/M8: `setRecipeChoiceLines`/`setBomEnabled` missing, column/table missing · M4: VALIDATION instead of NOT_FOUND.
- Q3/Q6/C2/C3/C4/K4/V1–V4: MENU lines carry `components null` ⇒ no OUT · Q4: latte visible + quotable at unit B · Q5: BLOCK sale succeeds (no components) · C1: non-recipe 2-line sale = 2 xmins · C5: `consumeBatch` missing; SERVICE-component sale cut in 4 tx · C6: 0 OUT per latte sale · C7: `retryPendingStockCuts` missing · K1–K3: `recipeCost` missing · K5: cappuccino line uncosted · A1/A2: MENU `stockLeft null` · V5: water returned at new avg 607 (≠ 400), latte not cut.

## `--list`
```
qc-pos-p2.3 — 45 ข้อ (id · X · หัวข้อ)
P2.3-ST1	S
P2.3-ST2	S
P2.3-ST3	S
P2.3-ST4	S
P2.3-E1	P
P2.3-E2	P
P2.3-E3	P
P2.3-E4	P
P2.3-E5	-
P2.3-M1	-
P2.3-M2	-
P2.3-M3	X5
P2.3-M4	X2
P2.3-M5	-
P2.3-M6	X5
P2.3-M7	X3
P2.3-M8	-
P2.3-Q1	PAR
P2.3-Q2	PAR
P2.3-Q3	X4
P2.3-Q4	X2
P2.3-Q5	X5
P2.3-Q6	X4
P2.3-Q7	-
P2.3-C1	X5
P2.3-C2	X4
P2.3-C3	X4
P2.3-C4	X1
P2.3-C5	-
P2.3-C6	X4
P2.3-C7	X1
P2.3-K1	X4
P2.3-K2	X4
P2.3-K3	X3
P2.3-K4	X4
P2.3-K5	X4
P2.3-A1	X4
P2.3-A2	-
P2.3-V1	X5
P2.3-V2	X4
P2.3-V3	X5
P2.3-V4	X1
P2.3-V5	X4
P2.3-Z1	-
P2.3-Z2	-
X-coverage: S=4 P=4 -=10 X5=6 X2=2 X3=2 PAR=2 X4=12 X1=3
```

## Commands
- `pnpm exec tsx scripts/qc-pos-p2.3.mts --list` · `… --no-db` (8 checks, exit 1 on base)
- DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.3.mts` (drop `QC_FORCE=1` after build: SKIP gate opens by itself when every export/column exists)
- Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → exit 0 (9 Oct 22:39Z, ~4 min lock wait) · single-file `tsc -p <scratch>/tsconfig.p23.json` → exit 0
- Runs at commit: `--list` 45 ids · `--no-db` 0/8 (exit 1, all by "missing") · forced QC4 4/45 (Q1 Q2 PAR + Z1 Z2 green · residue 0)
