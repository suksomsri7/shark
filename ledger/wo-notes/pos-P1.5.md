# POS P1.5 — hold / recall bills (builder notes)

Builder · cloud run · 4 Oct 2026 · branch `wip/pos-p1.5` (base e2cf04ee = session/pos + P1.3 + P1.4). No DB in this container.

## What was built

**Server**
- `src/lib/modules/pos/held-cart.ts` (new). It is the only writer of `PosHeldCart`, and it is not a `"use server"` file. Every function returns refusals as data and never throws (an unexpected error becomes `INTERNAL`). Each one takes an optional trailing `client`.
  - `holdRegisterCart(ctx, actor, {cart, label?}, client?)`:
    - Runs the register scope gate (`registerScopeCheck`, which is `regScope`).
    - Validates the label: string, trimmed, at most 60 code points, no NUL or lone surrogate. Empty becomes null.
    - Canonicalises the cart with `registerCanonicalCart`, the same parser as quote (`regParseCart` + `REG_QUOTE_KEYS`). Unknown keys, a coupon or `idempotencyKey` give `VALIDATION`. Catalog-line client prices are dropped.
    - An empty cart gives `VALIDATION`.
    - Then calls `quoteRegisterCart`, which must be ok; its refusal is returned as is.
    - Stores `cartJson = {cart, heldUnitPrices, preview}`, with `approxTotalSatang` set to the server grand total.
  - `listHeldCarts`:
    - Lazy expiry first: an `updateMany` turns HELD rows whose `createdAt` is older than N×24 h into DISCARDED. N is `AppSystem.settings.pos.heldCart.expireDays` (integer 1–365), else `HELD_CART_EXPIRE_DAYS = 2`.
    - Then returns HELD rows newest first (`createdAt desc, id desc`, max 100).
  - `recallHeldCart`:
    - Scope gate.
    - Reads the row (tenant + system + unit). Missing or DISCARDED gives `NOT_FOUND`; RECALLED gives `ALREADY_RECALLED`; expired gives `NOT_FOUND`.
    - Re-parses `cartJson.cart` through the canonical parser, because the DB copy is untrusted.
    - **Single-winner** step: `updateMany WHERE id, tenant, system, unit, status='HELD', createdAt >= cutoff` sets RECALLED + `recalledAt` + `recalledByUserId` + `version+1`. `count !== 1` triggers a re-read, which gives `ALREADY_RECALLED` or `NOT_FOUND`.
    - Re-prices with `quoteRegisterCart` at current prices.
    - Notices:
      - If the full quote is ok, each catalog (non-open-price) line's current price is compared with `heldUnitPrices`, giving `PRICE_CHANGED {heldUnitPriceSatang, unitPriceSatang}`.
      - Otherwise it probes the catalog lines only (no discounts or member) and removes the failing line one at a time, giving `PRODUCT_NOT_FOUND` or `PRODUCT_UNAVAILABLE` per original line index. `OPTIONS_REQUIRED` and `PRICE_NOT_SET` map to `PRODUCT_UNAVAILABLE`.
      - Bad lines are **kept** in `cart`, so `quote` stays refused and Pay is blocked until they are removed.
    - Also returns `products` (still-sellable `RegisterProduct`s, for the grid cache) and `lineNames` (names, including archived products).
  - `discardHeldCart`:
    - Scope gate, which is the same permission as clearing a bill (`pos.sale.create` at the unit).
    - In one interactive tx: `updateMany status HELD → DISCARDED` and an `AuditLog` row (`pos.heldCart.discard`, `targetType PosHeldCart`, `unitId`, actor, before/after).
    - A non-HELD row gives `NOT_FOUND`.
- `register.ts` gets new exports only, with no behaviour change: `registerScopeCheck`, `registerCanonicalCart`, `registerProductsByIds`, `registerDb`, plus `REG_MESSAGE.ALREADY_RECALLED`.
- `register-shared.ts` adds:
  - `HELD_CART_EXPIRE_DAYS = 2` and `HELD_CART_LABEL_MAX = 60`;
  - the types `HeldCartSummary` (`… heldByName, preview, createdAt ISO`), `HeldCartNotice`, and the 4 result types;
  - refusal `ALREADY_RECALLED` → `errors.alreadyRecalled`;
  - the pure helper `quoteInputToCart(input, newLineKey)`, which uses fresh line keys and carries no key or coupon.
