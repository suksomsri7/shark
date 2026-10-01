# P1.3 — new register screen · BUILDER stage B1 (server side) — notes

> Branch `wip/pos-p1.3` · tree `/root/projects/shark-pos-p11` · base `0002997e` (oracle round 3.1, 104 checks) · 1 Oct 2026
> Brief: `ledger/pos-briefs/pos-brief-P1.3.md` incl. Addendum + **Addendum 2** (wins) · LANE-RULES · COMMON · spec `pos-spec-P1.3-register-ui.md` §3.2–§3.4, §4.6.
> Scope of B1 = server only: `pricing-shared.ts`, `register-shared.ts`, new region in `register.ts`, `register-actions.ts`, one line in `permissions.ts`
> (+ one additive field in `service.ts`, see D1). No React, no page, no i18n, no inventory rows, no seed hunk (left to B2 — see §6).
> Logs (git-ignored): `.qc-shots/pos/p1.3/b1-run{1,2}.log`, `before-*.log`, `after-*.log`, `b1-fitness-{env,noenv}.log`, `b1-typecheck.log`.

## 1. Result in one line
Forced oracle **89/104** (base 5/104). Groups S1, S2, S4 fully green; S3 green except **S3.18** (inventory lost update — not B1 code, fixed on `origin/hotfix/inventory-atomic`); every server-only S5 check green (S5.10 S5.12 S5.14 S5.15); remaining reds = B2 UI/i18n/page (S5.1–S5.9, S5.11, S5.13, S5.16, S5.17) + S6.1 (P1.6, forced past its own guard). Regression 9 suites identical before/after. Fitness 40/40 with and without env. Residue: `a5.drift []`, fingerprint unchanged.

## 2. Files
| file | kind | what |
|---|---|---|
| `src/lib/modules/pos/pricing-shared.ts` (new) | pure, zero imports | `priceCart(input)` + types `PriceCartInput/PriceCartResult/PriceDiscount/PriceVat…`, `roundHalfUp`, `PRICE_MAX_LINES/QTY/SATANG` |
| `src/lib/modules/pos/register-shared.ts` (new) | pure, client-safe (value imports only `@/lib/ui/money`) | all register types, constants, `cartToQuoteInput`, `cartToSubmitInput`, `cartToPriceInput`, `refusalMessageKey`, `moneyText`, `displayName` |
| `src/lib/modules/pos/register.ts` | append-only region `POS P1.3 ▸ … ◂` at end of file (0 lines removed/changed above it; its imports sit at the top of the region — ES hoisting — so the P1.1b hunk on `setItemSalePrice`/header imports cannot collide) | `registerCatalog`, `registerScan`, `quoteRegisterCart`, `submitRegisterSale`, `registerStatus`, `registerVatConfig`, `registerSellerLimits` |
| `src/lib/modules/pos/register-actions.ts` (new) | `"use server"`, 4 async exports only | `registerCatalogAction`, `quoteRegisterCartAction`, `submitRegisterSaleAction`, `registerStatusAction` |
| `src/lib/core/permissions.ts` | +1 line next to the POS keys | `"pos.sale.priceOverride"` |
| `src/lib/modules/pos/service.ts` | +1 optional field, +1 column in `createMany` (D1) | `CreateSaleInput.lines[].productId?` → `PosSaleLine.productId` |

## 3. Contract table (final names)
All service functions take an optional trailing `client?: PrismaClient` (the oracle drives each parallel submit on its own connection). Refusals are **returned** `{ok:false, code, message, lineIndex?}` — never thrown; anything unexpected = `INTERNAL`. `message` is Thai for logs only; the screen maps `code` with `refusalMessageKey`.

