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

## B2 — UI (builder stage 2)
> Base `eb30aa5f` (B1.1) · tree `/root/projects/shark-pos-p11` · brief `ledger/pos-briefs/pos-brief-P1.3-B2.md` · spec `pos-spec-P1.3-register-ui.md` (+ rulings Q1–Q29, Addendum, Addendum 2) · 1 Oct 2026
> Logs (git-ignored): `.qc-shots/pos/p1.3/b2-*.log` (`b2-unforced-1`, `b2-forced-1`, `b2-after-<suite>`, `b2-fitness-{env,noenv}`, `b2-typecheck-{1,2}`).

### B2.1 Result in one line
Forced oracle **118/119** — only **S6.1** red (P1.6 group, forced past its own guard) · unforced **118/118 + S6.1 SKIP** · `a5.drift []`, S9.1/S9.2 green (no QC4 residue) · 9 regression suites identical (0 differing check lines) · fitness 40/40 with and without env · typecheck #1 exit 0 · #2 exit 2 on one type-only error in `scripts/visual-pos.mts`, fixed and verified by a scoped tsc with positive control (B2.12) — full re-run owed to the controller build. Visual shots = CONTROLLER-RUN (needs build + server + the seed run, B2.8).

### B2.2 Files
| file | kind | what |
|---|---|---|
| `src/components/pos/register/RegisterScreen.tsx` | client | owns all state (spec §3.3), the single `keydown` listener (F2/F4/F8/Escape · G2), search ref + `.focus()` (G5), layout switch D/T/M/C via `matchMedia` after mount, toast, offline banner, dialog layer stack, idempotency lifecycle |
| `RegisterTopContext.tsx` | client | unit switch (menu of accessible units → `?unit=`), online dot + last sync, shift chip (`status.noShift`), user + role (client-translated from `user.role`) · portal into `#app-topbar-slot` (Q1=A) with 48 px inline fallback (B) · mobile header (05ก) with camera (soon) + ☰ (in-app only) |
| `RegisterModeTabs.tsx` | client | 8 tabs · D long labels / T icon-over-short-label · tables / online orders / reports = house "soon" (dimmed + chip, `<span aria-disabled>`) |
| `SearchRow.tsx` | client | search (`type=search`, Enter → `addFromSearchEnter`, IME-safe), F2 kbd (D), custom item (aria-disabled + reason toast without `pos.sale.priceOverride`), camera (soon) |
| `CategoryChips.tsx` | client | `tablist` of chips, horizontal scroll |
| `ProductGrid.tsx` · `ProductCard.tsx` | client | grid 4/3/2/3 columns · empty catalogue (19ก) · no result · category empty · load more (IntersectionObserver + button) · card states of spec §5 |
| `CartPanel.tsx` · `CartLine.tsx` | client | cart header (bill type / hold / held = soon) · member slot (`memberSlot` seam; P1.3 = "+ เพิ่มสมาชิก" soon row; attached-member row with `pos-reg-member-remove` coded, unreachable in P1.3) · lines · totals · action row · pay · stock warning box (19ฉ) |
| `LineEditor.tsx` | client | qty −/+ (48×48), line discount ฿/% (percent → basis points ×100), remove (no 2nd confirm · Q27); validated with `priceCart` before applying |
| `BillDiscountDialog.tsx` · `CouponDialog.tsx` | client | bill discount ฿/% (+ none) · coupon entry = soon (Q12 DEFER) → CouponDialog explains, nothing is sent |
| `CustomItemDialog.tsx` · `OpenPriceDialog.tsx` · `ClearBillDialog.tsx` | client | custom line (name + price) · open price for unpriced products (> 0 only, R2) · clear bill confirm (focus starts on Cancel — a scanner's trailing Enter must not clear a bill) |
| `InterimPayDialog.tsx` · `SaleDone.tsx` | client | interim payment (Q5): cash (received, quick exact/100/500/1000, change) + PromptPay QR locked to the quote total (`promptpayPayload`, pure) with manual confirm · zero bill = `payMethods: []` · error card (19ค) · unknown-result card (retry only) · conflict card (existing receipt + status, "start a new bill", link to today's bills) · done view |
| `MobileCartBar.tsx` · `MobileCartSheet.tsx` | client | C only: sticky bar (peek, count, total, pay) · bottom sheet holding the same `CartPanel` |
| `RegisterStatusBar.tsx` | client | D only: shortcuts + pending stock / sync + printer placeholder |
| `RegisterDialog.tsx` · `RegisterIcon.tsx` | client helpers | **2 files not named in spec §3.1** (same folder): the shared scrim/positioning shell (centred ≥md / bottom sheet <md) and the icon set (paths copied from the mockup sprite `_base.part`). Kept separate so every dialog file stays small and no icon/dialog code is duplicated 10× |
| `src/app/app/sys/[id]/pos/register/page.tsx` | server | HF-POS-PAGES guard verbatim (requireTenant → POS system → `posRegisterView` → `notFound()`); flag reader `registerV2On(settings)` = `settings.pos.registerV2 === true` strict; new screen gets `registerCatalog` · `registerStatus` · `registerVatConfig` · `registerSellerLimits` (session actor) + PromptPay ID (validated); otherwise the legacy branch renders `<PosRegister>` with the identical props |
| `src/lib/modules/pos/register-legacy-page.tsx` (new, **outside the brief's file list — flagged**) | server | the legacy page chrome moved out of `page.tsx` byte-for-byte (PageHeader · ModuleTabs · unit chips · PromptPay hint · Section; "unlinked" empty state) so `page.tsx` debt = 0 while the legacy 5 untestid controls keep their ratchet row ("move into a legacy component under the same debt rules", spec §4.7). `<PosRegister>` itself is still rendered in `page.tsx` (S5.11 `bothScreens`) |
| `src/messages/{th,en}/pos.json` + `src/i18n/request.ts` (one hunk) | i18n | `{ "register": … }` 167 keys, identical trees, no Thai in en; request.ts merges `pos` namespace |
| `scripts/pos-ui-inventory.json` | registry | +76 rows (page `/app/sys/[id]/pos/register`, wo P1.3; the 23 oracle ids carry `oracle: "qc-pos-p1.3"`); `page.tsx` debt → 0 (`byTag {}`), new debt row `register-legacy-page.tsx` = 5 (ModuleTabs 2 · EmptyState 1 · Link 2) |
| `src/components/app-shell/Topbar.tsx` (+2) · `NavRail.tsx` (1 changed) | shell | `<div id="app-topbar-slot" className="flex min-w-0 flex-[3] items-center gap-3 empty:hidden" />` (empty = hidden ⇒ every other page unchanged) · `isRailPath` also matches `/app/sys/<id>/pos/register` |
| `scripts/seed-pos-qc.mts` (one hunk in `ensureSystem`) | seed | POS systems of the QC tenants get `settings.pos.registerV2: true` (merged, idempotent; new systems created with it) — **not run by B2** (see B2.9) |
| `scripts/visual-pos.mts` | harness | p1.3 state shots (B2.8) + `LOCALE=en` + temporary fixtures, cleanup in `finally` and on signals |

### B2.3 Deliberate parity deltas vs mockups (with reason)
1. Topbar 56 (real shell) vs 66/54 drawn; brand + 2 shell buttons stay; context portals between them (Q1=A). Brand name truncates to ¼ of the free width on this page only (slot `flex-[3]`).
2. Rail at 1024 (Q2) → left column 588 instead of 644 at T.
3. Chips, hold/held buttons, mobile camera = 44 px (drawn 38/36/36) — S5.9/Q14.
4. Option popover + selected-card ring hidden (P1.2); "3 ขนาด" label hidden (Q6); member card → "+ เพิ่มสมาชิก" soon row with a small "เร็ว ๆ นี้" chip (P1.12); count pills (held bills, online orders) hidden; shift chip reads "ยังไม่เปิดกะ" (P1.9); printer text = "ยังไม่เชื่อมเครื่องพิมพ์" (P1.10); coupon line never shows (Q12 DEFER).
5. Soon tabs (โต๊ะ · ออเดอร์ออนไลน์ · รายงาน) dimmed 60 % + chip at D (Q13).
6. Line editor, bill discount, custom item, open price, clear bill, payment, done: no mockup in 01/05/19/20 → centred 420 px dialogs (radius 22, padding 28) ≥ md and bottom sheets < md (spec §4.6). Spec §3.1 suggested an anchored popover for the line editor on D/T; a dialog was used (one dialog system, keyboard/Esc layering identical) — reviewer's call.
7. Mobile: a 48×48 "+" (custom item) sits right of the search field (05ก draws none — custom items must stay reachable on phones). Chip row aligned with the search field and bleeding to the screen edge (Q20).
8. Mobile cart sheet: no drag-to-close (✕ 44 px + scrim tap + Esc instead).
9. In-cart card highlight + qty badge only < md (05ก draws it; 01 does not).
10. Empty catalogue: CSV / sample set / "+ หมวด" hidden (Q15); `empty.body` = ruled copy.
11. Fonts IBM Plex vs Noto (Q17); colours `#a3a3a3`→muted, `#d4d4d4`→line, `--color-stage` for image placeholders (Q18); scrim/shadows via tokens (`color-mix` of ink) / `shadow-xl`.
12. Bill-type chip stays 28 px tall as drawn (soon control, not in the S5.9 list); "แก้" link 12 px as drawn; action-row buttons 40/36 as drawn (`.btn-sm` minimum).
13. Legacy register (flag off): **the page is now in rail mode for everybody** because `isRailPath` is path-based and cannot see the flag. The legacy chrome restores the old padding itself (`px-4 pb-10 pt-4 sm:px-6` ⇒ identical to the collapsed-rail layout), so users who already use the collapsed rail see no change; users who prefer the full 288 px drawer now see the 56 px rail on the register page. Making the rail flag-aware needs an AppShell/AppMain hunk (outside the two allowed shell hunks) — **controller decision**.

### B2.4 Hidden / soon in P1.3
Soon (visible, toast `pos.register.soon`, `aria-disabled`): bill type, hold (+F8), held bills, member pick, note, tax invoice, camera (both placements), coupon (dialog explains). Soon tabs: tables, online orders, reports. Hidden: option popover, sizes label, member card/points, count pills, 19ก extra buttons, 19จ shift dialog, 86 timestamp, fullscreen/lock.

### B2.5 Seams for later work orders
- **P1.2**: `ProductCard.onPick` → `RegisterScreen.pick` (blocks `requiredOptionGroupCount > 0` with `errors.optionsRequired`; P1.2 opens the popover there).
- **P1.4**: `addFromSearchEnter` (single/exact match from the shown result set, else `registerScanAction` one-match) · camera buttons call `soon`.
- **P1.5**: `onHold` (F8 + button) / held-bills button; cart = one serialisable `RegisterCart` object.
- **P1.6**: delete `InterimPayDialog.tsx` + `SaleDone.tsx`, mount the mockup-02 modal with the same props; idempotency lifecycle stays in `RegisterScreen.send/confirmPay/retryPay`.
- **P1.12**: `CartPanel.memberSlot`; `memberAttached`/`onRemoveMember` + `pos-reg-member-remove`; `MEMBER_RIGHTS_UNSUPPORTED` → "ขายโดยไม่ใส่สมาชิก" button in the pay dialog; coupon dialog becomes the code entry.
- **P1.15**: `onNeedsApproval(key)` (custom item without the permission; discount-ceiling refusals are shown inline by the dialogs) → PIN modal.

### B2.6 Money / idempotency behaviour (brief "not negotiable" list)
1. Screen totals: `priceCart(cartToPriceInput(…))` instantly, server quote (`quoteRegisterCartAction`, 250 ms debounce, request counter drops stale answers) replaces them; the cart line prices come from the quote lines (Q22). Pay enabled only with a fresh quote for the current cart version, online, `canSell`, idle submit; after 400 ms pending the amount reads `common.loading`.
2. One `idemKey` per bill attempt (created on mount and after every finished/cleared bill). `send()` keeps the submit object in `pendingSubmit`; `retryPay()` re-sends that object unchanged. `UNKNOWN`/`INTERNAL`/`BUSY`/thrown ⇒ phase `unknown` (cart frozen, only "ลองอีกครั้ง", Esc/scrim blocked). `IDEMPOTENCY_CONFLICT` ⇒ phase `conflict` showing receipt no + status, only "เริ่มบิลใหม่" (explicit) or the link to today's bills. Other refusals ⇒ new key, error card, form stays. `sendingRef` guarantees one submit in flight (double click / double Enter / form submit).
3. `PRICE_CHANGED` ⇒ fresh totals from the response become the quote, user must confirm again; `PAYMENT_MISMATCH` ⇒ re-quote; `MEMBER_RIGHTS_UNSUPPORTED` ⇒ message + remove-member button.
4. Payments: CASH or PROMPTPAY, one entry = whole quote total (≥ 1 satang); zero total ⇒ `payMethods: []`; cash confirm disabled while received < due; `cashReceivedSatang` only with a cash portion.
5. No server `message` is ever rendered: every error goes through `refusalMessageKey(code)` → `pos.register.errors.*`; the code is only in `data-code`.

### B2.7 G1–G10 self-check
G1 every testid is a literal / template literal on the element (scanner: 0 unreadable) · G2 keydown + "F2" "F4" "F8" "Escape" in `RegisterScreen.tsx` (carries `pos-reg-root`/`pos-reg-toast`) · G3 no Thai outside comments in any file with a `pos-reg-` testid (money only via `moneyText`/`formatBaht`, never a literal baht sign) · G4 first occurrence of each touch id sits on its own tag with an unprefixed ≥44 class, `data-testid` written before `className` and no `<`/`>` in between (CartLine → `size-11`, CartPanel → `h-11`/`min-h-12`/`h-14|h-[70px]`, CategoryChips → `h-11`, ProductCard → `min-h-[120px]`, RegisterTopContext (mobile camera) → `size-11`, SearchRow → `h-12`) · G5 search focused through `searchRef.current.focus()` on mount (pointer-fine), after every add, after dialogs, after "next sale"; F2 focuses always · G6 `pos.json` = `{ "register": … }` · G7 identical ICU variable sets, en without Thai, th never empty/key/enum (S5.2 green) · G8 every clickable `pos-reg-*` has a row (F15.3a green) · G9 client files import only `register-shared`, `pricing-shared`, `register-actions` from the POS module (+ `@/lib/ui/*`, `@/lib/payment/promptpay` (pure), `@/components/PromptPayQr`) · G10 no `"use server"` file touched.

### B2.8 visual-pos shot list (CONTROLLER-RUN)
`bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts p1.3 --user owner|cashier --base http://127.0.0.1:<port> --page register` (+ `LOCALE=en` in front of `pnpm` for 20B, 1440 only). Files `.qc-shots/pos/p1.3/register-<state>-<user>-<w>x<h>[-en].png`:
default (3 sizes) · cart3 (3) · line-editor (3) · bill-discount (3) · custom-item (3; cashier = reason toast) · paydlg-cash (3) · sale-done (1440 only — **creates one real PAID cash sale in the QC coffee tenant per user run**: Americano ×2 + Latte, untracked items) · search-empty (3) · stock-warn (3; fixture "เหลือ 2" ×3) · mobile-sheet (390). Fixtures: 3 temporary PosProducts (low = 2 left, out = tracked 0, off = unavailable at the unit) + 2 InvItems, ids `posqc-vis-<pid>-*`, deleted in `finally`/on SIGINT-TERM-HUP; leftovers older than 1 h swept at start. `--dry` prints the plan (35 owner shots incl. the other 3 pages).
**Pre-condition**: run `scripts/seed-pos-qc.mts` on QC4 first (it turns `registerV2` on for the QC tenants; B2 did not run it because the seed rewrites the tracked `scripts/pos-expected.json` counts). Without it every state step fails with "หน้าขายใหม่ไม่ขึ้น (pos-reg-root)".

### B2.9 Not verifiable without a browser (look here first)
1. **Every pixel number of spec §7** — written from the effective mockup CSS (`_base` → `_pos` → page → `_airy` → `_airy2`) as Tailwind arbitrary values, base classes = T sizes, `xl:` = D sizes, but nothing has been rendered. Highest-risk spots: Topbar slot fit at 768–1279 (unit chip `max-w` 200/260/360 + truncation; shift chip hidden < lg; user name hidden < lg, role < xl); mode-tab row height (58 D / ≈57 T) and the `-mb-px` underline overlap; grid card 194×≥170 at 1440; cart line height ≈84; pay button 432×72 at x 984; status bar fitting at exactly 1280.
2. **Portal into `#app-topbar-slot`** (React portal into a node the Topbar renders with no children) and `empty:hidden` keeping the slot invisible on every other page; whether the brand name truncation (¼ of free width, register page only) is acceptable.
3. **Rail mode on `/pos/register`** — new screen full-bleed (`h-[calc(100dvh-3.5rem)]`, inner scroll regions); **legacy register with the flag off**: padding restored by `register-legacy-page.tsx`, but drawer users now see the rail (B2.3 #13).
4. **Mobile (390/360)**: sticky cart bar at the page bottom with safe-area padding, last card not covered, chip row bleeding to the screen edge without horizontal page scroll, toast (bottom 150 px) above the bar, sheet max 85dvh with lines scrolling and pay visible, sheet → line editor stacking.
5. **Tailwind v4 compilation of the arbitrary utilities used** (`bg-[color:var(--color-ink)]/30`, `shadow-[…color-mix(…)…]`, `empty:hidden`, `max-md:*`, `opacity-45`, `flex-[3]`, `[overflow-wrap:anywhere]`, `[&::-webkit-scrollbar]:hidden`, `[scrollbar-width:none]`, `line-clamp-2`).
6. **Keyboard/focus**: single `keydown` listener (F2 focus+select while typing elsewhere, F4 only with no dialog + pay enabled, F8 soon toast, Esc layering incl. locked pay phases), autofocus only on `(pointer: fine)`, Thai IME `isComposing` on Enter, clear-bill dialog focusing Cancel.
7. **Runtime i18n**: next-intl rich text `<b>` in `errors.stockInsufficient`, ICU plural in en `cart.itemCount`, the `common` namespace (`loading`, `cancel`) resolution, `LOCALE=en` cookie switching to `pos.json` en.
8. **Server-action timing**: Next dispatches actions one at a time per client — quote (250 ms debounce), catalog search (200 ms) and status refresh queue behind each other; the 400 ms "กำลังโหลด..." swap and the stale-response counters are reasoned, not observed.
9. **Payment paths in a real browser**: double click / double Enter producing one submit, unknown-result (network drop) → retry with the identical object, conflict card, PRICE_CHANGED re-confirm, PromptPay QR (170 px, amount-locked) rendering.
10. **visual-pos p1.3 steps** were only dry-run (`--dry` plan OK, tsx compiles); selectors/timings, the fixture inserts (PosProduct + InvItem rows written directly) and their cleanup have not touched QC4 yet. The seed hunk has not been executed either.

### B2.10 Oracle runs (QC4)
| run | UTC | result |
|---|---|---|
| unforced #1 | 22:28:34Z → 22:30:14Z | 118/118 · S6.1 SKIP · `a5.drift []` |
| forced #1 (`QC_FORCE=1`) | 22:43:37Z → ~22:45Z | 118/119 · red = S6.1 only · `a5.drift []` |
| forced #2 (final tree) | 22:51:02Z → 22:52:33Z | **118/119** · red = S6.1 only · S9.1/S9.2 ✅ |
| unforced #2 (final tree) | 22:52:33Z → 22:54:01Z | **118/118** · S6.1 SKIP |
Green now vs B1.1 (105/119 forced): S5.1–S5.9, S5.11, S5.13, S5.16, S5.17.

### B2.11 Regression (before = B1.1 final-tree logs `b11-after-*` · after = B2) — check lines compared
| suite | before (`b11-after-*`, tree = eb30aa5f) | after (B2, flag off in QC4) |
|---|---|---|
| qc-pos-p1.1 | 113/113 | 113/113 |
| qc-pos-register | 42/42 | 42/42 |
| qc-hf-pos-page-authz | 56/56 | 56/56 |
| qc-pos-p0.2 | 55/55 (+1 SKIP) | 55/55 (+1 SKIP) |
| qc-pos-inventory | 25/25 | 25/25 |
| qc-pos-account | 16/16 | 16/16 |
| qc-pos-closeday | 22/22 | 22/22 |
| qc-pos-coupon | 8/8 | 8/8 |
| qc-pos-products | 24/24 | 24/24 |
0 differing check lines in every suite (sorted ✅/❌/⏭️ + id). "Before" reuses the B1.1 after-logs (`.qc-shots/pos/p1.3/b11-after-*.log`, 21:45–21:50Z, recorded by B1.1 as its final tree; commit `eb30aa5f` 21:55Z) — no separate before-run was made in this tree (it would have needed parking all B2 files).

### B2.12 Gates
- fitness `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` → exit 0 `{"total":40,"passed":40}` · `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` → exit 0 `{"total":40,"passed":40}` (F15.3a/b incl. the moved debt row; F15.4 167 keys th/en).
- typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`: #1 22:30:20Z → 22:40:27Z exit 0 · #2 22:54:20Z → 23:05:37Z **exit 2 — one error**, `scripts/visual-pos.mts(103,3) TS2322` (the new state-plan `flatMap` inferred `page: "register"` from the first branch; typecheck #1 ran before visual-pos was extended). Fixed with explicit `Job[]`/`Job` return annotations (types only, no behaviour change). The 2-run limit was respected, so the fix was verified with a **scoped** `tsc -p` (temp tsconfig extending the project one, `files: [scripts/visual-pos.mts]` + everything it imports) through `iso.sh` + `with-gate-lock.sh`: exit 0 (23:24:21Z → 23:27:57Z); **positive control** in the same scoped setup with an unfixed copy (`scripts/_b2-pc.mts`, deleted afterwards) reported exactly that TS2322 at line 103 while the fixed file stayed clean (23:28:27Z → 23:35:22Z). No other file changed after typecheck #2. **Controller: a full `pnpm typecheck` / `next build` on this head is still owed** (the build at CONTROLLER-RUN covers it).
- commit: one commit on `wip/pos-p1.3` with `--no-verify` (hook path points into an off-limits tree; fitness run through `iso.sh` instead) + push of that branch only.

### B2.13 Proposed ORACLE-EDITs
None required — every S5 check is green with the final tree. Observation only (no edit asked): S5.4 requires `pos-reg-member-remove` in code although P1.3 can never attach a member; it is implemented as an unreachable attached-member row (seam for P1.12) rather than a dead literal.

### B2.14 Outside the brief's scope list (flagged)
- `src/lib/modules/pos/register-legacy-page.tsx` (new) — legacy chrome moved out of `page.tsx` (debt 0 for page.tsx, see B2.2).
- `src/components/pos/register/RegisterDialog.tsx` + `RegisterIcon.tsx` — helper files in the register folder not named in spec §3.1.
- Nothing under `prisma/`, no server file of B1 changed, `register-ui.tsx` / `actions/pos.ts` untouched (S5.12 green).

## B2.1 — rail only when the V2 screen renders (fix of the B2 defect · base `ba6a9bb8`)

**Defect:** `NavRail.isRailPath` forced the 56 px rail on `/app/sys/[id]/pos/register` from the URL alone ⇒ with `settings.pos.registerV2` OFF (every real shop) the legacy register lost the full menu (and the legacy frame carried its own padding to compensate). Violated Q4.

**Fix (server-decided, SSR-consistent — no flash):**
- `register-shared.ts` exports `posRegisterV2On(settings)` (strict `=== true`, body moved verbatim from `page.tsx`). It is the single flag reader: `page.tsx` picks the screen with it, `app/layout.tsx` uses it on the `appSystems` rows it already loads (no extra query) to build `posRegisterV2Ids` (POS systems with the flag on).
- `layout.tsx` passes `posRegisterV2Ids` to `AppShell` and `AppMain`; `isRailPath(pathname, posRegisterV2Ids = [])` forces the rail on `/pos/register` only when the path's system id is in that list. Kanban board rule unchanged. Both client components get the prop in the first server render ⇒ the first HTML already has the right layout; no client effect / DOM probe.
- Flag OFF ⇒ list has no such id ⇒ shell identical to origin/main; `PosLegacyRegisterFrame` lost its `LEGACY_PAD` wrapper ⇒ legacy DOM = origin/main markup (inside the normal `<main>` padding).
- `PosRegisterUnlinked` gets `railFrame` (= flag on): flag on + no linked unit still sits under the rail (layout cannot see units) so it re-adds the same padding; flag off = origin markup.
- Hunk sizes: NavRail 4 lines, AppShell/AppMain 4 each, layout 5 (clear of the session/crm layout hunk at the CRM menu, lines ~156).

**Known edge (flag ON only, QC shops):** a 404 on `/pos/register` for a user without access is shown under the rail (layout decides before the page's guard). Harmless; flag off unaffected.

**ORACLE-EDIT:** added `P1.3-S5.19` [static, no DB] to `scripts/qc-pos-p1.3.mts` — `isRailPath(pathname, posRegisterV2Ids)` gated by `.includes`, no unconditional `/pos\/register\/?$/.test(pathname)`, AppShell+AppMain pass the ids, layout uses `posRegisterV2On` and passes to both. Reads NavRail raw (the kanban regex `\/b\//` contains `//`, which the oracle's `stripComments` would treat as a comment). Simulated standalone: RED on `ba6a9bb8`, GREEN now. S5.11 re-simulated: still green (reader now lives in `src/lib/modules/pos/*.ts`, which S5.11 scans). Oracle total 119 → 120.

**Gates (cloud container, no DB):** `pnpm typecheck` exit 0 · `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` exit 0 (40/40) · `pnpm exec tsx scripts/fitness-pos.mts` (no env) exit 0 (7/7). DB oracles not run (no DB access) — controller.

**Controller browser pass:** flag OFF — `/pos/register` at 1440/1024 shows the pinned 288 px menu (or the rail only if the user chose collapsed), normal page padding, ‹ collapse works and is remembered; 390 = topbar ☰ + drawer as on main; compare against a main deploy. Flag ON — 1440/1024 rail from first paint (hard reload, no 288→56 jump), › opens the overlay menu; 390 unchanged (rail is lg+ only). Also: kanban board still rails; flag-ON shop with no linked unit shows padded empty state.

## B2.2 — fixes from the independent B2 review (base `b6338724`)

| Item | Change |
|---|---|
| S1 | `addLine`/`addProduct` update via `updateCart(prev => …)` (functional `setCart`; line key made outside the updater for StrictMode). `pick`/add read `frozenRef`. `billGen` ref bumped in `resetBill`; the scan result is dropped if the generation changed or the screen froze while awaiting. Search term cleared only if unchanged. |
| S2 | `openPay` no-op when a pay layer exists (`layersRef` + functional `setLayers` guard — double tap / F4+click cannot stack nor wipe the open dialog's error). Background wrapped in `<div className="contents" inert={layers.length>0}>`; every non-top layer wrapped `inert`. `RegisterDialog` traps focus (Tab/Shift+Tab cycle, `focusin` pull-back to the scrim, inactive when under `[inert]`); initial pull goes to the scrim (`tabIndex=-1`), not the first input — no touch keyboard pop. |
| S3 | Cart action row (`pos-reg-bill-discount` / `-note` / `-tax-invoice`) h-10 at every width (was h-9 below xl). Stock-warning keep/reduce were already `h-10` primary/ghost, gap 8 = spec §4/row 333 — unchanged. Main buttons untouched (≥44). |
| N1 | `InterimPayDialog` gets `quotePending` (= `!quoteFresh`): confirm disabled, label `common.loading`. |
| N2 | `beforeunload` guard while `payPhase` is `sending` or `unknown`. (Client-side Next navigation via topbar/rail links is not covered by `beforeunload`; the scrim covers those links visually — z-50 over the topbar.) |
| N3 | Scan `none` → toast `search.noResult {q}`; `choose` → candidates placed in the grid (catalog seq bumped, `nextCursor` null) + toast `search.chooseOne {count}` (new th+en pair); scan refusal → toast via `refusalMessageKey`. Status poll got a sequence guard. |
| N4 | Global Esc returns early on `e.isComposing`. |

**ORACLE-EDIT:** `P1.3-S5.20` [static, no DB] — source markers for S1/S2/S3/N1–N4. Simulated standalone: RED on `b6338724` (all 10 sub-flags), GREEN now. S5.19 still green. Total 120 → 121.

**Gates:** typecheck exit 0 (1 run) · fitness no-env 40/40 exit 0 · fitness-pos no-env 7/7 exit 0 · no Thai literal outside comments in touched register files.

**Browser checks for the controller:** see the B2.2 report (scan race, double pay, focus trap, quote-pending confirm, beforeunload, scan none/choose, IME Esc, 1024/768 action-row height).

## B2.3 — reviewer findings on `920befb9`

- **R1 (regression of B2.2 S2):** `focusSearch()` called next to `pop()` / `setLayers([])` ran while the background was still `inert` ⇒ no-op ⇒ first scan of the next bill lost. Removed the 6 dead calls (applyLine, removeLine, nextSale, custom item, open price, clear bill); one effect on `layers.length` refocuses search after the commit in which the last layer closes (covers Esc/scrim/close too). `focusSearch` still skips touch-only pointers (no keyboard pop). The grid-tap `addProduct` call (no layer open) stays.
- **N-a:** quote failed for the current cart ⇒ `quotePending` false, `quoteError` (code + mapped `errors.*` key) passed to `InterimPayDialog`; shown in the existing error card (`pos-reg-paydlg-error`, submit error takes precedence); Confirm disabled.
- **N-b:** `page.tsx` renders V2 only when `sys.active && posRegisterV2On(...)` (layout loads active systems only) ⇒ page and shell agree; inactive flag-on POS = legacy screen without rail.
- **ORACLE-EDIT:** `P1.3-S5.20` gains `r1` (red if `focusSearch(` follows `pop()`/`setLayers([])` within 2 lines, or no `layers.length` effect calling it) and `na`; `n1` loosened to `quotePending={!quoteFresh…`. Simulated: GREEN now · RED on `920befb9` (r1, na) · RED on `b6338724` (all).
- **Gates:** typecheck 0 · fitness no-env 40/40 · fitness-pos 7/7.

## R4 — builder fixes K1–K5 (base `ecd16a23` · oracle untouched)

- **K1** `register.ts`: client key must match `/^[A-Za-z0-9_-]{8,100}$/` (colon ⇒ `reg2:` from the client = VALIDATION); `regParseSubmit` returns the stored key `REG_KEY_PREFIX ("reg2:") + key`, used for the lookup, `createSale` and the P2002 re-read. Legacy `actions/pos.ts` untouched (O23).
- **K2** `regDuplicate`: conflict details only when the found sale is `sourceModule POS` + same `systemId` + same `unitId` as the request (the actor passed `regScope` for that unit ⇒ visible); otherwise `regRefuse("IDEMPOTENCY_CONFLICT")` — bare, no saleId/receiptNo/saleStatus keys. Client: bare conflict shows the conflict card without the bill line (`saleStatus: null`), "new bill" ⇒ `resetBill`.
- **K3** client: `setIdemKey(newKey())` only in `resetBill`; the refusal branch of `send` keeps the key (removed rotation). Server path unchanged (unique key + P2002 re-read) — S3.52 proves it on the VPS.
- **K4** cash-received check (`cash > 0 && (received null || < cash)` ⇒ PAYMENT_MISMATCH) moved BEFORE the idempotency lookup; negative/non-integer stays VALIDATION in `regParseSubmit`. Order: scope → parse → ⑤ cash → ① key → ② price → ③ PRICE_CHANGED → ④ Σ. Refusals carry no changeSatang/saleId.
- **K5** `RegisterScreen`: `pos-reg-pending:${systemId}:${unitId}` in `sessionStorage` = `{v, idempotencyKey, sale, phase}` saved on send ("sending") and on unknown ("unknown"); removed on ok / conflict / refusal / `resetBill`. On mount a stored request restores key + payload, opens the pay dialog in "unknown" and retries immediately with the same key (StrictMode double effect guarded by `sendingRef`). Every storage access in try/catch. Cart lines are not rebuilt; the dialog shows `expectedGrandTotalSatang` and the line count from the stored payload.
- **m2 — deploy checklist line (controller to copy into `ledger/POS-DEPLOY-REQUEST…`, which lives outside this tree):** "When `settings.pos.registerV2` is turned on for a tenant, every STAFF holding the `pos.*` wildcard gains `pos.sale.priceOverride` (open price + custom item) at that moment (S3.47/S3.54 ruling) — review role grants first."
- **Statics (standalone copy of the oracle's S5.20–S5.22 block):** S5.20 PASS · S5.21 PASS · S5.22 PASS; S5.19 PASS. DB checks S3.50–S3.54 not runnable here.
- **Gates:** typecheck 0 · fitness no-env 40/40 · fitness-pos 7/7.
- **Edge for the VPS/browser run:** a restored request that comes back with a definitive refusal (e.g. PRICE_CHANGED because the first attempt never committed) leaves an empty cart with the pay dialog open in "form" (Confirm shows loading); the cashier closes it and rings the bill again (key unchanged until resetBill).
