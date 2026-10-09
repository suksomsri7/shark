# POS P2.2 — builder S notes (`wip/pos-p2.2`)

Builder S · account B · lane 3 · 9–10 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.2` from `origin/session/pos` d2c41103 (oracle b3c3fbf5 merged, 42 checks).
Contract: `ledger/pos-briefs/pos-brief-P2.2.md` (§9 binding) + `ledger/pos-briefs/pos-prompt-accountB-P2.2-S.md` (rulings 1–14) + names table in `pos-P2.2-oracle.md`.
Run logs (each with a `tree=… head=…` header): `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22/runs/`.

## Checkpoint (restart from here)
- DONE: steps 1–6 · final gates (below) · NEXT: controller review / merge (builder does not merge) · P2.2U (contract below)
- Commands:
  - oracle no-db: `pnpm exec tsx scripts/qc-pos-p2.2.mts --no-db`
  - oracle: `bash scripts/iso.sh [env QC_FORCE=1] bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.2.mts` (skips Bangkok 23:40–00:01)
  - typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`

## Migration `prisma/migrations/20261204100000_pos_p22_prices/migration.sql`
From `prisma migrate diff --from-schema <origin/session/pos d2c41103 prisma/schema (git archive)> --to-schema prisma/schema --script` (never from the DB). Hand edits: `IF NOT EXISTS` on CREATE TABLE / CREATE INDEX / ADD COLUMN, CHECK inside CREATE TABLE, the `NULLS NOT DISTINCT` unique index (Prisma cannot express either — schema `///` comment "ห้ามลบ / do not remove"), `SET/RESET lock_timeout`.
```sql
SET lock_timeout = '3s';
CREATE TYPE "PosPriceSource" AS ENUM ('BASE', 'BRANCH', 'CHANNEL', 'RULE', 'OPEN', 'CUSTOM', 'WEIGHED');
CREATE TYPE "PosPriceRuleKind" AS ENUM ('HAPPY_HOUR', 'PROMO');
CREATE TYPE "PosPriceRuleAdjust" AS ENUM ('PRICE', 'PERCENT_OFF', 'AMOUNT_OFF');
CREATE TABLE IF NOT EXISTS "PosProductChannelPrice" (id, tenantId, systemId, productId, channelCode?, unitId?, priceSatang?, notSold bool default false,
  updatedByUserId, createdAt, updatedAt, PK id,
  CONSTRAINT "PosProductChannelPrice_row_check" CHECK (("channelCode" IS NOT NULL OR "unitId" IS NOT NULL) AND (NOT "notSold" OR "priceSatang" IS NULL) AND ("notSold" OR "priceSatang" IS NOT NULL)));
CREATE TABLE IF NOT EXISTS "PosPriceRule" (… 24 columns of R3, arrays default '{}', PK id);
CREATE UNIQUE INDEX IF NOT EXISTS "PosProductChannelPrice_product_code_unit_key" ON "PosProductChannelPrice" ("productId", "channelCode", "unitId") NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS "PosProductChannelPrice_tenantId_systemId_productId_idx" ON "PosProductChannelPrice"("tenantId", "systemId", "productId");
CREATE INDEX IF NOT EXISTS "PosPriceRule_tenantId_systemId_archivedAt_idx" ON "PosPriceRule"("tenantId", "systemId", "archivedAt");
ALTER TABLE "PosSaleLine" ADD COLUMN IF NOT EXISTS "listPriceSatang" INTEGER, ADD COLUMN IF NOT EXISTS "priceRuleId" TEXT, ADD COLUMN IF NOT EXISTS "priceSource" "PosPriceSource";
RESET lock_timeout;
```
`migrate status` before: only this folder pending (QC4 also holds 6 other lanes' migrations — untouched) · `migrate deploy` (iso → qc4 → POS gate lock) **0** · `prisma generate` (tree-local node_modules) **0** · host `ep-frosty-lab-aoylqlv8…`. Not idempotent as a whole file (3 unguarded CREATE TYPE, same as P2.1).

## Steps
| step | commit | result |
|---|---|---|
| 1 | 7d668c15 | schema + migration + scope/qc-env/`pos.price.rule` + `price-shared.ts` (pure) + `price.ts` (reader) · `--no-db` ST1 + B1–B7 green (ST2–ST4/S3 need later steps) · typecheck 0 · pushed |
| ORACLE-EDIT | 18244782 | `test(pos P2.2): ORACLE-EDIT C3 — catalog NOT_FOUND (controller ruling 1)` — C3 only (2 asserts + title text), count 42 |
| 2 | 7e63ca18 | `catalog.setChannelPrices` + `bulkChannelMarkup` + `listForUnit.channelPrices` + facade (`catalog.*`, `resolvePrices`) · forced run (pre-edit oracle): C1 C2 C4 C5 C6 green, C3 red only for PRODUCT_NOT_FOUND vs NOT_FOUND (ruling 1) |
| 3 | 9e3dff7b | `price-rule.ts` + `price-rule-actions.ts` · same forced run: P1–P4 + ST4 green · `git merge origin/session/pos` → f6469641 · typecheck 0 · pushed |
| 4 | ba604e71 | register seam / tiles / `priceValidUntil` / quote line source / `CHANNEL_NOT_SOLD` / held-cart probe fix · **H2 red before the fix** (`runs/s2-forced1.log`: "held-cart.ts ไม่ส่ง channelId ให้ probe") |
| 5 | 6bfacdf1 | createSale 3 optional line fields + VALIDATION · contract regen (`--update-pos-contract`: "เติม 3 รายการ" — diff = exactly `lines[].priceSource?`, `lines[].priceRuleId?`, `lines[].listPriceSatang?`) · BillDetail lines + 3 keys |
| 6 | a91598d4 | messages th/en (`register.errors.channelNotSold/priceRuleNotFound/priceRuleLimit`, `price.*`) · forced run on steps 4–6: **42/42**, residue 0 (`runs/s4-forced1.log`) |
| merge | 3347c88a | `git merge origin/session/pos` (ledger only) · final typecheck 0 · pushed |

## What was built (S)
- `pos/price-shared.ts` (pure, client-safe; imports only `./pricing-shared`, `./channel-shared`): `PRICE_SOURCES`, limits (`PRICE_RULE_LIMIT` 100, `CHANNEL_PRICE_ROWS_MAX` 60, `BULK_MARKUP_BP_MAX` 20 000, `PRICE_RULE_PRODUCTS_MAX` 500, `PRICE_RULE_CATEGORIES_MAX` 50, `PRICE_RULE_ID_MAX` 40), `resolveUnitPrice`, `channelMarkupPrice`, `applyPriceRule`, `priceRuleMatches`, `priceRuleWindowOpen`, `priceRuleActiveUntil`, `nextPriceEdge`, `priceRuleState` (ACTIVE/UPCOMING/ENDED/OFF for U), `parsePriceRuleInput`, `priceRuleItem` (18-key DTO), `channelMarkupBpOf` (U's "+27%"), types for U.
- `pos/price.ts` (server, read-only): `loadPriceBook` (rows of product+parent for unit/all + live rules for unit matching product/parent/category — 2 queries, +1 for missing parents), `priceOf`, `priceBookValidUntil`, `resolvePrices` (C-6 `priceFor`, exported on `pos/index.ts`; channelId of this unit or channelCode, default STORE; weighed = WEIGHED per-kg).
- `catalog.ts` (single writer of PosProductChannelPrice): `setChannelPrices`, `bulkChannelMarkup`, `toViews().channelPrices` (rows with unitId null or = unit; `channelId` = this unit's non-archived SalesChannel for the code, null for branch rows / missing channel).
- `price-rule.ts` (single writer of PosPriceRule) + `price-rule-actions.ts` ("use server", async-only, `requireTenant`, each action has catch).
- `register.ts`: one `at` + one price book per `regPrice`; seam comment kept verbatim (Q8); quote lines + `priceSource/listPriceSatang/priceRule`; resolved lines → createSale `priceSource/priceRuleId/listPriceSatang`; tiles + `listPriceSatang/priceSource/priceRule{id,name,endsAt}`; `registerCatalog` + `priceValidUntil`. `held-cart.ts:292` probe passes `cart.channelId`.
- `service.ts` (createSale additive) · `bills.ts`/`bills-shared.ts` (R11) · `core/permissions.ts` `pos.price.rule` · `core/scope.ts` 2× `sys()` · `scripts/pos-qc-env.mts` · `src/messages/{th,en}/pos.json`.
- Not touched: `pos-integrations.ts` (`MARKETING.happyHourPricing` stays `false, "P2.2"` — flips in P2.2U), receipts (CD9), refund/void (R8: already price-layer agnostic; REFUND lines leave the 3 columns null — ruling 14).

## Deviations / decisions (rule touched)
1. Ruling 1: catalog writers throw `CatalogError` `NOT_FOUND` for another tenant/system/unknown product (union not widened) — ORACLE-EDIT C3 18244782.
2. Ruling 6 implemented: rights are checked on every row **added, changed or removed** by a full replace (unchanged rows need no rights, so a unit-A manager can resubmit a set that contains untouched all-branch rows). A pure no-op still requires price rights on the product (an unauthorised caller never gets "ok"). Row on a unit the actor cannot access ⇒ `PERMISSION_DENIED` (not 404 — the product itself is visible).
3. R2: row unitId must be a non-archived unit linked to this POS (else VALIDATION "ไม่รู้จักสาขานี้"); a branch-only product (`unitId` set) refuses rows for another unit. Variants of a weighed parent are refused like weighed products (CD7).
4. Bulk (CD6/ruling 5): permission is checked for every eligible product **before** skipping equal prices (staff never gets "ok, 0 written"); skips products without their **own** base price (variants inherit parent rows via the resolver), weighed products, branch products of another unit; result `{written, skipped, productIds}`; audit `pos.product.channelPrice` per written product with `via: "bulk", markupBp, roundTo`; result > Int4 ⇒ VALIDATION.
5. Rules (R3/ruling 8): edits need `pos.price.rule` on both the old and the new unit scope; productIds/categoryIds must exist in this POS system and unitIds must be linked units (VALIDATION); editing an archived rule ⇒ VALIDATION; archive of an archived rule ⇒ ok without a new audit; the limit is counted under a per-system advisory lock. Scope errors (bad ctx / unit not accessible) return `PRICE_RULE_NOT_FOUND` (404 style — the rule service has no `NOT_FOUND` code).
6. Tiles (R6): weighed ⇒ `priceSource "WEIGHED"`, per-kg price unchanged, list null; price not set ⇒ priceSatang/priceSource null; **STORE notSold ⇒ `priceSatang null`, `priceSource null`, `listPriceSatang` = list** (quote/submit refuse `CHANNEL_NOT_SOLD`; `soldOut` semantics unchanged because tiles are STORE-priced while carts may be on another channel). `priceRule.endsAt` = end of the current window (min of endsAt · today's timeTo · Bangkok midnight for weekday rules).
7. Open price (①) bypasses channel rows including notSold (R4 ① wording) — an open-price line of a channel-notSold product still sells.
8. `RegisterQuoteLine.priceSource/listPriceSatang/priceRule` and the `RegisterProduct` additions are **optional in the type** (client `localQuote` in RegisterScreen.tsx:1474 and OptionsDialog build these objects; S does not edit components). The server always fills them.
9. Messages: th `price.badge.rule` / `price.rule.kind.HAPPY_HOUR` read "ช่วง Happy hour" (fitness F15.4 requires Thai letters in th values).
10. `pos/index.ts` resolver export landed in the step-2 commit (with the catalog facade), not step 5.

## P2.2U contract (06 drawer tab · rule list/editor · register badges · bills source)
- Import only `@/lib/modules/pos/price-shared` (+ `register-shared`/`channel-shared`) in `'use client'` files.
- **06 drawer tab "ราคาตามช่องทาง"**: read `catalog.listForUnit(...).items[].channelPrices` = `{channelId|null, channelCode|null, unitId|null, priceSatang|null, notSold}`; write with `catalog.setChannelPrices(ctx, {productId, rows:[{channelCode|null, unitId|null, priceSatang|null, notSold?}]})` (full replace, ≤60 rows, throws `CatalogError` VALIDATION/PERMISSION_DENIED/NOT_FOUND/BUSY/INTERNAL — wrap in a "use server" action; no catalog action exists yet). "+27%" = `channelMarkupBpOf(price, base)`. Bulk dialog = `catalog.bulkChannelMarkup(ctx, {channelCode, unitId|null, markupBp 1..20000, roundTo 1|100, productIds≤500 | categoryId})` → `{written, skipped, productIds}`; preview with `channelMarkupPrice(base, bp, roundTo)`. Rights: `pos.product.setPrice` per row scope.
- **Rule list/editor**: `listPriceRulesAction({systemId, unitId, includeArchived?})`, `savePriceRuleAction({systemId, unitId, input: PriceRuleInput})`, `archivePriceRuleAction({systemId, unitId, id})` → `{ok:true, items|rule}` | `{ok:false, code, message, field?}` with codes VALIDATION / PERMISSION_DENIED / PRICE_RULE_NOT_FOUND / PRICE_RULE_LIMIT / INTERNAL (`register.errors.priceRuleNotFound|priceRuleLimit`). Client validation = `parsePriceRuleInput` (same messages); state pill = `priceRuleState(rule, now)`; weekday chips 0=อา…6=ส; times "HH:MM" Bangkok, no overnight (`price.rule.overnightHint`). Label "โปรราคา · <name>" (`price.rule.label`, CD1).
- **Register**: tiles carry `priceSatang` (STORE effective) + `listPriceSatang`, `priceSource`, `priceRule{id,name,endsAt}`; show the accent chip + struck list when `priceSource === "RULE"`; refetch the catalog at `priceValidUntil`. Quote lines carry `priceSource`/`listPriceSatang`/`priceRule{id,name}`: badge "ราคาตามช่องทาง" (CHANNEL) / Happy hour (RULE). `localQuote` must return null when any line has a `priceRule` or the cart channel ≠ STORE (server quote is truth). New refusal `CHANNEL_NOT_SOLD` (+ lineIndex) → `register.errors.channelNotSold`.
- **Bills drawer**: `billDetail().bill.lines[]` + `priceSource`, `priceRuleName`, `listPriceSatang` → note via `price.billNote.channel` ("ราคา {channel}") / `price.billNote.rule` ("{kind} · {name} (ปกติ {list})"); receipts unchanged (CD9).
- **10 settings**: flip `MARKETING.happyHourPricing` with its own ORACLE-EDIT on `qc-pos-p1.18.mts:319` (Q8).
- Message keys ready under `pos.price.*` (title, sectionTitle, edit, notSold, useBase, branch, markupPct, platformPrice, filterDiffers, source.*, badge.*, billNote.*, bulk.*, rule.*).

## Follow-ups
- F1 Held-cart probe maps `CHANNEL_NOT_SOLD` to the `PRODUCT_UNAVAILABLE` notice (HeldCartNotice union unchanged) — a dedicated notice code is a small additive change for P2.2U/P2.4.
- F2 No catalog server actions for `setChannelPrices`/`bulkChannelMarkup` yet (U adds them, `pos.product.setPrice`).
- F3 Rules referencing archived/deleted products stay valid (ids are loose); the editor should show "สินค้าถูกเก็บถาวร".
- F4 P2.4/P2.7/P2.8 callers should pass `priceSource/priceRuleId/listPriceSatang` from `resolvePrices` into createSale (today only the register does).
- F5 P2.11: branch rows (null, unit) are already branch prices; copy/compare UI and reports remain there. P2.12 reads `PosSaleLine.priceSource`.
- F6 `marketing.activePriceRules` facade + `campaignId` (P3, CD1).

## Gate exit codes
All at head 3347c88a (steps 1–6 + merge of origin/session/pos), logs `runs/final-*.log`, `runs/final-summary*.txt`.
- `qc-pos-p2.2` forced ×2 **0 · 42/42 · 42/42** · unforced **0 · 42/42** · residue 0 · leaks 0 · guardHits 0 (Bangkok ≈06:10–06:40).
- typecheck **0** (also 0 after step 1 and after step 3 + merge) · `pnpm fitness` no env **0 · 41/41** · QC4 env **0 · 41/41** · `scripts/fitness-pos.mts` **0 · 8/8** (F15.2 contract diff = exactly the 3 optional line fields).
- Green: `qc-pos-p1.12` 72/72 (run 2; run 1 X6 void-race 71/72 — race test, green on re-run) · `qc-pos-p1.8` 49/49 (run 2; run 1 C10/Z1/Z2 drift from a parallel lane) · `qc-pos-p1.5` 21/21 · `qc-pos-p1.15` 39/39 · `qc-pos-p1.13` 33/33 · `qc-pos-p1.16` 28/28 · `qc-pos-p1.17` 40/40 · `qc-pos-p1.18` 81/81 (ST7 green) · `qc-pos-account` 16/16 · `qc-account-cpa` 107/107 · `qc-shop-refund` 12/12 · `qc-restaurant-money` 6/6 · `qc-hotel-money` 5/5 · `qc-ticket-money` 6/6 · `qc-subscription-money` 14/14 · `qc-hf-pos-page-authz` 56/56.
- **Red, not this WO's code (re-run once):** `qc-pos-p1.3` 126/128 and `qc-pos-p1.2` 53/55 — only the residue/fingerprint checks (P1.3-S9.1/S9.2, P1.2-Z1/Z2): posqc-coffee counts moved during the runs (posSale +11/+9, posProduct 18→7, menuOptionGroup 4→0) while `visual-pos.mts p1close` from tree `shark-pos-d` was running against posqc-coffee (:3228). Run 1 of p1.3 also had S1.9 pick up a visual fixture (`PQC-VIS-…`); green on re-run. ⇒ CONTROLLER-RUN on a quiet QC4.
- **Red by contract — CONTROLLER-RUN / ORACLE-EDIT needed:** `qc-pos-p2.1` 54/55 — **P2.1-S8** asserts the CreateSaleInput fields beyond its base are exactly `channelId, channelRef`; the P2.2 contract regen (mandated, F15.2 additive) adds `lines[].priceSource/priceRuleId/listPriceSatang`. Proposed edit: `qc-pos-p2.1.mts:550` accept the three P2.2 line fields as known later additions (count unchanged). Not edited here (prompt: only C3).

### Controller ruling round (10 Oct) — head after 4ea0ad23
- ORACLE-EDIT `qc-pos-p2.1` S8 in its own commit **4ea0ad23** (`scripts/qc-pos-p2.1.mts:550` — extras must be exactly `channelId, channelRef` + the 3 optional P2.2 line fields; count 55). Re-run `qc-pos-p2.1` **0 · 55/55** · residue 0 · drift none (`runs/final-p21-r2.log`).
- Re-run 3 of `qc-pos-p1.3` **127/128** (`runs/final-p13-r3.log`): only **P1.3-S9.1** red — posqc-coffee `outboxEvent 487→488`, `accountJournalEntry 728→729` during the run · S9.2 fingerprint now green.
- Re-run 3 of `qc-pos-p1.2` **54/55** (`runs/final-p12-r3.log`): only **P1.2-Z1** red — posqc-coffee `auditLog 388→389` during the run · Z2 fingerprint now green.
- Both drifts coincide with tree `shark-pos-d` running `visual-pos.mts p1close --states --tenant coffee` (pages shifts → stock, server :3228) against posqc-coffee throughout runs r1–r3 (`ps` at run time). Every functional check of both suites is green; residue checks left to the controller's merge-point gates on a quiet QC4.
