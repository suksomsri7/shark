# P0.3 lane 4 — oracle `scripts/qc-pos-p1.3.mts` (new register screen: server side + data contract)

> Branch `wip/pos-p0.3-register` · worktree `/root/projects/shark-pos-d` · base `d0e6e514` · oracle writer (Opus 5.5) · 1 Oct 2026
> Brief: `ledger/pos-briefs/pos-brief-P0.3.md` "Lane 4" + LANE-RULES + COMMON. No edits to `src/`, `prisma/`, or any existing script.
> Logs (not committed): `.qc-shots/pos/p0.3/force.log`, `force2.log`

## Ratified names (controller 1 Oct)
- `src/lib/modules/pos/pricing-shared.ts` → `priceCart` (pure, percents in bp, shape §6.1) · VAT config is the caller's INPUT (from accounting settings per system); VAT storage on the sale = P1.6.
- `register.ts`: `registerCatalog`, `quoteRegisterCart`, `submitRegisterSale(ctx, actor, input, client?)`, `registerStatus`.
- **Refusal split**: register functions RETURN `{ok:false, code, message}` (server-action friendly); `catalog.ts` THROWS typed errors with a stable `.code`. One shared vocabulary: `NOT_FOUND`, `PERMISSION_DENIED`, `VALIDATION`/`INVALID_LINE`, `PRODUCT_NOT_FOUND`, `PRODUCT_UNAVAILABLE`, `MEMBER_NOT_FOUND`, `PRICE_NOT_SET`, `PRICE_CHANGED`, `IDEMPOTENCY_CONFLICT`, `LINE_DISCOUNT_EXCEEDS_LINE`, `BILL_DISCOUNT_EXCEEDS_TOTAL`, `TOO_MANY_LINES` (+ spec `DISCOUNT_EXCEEDS_LIMIT`, `PAYMENT_MISMATCH`, `STOCK_INSUFFICIENT`). S2.11/S2.12 accept `INVALID_LINE` or `VALIDATION`.
- `openPrice: true` lines need `pos.sale.priceOverride` · discount cap `pos._maxDiscountBp` (default 1000 bp for STAFF) · testid prefix `pos-reg-` · i18n `pos.register.*` in `src/messages/{th,en}/pos.json`.
- Catalog API (lane 3, ratified) used by the fixtures: ctx `{tenantId, systemId, actorUserId|null}` + optional trailing `client`; `createProduct`, `updateProduct` (also availability / branch scope — there is NO `setAvailability`), `setPrice`, `archive`, `listForUnit → {items, nextCursor}`, `byBarcode`, `ensureForInvItem → {id, created}`, `createCategory(ctx, {name, unitId?, sortOrder?})`. PosProduct: MenuItem → own MENU product (`invItemId` null, menu→stock via `RecipeLine`); columns `vatRateBp`, `stationId`, `dailyStockQty`, `images`, `parentId`.
- S3.15 (same key ×10 parallel) STAYS in P1.3 — `submitRegisterSale` must catch the duplicate (P2002) and return the first result. Old S3.19 ("block" oversell race) MOVED to **S6.1**, own SKIP guard owned by P1.6 (skips while no code in `src/` reads `oversellPolicy`); S3.18 (allow-negative ends at exactly −9) stays.
- Subtotal = Σ line totals after line discounts (code meaning) — ratified as a spec correction to 14-pos §7.1.
- Fixture rewrite this round: untracked products via `createProduct` (no InvItem); tracked via InvItem + `ensureForInvItem` + `setPrice`; out-of-stock via receive 1 + consume 1; 86 via `updateProduct(id, {availability: {[unitId]: false}})`; branch-scoped product via `createProduct({unitId: <2nd sandbox branch linked to the sandbox POS>})`; `createCategory` without nameEn; S1.17 counts PosProduct of the sandbox POS (>200) and fills with `createProduct`; cleanup also deletes every PosProduct of the sandbox POS system.

