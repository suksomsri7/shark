# P1.1a — Single catalog: tables + backfill (no UI, no behaviour change for existing screens)
Read `pos-brief-COMMON.md` first. Lane S (solo) — touches shared schema.

## Why
Products exist in three places (`InvItem`, `MenuItem`, `ShopProduct`) and the sale price lives in `AccountProduct.salePrice` (so a shop cannot set a price without connecting Accounting). Everything in P1/P2 needs one `PosProduct` per sellable thing, linked 1:1 to `InvItem`.

## Deliverables
1. Prisma (additive only, see `POS-MIGRATION-PLAN.md` §1–§2 step 1): `PosProduct`, `PosCategory`, `PosVariant` (or `PosProduct.parentId`), `RecipeLine`, `PosProductOptionGroup`, plus nullable `posProductId` on `MenuItem` and `ShopProduct`, nullable `productId` on `PosSaleLine`, `RestaurantOrderItem`, `ShopOrderLine`. Indexes via separate concurrent migration file.
2. `src/lib/modules/pos/catalog.ts` — the only writer: `createProduct`, `updateProduct`, `setPrice`, `archive`, `listForUnit`, `byBarcode`, `ensureForInvItem`. Read model shape = `POS-API.md` §1 `GET /products`.
3. `scripts/pos-backfill-catalog.mts` — idempotent, `--dry-run` prints counts per source; creates PosProduct for every InvItem / MenuItem / ShopProduct exactly once; copies price from `AccountProduct.salePrice`; links option groups.
4. Fitness F15.1 (no MenuItem/ShopProduct/AccountProduct.salePrice writer outside catalog.ts — ratchet baseline like `AUTHZ_BASELINE`), F15.2 (createSale consumers' call sites unchanged — snapshot of signatures).
5. Oracle `scripts/qc-pos-p1.1.mts` already exists from P0.3 (fail-before). Make it pass without editing expectations; if an expectation is wrong, stop and write ORACLE-EDIT in notes with before/after.

## Files you own
`prisma/schema/pos.prisma` (new models + columns only), new migration files, `catalog.ts`, the backfill script, `scripts/fitness.mts` (F15.1/F15.2 only), `ledger/wo-notes/P1.1a.md`.
Do NOT touch: `service.ts` createSale, restaurant/shop/inventory modules (P1.1b does the writers).

## Acceptance
- `bash scripts/iso.sh pnpm exec tsx scripts/pos-backfill-catalog.mts --dry-run` then real run twice → second run creates 0 rows.
- `qc-pos-p1.1.mts` green (~40 checks: 1:1 counts, price equality, idempotency, cross-tenant isolation, rollback = drop new tables leaves old data intact).
- Full money regression set (COMMON §7) green on the Neon branch with migrations applied.
- `pnpm fitness` green with and without `.env`.
- Push the migration immediately after it is created (shared-schema rule).
