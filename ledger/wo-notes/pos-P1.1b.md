# WO P1.1b — Part A builder notes (account B · VPS · tree `/root/projects/shark-pos-b` · branch `wip/pos-p1.1b`)

> Contract: `ledger/pos-briefs/pos-brief-P1.1b.md` G1–G13 + Addendum (1 Oct 22:00) + Addendum 2 (3 Oct, rulings 1–14) · oracle `scripts/qc-pos-p1.1.mts` group S2 (not edited unless listed under ORACLE-EDITs)
> DB = QC4 only (`.env.qc` / `.env.qc4` host `ep-frosty-lab`, checked 4 Oct)

## Progress log (append-only, newest last)
- 4 Oct · merge `origin/session/pos` (P1.3 accepted, b1816f02) → 51a5e7d6, no conflicts · typecheck exit 0 · fitness 40/40 · pushed.
- 4 Oct · "before" regression run (G13) on an untouched copy of 51a5e7d6 (scratch worktree, same QC4): 32 suites, results kept for the after-compare (acc-v2-products/invitem/pos-lines are red on QC4 already on the base: seed differs; qc-ai-actions has 1 CRASH on the base).
- 4 Oct · step 1 = catalog.ts groundwork + `catalog-legacy.ts` + restaurant menu/order doors (9277cfab). Typecheck 0 · fitness 40/40 · qc-restaurant / -money (6/6) / -pay (19/19) / -void (11/11) identical to before.
- 4 Oct · step 2 = shop (createProduct/updateProduct → catalog-legacy; shop/actions refusals → ?err=). Typecheck 0 · fitness 40/40 · qc-shop 15/15 · qc-shop-refund 12/12 = before. Shared hot file touched: `scripts/fitness.mts` F2.1 ALLOWED_EDGES +`inventory→pos` +`account→pos` (one append-only block `// POS P1.1b ▸ … ◂`) — needed because G2/S2.30 make inventory/service.ts and account/product.ts import pos/catalog-legacy.
- 4 Oct · step 3+4 = inventory (createItem/updateItem/archiveItem/unarchiveItem/linkAccountProduct + new `applyAccountProductSync`) and account/inventory-link (both sync writers moved — ruling 2; createItem BUSY → `{ok:false, reason: <catalogue BUSY text>}`) in ONE commit (inventory-link's InvItem write now goes through the inventory module helper, so the two files move together). inventory/actions.ts: 5 call sites → `?err=` on CatalogError. Typecheck 0 · fitness 40/40 · qc-inventory 12/12 · -account 23/23 · -item 11/11 · qc-pos-products 24/24 · qc-pos-inventory 25/25 · qc-ai-proposals 16/16 · qc-ai-tools 18/18 · qc-acc-v2-invitem 77/88 + qc-acc-v2-products 57/72 = identical JSON_SUMMARY to before (red on base too).
  - Note: inventory-link's AP write runs in a `tenantDb(accCtx).$transaction` (raw prisma import is frozen in that file by F5); the tx is cast to `Prisma.TransactionClient` (only `$transaction` differs in the type).
- 4 Oct · step 5–7 = account/product (createProduct/updateProduct/archiveProduct — ruling 13) · booking (no code change: importServicesToCatalog goes through inventory.createItem; BookingService dropped from F15.1 PRICE_MODELS — ruling 2) · register.setItemSalePrice (AP-linked item → `catalog-legacy.writeAccountProductSalePrice`, ruling 1; unlinked item keeps `account.createAccountProductWithSalePrice` (Part B file) + `inventory.linkAccountProduct`, which now re-derives the price) · pdpa exempt via `CATALOG_WRITER_EXEMPT` with reason (ruling 2). F15.1 baseline now = exactly `{account/service.ts: {AccountProduct.price: 2}}`. Typecheck 0 · fitness 40/40 · qc-account-cpa · qc-acc-v2-products/-pos-lines · qc-pos-account/-products/-register/-p1.3 · qc-booking ×4 = identical JSON_SUMMARY to before.
- 4 Oct · forced oracle run 1 on 5053ac79: `ผ่าน 167/169` · red = S2.21 + S2.34 (both oracle defects — see ORACLE-EDITs/open questions below; a local untracked copy with the S2.34 fixture fixed gave 168/169, then deleted) · R.1/R.2 green (no residue) · S2.42 statement counts 13/6 = base.
- 4 Oct · A5 `--verify` drift mode added (`catalog.verifyCatalog` + `pos-backfill-catalog.mts --verify`, read-only, exit 1 on drift/missing). On the two POS QC tenants: `--dry-run` → create 0 · link 0 · already 9 InvItem + 4 MenuItem; `--verify` → missing 0 · drift 0. Typecheck 0 · fitness 40/40.

---

## Summary
Part A done on `wip/pos-p1.1b`. Every legacy catalogue writer except the two Part-B sites in `account/service.ts` now calls `src/lib/modules/pos/catalog-legacy.ts` with its own transaction: the legacy statement (same data) and the PosProduct side run in ONE transaction, no outbox, no after-commit work. The reverse direction (catalogue → legacy) lives in `catalog.ts` (`writeBackPrice` / `writeBackNames` / `writeBackArchived`). One converter set (G3) in `catalog.ts` is used by backfill, `ensureForInvItem`, the sync and the new `--verify` mode. F15.1 baseline = exactly `{ "src/lib/modules/account/service.ts": { "AccountProduct.price": 2 } }`; writer set = `catalog.ts` + `catalog-legacy.ts`.

## File list
| file | what |
|---|---|
| `src/lib/modules/pos/catalog-legacy.ts` (new) | second writer · every export takes `tx: Prisma.TransactionClient` (no default) · no root prisma import · no door import |
| `src/lib/modules/pos/catalog.ts` | G3 converters (`invItemProductFields` · `menuItemProductFields` · `shopProductFields` · `menuCategoryFields`) used by `planTenant`/`ensureForInvItem`/sync · `legacySourceOf` (row → menu / inv / shop / native) · reverse G4b in setPrice/updateProduct/archive/restore · `FOR NO KEY UPDATE` · N1 (restore re-checks on the locked row) · G12 (createProduct locks after the permission check · createCategory via `ownFields`) · `menuSoldOutIds`/`rowAvailable` (ruling 3) · `tryLockCatalogTenant` · `verifyCatalog` (A5) |
| `src/lib/modules/pos/register.ts` | `setItemSalePrice` AP-linked branch → `writeAccountProductSalePrice` (ruling 1) + one import line · `regViews` uses `menuSoldOutIds`/`rowAvailable` (Addendum-2 merge item: register = listForUnit, S1.27) |
| `src/lib/modules/restaurant/menu.ts` · `order.ts` | all MenuItem/MenuCategory/MenuOptionGroup/MenuOptionChoice/MenuItemOptionGroup writes → catalog-legacy · order.ts: 3 stock/86 statements moved unchanged |
| `src/lib/modules/shop/service.ts` | createProduct/updateProduct → catalog-legacy |
| `src/lib/modules/inventory/service.ts` | createItem/updateItem/archiveItem/unarchiveItem/linkAccountProduct → catalog-legacy · new `applyAccountProductSync` |
| `src/lib/modules/account/product.ts` · `account/inventory-link.ts` | createProduct/updateProduct/archiveProduct · both link-sync writers (ruling 2) |
| `src/lib/modules/inventory/actions.ts` · `shop/actions.ts` · `src/lib/actions/restaurant.ts` · `src/lib/actions/booking.ts` | G11: `CatalogError` → `redirect(…?err=<Thai message>)` (house pattern of `actions/pos.ts`) · other errors rethrown as before |
| `scripts/fitness-pos.mts` | `CATALOG_WRITERS` · baseline → account/service.ts 2 · BookingService out of PRICE_MODELS · `CATALOG_WRITER_EXEMPT` (pdpa, with reason) · F15.5: catalog-legacy in `SYSTEM_MARKER_ALLOWLIST` + import ban from request code (static/namespace/export-from/import()/require/import=require/import type) + `holdsMarker` for parameter/destructuring defaults (G12) |
| `scripts/fitness.mts` (shared hot file) | F2.1 `ALLOWED_EDGES` + `inventory→pos` + `account→pos` (one append-only block) |
| `scripts/pos-backfill-catalog.mts` | `--verify` (read-only drift report, exit 1 on drift/missing) |

## Door table (legacy function → catalogue call → PosProduct fields)
| door | catalog-legacy fn | PosProduct effect |
|---|---|---|
| menu.createItem / duplicateItem | `createMenuItem` | new MENU row (converter) in the unit's POS · PosCategory found/created by (system, unit, name) · option links · RecipeLine if `invItemId` · `MenuItem.posProductId` |
| menu.updateItem | `updateMenuItem` | name · nameEn · categoryId · basePriceSatang · images · sortOrder · stationId · dailyStockQty (changed fields only, one UPDATE) |
| menu.setItemOptionGroups | `setMenuItemOptionGroups` | PosProductOptionGroup = same groupId:sortOrder set |
| menu.archiveItem | `archiveMenuItem` | archivedAt (same timestamp; no second MenuItem write) |
| menu.setItemStock | `setMenuItemStock` | dailyStockQty only (isOutOfStock/stockQty live, not mirrored — G8) |
| menu.resetDailyStock | `resetMenuItemDailyStock` (per item) | none (live counters) |
| menu.createCategory / archiveCategory | `createMenuCategory` / `archiveMenuCategory` | PosCategory create / archivedAt |
| menu.createOptionGroup / archiveOptionGroup / setChoiceStock | `createMenuOptionGroup` / `archiveMenuOptionGroup` / `setMenuChoiceStock` | none / PosProductOptionGroup rows of that group deleted / none (choices read live) |
| order.createOrder / cancelOrderItem | `consumeMenuStock` · `markMenuItemOutOfStock` · `restoreMenuStock` | none (statements unchanged) |
| shop.createProduct | `createShopProduct` | C9a: link to the InvItem row (`ensureForInvItem`) · C9b: own row with invItemId (tenant try-lock; reuse a previous own row of the same InvItem) · C9c/d: own row |
| shop.updateProduct | `updateShopProduct` | own row only: name · basePriceSatang (C7) · vatRateBp · images · sortOrder · `unavailableUnitIds` ± shop unit (`active`) — shared InvItem row untouched (G5) |
| inventory.createItem | `createInvItem` | `ensureForInvItem` in the POS selling that inventory (budgeted tenant lock → BUSY rolls back the InvItem too) |
| inventory.updateItem | `updateInvItem` | name (InvItem rows) · price+VAT only for SERVICE when `priceSatang` changed |
| inventory.archiveItem / unarchiveItem | `setInvItemArchived` | `catalog.archive` / `catalog.restore` on the InvItem row (active POS only) |
| inventory.linkAccountProduct (→ register.setItemSalePrice unlinked branch, inventory-link.linkProductToItem) | `linkInvItemAccountProduct` | price + VAT re-derived |
| inventory.applyAccountProductSync (inventory-link.syncProductToItem) | `writeInvItemFromAccountProduct` | name; price+VAT when the AP link is repaired |
| inventory-link.syncItemToAccountProduct | `writeAccountProductFromItem` | none (no derived field) |
| account/product.createProduct | `createAccountProduct` | none (no InvItem points at a new AP) |
| account/product.updateProduct · archiveProduct (ruling 13) | `updateAccountProduct` · `archiveAccountProduct` | price + VAT of every row whose InvItem.accountProductId = this AP |
| register.setItemSalePrice (AP linked) | `writeAccountProductSalePrice` | price + VAT |
| booking.importServicesToCatalog · ai `inventory_create_item` | via inventory.createItem | as createItem (S2.22 with `ai/proposals.ts` untouched) |
| catalog.setPrice (reverse) | — | one legacy field = the C7 winner: MENU → MenuItem.basePrice · strict AP (PRODUCT, or AP sale/pos price winning) → AccountProduct.salePrice · SERVICE without winning AP → InvItem.priceSatang · shop own row → ShopProduct.priceSatang · otherwise PosProduct only (X8.1) |
| catalog.updateProduct name/nameEn (reverse) | — | MENU name/nameEn · InvItem row → InvItem.name (ruling 12) · shop own row → ShopProduct.name |
| catalog.archive / restore (reverse) | — | MENU → status ARCHIVED+archivedAt / ACTIVE+null · shop own row → `active` false/true · InvItem row → catalogue only (ruling 4) |

## Shared-row table (G5) — who may move the price of which row
| PosProduct row | price derivation (C7) | writes that move the price | writes that do NOT (own legacy field still written) |
|---|---|---|---|
| InvItem row, PRODUCT | strict AP salePrice>0 → posPrice>0 if posEnabled → null | account updateProduct/archiveProduct · setItemSalePrice · linkAccountProduct · catalog.setPrice (→ AP.salePrice, or PosProduct only without AP) | inventory.updateItem priceSatang · shop.updateProduct on a shop row linked to it (C9a) |
| InvItem row, SERVICE | strict AP salePrice>0 → posPrice → InvItem.priceSatang>0 → null | the above + inventory.updateItem priceSatang + booking import | shop.updateProduct (C9a) |
| MENU row | MenuItem.basePrice | menu.updateItem · catalog.setPrice | — |
| shop own row (C9b/c/d) | strict AP of its InvItem (C9b) → ShopProduct.priceSatang (first linked ShopProduct) | shop.updateProduct · account doors of that InvItem's AP · catalog.setPrice | — |
| catalogue-native row | catalogue only | catalog.setPrice | — |
A door writes the PosProduct only when a derived field actually differs (no updatedAt bump on a same-value save — S2.17).

## Lock order (G7)
Both directions: (1) budgeted tenant try-lock `pos-catalog:<tenant>` — only where a new InvItem link / barcode row is created (catalog.createProduct with barcode/invItem **after** the permission check, ensureForInvItem for a new row, restore of a row with a barcode, shop.createProduct C9b) → (2) PosProduct row(s) `SELECT … FOR NO KEY UPDATE` in id order → (3) the ONE legacy table of that door (MenuItem | ShopProduct | InvItem | AccountProduct). Forward doors read the link first (plain SELECT), lock the PosProduct row(s), then run the legacy statement, then the PosProduct UPDATE. Deliberate exception: doors that INSERT a brand-new legacy row (createItem, shop.createProduct, menu.createItem/duplicateItem) insert it first, then lock/create the catalogue row — nobody else can see/lock that row yet. X6.5 (10 lanes × 3 rounds menu.updateItem ↔ catalog.setPrice) green, deadlock counter +0.

## Legacy actions that can get BUSY and how the Thai message reaches the user (G7/G11)
| action | path | user sees |
|---|---|---|
| inventory `createItemAction` · `createServiceAction` | inventory.createItem → ensureForInvItem BUSY → whole tx rolled back | redirect `/app/sys/<id>?err=<BUSY text>` |
| inventory CSV import (`importItems`) | per-row createItem | row error `{row, reason: <BUSY text>}` in the import summary (data) |
| account `linkProductToItem({createItem})` (products page "track stock") | createItem BUSY | `{ok:false, reason: <BUSY text>}` (S2.40) — AP link not written |
| booking `importServicesToCatalogAction` | createItem BUSY | redirect `/app/u/<unit>/booking/services?err=<BUSY text>` |
| AI proposal `inventory_create_item` | createItem BUSY → thrown inside runKind | proposal FAILED with the Thai text (existing runKind error path) |
| shop `createProductAction` (product linked to an InvItem outside the first POS, or whose InvItem row does not exist yet) | tryLockCatalogTenant / ensureForInvItem BUSY | redirect `/app/u/<unit>/shop?err=<BUSY text>` |
| inventory.unarchiveItem (no UI caller today) | catalog.restore BUSY (row with own barcode) | thrown CatalogError (service level) |
| menu / account / setItemSalePrice / updates | no tenant lock on these paths | — |
Other refusals of the same actions (VALIDATION/INTERNAL from the catalogue) use the same path. Non-catalogue errors keep their old behaviour.

## Statement counts on the order hot path (G8) — S2.42 SQL tap
| path | before (a0f5e11e, oracle notes) | after (this branch) |
|---|---|---|
| createOrder (stock to 0 → 86 → second item out → ROLLBACK) | 13 | 13 |
| cancelOrderItem (restore stock) | 6 | 6 |
No PosProduct statement on either path (S2.42 `noPosProduct ✓`). setItemStock(86/stockQty) and resetDailyStock write no PosProduct (S2.43).

## ORACLE-EDITs
None applied. Two requested (the oracle is wrong, not the code):
1. **S2.34 fixture** (line ~2574): the `svcCnt` fixture is inside the trailing `//` comment of the `svcB` line, so `I.svcCnt` / `L.svcCnt` are undefined → `inventory.updateItem(…, undefined.id)` TypeError and `setPrice(undefined)` NOT_FOUND. Fix = move `svcCnt: await inv("svcCnt", { kind: "SERVICE", priceSatang: 9100 }),` to its own line. Verified with an untracked local copy (deleted after): S2.34 green, total 168/169.
2. **S2.21** expects 2700 but `account/inventory-link.inventorySystemId()` picks an arbitrary INVENTORY system (`findFirst`, no order). During the run it picked the fixture warehouse `tInvX`, sold only by the fixture POS `fx.tPos`, which has **no AccountSystemLink** → ratified C7 (`strictAp`: the AP must be in the book linked to that POS) gives `null`. Debug print from the local copy: `inv <tInvX> · pos [<tPos>]` (seed inv/POS not picked). The code result (null) follows C7; options: expect `null` when the POS has no book (or the C7 result), or pin the inventory system the oracle uses.
Neither of the Addendum-2-named ORACLE-EDITs (S2.19a, S2.45 wrapper, S2.42 re-measure, PART_B moves) was needed: S2.19a green as written, S2.45 green with inline try/catch + `redirect(`, S2.42 counts unchanged, S2.10b green in Part A.

## Part B — exact hunks (after CRM lands; `src/lib/modules/account/service.ts`)
```ts
// import
import * as legacy from "@/lib/modules/pos/catalog-legacy";
// updateAccountProductSalePrice — replace the body
  return prisma.$transaction((tx) => legacy.writeAccountProductSalePrice(tx, tenantId, productId, salePriceSatang));
// createAccountProductWithSalePrice — replace the create
  const p = await prisma.$transaction((tx) =>
    legacy.createAccountProduct(tx, { tenantId, systemId: accountSystemId, name: input.name.trim() || "สินค้า", type: "GOODS", salePrice: Math.max(0, Math.round(input.salePriceSatang)) }),
  );
```
then `scripts/fitness-pos.mts`: delete the last `CATALOG_WRITER_BASELINE` entry (→ `{}`); F2.1 needs no new edge (`account→pos` exists). Oracle: PART-B guard opens S2.11b + S2.19. (`setItemSalePrice` already bypasses `updateAccountProductSalePrice`; other callers of it — `account/index.ts` export — then sync too.)

## Open questions
1. S2.21 / S2.34 oracle defects above — controller to rule (ORACLE-EDIT).
2. Unforced total: once a legacy writer imports catalog-legacy the S2 guard opens in **unforced** mode too, so the unforced run is no longer 115/115 but the same 169 (−2 PART-B) as forced. The prompt's "unforced 115/115" was the pre-P1.1b expectation.
3. `menu.createItem` / `setItemOptionGroups` / `createOptionGroup` were several un-transacted statements; they now run in one transaction (needed for the PosProduct side). Behaviour change only on partial failure (all-or-nothing now).
4. `shop.updateProduct` changing `invItemId` of an own row does not re-link the catalogue row (kind/invItemId kept); backfill would not re-link either. Should P2.8 own it?
5. A shop own row shared by several ShopProducts (C9b) takes price/name from the edited ShopProduct; the reverse `setPrice`/rename writes all linked ShopProducts.
6. `catalog.setPrice(0)` on a PRODUCT with AP writes `salePrice = 0`; C7 then derives "free"/null on the next AP-side re-derive (salePrice 0 is not a winning rung). Same for SERVICE + InvItem.priceSatang 0. Ratified C7 semantics — flagging only.
7. AccountProduct name after `catalog.updateProduct` on an InvItem row: only InvItem.name is written (ruling 12); AP name follows on the next inventory-side sync.
8. inventory-link AP write uses `tenantDb(accCtx).$transaction` with a `TransactionClient` cast (raw prisma import is frozen in that file by F5).

## Final results (4 Oct · code at e2a1bf96 + booking action G11 wrap in this commit)
- Forced oracle ×2 in a row: `ผ่าน 167/169` both · red only S2.21 + S2.34 (oracle defects, see ORACLE-EDITs) · PART-B S2.11b/S2.19 skipped by their guard · R.1/R.2 green (QC4 left as found) · S2.42 13/6 = base.
- Unforced: `ผ่าน 167/169` (same set — the S2 guard is open now; see open question 2).
- G13: all 32 suites re-run on the final code — JSON_SUMMARY identical to the before-run of 51a5e7d6 for every suite (acc-v2-products/-invitem/-pos-lines and qc-ai-actions are red/crash on the base too, unchanged).
- Typecheck (5632 MB heap, this tree) exit 0 · fitness 40/40 with env and without env.
- Negative proofs (temp files, deleted): MenuItem + AccountProduct.salePrice write in `src/lib/modules/restaurant/zz-p11b-probe.ts` → F15.1 ❌ naming the file; `src/app/zzp11b/page.tsx` importing catalog-legacy → F15.5 ❌ naming the file. S2.31/S2.46 prove the new F15.5 rules behaviourally (green). `--verify` positive control: MenuItem.basePrice +1 inside a rolled-back tx → `drift 1 {basePriceSatang:1}`.

# R2 (controller brief `pos-brief-P1.1b-R2.md` · base 1219966c)

## F1 — refusals visible (redirect target → page → banner)
| action (file) | redirect target | page | banner |
|---|---|---|---|
| createItemAction · updateItemAction · archiveItemAction · createServiceAction · updateServiceAction (`inventory/actions.ts`) | `/app/sys/<id>?err=` | `src/app/app/sys/[id]/page.tsx` → `InvHub err={err}` (`inventory/ui.tsx`) | `role="alert"` danger box, same classes as `shop/orders/page.tsx` |
| createProductAction · updateProductAction · toggleProductAction (`shop/actions.ts`) | `/app/u/<unit>/shop?err=` | `shop/page.tsx` | same |
| importServicesToCatalogAction (`actions/booking.ts`) | `/app/u/<unit>/booking/services?err=` | `booking/services/page.tsx` | same |
| archiveItemAction (`actions/restaurant.ts`) | `<base>/menu?err=` | `restaurant/menu/page.tsx` | same |
| setItemStockAction (`actions/restaurant.ts`) | `<base>/menu/stock?err=` when the form sends hidden `back=stock` (stock page forms), else `<base>/menu?err=` | `restaurant/menu/stock/page.tsx` · `restaurant/menu/page.tsx` | same |
Text = the catalogue's Thai message (already says "ยังไม่ได้บันทึก…"). Typecheck 0 · fitness 40/40.

## F2 + F3 + F4 — reverse price (one commit: same function `setPrice`)
- F2: `priceTarget` replaced by `reverseTarget(src)`: target = the winning `rung` of `initialPrice` for that row's legacy sources (sale/pos → `AccountProduct.salePrice` · service → `InvItem.priceSatang`, incl. a shop row linked to a SERVICE · own → `MenuItem.basePrice` / `ShopProduct.priceSatang` · free/none → the field that would win: strict AP → SERVICE InvItem → shop price · nothing = PosProduct only, X8.1). Shop rows use `ShopProduct` #1 (`src.first`) as `own` — same source as backfill.
- F3: setPrice = peek (no lock) → permission → sibling set of the target field (`siblingIdsOf`: AP → rows via `InvItem.accountProductId`; InvItem → rows with that `invItemId`; ShopProduct → their linked rows) → `lockProductRows` (own row + siblings, id order, one `FOR NO KEY UPDATE`) → re-read + permission on the locked row → write own PosProduct → legacy field → `rederiveRows` on siblings (same function the forward doors use, moved into catalog.ts). Siblings that appear between peek and lock are locked additionally.
- F4: `reverseTarget.sim(price)` runs the forward derivation with the written value; `sim(p) !== p` ⇒ `VALIDATION` "ราคา 0 ใช้กับสินค้านี้ไม่ได้ — ตั้งราคาที่ระบบเดิม" before any write. 0 that round-trips (MENU, web price, AP salePrice 0 with cost 0 → "free") is still accepted. `--verify`: stored 0 + derived null → own bucket `zeroVsNull` (exit 1), `catalogueOnlyPrice` stays info.
- Typecheck 0 · fitness 40/40.

## F5 + F6 + F7 (one file, one commit)
- F5: `updateShopProduct` writes the shared own row only when the edited ShopProduct is `src.shopIds[0]` (`legacySourceOf` now carries `first` = ShopProduct #1, used by backfill order, `rederiveRows`, `reverseTarget` and `--verify`).
- F6: `categoryFor` = find → `INSERT … ON CONFLICT DO NOTHING` (raw, same tx client) → re-read; audit only when the insert won. No P2002 can reach the caller's tx.
- F7: `setInvItemArchived(…, false)` takes the budgeted tenant try-lock BEFORE `lockRows` (tenant → row), so `catalog.restore`'s own tenant lock is re-entrant and never waited for while holding rows.
- catalog-legacy now delegates lock/derive/audit helpers to the shared ones in catalog.ts (`lockProductRows` · `applyDerived` · `rederiveRows` · `auditSync`). Typecheck 0 · fitness 40/40.

## F8 — fitness tightening (`scripts/fitness-pos.mts`)
- New **F15.7** `scanDoorPosImports`: files under `src/lib/modules/inventory/` and `src/lib/modules/account/` may import from POS only `pos/catalog-legacy`, `pos` (index — CatalogError) or `pos/catalog` (static · export-from · `import()` · `require`). F2.1 edges `inventory→pos`/`account→pos` therefore carry only these three entries.
- F15.5 (`scanSystemMarker`): `export * from` / `export { … } from` of catalog-legacy in ANY file = violation (same as catalog.ts).
- `CATALOG_WRITER_EXEMPT` narrowed: pdpa.ts exempts only `{dynamic}` hits whose call is `.deleteMany` — every other write in pdpa.ts is counted again.
- Negative proofs (temp files, deleted; pdpa.ts restored byte-for-byte): `inventory/zz-p11b.ts` importing `pos/service` → F15.7 ❌ (+F2.1 unaffected since the edge exists); `zzp11b/reexp.ts` with `export *` + `export {createInvItem} from` → F15.5 ❌ at lines 1 and 2; appending `tx[m].updateMany(…)` to pdpa.ts → F15.1 ❌ `pdpa.ts dynamic 0→1 [@133 tx[m].updateMany …]`.
- Fitness 41/41 with env and without env.

## F9 — audit actor
- `CatalogCtx.onBehalfOfUserId?` (audit only — permission still the system path) · `catalog.audit` writes `USER/<id>` when the system caller carries it · `auditSync/applyDerived/rederiveRows` take an `AuditActor`.
- Every writing export of catalog-legacy takes a trailing optional `actorUserId` → `C.auditActorOf()` (USER when given, else SYSTEM); `sysCtx` passes it into `catalog.archive/restore/ensureForInvItem`; setPrice siblings audit as the setPrice user.
- Doors (backward compatible, optional): `menu.createCategory/archiveCategory/createItem/updateItem/setItemOptionGroups/duplicateItem/archiveItem/setItemStock` trailing `actorUserId` · `ShopCtx.actorUserId?` · inventory `Ctx.actorUserId?` · `BookingCtx.actorUserId?` · `account/product.updateProduct/archiveProduct` trailing `actorUserId` · `register.setItemSalePrice` trailing `actorUserId`.
- Human callers pass the session user: `actions/restaurant.ts` (6 menu calls via `ctx().userId`), `shop/actions.ts` (`ctxOf` → `auth.user.id`), `inventory/actions.ts` (5 sites), `actions/booking.ts` import, `account/product-actions.ts` (3 sites), `actions/pos.ts` setItemSalePriceAction.
- Still SYSTEM (no human known at that layer): AI proposals (`ai/proposals.ts` not editable in Part A), REST `account/api/ops/products-write.ts`, undo-stack, inventory-link syncs, CSV import, order stock paths (no audit).
- Typecheck 0 · fitness 41/41.

## S2.R2 tests (ORACLE-ADD, controller R2 ruling) — `scripts/qc-pos-p1.1.mts` section `s2-r2`
Registry 177 checks (P1.1b 62). Existing assertions untouched; new block marked `// ORACLE-ADD (controller R2 ruling)`.
| id | fix | proves |
|---|---|---|
| S2.R2.1 | F2 | shop own row (C9b) on a SERVICE (`InvItem.priceSatang` 5000, warehouse X / fx.tPos) → `setPrice(5500)` writes InvItem 5500, ShopProduct stays 1000; next shop edit keeps 5500; `verifyCatalog` has no sample for either row |
| S2.R2.2 | F3 | the sibling InvItem row of that service in fx.tPos goes 5000 → 5500 in the same tx |
| S2.R2.3 | F4 | PRODUCT + AP (salePrice null, posPrice 3500, posEnabled) → `setPrice(0)` = VALIDATION Thai, AP + PosProduct byte-identical; control 3600 → AP.salePrice 3600 |
| S2.R2.4 | F5 | two ShopProducts sharing one own row (InvItem outside first POS): editing #2 (2500 + rename) leaves the row at 1000 / #1's name; ShopProduct #2 written |
| S2.R2.5 | F6 | new MenuCategory without PosCategory + 2 parallel `menu.createItem` → both ok, 1 PosCategory, both MENU rows point at it |
| S2.R2.6 | F1 | static: all 14 `?err=` redirects in the 4 action files map to pages that read `err` from searchParams and render `{err && …}`; `/app/sys/<id>` also requires `<InvHub err={err}>` + InvHub rendering it |
- **Red on 8bc118f6** (scratch worktree of 8bc118f6 + this oracle file, forced, then removed): `ผ่าน 169/175`, failed exactly S2.R2.1–S2.R2.6 — R2.1 `invItemPrice✗ shopPriceKept✗ nextShopEditKeeps✗` (inv 5000 · shop 5500) · R2.2 `5000 → 5000` · R2.3 `refused✗ apKept✗ posKept✗` (AP 0) · R2.4 `priceKept✗ nameKept✗` (2500) · R2.5 `both✗` (P2002 on PosCategory) · R2.6 11 of 14 targets don't show err.
- Green on the fix head (first forced run after the block: 174/175, only R2.6 red because the test's path mapper missed `${base(unitSlug)}?err=` → restaurant root page; mapper fixed — that page already reads err).