- Ratification-round runs (no typecheck this round, per controller): skipped → exit 0 `⏭️ SKIPPED` registered 72 · `--list` 72 ids · `QC_FORCE=1` (passed inside the lock: `… with-gate-lock.sh env QC_FORCE=1 pnpm …`) → exit 1, `ผ่าน 3/72`, S6.1 red with "[ยังไม่มีโค้ด oversellPolicy]", cleanup `{…"invJournal":6,"invItem":6} · สาขา 3 · ระบบ 2`, `"a5":{"drift":[]}` · QC4 coffee counts = first snapshot (journal 2 · invItem 7 · businessUnit 2).

## 0. Controller rulings 1 Oct (survey) — override the documents
Source: controller message + `/root/projects/shark-pos-e/ledger/REVIEW-POS-DESIGN-2026-10-01.md` §3/§4/§6 (read-only; rows re-checked against code where the oracle depends on them).
| # | ruling | how the oracle follows it | changed vs first draft |
|---|---|---|---|
| R1 | No `/api/u/[unitId]/pos/*`, no `X-Pos-Device`; P1.3 = server actions on `/app/sys/[id]/pos/*` | oracle calls service-level functions in `src/lib/modules/pos/register.ts` (the actions must be thin wrappers over them) | header comment only (draft was already service-level) |
| R2 | Server re-prices every catalogue line from PosProduct; tampered client price refused/ignored; no-price product never sold at cost; open price only with permission | S3.1, S3.5 (rewritten: both "pay fake total" and "pay real total" variants, 0 lines at 1 satang), new S1.19 (grid price null, not cost), new S3.23 (PRICE_NOT_SET · openPrice needs `pos.sale.priceOverride`) | S3.5 rewritten · S1.19 + S3.23 added |
| R3 | PosProduct = tenantId + POS systemId, nullable unitId (null = all branches), nullable unique invItemId, kind PRODUCT/SERVICE/MENU/BUNDLE | sandbox has its own POS system ⇒ its own products; new S1.18 (product with unitId of another branch hidden, unitId null shown) | S1.18 added |
| R4 | 200-item cap (inventory.listItems take 200) must go; search/paginate server-side | new S1.17: sandbox catalogue >200 items, item #208 found by name, SKU and barcode | S1.17 added |
| R5 | Catalogue SERVICE sale must keep its service link | S3.4 now = sell an InvItem kind SERVICE product → line `serviceId = InvItem id`, `productId` set, `itemId` null, no OUT movement | S3.4 replaced (was VAT snapshot) |
| R6 | messages = `src/messages/{th,en}/pos.json` (P1.3 adds them) | S5.1/S5.2 read `src/messages/<locale>/pos.json` (or a `pos` key in any file) — same layouts as F15.4 | none |
| R7 | VAT storage is P1.6, not P1.3 | stored-VAT check removed; VAT only in the pure `priceCart` (cart shows "VAT 7% (included)" line in mockup 01) — S2.1/S2.7/S2.8/S2.9/S2.14 + quote display S3.1 | old S3.4 (`PosSale.vatSatang = quote vat`) → moved to P1.6 |
| R8 | New register path must refuse a unit not linked to the POS system and a user without branch access (404), with positive controls | S1.15, new S3.24 (unlinked unit: quote+submit NOT_FOUND, positive control PAID), S1.16/S3.10/S4.4 now accept **only** `NOT_FOUND` (was PERMISSION_DENIED|NOT_FOUND) with positive controls | codes narrowed · S3.24 added |

## 1. Status (checkpoint)
| step | state | commit |
|---|---|---|
| read briefs, docs, mockups 01/05/19/20, code | ✅ | 4367eaf0 (notes start) |
| oracle written + rulings applied | ✅ | efc101c4 |
| A1 / A2 / A3 / A5 runs | ✅ | 472073d3 (cleanup fix found by A3) |
| A4 typecheck (once, at end) | ✅ exit 0 | — |
| notes final + push | ✅ | (last commit) |