- `register-actions.ts` adds `holdRegisterCartAction`, `listHeldCartsAction`, `recallHeldCartAction` and `discardHeldCartAction`. They use the same thin shell (session → `sessionScope` → service, with `catch` → `UNKNOWN`) and have no `throw`.
- `src/lib/core/scope.ts` registers `PosHeldCart: sys()`. Fitness F1.1/F10.1 require it.
- `scripts/pos-qc-env.mts` moves `PosHeldCart` from `POS_FUTURE_MODELS` to `POS_MODELS`.

**UI** (`src/components/pos/register/`)
- `CartPanel.tsx`:
  - `pos-reg-hold` is now real: `disabled` while frozen or when the cart is empty, and it opens the label dialog.
  - `pos-reg-held-bills` is now real and opens the drawer, with the count pill `pos-reg-held-count` (hidden at 0, shown as 99+ above 99).
  - New `notice` slot above the lines.
- `HeldBillsDrawer.tsx` (component `HeldBillsDialog`; the "Drawer" suffix would trip the F15.3a interactive-component regex):
  - Mockup 14B: right panel 474 px on md+, bottom sheet on mobile.
  - Each card shows the label (or "Bill HH:MM"), the held total, "N items · held HH:MM · name", and a preview.
  - Buttons are `pos-reg-held-recall-<id>` / `pos-reg-held-discard-<id>`, both h-12. Discard needs two taps.
  - Expiry note at the bottom.
- `HeldDialogs.tsx`:
  - `HoldLabelDialog`: optional label of up to 60 chars; Enter submits.
  - `HeldRecallConfirmDialog`: implements ruling 4. Recalling over a non-empty cart asks "hold the current cart first?" with "hold then recall" or cancel. Cancel is focused.
- `RegisterScreen.tsx`:
  - **F8** calls `onHold()` (instant hold, no label). The button opens the label dialog, which also calls `onHold(label)`.
  - `onHold` guards `frozenRef`/`frozen`, `cart.lines.length` and a busy ref. It calls `holdRegisterCartAction`, and only on ok calls `resetBill()` (key rotation stays inside `resetBill`, S5.21). A failed hold keeps the cart.
  - `onRecallHeld` calls `recallHeldCartAction`, then `resetBill()`, then `changeCart(quoteInputToCart(…))`, then sets notices keyed by the new line keys. There is no `setIdemKey` and no key from the held row.
  - The count refreshes on mount, on tab visibility, after every hold/recall/discard and when the drawer opens.
  - Recalled lines show their name from `lineNames` even when the product is no longer in the grid cache.
  - A notice disappears when its line is removed or the bill is reset, and it can be dismissed.
- i18n: `pos.register.held.*` (24 keys) and `errors.alreadyRecalled` in th and en. ICU variables are the same in both.
- `scripts/pos-ui-inventory.json`: the hold and held-bills rows are updated (modal instead of toast), and 10 P1.5 rows are added.

## Migration

`prisma/migrations/20261121000000_pos_p15_held_cart/migration.sql`. It is additive only and contains no DROP, RENAME, TRUNCATE or DELETE (grep count 0):
- `CREATE TYPE "PosHeldCartStatus" AS ENUM ('HELD','RECALLED','DISCARDED')`
- `CREATE TABLE "PosHeldCart"` with the 14 H1 columns:
  - `id`, `tenantId`, `unitId`, `systemId` (TEXT NOT NULL);
  - `label` (TEXT NULL), `cartJson` (JSONB NOT NULL);
  - `lineCount`, `approxTotalSatang` (INT NOT NULL), `heldByUserId` (TEXT NOT NULL);
  - `recalledAt` (TIMESTAMP(3) NULL), `recalledByUserId` (TEXT NULL);
  - `status` (enum NOT NULL DEFAULT 'HELD'), `createdAt` (DEFAULT CURRENT_TIMESTAMP), `version` (INT NOT NULL DEFAULT 1).
- Primary key on `id`.
- `CREATE INDEX "PosHeldCart_unitId_status_createdAt_idx" ON ("unitId","status","createdAt")`.
- There are no FKs: ids are loose, as on `PosProduct` and `PosReceiptCounter`. No existing model is touched, and no back-relations are needed.

**How it was validated without a DB:** the body of the file is byte-for-byte the output of `pnpm exec prisma migrate diff --from-schema <copy of prisma/schema at e2cf04ee> --to-schema prisma/schema --script` (Prisma 7). The diff showed only the 3 statements above, so there is no drift in other models. `pnpm exec prisma generate` was run, which wrote to the shared node_modules. The timestamp 20261121000000 is later than every existing folder (latest 20261120000001_pos_v2_a_links).

## No-DB results (this container)

