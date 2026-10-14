# POS P2.6 S — builder notes (KDS server half)

Builder · account B · 10 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.6` from `session/pos` **ca5a07b4**.
Binding: `pos-brief-P2.6.md` §9 + §10 · `wo-notes/pos-P2.6-oracle.md` (names table rows 1–22) · `scripts/qc-pos-p2.6.mts` (not edited) · LANE-RULES.

## Step 0 — red-before (done · commit 27cb28fa)
`bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.6.mts` (CI unset)
→ **7/51** (ST4 L1 L2 L3 L4 Z1 Z2) · PAR 5/5 · **SKIP-until-export 0** · residue 0 · saved `ledger/wo-notes/P2.6-red.txt`. Matches the expected result, so there is no oracle drift.

## Step 1 — migration + schema + registrations (WIP)
- `prisma/migrations/20261208100000_pos_p26_kds/migration.sql` = the oracle sample statements exactly (lock_timeout 3s · 6 RO columns · 2 partial uniques · autoAcceptMaxOpen · DO-block enum · PosAvailabilityMark table + 2 indexes · RESET).
- Schema: `restaurant.prisma` RestaurantOrder +6 (`posSaleId posOrderId channelCode channelName externalRef String?` · `targetMinutes Int?`) · RestaurantSetting `autoAcceptMaxOpen Int?` · `pos.prisma` enum `PosAvailabilitySource` + model `PosAvailabilityMark` (no @relation, `@@unique([unitId, productId])`, `@@index([tenantId, unitId])`).
- `core/scope.ts` `PosAvailabilityMark: sys()` · `scripts/pos-qc-env.mts` `POS_MODELS.posAvailabilityMark`.
- `pnpm exec prisma validate` ✓ · `pnpm exec prisma generate` ✓ (tree c node_modules).
- **QC4 deploy** `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec prisma migrate deploy` → host ep-frosty-lab · "Applying migration `20261208100000_pos_p26_kds` … All migrations have been successfully applied." (**APPLIED on QC4**).
- Prod `RestaurantOrder` row count: not available to the builder; the controller supplies it (§9 ruling 14).

## ▶️ RESUMED 14 Oct 2026 (account B · controller B) — from ffaee746 (step 1 WIP) · scratch `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p26/`
- Tree clean at ffaee746 · `prisma migrate status` up to date (controller) · client already has `posAvailabilityMark` (no regenerate needed).
- Step 1 remainder: `src/lib/modules/pos/kds-shared.ts` (pure · row 11 + DTO types of the P2.6U contract) → `--no-db`: ST1 T1 T2 T3 green (8/13; remaining reds = later steps).

## Design decisions (carried from the pause + refined on resume)
  - restaurant `createKitchenRoundInTx`: advisory lock per sale/order · existing round = `created:false` · non-archived stations only · MENU routing via `MenuItem.posProductId`, non-MENU via `PosProduct.stationId` (or the parent's) · round items carry **price 0** and `saleId` null (money untouched) · floor-at-0 consume through a new catalog-legacy function that emits a STOCK flip event plus a STOCK mark.
  - KDS moves: conditional `updateMany … WHERE kdsStatus IN (…)` in restaurant `*InTx` functions.
  - `kitchenProgressInTx` goes in `pos/order.ts`. `kds.ts` lazy-imports `./order`, and `order.ts` imports `./kds` statically. The p2.8 ST3 check bans any restaurant import in `order*` files, so the restaurant calls go through `kds.ts`.
  - Kitchen pause and backlog use the `pauseRefuses` adapters (WEB/CHAT/API).
  - `setAvailability` writes MenuItem directly in `catalog.ts` (F15.1 writer). Routing it through catalog-legacy would create an import cycle; the MENU write still stays inside the catalog writer pair.
  - **Refined on resume:** (a) the new restaurant writers live in a new file `restaurant/kitchen.ts` (re-exported by `restaurant/index.ts` in a `// POS P2.6 ▸ … ◂` block) so the pinned `restaurant/order.ts`/`kds.ts` (L1 sigs · ST4 hot-path bodies) stay byte-identical; (b) the restaurant writer does **not** touch MenuItem — the floor-at-0 MENU counter consume/restore is a new catalog-legacy function called by `pos/kds.ts` in the same tx (F15.1 writer pair · restaurant module stays free of catalog writes); (c) **no STOCK mark row** — the board's `eightySix` lists marks (KDS/MANUAL, with who/when) plus MENU rows sold out by counter/legacy 86 (source STOCK, `at` = MenuItem.updatedAt), so a counter release never leaves a stale mark; (d) legacy `setItemStock`/`resetDailyStock` flips emit events only (no mark) — the mark is the `setAvailability` record.

## Per-step results
- step 1 ✅ (this commit) — migration/schema/scope/qc-env (ffaee746) + kds-shared.ts.