## 2. Acceptance
- **A1** `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.3.mts` → **exit 0**
  `⏭️  SKIPPED — qc-pos-p1.3: ของใบ P1.1a/P1.3 ยังไม่มี` · reasons: PosProduct + PosCategory absent from Prisma client · files absent `src/lib/modules/pos/catalog.ts`, `src/lib/modules/pos/pricing-shared.ts` · `register.ts` lacks exports `registerCatalog, quoteRegisterCart, submitRegisterSale, registerStatus` · seed coffee ✅ resto ✅
  `JSON_SUMMARY {"suite":"qc-pos-p1.3","total":0,"passed":0,"failed":[],"skipped":true,"reason":[…4 lines…],"registered":72,"seed":{"coffee":true,"resto":true},"a5":{…}}`
  Seed note: the POS QC tenants **are** present on QC4 (lane 1 seed) — I did not run the seed.
- **A2** `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p1.3.mts --list` → exit 0, no DB, 72 ids + `X-coverage: -=26 X4=20 X2=8 X3=7 X1=3 X6=3 X8=1 X7=1 X11=3`
- **A3** guard bypass: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.3.mts` (note: `QC_FORCE=1` must be passed **inside** `iso.sh` with `env` — a prefix before `bash scripts/iso.sh` does not cross the systemd unit) → **exit 1**, no crash, `===== qc-pos-p1.3 ===== ผ่าน 3/72 (QC_FORCE)`.
  Red for the right reason: S2.* `MISSING:priceCart` · S1/S3/S4 `MISSING:registerCatalog|quoteRegisterCart|submitRegisterSale|registerStatus` / `MISSING:ensureForInvItem` (sandbox catalogue cannot be built) · S5.1 "ขาด 51 คีย์" · S5.4 "ขาด 36 testid" · S5.5 "ไม่มีแถว 23" · S5.6 debt `register-ui.tsx=22, register/page.tsx=5` · S5.7–S5.9 "ยังไม่มีไฟล์หน้าขายใหม่".
  Green today (legitimately — regression guards, not blanket passes): S3.22 legacy `createSale` shape, S5.10 F15.2, S9.1 cleanup.
  Every registered id that was not reached is recorded red ("ไม่ถึง"), so a harness crash cannot look like a pass.
- **A3 finding (fixed)**: the first forced run left **6 `AccountJournalEntry` rows** in `posqc-coffee-tenant` (S9.1 caught it: `accountJournalEntry 2→8`). Cause: `inventory.receive` posts GL to the tenant's *first* ACCOUNT system (`src/lib/modules/inventory/service.ts:390-397` `postMovementGl`) even though the sandbox inventory system is not linked to accounting. Cleanup now deletes `refType "InvMovement"` entries of the sandbox movements (lines cascade). The 6 orphans (created 07:54:08–10Z by that run, refIds = deleted sandbox movements) were removed with a one-off throw-away script (shown first, then `--apply`; script deleted). Second forced run: `"a5":{"drift":[]}`, `ลบแล้ว: {…"invJournal":6,"invItem":7}`.
- **A4** `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (once, 07:57→08:07Z incl. lock wait) → **exit 0** · `> tsc --noEmit` with no diagnostics.
- **A5** POS QC tenant row counts (18 tables + receipt seq sum, both tenants) printed by every run; SKIPPED run is read-only. After the forced runs + leak repair: coffee `accountJournalEntry 2`, `invItem 7`, `invMovement 2`, `appSystem 5`, `appSystemUnit 10`, `businessUnit 2`, `posSale 0`, `outboxEvent 0` … resto unchanged — identical to the first A1 snapshot. QC4 outbox before the forced run: `DONE 17271 · PENDING_DUE 0` (so `createSale`'s in-process `drainAll` only touched the sandbox's own events).
- **A6** this file.