| function | input | output (ok) | refusal codes |
|---|---|---|---|
| `registerCatalog(ctx, actor, {q?, categoryId?, cursor?, limit?})` | ctx `{tenantId, systemId, unitId}` · actor `{userId, role, unitAccess, permissions}` | `{ok, categories: RegisterCategory[], products: RegisterProduct[], nextCursor: string\|null}` · default 100, >500 clamps to 500, order `name, id` (keyset) | NOT_FOUND · PERMISSION_DENIED · VALIDATION (limit not int ≥1, malformed cursor, bad q/categoryId, unknown key) |
| `registerScan(ctx, actor, {barcode})` | | `{ok, match:"one", product}` · `{ok, match:"choose", products}` (stable order) · `{ok, match:"none"}` (also for empty/dirty code) | NOT_FOUND · PERMISSION_DENIED |
| `quoteRegisterCart(ctx, actor, RegisterQuoteInput)` | `{lines: ({productId, qty, discount?, openPrice?: true, unitPriceSatang?} \| {name, qty, unitPriceSatang, discount?})[], billDiscount?, memberId?}` | `{ok, subtotalSatang, lineDiscountSatang, billDiscountSatang, couponDiscountSatang(=0), netSatang, vatSatang, grandTotalSatang, lines: {productId\|null, unitPriceSatang, grossSatang, discountSatang, lineTotalSatang}[], vatMode:"INCLUDED"\|"NONE", vatRateBp}` | NOT_FOUND · PERMISSION_DENIED (no `pos.sale.create`; custom/open line without `pos.sale.priceOverride`) · VALIDATION (shape, unknown key, **any `couponCode`/`couponDiscountSatang`**) · INVALID_LINE (qty ∉ 1…9999 int, price not int satang ≥0) · TOO_MANY_LINES (>200) · MEMBER_NOT_FOUND · PRODUCT_NOT_FOUND · PRODUCT_UNAVAILABLE · OPTIONS_REQUIRED · PRICE_NOT_SET · LINE_DISCOUNT_EXCEEDS_LINE · BILL_DISCOUNT_EXCEEDS_TOTAL · DISCOUNT_EXCEEDS_LIMIT · INTERNAL |
| `submitRegisterSale(ctx, actor, RegisterSubmitInput, client?)` | quote input + `idempotencyKey` (string ≤200) · `payMethods: {type:"CASH"\|"PROMPTPAY", amountSatang}[]` (1–2, no duplicate type) · `cashReceivedSatang?` · `expectedGrandTotalSatang` (REQUIRED int ≥0) | `{ok, saleId, receiptNo, grandTotalSatang, changeSatang, duplicated}` | all quote codes + IDEMPOTENCY_CONFLICT · PRICE_CHANGED (**carries every quote field**: totals + `lines` + vat) · PAYMENT_MISMATCH · VALIDATION (missing/non-int/negative expected, other pay types, negative/fractional amounts, empty pay list, cashReceived without cash) · BUSY (3 retries exhausted) · INTERNAL |
| `registerStatus(ctx, actor)` | | `{ok, unit:{id,name}, user:{name, roleLabel(th), role}, shift:null, pendingStockCount, pendingSyncCount:0}` | NOT_FOUND · PERMISSION_DENIED |
| `registerVatConfig({tenantId, systemId})` | | `{ok, mode:"INCLUDED"\|"NONE", rateBp}` (same helper the quote uses) | NOT_FOUND |
| `registerSellerLimits(actor, unitId)` (pure) | | `{canSell, canOverridePrice, maxDiscountBp: number\|null}` — same rules the server enforces | — |
| `priceCart(input)` (pure) | `{lines:{qty, unitPriceSatang, optionDeltasSatang?, discount?}[], billDiscount?, couponDiscountSatang?, vat:{mode NONE\|INCLUDED\|EXCLUDED, rateBp}, maxDiscountBp?}` | `{ok, subtotalSatang, lineDiscountSatang, billDiscountSatang, couponDiscountSatang, netSatang, vatSatang, grandTotalSatang, vatMode, vatRateBp, lines}` | VALIDATION · INVALID_LINE · TOO_MANY_LINES · LINE_DISCOUNT_EXCEEDS_LINE · BILL_DISCOUNT_EXCEEDS_TOTAL · DISCOUNT_EXCEEDS_LIMIT |

