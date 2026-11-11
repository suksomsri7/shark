# P1.1b Part A — round R2 (controller rulings on the independent review of 8bc118f6 · 4 Oct 2026)

Same builder, same tree `/root/projects/shark-pos-b`, branch `wip/pos-p1.1b`. **First `git pull --ff-only origin wip/pos-p1.1b`.** It now contains the controller ORACLE-EDIT 1219966c (S2.34 fixture fixed; S2.21 expects the C7 price of the POS that sells the inventory legacy picked). All rules of the first prompt still apply: QC4 only, wrappers, explicit-path commits, push after each fix, notes, QUOTA STOP.

## Fix list (in this order)
F1 **BLOCKER — catalogue refusals must be visible.** Your `?err=` redirects land on pages that never read `searchParams.err`:
- `shop/page.tsx`
- `booking/services/page.tsx`
- `restaurant/menu/page.tsx`
- `menu/stock/page.tsx`
- InvHub on `/app/sys/[id]`: today it passes `err` only to the chat section.

Render an error banner on each, using the same component/pattern `shop/orders/page.tsx` uses, with Thai text and existing tokens. Pass `err` into InvHub. Check every redirect target in `inventory/actions.ts`, `shop/actions.ts`, `actions/booking.ts`, `actions/restaurant.ts`, and list them in the notes (action → page → banner).
F2 **Reverse price target = the winning rung.** `catalog.ts` ~:692-701 `priceTarget` must follow the same rungs as the forward derivation (`initialPrice`/C7). Derive it from `price.rung` so the two can never drift. Case: shop row linked to a SERVICE with `InvItem.priceSatang>0` → write `InvItem.priceSatang`, not `ShopProduct.priceSatang`.
F3 **Ruling: the reverse direction re-syncs siblings.** G4c forbids ping-pong, not fan-out. After writing the winning legacy field (`AccountProduct.salePrice` / `InvItem.priceSatang` / …), re-derive EVERY PosProduct row derived from that same source, exactly as the forward doors do. Locking: compute the sibling set first, then lock all PosProduct rows in id order, then the legacy row (G7 order unchanged). One tx.
F4 **Ruling: `setPrice(0)` where the winning legacy field cannot express 0** (e.g. PRODUCT with AP + posEnabled/posPrice rung, SERVICE whose derived result would be null) → refuse with `VALIDATION` and a Thai message ("ราคา 0 ใช้กับสินค้านี้ไม่ได้ — ตั้งราคาที่ระบบเดิม"). Leave `setPrice(0)` alone wherever it round-trips. In `--verify`, give stored price 0 + derived null its own reported bucket (`zeroVsNull`), separate from the info bucket `catalogueOnlyPrice`.
F5 **Shared shop row (C9b).** `catalog-legacy.ts` ~:351: take name/price from the edited ShopProduct only when it is `shopIds[0]`. This is the same source as backfill, `resyncRows` and `--verify` (G3 wins, ruling 5).
F6 **Category race.** `catalog-legacy.ts` ~:87-89: PosCategory creation must use `INSERT … ON CONFLICT DO NOTHING` followed by a re-read in the same tx client, so there is no P2002 in the caller's tx (G11). Two concurrent `menu.createItem` with a new category name must both succeed.
F7 **Lock order on InvItem unarchive** (`catalog-legacy.ts` ~:377): take the tenant try-lock BEFORE locking rows when un-archiving (tenant → row).
F8 **Fitness tightening.**
- The `inventory→pos` / `account→pos` edges: allow only `pos/catalog-legacy` plus `pos`/`pos/catalog` (for CatalogError), not the whole module.
- Ban re-exports of `catalog-legacy` (`export * from` / `export {…} from`), as is done for catalog.ts.
- Narrow the pdpa exemption to the `{dynamic}` delete instead of the whole file.
- Negative proofs for all three.
F9 **Audit actor.** Sync audit rows record the human actor of the legacy door (pass `actorId`/`actorType` through), not `SYSTEM/null`, whenever a human started the change.

## Deferred (no code now — note only)
- Archived PosCategory reuse (review #8) → P2.4.
- Book link/unlink and `vatRegistered` toggle are not doors (review #11) → P6.1 runbook + P2.1.
- Legacy `inventorySystemId()` unordered `findFirst` → P2.1 (same family as O21).

## Tests for the fixes
Add checks to `scripts/qc-pos-p1.1.mts` ONLY in a new block named `S2.R2` with ids `S2.R2.1…`. Each one must fail on 8bc118f6 and pass after your fix:
- F2: setPrice on a shop+SERVICE row writes `InvItem.priceSatang`; the next shop edit keeps the price; `--verify` reports 0 drift.
- F3: siblings get the new price.
- F4: refusal + nothing written.
- F5: an edit on the second ShopProduct does not change the catalogue price.
- F6: 2 parallel `createItem` calls with a new category name both succeed, leaving one PosCategory.
- F1: a static check that each redirect target page reads `err`.

Do NOT change any existing assertion. Mark the block `// ORACLE-ADD (controller R2 ruling)`. An independent hunter will judge these checks later.

## Done =
- Forced ×2: everything green except the Part-B guard skips (state the totals; expected 169 + your S2.R2 count).
- Unforced: same totals.
- R.1/R.2 residue green; S2.42 still 13/6.
- G13 suites identical to base (the 4 pre-existing reds unchanged).
- Typecheck 0; fitness 40+/40+ both modes.

Append a "R2" section to `ledger/wo-notes/pos-P1.1b.md` (fix → commit → evidence), push, then stop.