## 3. What the P1.3 builder must deliver (contract fixed by the oracle)
- `src/lib/modules/pos/pricing-shared.ts` — `priceCart(input)` pure, client-safe (value imports only `./*-shared`).
- `src/lib/modules/pos/register.ts` new exports: `registerCatalog(ctx, actor, {q?, categoryId?})`, `quoteRegisterCart(ctx, actor, input)`, `submitRegisterSale(ctx, actor, input, client?)`, `registerStatus(ctx, actor)`. `ctx = {tenantId, systemId (POS), unitId}`; `actor = {userId, role, unitAccess, permissions}` (same shape as `MemberActor`, built by the action from `requireTenant()`). Refusal = `{ok:false, code, message}` (a thrown error with the same `.code` is accepted).
- Uses P1.1a: `PosProduct`, `PosCategory`, `PosSaleLine.productId`, `catalog.ts`.
- Server actions in `src/lib/actions/pos.ts` become thin wrappers (R1); UI under the existing `/app/sys/[id]/pos/register` page.

## 4. Check table (id · what it proves · X)
| id | proves | X |
|---|---|---|
| S1.1 | seeded 7 products on grid once each (via PosProduct) | - |
| S1.2 | grid price = PosProduct.basePriceSatang; AMER 6500; 0-price shown as 0 | X4 |
| S1.3 | grid product shape (13 keys, types) | - |
| S1.4 | stockLeft = InvItem.onHand for tracked; null + not sold out for untracked drinks | - |
| S1.5 | empty unit → `[]`/`[]` (empty-state data, mockup 19ก) | - |
| S1.6 | archived hidden | - |
| S1.7 | unavailable at unit (86) → shown, soldOut | - |
| S1.8 | tracked onHand ≤0 → soldOut; onHand 2 → stockLeft 2 | - |
| S1.9 | Thai partial-name search + trimmed | - |
| S1.10 | SKU exact / case-insensitive / prefix | - |
| S1.11 | EAN-13 barcode search | - |
| S1.12 | nameEn case-insensitive search (mockup 20B) | - |
| S1.13 | no-hit search empty; category filter; productCount | - |
| S1.14 | other tenant's unit → NOT_FOUND, no id leak | X2 |
| S1.15 | unit not linked to this POS → NOT_FOUND (R8) | X2 |
| S1.16 | cashier other branch → NOT_FOUND; own branch ok | X3 |
| S1.17 | >200 catalogue: #208 found by name/SKU/barcode (R4) | - |
| S1.18 | PosProduct.unitId other branch hidden; null shown (R3) | X2 |
| S1.19 | unpriced product → priceSatang null, never cost (R2) | X4 |
| S2.1 | mockup-01 cart totals incl. VAT-included 4,089 | X4 |
| S2.2 | option price deltas | X4 |
| S2.3 | line % discount (bp, half-up) | X4 |
| S2.4 | line discount > line → refusal | X4 |
| S2.5 | bill discount %/฿, > total → refusal | X4 |
| S2.6 | discount ceiling → refusal not clamp; exact ceiling ok; null unlimited | X3 |
| S2.7 | coupon outside ceiling; coupon > total → 0 not negative | X4 |
| S2.8 | VAT EXCLUDED half-up / NONE / INCLUDED | X4 |
| S2.9 | VAT at bill level (vs per-line drift) | X4 |
| S2.10 | zero-price line and zero bill | X4 |
| S2.11 | 200 lines ok · 201 refused · qty limit | - |
| S2.12 | integer satang only, no negatives, qty>0 | X4 |
| S2.13 | pure, deterministic, input not mutated, client-safe imports | - |
| S2.14 | 300 seeded random carts: equation exact, all Int ≥0 | X4 |
| S3.1 | quote re-prices from catalogue, ignores client unit price (R2) | X4 |
| S3.2 | sale PAID, totals = quote, Σpay = total, subtotal = Σ lineTotal | X4 |
| S3.3 | stored lines = quote; productId + itemId; one OUT per tracked line | X4 |
| S3.4 | catalogue SERVICE keeps serviceId, no stock (R5) | - |
| S3.5 | tampered price never stored (R2) | X4 |
| S3.6 | ±1 satang payment → PAYMENT_MISMATCH | X4 |
| S3.7 | STAFF ceiling (default 10%) refusal; owner ok; `pos._maxDiscountBp` 2000 ok | X3 |
| S3.8 | custom line needs `pos.sale.priceOverride` | X3 |
| S3.9 | no `pos.sale.create` → denied (quote + submit) | X3 |
| S3.10 | cashier without branch access → NOT_FOUND (R8) | X3 |
| S3.11 | other tenant's unit → NOT_FOUND, nothing written there | X2 |
| S3.12 | foreign/archived/bogus productId → PRODUCT_NOT_FOUND; 86 → PRODUCT_UNAVAILABLE | X2 |
| S3.13 | foreign memberId refused | X2 |
| S3.14 | same key twice → same sale, duplicated flag, 1 payment, 1 stock cut | X1 |
| S3.15 | same key ×10 parallel (separate connections) ×3 rounds → one sale, same answer | X1 |
| S3.16 | same key different cart → original or IDEMPOTENCY_CONFLICT, never 2nd sale | X1 |
| S3.17 | receipt numbers unique under 10-way parallel ×2 | X6 |
| S3.18 | last item ALLOW_NEGATIVE: 10 tills ×3 → onHand exactly −9, 10 OUT | X6 |
| S6.1 | [P1.6 group, own SKIP] last item BLOCK: 10 tills ×3 → 1 PAID, 9 STOCK_INSUFFICIENT, onHand 0 | X6 |
| S3.20 | integrations off: sells, event DONE, no journal/points | X8 |
| S3.21 | 200-line server sale | - |
| S3.22 | legacy createSale shape (other modules) unchanged | X4 |
| S3.23 | unpriced → PRICE_NOT_SET; openPrice needs permission (R2) | X3 |
| S3.24 | unit not linked to POS → NOT_FOUND + positive control (R8) | X2 |
| S4.1 | status: unit, user, human role label, pendingSync 0 | - |
| S4.2 | no shift → `shift: null` | - |
| S4.3 | pendingStockCount over the Thai business day (0 → 1) | X7 |
| S4.4 | status cross-tenant / cross-branch → NOT_FOUND; own ok | X2 |
| S5.1 | 51 `pos.register.*` keys in th+en | - |
| S5.2 | en has no Thai; th not key/enum; ICU vars match | - |
| S5.3 | no hard-coded Thai in new register UI files | - |
| S5.4 | 36 mockup-01 testids present in code | - |
| S5.5 | 23 clickable testids have inventory rows | - |
| S5.6 | register baselineDebt closed | - |
| S5.7 | hot-keys F2/F4/F8/Esc [static] | X11 |
| S5.8 | scan input autofocus + refocus [static] | X11 |
| S5.9 | primary controls ≥44px class [static heuristic] | X11 |
| S5.10 | createSale/voidSale contract (F15.2) | X4 |
| S9.1 | QC4 row counts before = after | - |