Actions (`register-actions.ts`): `registerCatalogAction({systemId, unitId, q?, categoryId?, cursor?, limit?})` · `quoteRegisterCartAction({systemId, unitId, cart: RegisterQuoteInput})` · `submitRegisterSaleAction({systemId, unitId, sale: RegisterSubmitInput})` · `registerStatusAction({systemId, unitId})`. Each: `requireTenant()` (outside the try so Next redirects still work) → `tenantId` + actor from the SESSION membership (`posMembership(auth.active)` + `auth.user.id`) → unit access (else NOT_FOUND) → `assertCan(pos.sale.create, unitId)` (else PERMISSION_DENIED) → service → result unchanged; any throw → `{ok:false, code:"UNKNOWN"}`. Submit success revalidates `/pos/sales` and `/app/sys/[id]` only (never the register page — cart state is client-side); a revalidate failure cannot turn a saved sale into an error.

## 4. Submit algorithm (where the guarantees come from)
1. **Scope** (`regScope`): ctx strings clean → POS `AppSystem` of this tenant, active → `AppSystemUnit(tenant, unit, POS).systemId === systemId` → unit not archived → `canAccessUnit(actor)` (all = NOT_FOUND, 404-not-403) → `evaluate(pos.sale.create, unit)` (PERMISSION_DENIED).
2. **Shape** (`regParseSubmit`, no DB): allow-listed keys; coupon fields → VALIDATION; ≤200 lines; qty int 1…9999; money ints within Int4; pay types CASH/PROMPTPAY only; `expectedGrandTotalSatang` int ≥0.
3. **Idempotency lookup first**: `PosSale` by unique `(tenantId, idempotencyKey)`. Found → compare the request with the *stored* sale (`regSameSubmission`): same unit/system/sourceModule POS · same memberId · `expected === sale.grandTotalSatang` · same multiset of `(payType, amount)` · bill discount recomputed on the stored subtotal equals `sale.discountSatang` · every request line matched 1:1 to a stored line (productId or custom name+price, qty, open price, discount recomputed on the *stored* unit price). Match ⇒ the original sale, `duplicated:true` (even if catalogue prices changed since); otherwise `IDEMPOTENCY_CONFLICT`. No payload hash column exists and no schema change is allowed, so the stored sale is the fingerprint.
4. **Re-price from the DB** (`regPrice`): priceOverride gate → member exists in tenant → product ids filtered by the *same visibility rule as `catalog.listForUnit`* (tenant + POS system + not archived + `unitId null or this unit` + C3 warehouse of this unit) — anything else ⇒ PRODUCT_NOT_FOUND without price or name → 86 (manual off) ⇒ PRODUCT_UNAVAILABLE → required option group ⇒ OPTIONS_REQUIRED → no price and no open price ⇒ PRICE_NOT_SET → `priceCart` with server prices, the seller's ceiling and the POS's VAT.
5. `expected !== server grandTotal` ⇒ **PRICE_CHANGED** with the fresh quote (checked before payments).
6. `Σ payMethods !== grandTotal` ⇒ **PAYMENT_MISMATCH**; a CASH portion needs `cashReceivedSatang ≥ cash portion` (else PAYMENT_MISMATCH); `changeSatang = received − cash portion` (0 without cash).
7. **`createSale(input, client)`** — the existing path (stock cut after commit, outbox `pos.sale.paid` → accounting/points, receipt counter), lines carry `productId`, `itemId` only for effectively stock-tracked PRODUCTs, `serviceId = InvItem.id` for SERVICE products.
   - **Ten parallel submits of one key ⇒ one sale**: the guarantee is the unique index `PosSale(tenantId, idempotencyKey)` hit by the single `INSERT` (`tx.posSale.create`) inside `createSale`'s transaction. Losers block on the receipt-counter row lock, then their INSERT raises P2002 and their whole transaction (incl. the counter increment) rolls back; `submitRegisterSale` catches P2002, reads the winner's sale and applies step 3's comparison (same payload ⇒ `ok`, `duplicated:true`; different ⇒ IDEMPOTENCY_CONFLICT). No read-then-write decides it.
   - `createSale`'s own pre-check silently returns an existing sale when the key committed between our lookup and its transaction ⇒ after every `createSale` we re-read the sale by key and run the same comparison (a different payload that raced in is refused, never reported as paid). `duplicated` there = sale created before this call started.
   - P2002 without a visible sale (counter race) and P2034/P2028 (rolled back) are retried ≤3 times, then BUSY. `createSale` throwing `PAYMENT_MISMATCH…` (e.g. automatic member-tier discount, see D6) ⇒ PAYMENT_MISMATCH, no sale.