| command | result |
|---|---|
| `pnpm exec tsx scripts/qc-pos-p1.5.mts --no-db` | 5/5 (S1–S5), exit 0 |
| `pnpm exec tsx scripts/qc-pos-p1.5.mts --list` | 21 ids, exit 0 |
| `pnpm exec tsx scripts/qc-pos-p1.4.mts --no-db` | 13/13, exit 0 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | 41/41, exit 0 (F1.1, F5.1, F10.1 and F15.3a were red mid-way and are fixed) |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck` | exit 0 |

The P1.3 oracle has no `--no-db` mode, so its statics were not run. I checked these by hand:
- no new `setIdemKey`;
- `pos-reg-hold` and `pos-reg-held-bills` are still first in CartPanel with `h-11`;
- no Thai literals outside comments in the UI files;
- `register-shared` imports are unchanged;
- every new action calls `session()` → `requireTenant` and has a `catch`.

## For the controller (VPS / QC4)

1. Deploy the migration to QC4 (runner `migrate-qc4`), then run `pnpm exec prisma generate` on the VPS.
2. `QC_FORCE=1 … qc-pos-p1.5.mts` must give 21/21. Most sensitive to confirm:
   - **H9**: race, 10 lanes × 3 rounds;
   - **H8**: probe loop gives `PRODUCT_NOT_FOUND@0` and `PRODUCT_UNAVAILABLE@1`;
   - **H7**: `PRICE_CHANGED`, assuming quote `unitPriceSatang` equals the base price under VAT INCLUDED;
   - **H13**: expiry setting;
   - **H12**: cashier with `pos.sale.create` can recall the owner's cart with no custom line.
   - Unforced, the oracle must not SKIP.
3. Re-run `qc-pos-p1.3`, `qc-pos-p1.4` and the `qc-pos-*` suites, plus fitness with .env.
4. **Browser checks** (visual, owner and cashier, at 1440×900, 1024×768 and 390×844):
   - The hold button opens the label dialog; Enter holds; the cart clears; the toast shows; the pill shows 1.
   - F8 on a non-empty cart holds instantly. F8 inside a dialog does nothing.
   - The drawer matches mockup 14B: right panel on desktop, bottom sheet on 390.
   - Recall on an empty cart restores the lines with names and the server total.
   - Recall on a non-empty cart opens the confirm dialog: "hold then recall" swaps the carts, and the pill count stays the same.
   - Discard needs two taps and the card disappears.
   - Two browsers recall the same bill: one gets the cart and the other gets the "already recalled" toast.
   - Change a price after holding, then recall: the price notice shows. Archive a product, then recall: the line keeps its name, the notice shows, and Pay is blocked until it is removed.
   - Pay after a recall uses a new bill key: check that the `reg2:` key differs from the pre-hold one.

## Open questions

1. **F5.1 ratchet.** `held-cart.ts` gets its default client through `registerDb()`, a new export in register.ts, which is already in the F5.1 baseline, instead of importing `prisma` itself. This kept `fitness.mts` (a shared hot file) untouched. If the controller prefers that held-cart imports `prisma` directly, bump `BASELINE.f5RawPrisma` to 46 at merge.
2. **F8 holds without a label**, while the button asks for one. The drawer falls back to "Bill HH:MM". Alternative: F8 also opens the label dialog, but S3 requires F8 to call `onHold(` directly.
3. **The confirm dialog has 2 options** (hold first, or cancel) per ruling 4. Mockup 14B also shows "discard then recall"; it is not built.
4. The expiry note in the drawer shows the default 2 days, not the per-system setting. The list result does not carry N.
5. There is no cap on HELD carts per unit; the list shows the newest 100. Propose a cap (e.g. 50) with a refusal code if wanted.
6. `OPTIONS_REQUIRED` and `PRICE_NOT_SET` on recall are reported as `PRODUCT_UNAVAILABLE` notices, because the notice vocabulary has 3 codes.

## R1 — controller rulings (4 Oct)

- (1) `registerDb()` was removed from register.ts. `held-cart.ts` now imports `prisma` from `@/lib/core/db` directly. `scripts/fitness.mts` F5.1 baseline goes from 45 to 46, with the comment "P1.5 held-cart.ts — new POS module".
- (2) Accepted: F8 holds at once with no label. (3) Accepted: the confirm dialog has 2 options.
- (4) Fixed. `listHeldCarts` now also returns `expireDays`: the setting `AppSystem.settings.pos.heldCart.expireDays`, or 2 if it is unset. The screen keeps this value and the drawer's expiry note shows it.
- (5) Note: there is no cap on HELD carts per unit. The drawer lists the newest 100.
- Re-run with no DB: p1.5 `--no-db` 5/5 · p1.4 `--no-db` 13/13 · fitness (DB env unset) 41/41 · typecheck exit 0.