X-groups with no check here (reasoned): **X5** reverse/void/refund — P1.8/P1.16 (P1.3 adds no reversal path). **X9** outbox — P1.3 adds no event; existing `pos.sale.paid` is only observed (S3.20). **X10** visual parity/overflow/states — needs the running app (visual-pos + controller), list below. **X12** fitness without env — no fitness change in P1.3; S2.13 covers the client-safe import side.

Size: 72 checks vs target ≈50 — the rulings added 7 (S1.17–S1.19, S3.23, S3.24, S3.4 swap) and S5 statics are cheap; controller may drop S1.10/S1.12/S2.11 if wanted.

## 5. Expected data-testid list — mockup 01 (+ 05ก mobile cart bar) — the builder's contract
Clickable (each needs a row in `scripts/pos-ui-inventory.json`, page `/app/sys/[id]/pos/register`):
`pos-reg-unit-switch` · `pos-reg-tab-*` (sale, tables, online-orders, bills, shift, products, reports, settings) · `pos-reg-search` · `pos-reg-custom-item` · `pos-reg-scan-camera` · `pos-reg-category-*` (incl. `pos-reg-category-all`) · `pos-reg-product-*` (`<productId>`) · `pos-reg-bill-type` · `pos-reg-hold` · `pos-reg-held-bills` · `pos-reg-member-pick` · `pos-reg-member-remove` · `pos-reg-cart-line-*` · `pos-reg-line-qty-*` · `pos-reg-line-discount-*` · `pos-reg-line-remove-*` · `pos-reg-bill-discount-edit` · `pos-reg-coupon` · `pos-reg-bill-discount` · `pos-reg-note` · `pos-reg-tax-invoice` · `pos-reg-pay` · `pos-reg-cart-bar` (05ก)
Display (must exist in code, no row): `pos-reg-status-online` · `pos-reg-status-shift` · `pos-reg-status-user` · `pos-reg-status-stock-pending` · `pos-reg-status-sync-pending` · `pos-reg-status-printer` · `pos-reg-shortcuts` · `pos-reg-subtotal` · `pos-reg-line-discounts` · `pos-reg-bill-discount-line` · `pos-reg-coupon-line` · `pos-reg-vat-line` · `pos-reg-total`
Listed, NOT asserted (other WO owns behaviour): option popover `pos-reg-options`, `pos-reg-option-choice-*`, `pos-reg-options-note`, `pos-reg-options-qty-dec/inc`, `pos-reg-options-add`, `pos-reg-options-close` (P1.2) · `pos-reg-member-use-points` (P1.12) · empty-state actions `pos-reg-empty-add-product/import-csv/sample` (mockup 19ก) · app-shell left rail (not POS).
Touch ≥44px asserted for: pay, category, product, line-qty, hold, held-bills, member-pick, custom-item, scan-camera (classes `h-11+`, `min-h-11+`, `h-[44px]+`, `size-11+`, `touch-target`, `pos-touch`).