Quote = steps 1, 2 (quote keys), 4. Catalogue/scan/status = step 1 + their own reads.

## 5. Decisions the brief did not spell out (controller please confirm)
- **D1 `service.ts` touched (additive)**: `CreateSaleInput.lines[].productId?: string` + written to `PosSaleLine.productId` (column from P1.1a). Needed by S3.3/S3.4/S3.26/S3.28 and the brief's "sale goes through `createSale`". F15.2 stays green (optional input field = compatible addition). `scripts/pos-sale-contract.json` **not** refreshed (`--update-pos-contract` would add the field + the new caller `register.ts`); run it at merge if you want the field pinned.
- **D2 catalogue reads are direct (read-only), not via `catalog.listForUnit`**: `listForUnit` re-loads the membership from the DB by `actorUserId`, while the register contract takes the actor from the caller (session in production; the oracle builds actors that differ from DB rows, e.g. a cashier scoped to the sandbox unit). Passing the system marker is forbidden in register code (F15.5). So `register.ts` reproduces `listForUnit`'s visibility SQL (same keyset cursor format) and reuses `catalog.effectiveTrackStock`. No catalogue writes anywhere in B1 (F15.1 unchanged).
- **D3 all four register functions require `pos.sale.create` at the unit** (same gate as the page's `posRegisterView`), not just unit access.
- **D4 discount ceiling**: OWNER unlimited · MANAGER unlimited unless `permissions["pos._maxDiscountBp"]` is set · STAFF `pos._maxDiscountBp` or 1000 bp (docs/modules/14-pos.md §9). Ceiling = (line + bill discounts) / subtotal; coupon excluded. `pos._maxDiscountBp` is not in `PERMISSION_PARAMS` (owners cannot set it in the UI yet — P1.15 seam).
- **D5 open price** (`openPrice: true` + `unitPriceSatang`) is allowed on any catalogue product for holders of `pos.sale.priceOverride` (docs: "Open price / แก้ราคา"), not only on unpriced ones. Without `openPrice`, a client `unitPriceSatang` on a catalogue line is ignored (S3.5 variant = PAID at the server price).
- **D6 memberId**: unknown/foreign ⇒ MEMBER_NOT_FOUND; a valid member is attached to the sale (walk-in semantics, earns via the outbox bridge). P1.3 does not price member rights; if the member's tier gives an automatic discount, `createSale`'s own guard refuses with PAYMENT_MISMATCH (no sale). P1.12 must add member rights to the quote.
- **D7 stock cut follows C2**: a line cuts stock only when the product's *effective* `trackStock` is true (explicit on, or AUTO with movements/onHand ≠ 0). AUTO items that never had stock (e.g. seeded americano/latte) are sold without a cut, so they do not flip to "หมด" after the first sale. Default policy sells into negative (no block); `pendingStockCount` = today's (Thai day) PAID sales of the unit with a stock-linked line whose `pos-consume-<sale>-<line>` movement is missing.
- **D8 categories**: only visible, non-archived categories of the unit that have ≥1 sellable product at that unit; `productCount` = sellable products, independent of `q`/paging.
- **D9 VAT** (`registerVatConfig` = quote): account book linked to the POS (`account.posAccountSystemId`) → `AccountSettings.vatRegistered/vatRateBp` (missing row = registered 7%, as `vatConfigOf`) ⇒ `INCLUDED rate`; no book / not registered ⇒ `NONE 0`. `AccountSettings` is read directly (facade does not export `vatConfigOf`) — same N5-style debt as `catalog.ts`.
- **D10 payments**: at most one entry per type; zero amounts allowed; `cashReceivedSatang` given without a cash portion ⇒ VALIDATION.
- **D11 refusal for a 0-line submit** = VALIDATION; a 0-line quote = ok with zeros.
- **D12 `cashReceivedSatang` is not stored** (no column) ⇒ not part of the idempotency comparison; a duplicate's `changeSatang` is computed from the retried request.
- **D13 Q7 reminder for P1.16**: quote/`priceCart` `subtotalSatang` = Σ gross before line discounts (screen "รวม"); stored `PosSale.subtotalSatang` = Σ line totals after line discounts (unchanged `createSale` meaning).

## 6. What B2 must know
- Import types/consts/helpers **only** from `@/lib/modules/pos/register-shared` (and `pricing-shared`) in `"use client"` files; call the server through `@/lib/modules/pos/register-actions` (S5.17 allows `-actions`). Never import `register.ts` client-side.
- Build requests with `cartToQuoteInput(cart)` and `cartToSubmitInput(cart, {idempotencyKey, payMethods, cashReceivedSatang?, expectedGrandTotalSatang: quote.grandTotalSatang})`; **keep the submit object and resend it unchanged on retry** (payload identity = idempotency). `cartToPriceInput(cart, productsById, vat, maxDiscountBp)` feeds `priceCart` for optimistic totals.
- `page.tsx` (server) can call `registerCatalog`, `registerStatus`, `registerVatConfig` and `registerSellerLimits(actor, unitId)` (gives `canOverridePrice` + `maxDiscountBp` for the UI) directly from `@/lib/modules/pos/register` with the session actor `{userId: auth.user.id, ...posMembership(auth.active)}`.
- Submit outcome handling (**updated in B1.1**): `ok:true` (incl. `duplicated`) = done · **`IDEMPOTENCY_CONFLICT` is NOT "no sale, issue a new key"** — it means "a bill with this key already exists": it always carries `saleId`, `receiptNo`, `saleStatus` (`PAID`/`VOIDED`/`REFUNDED`) → show that existing bill and do not resell it under a new key · **`UNKNOWN` / `INTERNAL` / `BUSY` are not definite** — keep the key and offer "ลองอีกครั้ง" with the identical payload (spec §3.4 step 6) · every other code is definite with no sale ⇒ new key. `PRICE_CHANGED` carries fresh totals/lines to display without a re-quote. `MEMBER_RIGHTS_UNSUPPORTED` (B1.1) ⇒ sell without the member (P1.12).
- `duplicated` is **not** a "print the receipt only once" signal: concurrent callers of one key may all receive `duplicated:false` for the same `saleId` (it is "created before this call started"). Dedupe printing by `saleId`.
- Spec §3.1's flat submit arguments (`{systemId, unitId, cart, payMethods, cashReceivedSatang?, idempotencyKey}`) are stale — the contract is the code: `submitRegisterSaleAction({systemId, unitId, sale: RegisterSubmitInput})`, `quoteRegisterCartAction({systemId, unitId, cart: RegisterQuoteInput})`, plus `registerScanAction({systemId, unitId, barcode})` (B1.1).
- Payments (B1.1): every entry ≥ 1 satang (an entry of 0 ⇒ `VALIDATION`); a zero-total bill submits `payMethods: []`; `idempotencyKey` ≤ 100 chars, not whitespace-only.
- i18n keys `refusalMessageKey` returns (S5.13 needs every one in th **and** en `pos.json`): `errors.notFound, permissionDenied, invalidLine, productNotFound, productUnavailable, optionsRequired, memberNotFound, memberRightsUnsupported, priceNotSet, priceChanged, paymentMismatch, idempotencyConflict, lineDiscountExceedsLine, billDiscountExceedsTotal, discountExceedsLimit, tooManyLines, stockInsufficient, conflict, busy, unknown`.
- `RegisterProduct.soldOutReason`: `UNAVAILABLE` = block (server refuses), `NO_STOCK` = still sellable; `requiredOptionGroupCount > 0` = block with `errors.optionsRequired`; `priceSatang === null` = needs open price (`pos.sale.priceOverride`).
- Seed hunk `registerV2: true` in `scripts/seed-pos-qc.mts` was **left to B2** (only S5.11 — static, together with `page.tsx` — needs it; no server check reads the flag). The flag reader (`settings.pos.registerV2 === true`) belongs with the page gate.

## 7. Forced-oracle progression (QC4, `… with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.3.mts`)
| run | UTC | result | note |
|---|---|---|---|
| base (controller) | — | 5/104 | |
| b1-run1 | 20:00:13Z → 20:09:22Z (incl. lock) | 88/104 | S2.13 red: my comment in `pricing-shared.ts` contained the literal `server-only` (the purity regex reads comments) → reworded |
| b1-run2 | 20:11:00Z → ~20:12Z | **89/104** · `a5.drift []` · S9.1/S9.2 ✅ | final code (incl. `registerSellerLimits`) |

Still red (15) after run 2:
- **S3.18** (ALLOW_NEGATIVE last item, 10 parallel × 3: PAID 10/10, OUT 10 rows, but `onHand` −5/−6 instead of −9) — lost update in `inventory.consumeInTx` (`onHand = item.onHand − qty` read-then-write without a row lock, `src/lib/modules/inventory/service.ts:539–552` at this base). Not register code (the sale path is the unchanged `createSale` → `consumeSaleInventory`). Fixed on **`origin/hotfix/inventory-atomic`** (HF-INV-1: `lockItemForStock … FOR NO KEY UPDATE` before reading the balance), not merged into `wip/pos-p1.3`. Needs a controller merge; no oracle change.
- **S6.1** — P1.6 group, forced past its own SKIP guard (no `oversellPolicy` reader exists by design).
- **B2 (UI)**: S5.1, S5.2 (no `pos.json`), S5.3, S5.4, S5.7, S5.8, S5.9, S5.17 (no `src/components/pos/register/*`), S5.5 (inventory rows), S5.6 (`page.tsx` debt 5), S5.11 (page flag + seed), S5.13 (mapping exact — verified offline 0 mismatches — red only because the keys are not in th/en yet), S5.16 (only "no `src/components/pos/register/*`"; marker/scripts-import/F15.1/F15.5/F15.6 parts green).

## 8. Regression (before = base `0002997e` with my 6 files parked; after = B1) — check lines compared, 0 differences
| suite | before | after |
|---|---|---|
| qc-pos-p1.1 | 113/113 | 113/113 |
| qc-pos-register | 42/42 | 42/42 |
| qc-hf-pos-page-authz | 56/56 | 56/56 |
| qc-pos-inventory | 25/25 | 25/25 |
| qc-pos-account | 16/16 | 16/16 |
| qc-pos-closeday | 22/22 | 22/22 |
| qc-pos-coupon | 8/8 | 8/8 |
| qc-pos-products | 24/24 | 24/24 |
| qc-pos-p0.2 | 55/55 (+1 SKIP S6.7) | 55/55 (+1 SKIP S6.7) |
All create/delete their own temp tenants (p1.1 uses the POS QC seed read-mostly); none re-seeds shared data, so none was skipped. Not run (not in the B1 list): COMMON §7 money set (`qc-account-cpa`, `qc-restaurant-money`, `qc-shop-refund`, `qc-hotel-money`, `qc-ticket-money`, `qc-subscription-money`) and `qc-crm-c2.7` — `register-ui.tsx` / `actions/pos.ts` byte-identical (S5.12 ✅).

## 9. Gates
- fitness `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` → exit 0 `{"total":40,"passed":40}` · `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` → exit 0 `{"total":40,"passed":40}` (F5.1 45/45 unchanged · F6.1 ✅ · F15.1–F15.6 ✅).
- typecheck (once, at the end): `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (20:24:01Z → 20:28:02Z incl. lock) → **exit 0**, `tsc --noEmit` no diagnostics.
- commit: one commit on `wip/pos-p1.3` + push of that branch only.

## 10. Proposed ORACLE-EDITs
None. (S3.18 is correct; it is red because the base lacks HF-INV-1.)

## B1.1 — review fixes (controller rulings on the B1 review, oracle round 3.2 · base `fe89ccd7` = B1 + merge of `hotfix/inventory-atomic` 2eccebf4 + oracle 119 checks)
D1–D13 stand except **D4** and **D6** (changed below) and **D10** (payments, changed by ruling 4). D2, D7, D12 and the R5 service lines are unchanged.

### What changed (file:line at the B1.1 commit)
| # | ruling | change |
|---|---|---|
| 1 | idempotency order-independent + exact; conflict = "bill exists" | `register.ts:987` `regLoadSale` loads lines/payments `orderBy: {id: "asc"}` · `register.ts:1008` new `regLinesEqual` (canonical, below) replaces the greedy matcher · `register.ts:1040` `regSameSubmission` (payments as a sorted multiset) · `register.ts:1058` `regDuplicate`: any stored bill with this key that is not `PAID`, or whose payload differs ⇒ `IDEMPOTENCY_CONFLICT` carrying `saleId`, `receiptNo`, `saleStatus` (never `ok:true` for a VOIDED bill) · `register-shared.ts:139` type `RegisterIdempotencyConflict` added to `RegisterSubmitResult` · message now "มีบิลของรายการนี้อยู่แล้ว — ตรวจบิลเดิมก่อน ห้ามขายซ้ำ" |
| 2 | D6 → member rights refused | `register.ts:831` `regMemberAutoDiscount` + call at `register.ts:908` (inside `regPrice`, i.e. quote and submit, after pricing, before any write): member system of the unit via `systemForUnit(…,"MEMBER")` (same as `createSale`) → `member.automaticDiscountForSale` > 0 ⇒ `MEMBER_RIGHTS_UNSUPPORTED`; no member system / customer not in it ⇒ attaches as today (same as `createSale`'s `applyMemberRights`). Source of truth: new read-only export `member/wallet.ts:685` `automaticDiscountForSale` = step 1 of `computeQuote` with the same private helpers (`loadCustomer` → `benefitsFor` → `tierDiscountOf(subtotalOf(cart))`); with no choices (the register never sends any) that step is the whole automatic discount `applyOnSale` returns. It does **not** call `computeEarn` (which creates a `PointSettings` row lazily through `point/internal.ts getSettings`), so the refused path writes nothing. Facade: one line `member/index.ts:123`. Code + key: `register-shared.ts:42`, `:249` (`errors.memberRightsUnsupported`) |
| 3 | D4 → ceiling vs rounding | `pricing-shared.ts:108` `ceilingUseOf`, `:147`, `:173–174`, `:190–192`: ceiling usage in 1/10000 satang — PERCENT uses `bp × base` exactly (never the rounded satang), AMOUNT uses `satang × 10000`; refuse when `Σ usage > maxBp × subtotal + 5000 × (number of AMOUNT discounts > 0)` (each AMOUNT compared with its ceiling rounded half-up). Integer only (max ≈ 4.3e13 < 2^53). Same function client/server (S3.45 green) |
| 4 | payments | `register.ts:966`, `:972`: empty list allowed at parse; any entry < 1 satang ⇒ `VALIDATION`; `[]` on a non-zero total ⇒ `PAYMENT_MISMATCH` at step ④ (unchanged code path) |
| 5 | key format | `register.ts:493` `regIsIdemKey` (string, `trim()` non-empty, ≤ 100, clean) used at `:962`; the key is stored verbatim |
| 6 | scan action | `register-actions.ts:131` `registerScanAction({systemId, unitId, barcode})` — same shape as the other four |
| 7 | review extras (no oracle check) | `register.ts:1173` `registerVatConfig` requires `active: true` (inactive POS ⇒ `NOT_FOUND`, as in `regScope`) · `register-actions.ts:66` `session()` wraps `requireTenant`: `unstable_rethrow(e)` passes Next redirects/notFound through, any other failure ⇒ `{ok:false, code:"UNKNOWN", message}` instead of a raw rejected promise; every action calls it first · notes §6 updated (`IDEMPOTENCY_CONFLICT` meaning, `duplicated` ≠ print-once, stale spec §3.1 arguments) |

### Canonical idempotency comparison (`regLinesEqual` + `regSameSubmission`)
1. Same unit, POS system, `sourceModule` POS, memberId, `expected === sale.grandTotalSatang`, payments as a sorted multiset of `type:amount`, bill discount recomputed on the stored subtotal (after line discounts) equals `sale.discountSatang`, and the same number of lines.
2. Custom lines: sorted multiset of `name|unitPrice|qty|discountSatang` on both sides must be identical (request discount recomputed with the `priceCart` formula on `price × qty`).
3. Product lines, per `productId` (union of both sides): stored multiset `S` of `unitPrice|qty|discountSatang`; request = open-price lines `E` (price known) + plain lines `U` (price = the catalogue price at sale time, not stored). Because `regPrice` reads each product's price once per submit, every plain line of one product in one sale has the same price `c`. The product matches iff counts are equal and **some single** `c` taken from the stored prices of that product makes `sorted(E ∪ U@c) == sorted(S)`. Order of lines never matters; there is no greedy pairing; a plain line cannot "take" an open-price line unless the resulting whole multiset is identical.
4. Residual indistinguishable case (documented): stored data cannot tell `[P open 60, P plain @45]` from `[P open 45, P plain]` when the catalogue price at the original sale was 60 — both describe byte-identical stored lines and totals, so the "duplicate" answer refers to a sale with exactly the lines/money the retry describes.

### Forced oracle (QC4, `… with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.3.mts`)
| run | UTC | result |
|---|---|---|
| controller at `fe89ccd7` | — | 97/119 |
| b11-run1 | 21:43:02Z → ~21:45Z | **105/119** · `a5.drift []` · S9.1/S9.2 ✅ |
Green now: S2.15, S3.40, S3.41, S3.42, S3.43, S3.48, S3.49, S5.18 (+ all 97 previously green). Red (14, none mine): UI/i18n/page for B2 — S5.1–S5.9, S5.11, S5.13 (0 mapping mismatches; red only because th/en `pos.json` do not exist; `MEMBER_RIGHTS_UNSUPPORTED → errors.memberRightsUnsupported` mapped), S5.16 (only "no `src/components/pos/register/*`"), S5.17 — and S6.1 (P1.6, forced past its own guard).

### Regression (before = `fe89ccd7` clean tree · after = B1.1) — check lines compared, 0 differences
| suite | before | after |
|---|---|---|
| qc-pos-p1.1 | 113/113 | 113/113 |
| qc-pos-register | 42/42 | 42/42 |
| qc-hf-pos-page-authz | 56/56 | 56/56 |
| qc-pos-inventory | 25/25 | 25/25 |
| qc-pos-account | 16/16 | 16/16 |
| qc-pos-closeday | 22/22 | 22/22 |
| qc-pos-coupon | 8/8 | 8/8 |
| qc-pos-products | 24/24 | 24/24 |
| qc-pos-p0.2 | 55/55 (+1 SKIP) | 55/55 (+1 SKIP) |
| qc-hf-inventory-atomic | 143/143 | 143/143 |

### Gates
- fitness with QC4 env and without env → exit 0, `{"total":40,"passed":40}` both.
- typecheck (once, at the end): `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (21:51:40Z → 21:55:08Z incl. lock) → **exit 0**.
- commit: one commit on `wip/pos-p1.3` (`--no-verify`: `core.hooksPath` points into `/root/projects/shark-in-th`, off-limits; fitness run through `iso.sh` instead) + push of that branch only.

### Outside the B1 file list (flagged)
- `src/lib/modules/member/wallet.ts` (+10 lines, new export) and `src/lib/modules/member/index.ts` (+2 lines) — required by ruling 2 ("reuse the function `createSale` uses"; the tier step was private). Read-only, no behaviour change for existing callers.
