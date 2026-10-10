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

## ⏸ PAUSED (controller order 10 Oct 12:2xZ — weekly quota)
- **Last completed step:** step 0. Step 1 is committed as WIP: schema, migration, QC4 deploy, scope, and qc-env are done.
- **Resume point (step 1 remainder):** create `src/lib/modules/pos/kds-shared.ts`. It must be pure, with no prisma/db/server imports and no `node:`. Exports per names table row 11: `KDS_TICKET_STATES` · `KDS_SOURCES` · `KDS_WARN_SEC=120` · `ticketStateOf` · `ticketSourceOf` (ONLINE > REGISTER > TABLE > QR > LEGACY) · `ticketTargetMinutes` (round → max prep → critical) · `ticketTimer` (floor elapsed · remaining = target·60 − elapsed · late = elapsed ≥ target·60 · warn = !late && remaining ≤ 120) · `avgReadyMinutes` (floor mean, 0 when empty) · `sortColumn` (non-mutating · NEW sentAt · COOKING rush then remainingSec · READY readyAt · ties by id) · `kdsRefusalMessageKey` (`errors.<camel>` · unknown → `errors.unknown`) · code literals `TICKET_NOT_FOUND TICKET_TOO_OLD KDS_STATION_NOT_FOUND` + DTO types. Commit it as "pos P2.6 S step 1", then start step 2.
- **Design decided so far (not yet coded):**
  - restaurant `createKitchenRoundInTx`: advisory lock per sale/order · existing round = `created:false` · non-archived stations only · MENU routing via `MenuItem.posProductId`, non-MENU via `PosProduct.stationId` (or the parent's) · round items carry **price 0** and `saleId` null (money untouched) · floor-at-0 consume through a new catalog-legacy function that emits a STOCK flip event plus a STOCK mark.
  - KDS moves: conditional `updateMany … WHERE kdsStatus IN (…)` in restaurant `*InTx` functions.
  - `kitchenProgressInTx` goes in `pos/order.ts`. `kds.ts` lazy-imports `./order`, and `order.ts` imports `./kds` statically. The p2.8 ST3 check bans any restaurant import in `order*` files, so the restaurant calls go through `kds.ts`.
  - Kitchen pause and backlog use the `pauseRefuses` adapters (WEB/CHAT/API).
  - `setAvailability` writes MenuItem directly in `catalog.ts` (F15.1 writer). Routing it through catalog-legacy would create an import cycle; the MENU write still stays inside the catalog writer pair.
- **CONTROLLER-DECISION items:** none so far.
- **Commands planned next:** `pnpm exec tsx scripts/qc-pos-p2.6.mts --no-db` after kds-shared · then build steps 2–8 · final gates per the prompt.