i18n keys (namespace `pos.register.`): search.placeholder · search.customItem · search.scanCamera · category.all · product.soldOut · product.left · product.sizes · product.stock · product.service · cart.newBill · cart.billType.takeaway · cart.hold · cart.heldBills · cart.empty · member.add · member.remove · totals.subtotal · totals.lineDiscounts · totals.billDiscount · totals.edit · totals.coupon · totals.vatIncluded · totals.vatExcluded · totals.total · actions.billDiscount · actions.note · actions.taxInvoice · actions.pay · shortcuts.title · shortcuts.search · shortcuts.pay · shortcuts.hold · shortcuts.clear · status.online · status.offline · status.lastSync · status.shift · status.noShift · status.pendingStock · status.pendingSync · status.printerReady · empty.title · empty.body · errors.discountExceedsLimit · errors.paymentMismatch · errors.productUnavailable · errors.stockInsufficient · errors.permissionDenied · roles.owner · roles.manager · roles.cashier

## 6. Names I had to invent (controller must ratify before the builder starts)
1. File `src/lib/modules/pos/pricing-shared.ts`, function `priceCart(input)`; input `{lines:[{qty, unitPriceSatang, optionDeltasSatang?, discount?:{type:"AMOUNT"|"PERCENT", value}}], billDiscount?, couponDiscountSatang?, vat:{mode:"NONE"|"INCLUDED"|"EXCLUDED", rateBp}, maxDiscountBp?: number|null}` (PERCENT = basis points per spec §7.1); output `{ok:true, lines:[{grossSatang, discountSatang, lineTotalSatang}], subtotalSatang, lineDiscountSatang, billDiscountSatang, couponDiscountSatang, netSatang, vatSatang, grandTotalSatang}`.
2. Refusal codes: `DISCOUNT_EXCEEDS_LIMIT`, `PAYMENT_MISMATCH`, `STOCK_INSUFFICIENT` (from spec) + invented `LINE_DISCOUNT_EXCEEDS_LINE`, `BILL_DISCOUNT_EXCEEDS_TOTAL`, `TOO_MANY_LINES`, `INVALID_LINE`, `NOT_FOUND`, `PERMISSION_DENIED`, `PRODUCT_NOT_FOUND`, `PRODUCT_UNAVAILABLE`, `MEMBER_NOT_FOUND`, `PRICE_NOT_SET`, `PRICE_CHANGED` (alt. to PAYMENT_MISMATCH), `IDEMPOTENCY_CONFLICT` (optional alt.).
3. `register.ts` exports `registerCatalog`, `quoteRegisterCart`, `submitRegisterSale`, `registerStatus`; ctx `{tenantId, systemId, unitId}`; actor `{userId, role, unitAccess, permissions}`; optional last arg `client` on `submitRegisterSale` (mirrors `createSale(input, client)` — needed for real separate-connection races).
4. Register product shape: `{id, invItemId, name, nameEn, kind, categoryId, priceSatang|null, sku, barcode, imageUrl, optionGroupCount, soldOut, stockLeft|null}`; category `{id, name, nameEn, productCount}`; `soldOut = !availableAtUnit || (trackStock && onHand ≤ 0)`.
5. Submit input: `{idempotencyKey, lines:[{productId, qty, discount?, note?, unitPriceSatang?, openPrice?: true} | {name, qty, unitPriceSatang, discount?}], billDiscount?, couponCode?, memberId?, payMethods:[{type, amountSatang}], cashReceivedSatang?}`; result `{ok:true, saleId, receiptNo, grandTotalSatang, changeSatang, duplicated}`.
6. Status result `{ok, unit:{id,name}, user:{name, roleLabel}, shift: null|{…}, pendingStockCount, pendingSyncCount}`; pendingStock = PAID sales of the unit in the current Thai business day with an `itemId` line lacking an OUT movement.
7. Permission keys: `pos.sale.priceOverride` (spec §9) for custom lines and `openPrice`; numeric param **`pos._maxDiscountBp`** (house pattern `crm._maxDealDiscountBp`; spec says `maxDiscountBp`, rbac comment says `_maxDiscountBp`, nothing reads either today) with **default 1000 for STAFF when absent**, OWNER/MANAGER unlimited.
8. Oversell policy in `BusinessUnit.settings.pos.stock.oversellPolicy` = `ALLOW_NEGATIVE` (default) | `BLOCK` (spec §4.1 name, kept).
9. ~~Catalog signatures~~ — now RATIFIED (see top). Still invented here: the `updateProduct` patch key `availability: {[unitId]: boolean}` (named after the POS-API §1 read model) and `kind: "PRODUCT"` default on `createProduct`. Previously assumed — must be reconciled with lane 3's `qc-pos-p1.1.mts`: `ensureForInvItem(ctx, invItemId) → {id}`, `setPrice(ctx, productId, satang)`, `updateProduct(ctx, id, {trackStock?, nameEn?, categoryId?, unitId?})`, `archive(ctx, id)`, with `ctx = {tenantId, systemId (POS), actorUserId}`; invented beyond the P1.1a list: `createCategory(ctx, {name, nameEn?}) → {id}`, `setAvailability(ctx, productId, {unitId, available})` (POS-API `/products/:id/availability`), `PosProduct.trackStock`.
10. "Tracks stock" (no `trackStock` column in the ratified PosProduct): a product tracks stock iff `invItemId` is set AND that InvItem has ≥1 InvMovement. Seeded AMER/LATTE (never received) ⇒ not tracked (stockLeft null, never "หมด"); CROIS/WATER tracked.
11. Testid prefix `pos-reg-` (new) and all ids in §5; i18n namespace `pos.register.*` and the 51 keys in §5.

