# P6.1 — production migration runbook (DRAFT · controller · cloud run · 3 Oct 2026)

> Draft collected from POS-RESUME §0.3–§0.9 and the P1.1a/HF review rounds. Not executable until P6.1 is reached and every item is re-verified against the code/migrations of that day. Nothing here authorises touching production — the owner's explicit GO is required for every step on prod.

## 0. Preconditions
- CRM is on `main` first; POS migration timestamps re-checked so every POS migration sorts AFTER CRM's (e.g. `20261104000000_account_journal_no_sequence`). Rename timestamps at merge time if needed.
- Hotfix RC (`rc/hotfixes-2026-10-01` = apiv1-scope + pos-page-authz + hr-privacy + inventory-atomic) is on `main` before or together with P1.3 (P1.3 merged `hotfix/inventory-atomic`; S3.18 depends on atomic counters).
- Merge checklist (from P1.1a acceptance): `checkCatalogWrite` (catalog.ts) ≡ `posCanSetTenantPrice` (hotfix/pos-page-authz) — one rule; add `ep-frosty-lab` handling to `scripts/qc-prisma.sh` only if still used; P1.1b: `catalog-legacy.ts` in `SYSTEM_MARKER_ALLOWLIST`; P1.3 `register.ts` registerCatalog uses the same live MENU availability rule as `listForUnit` (P1.1b addendum 2 ruling 3 / S1.27).
- `createSale` contract change (B1 `productId` optional) → run `--update-pos-contract` at merge.
- P1.4 (O22 exception): POS added dependency `@zxing/browser@^0.2.1` (+ peer `@zxing/library@0.23.0`, `ts-custom-error`, optional `@zxing/text-encoding`) to `package.json` + `pnpm-lock.yaml` → re-resolve the lockfile at the CRM/main merge (`pnpm install` after taking both `package.json` sides; do not hand-merge `pnpm-lock.yaml`). Note `@zxing/library` declares `engines.node >= 24`.
- Full suites green on a fresh Neon branch of prod (not QC4): POS oracles, money set (COMMON §7), hotfix oracles, fitness both modes, typecheck, production build.

## 1. Connection rules
- `prisma migrate deploy` ONLY through the **direct** URL (never `-pooler`): session-level `SET lock_timeout` leaks through PgBouncer transaction pooling.
- Check the Prisma version used for deploy: Prisma 7.8 sends a migration file **without `DO $$` as one statement per transaction** (non-atomic), and a file **with `DO $$` as one transaction**. Our split depends on this:
  - `20261120000000_pos_v2_a` (new tables/enum/index/FK; has DO ⇒ single tx, atomic)
  - `20261120000001_pos_v2_a_links` (5 nullable `ADD COLUMN` on existing tables; no DO ⇒ statement-by-statement, each lock held briefly; measured via xmin)
- `SET LOCAL` has no effect in the per-statement mode — files use session `SET lock_timeout` and `RESET` at the end.

## 2. Window + pre-flight
- Outside selling hours for all POS tenants (restaurant/shop/hotel/ticket also call `createSale`).
- Pre-flight read-only: `pg_stat_activity` + `pg_locks` on the 5 existing tables touched by `_links`: `ShopProduct`, `ShopOrderLine`, `PosSaleLine`, `MenuItem`, `RestaurantOrderItem` (verified from the migration file 3 Oct; re-check on the day); no long transactions; table sizes recorded (decides index strategy).
- Backup/branch point: create a Neon branch of prod immediately before deploy (instant rollback target).

## 3. Failure handling
- Lock timeout → `P3018` → migration marked failed → next deploy refuses with `P3009`.
- Recovery: inspect what applied (`_pos_v2_a` is atomic ⇒ nothing; `_links` may be partial) → run rollback SQL **one statement at a time (autocommit)**, all statements `IF EXISTS` → `prisma migrate resolve --rolled-back <name>` → re-deploy.
- Rehearsed on QC4 by P1.1a builder (lock held → P3018 → P3009 → resolve → deploy ok). Re-rehearse on the prod-copy branch.

## 4. Post-migration (separate, manual)
- Indexes deliberately NOT in migrations (lock risk on existing tables): InvItem barcode index and the 5 indexes removed in P1.1a R2 (M7) → `CREATE INDEX CONCURRENTLY` by hand, one at a time, outside a transaction; verify `indisvalid`.
- Backfill: `scripts/pos-backfill-catalog.mts` dry-run on prod copy first → review price counters with the owner (`soldAtCostToday`, `apIgnoredButTillPriced`, `invalidLegacyPrice`, `priceNotSetOther`, `catalogPriceDiffersFromTill` — compare against the price actually stored, not re-derived) → real run.
- Window between backfill and P1.1b dual-write going live: re-sync archive state + prices; re-run `--verify` AFTER the backfill (P1.1b hunter #3: a legacy edit racing the backfill on a not-yet-linked row can leave drift) — must report 0.
- Flag `settings.pos.registerV2` stays OFF on prod until P1.6 + P1.12 are done (Q4).

## 5. Prod read-only checks owed (owner approval each)
- O18: key types in use for legacy `/api/v1/*` · `scripts/inv-cache-audit.mts` (ALLOW_PROD_AUDIT=1, off-hours) · HR link audit SQL (links bound by non-payroll viewers).

## 6. Open before P6.1 can be final
- Who runs deploy (owner) and from where (VPS; cloud containers cannot reach Postgres over TCP).
- Exact table list / sizes for §2 and index plan for §4 on the day.
- Merge order of CRM / RC / POS branches and timestamp renames.

## P1.9 shift rollout (OQ-P19-1 — owner chose (a), 5 Oct 2026)
- Existing POSes with registerV2 on become shift-required after deploy; staff holding only pos.sale.create cannot open a shift. Controller recommendation (a): data step sets settings.pos.shift.required.register=false on every existing registerV2 POS before go-live; owners opt in. Alternatives (b) sale.create may open own-device shift, (c) default off. Old register tabs without deviceId must be reloaded.