## 7. Contradictions found (documents vs real code — code wins unless a ruling says otherwise)
- POS-API / 14-pos §5 routes `/api/u/[unitId]/pos/...` + `X-Pos-Device` do not exist (→ R1).
- 14-pos §7.1 "subtotal = Σ qty×unitPrice"; `createSale` stores `subtotalSatang = Σ lineTotal` (after line discounts) and `discountSatang = bill + coupon (+member)` (`service.ts:115-120,174-176`). S3.2 asserts the code's meaning.
- §7.1 VAT 3 modes from `unit.settings.account.{vatRegistered, priceIncludesVat, vatRate}` — no such unit settings; VAT config is `AccountSettings.vatRegistered/vatRateBp` per account system, no `priceIncludesVat`; `createSale` stores vat 0 and Accounting re-derives (→ R7, P1.6).
- §9 `maxDiscountBp` / rbac comment `_maxDiscountBp` — no reader anywhere (`permissions.ts:746`).
- Today `registerSaleAction` clamps bill discount to subtotal (`actions/pos.ts:110`) — design says refuse; S2.5/S2.6 assert refusal.
- Today client `itemId` is unchecked and client unit price is trusted, catalogue falls back to cost (`register.ts:147-150`, `actions/pos.ts:78-94,435`) (→ R2).
- `inventory.listItems` caps at 200 (`inventory/service.ts:793-799`) (→ R4).
- Service lines keep `serviceId` only for BookingService ids (`actions/pos.ts:411-422`) (→ R5).
- Messages are `src/messages/<locale>/<ns>.json`, only `common.json` (→ R6).
- §11.5 BLOCK oversell must be atomic in the sale tx; today stock is cut after commit, outside the tx, errors swallowed (`service.ts:306-347`) — now S6.1, owned by P1.6 (own SKIP guard).
- `inventory.receive/consume` post GL to the tenant's first ACCOUNT system regardless of unit links (`inventory/service.ts:390-397`) — not a P1.3 issue, but "integration off" (X8) is only true for POS-sale postings, not stock GL.
- Same-key concurrency today returns a P2002 error instead of the first result (REVIEW §3.5) — S3.15 stays in P1.3 (ratified): `submitRegisterSale` catches the duplicate and returns the first result.

## 8. Needs running app (controller / visual lane) — not faked here
- Pixel parity vs mockups 01 / 05ก / 19 / 20A / 20B at 1440×900, 1024×768, 390×844 (X10) — `scripts/visual-pos.mts`.
- Real touch-target size measurement (S5.9 is only a class heuristic) and no horizontal overflow at 390 px.
- Hot-keys actually firing (F2 focuses search, F4 opens pay, F8 holds, Esc clears) and wedge-scanner autofocus/refocus after add (S5.7/S5.8 are static).
- Online/offline indicator and "last sync" time (client state); printer-ready chip (P1.10).
- Option popover behaviour (P1.2), mobile cart bar expand/collapse (05ก), empty/error/offline states (19).
- English rendering of the register (20B) — every visible string from `en/pos.json`, ฿ formatting.
- Server action wrappers' auth (session → actor) and 404 page guard for the register page with `?unit=` of another branch.

## 9. Regression set (P1.3 must keep green)
`scripts/qc-pos-register.mts` (42 checks — this oracle duplicates none; CAT-*, MEM-1, CASH-*, IDEM-1, PP-*, CPN-*, XT-*, SV-*, MX-*, AC-* stay the legacy-path regression, especially SV-1..8/MX-* for services and AC-* for 4000/4030 revenue split) + `qc-pos-account` 16 · `qc-pos-closeday` 22 · `qc-pos-coupon` 8 · `qc-pos-inventory` 25 · `qc-pos-products` 24 · money set of POS-MASTER-PLAN §1 + REVIEW §6 row 18 additions · `pnpm fitness` with/without env.

## 10. Temp data left
None. Sandbox (2 units, 2 systems, items, sales, outbox events, GL of temp movements) is deleted in `finally`; S9.1 + A5 snapshot show 0 drift after the second forced run. The 6 GL rows from the first forced run were repaired (see A3 finding).
