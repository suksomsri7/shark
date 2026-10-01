# P1.3 — oracle round 3 (`scripts/qc-pos-p1.3.mts`) — oracle writer notes

> Branch `wip/pos-p1.3` · tree `/root/projects/shark-pos-p11` · base `a670d313` (accepted P1.1a + `hotfix/pos-page-authz`) · 1 Oct 2026
> Brief: `ledger/pos-briefs/pos-brief-P1.3.md` (Q1–Q29 rulings + "Order of work" item 1 + binding Addendum) · LANE-RULES · COMMON · spec `pos-spec-P1.3-register-ui.md` (brief wins where they differ).
> Scope of this round: tests only. No `src/`, `prisma/` or other script touched. New names → `ledger/wo-notes/pos-P0.3-register.md` "Round 3".
> Logs (not committed, `.qc-shots/` is git-ignored): `.qc-shots/pos/p1.3/r3-{list,skip,force,fitness-env,fitness-noenv}.log`.

## 1. Result in one line
76 → **101 checks** (25 added · 5 rewritten · 0 removed). `--list` 101 ids, no DB · normal run = `⏭️ SKIPPED` exit 0 · `QC_FORCE=1` = exit 1, **5/101 green** (regression guards + residue), 96 red, every one `MISSING:<export>` / missing file / missing key — no harness crash, `a5.drift []`, fingerprint unchanged.

## 2. What changed vs round 2
### Added (25)
| id | proves | brief ruling |
|---|---|---|
| S1.23 | every product carries `requiredOptionGroupCount` (Int, ≤ optionGroupCount); fixture REQP (required + optional group) = 2/1, OPTP (optional only) = 1/0, plain = 0/0 | Q6 |
| S1.24 | every product carries `soldOutReason` with `null ⇔ soldOut === false`; 86 → `UNAVAILABLE`, tracked stock-out → `NO_STOCK`; low stock / untracked / unpriced → `null` | Q9 |
| S1.25 | paging on a >500 catalogue: no `limit` = 100 + `nextCursor`; `limit: 1000` = exactly 500 + `nextCursor` (clamp proven, not just "≤"); pages 1–3 at limit 100 concatenated = the first 300 ids of the limit-500 read in the same order (no dup, no gap, stable order); last page `nextCursor` null; full walk = S1.17 walk | Q21 |
| S1.26 | cursors taken from another branch of the same POS (every page of unit 2) and from another tenant (resto, limit 1) used at the sandbox branch: refused (`VALIDATION`/`NOT_FOUND`, returned not thrown) or results ⊆ what the sandbox branch sees, never the unit-2-only / warehouse-Y product | Q21 |
| S3.26 | required-option product refused at quote (no totals) and submit (no sale); optional-only product quotes and sells at base price 5,500 | Q6 |
| S3.27 | `NO_STOCK` product still sells (default ALLOW_NEGATIVE): PAID, 1 OUT, onHand 0 → −1; `UNAVAILABLE` product refused at quote with no totals | Q9 · stock rule |
| S3.28 | STAFF without `pos.sale.priceOverride`: quote of a custom line and of an open-price line → `PERMISSION_DENIED`, no totals; STAFF with the key → quote + PAID at 2,000 / 4,200; MANAGER (role default, no explicit key) → PAID; key present in `src/lib/core/permissions.ts` | Q8 |
| S3.29 | client-supplied `couponCode` / `couponDiscountSatang` on quote and on submit → `VALIDATION` (4 cases), no totals, no sale, `CouponRedemption` count unchanged | Q12 |
| S3.30 | quote `lines[i]` aligned to input order for [product+discount, custom line, product×2 with fake client price 1]: `{productId?, unitPriceSatang, grossSatang, discountSatang, lineTotalSatang}` all Int, server price used; `subtotalSatang` = Σ gross before line discounts (25,500) | Q22 · Q7 |
| S3.31 | price changes between quote and submit (setPrice 5,000 → 5,600): submit with the stale per-line expectation and with the stale total → refused `PRICE_CHANGED`/`PAYMENT_MISMATCH`, no sale; re-quote shows 5,600 in `lines[0].unitPriceSatang`; paying the new total → PAID at 5,600; zero lines stored at 5,000 | money: re-read at submit |
| S3.32 | Σ payMethods == grandTotal with two methods: CASH + PROMPTPAY exact → PAID with 2 payment rows summing to the total; short by 1 satang → `PAYMENT_MISMATCH`; negative method compensated by an over-payment, fractional satang, empty list → refused; no sale in any refused case | money: Σ payMethods |
| S3.33 | discount ceiling at **quote** for STAFF (10%): line 15%, bill 15%, bill 651 on 6,500 (10% + 1 satang) → `DISCOUNT_EXCEEDS_LIMIT` with no totals (never clamped); exactly 650 → 5,850; owner line discount > line / bill discount > total → `LINE_DISCOUNT_EXCEEDS_LINE` / `BILL_DISCOUNT_EXCEEDS_TOTAL` at quote and submit, no sale, 0 negative lines/sales in the sandbox | money: ceiling · line ≥ 0 |
| S3.34 | qty at the server: 0, −1, 1.5, 10000, "2" → `INVALID_LINE`/`VALIDATION`; 9,999 quotes (gross 9,999×6,500); submit qty 10000 and a 201-line cart refused with no sale; 201-line quote → `TOO_MANY_LINES` | money: qty bounds |
| S3.35 | product id of another branch (unit-scoped to unit 2), of another warehouse (Y), of another tenant → quote and submit refused `NOT_FOUND`/`PRODUCT_NOT_FOUND`, no totals, product name not echoed, no sale; positive control: the unit-2 product quotes at unit 2 for 1,500 | branch scope |
| S3.36 | refusals are **returned**, never thrown, at service level: `q` with NUL, malformed cursor, `limit: 0`, quote `lines: "x"`, submit input `null`, status `unitId` with NUL → `{ok:false, code, message}` (or a safe `ok`), never a throw | Addendum |
| S4.5 | `registerStatus.user.role` = `OWNER`/`MANAGER`/`STAFF` from the actor; `roleLabel` still a human label | Q23 |
| S4.6 | `registerVatConfig(ctx)` = `{mode, rateBp}` equal to the quote's `vatMode`/`vatRateBp` at the sandbox branch and at the seeded Silom branch; mode ∈ INCLUDED/NONE | Q25 |
| S5.11 | flag gating [static]: `registerV2` compared strictly (`=== true` / `!== true`) and read from `settings…pos…registerV2` (in `page.tsx` or a POS module); `page.tsx` renders both `<RegisterScreen>` and `<PosRegister>`; HF-POS-PAGES guard tokens (`requireTenant`, `posRegisterView(`, `notFound()`) kept; `scripts/seed-pos-qc.mts` sets `registerV2: true` | Q4 · Q28 |
| S5.12 | legacy untouched [static, regression guard]: sha256 of `register-ui.tsx` and `actions/pos.ts` equal the base; the 3 legacy inventory rows still present | Q4 · brief "never touch" |
| S5.13 | `refusalMessageKey(code)` maps every vocabulary code to the spec §4.6 key, `BUSY → errors.busy`, `INTERNAL` and unknown codes → `errors.unknown`; `CONFLICT`/`OPTIONS_REQUIRED`/`UNKNOWN` map to some existing key; every returned key exists in th **and** en `pos.json` | Addendum · spec §4.6 |
| S5.14 | `register-shared.ts` pure (value imports only `./*-shared`, `@/lib/modules/pos/*-shared`, `@/lib/ui/money`), constants `REGISTER_MAX_LINES 200 · REGISTER_MAX_QTY 9999 · REGISTER_LOW_STOCK 5 · REGISTER_PAGE_SIZE 100`, `moneyText(8550) = "฿85.50"`, `62500 → "฿625"`, `-1000 → "−฿10"` | Q10 · spec §3.1 · §5 |
| S5.15 | `register-actions.ts` [static]: starts with `"use server"`; every export is `export async function`; the four spec actions exist; every action reaches `requireTenant` and a `catch` (directly or through a local helper); no `throw`; any `checkCatalogWrite(` in P1.3 files (and `register.ts`) takes a non-literal first argument (session membership, not a built object) | Addendum · G10 |
| S5.16 | P1.3 files exist (`pricing-shared`, `register-shared`, `register-actions`, `src/components/pos/register/*`) and none of them (nor `page.tsx`) mentions `CATALOG_SYSTEM_ACTOR` or imports from `scripts/`; fitness F15.1, F15.5, F15.6 green | Addendum F15.5/F15.6 · COMMON 3 |
| S5.17 | every `"use client"` register file has no value import of a server module (`pos/register`, `catalog`, `service`, `index`, `core/db`, `core/context`, `@prisma/client`, `next/headers`, other modules' facades) | spec G9 |
| S9.2 | fingerprint (row count + sha256 of all columns) of the QC tenants' pre-existing PosProduct, PosCategory, InvItem, AppSystem (incl. `settings` → the flag), AppSystemUnit, BusinessUnit, Membership, PosReceiptCounter: before = after | brief item 1 "residue check" |

### Rewritten (5)
| id | change | reason |
|---|---|---|
| S3.2 | the submit no longer carries the client `unitPriceSatang: 1` from S3.1's cart (strips it; the quote still gets it) | with Q22 a stale/tampered per-line price may legitimately be refused `PRICE_CHANGED`; the "happy sale" must not depend on that choice. Tampering at submit stays covered by S3.5. |
| S3.12 | foreign-tenant / archived / bogus product id accepts `PRODUCT_NOT_FOUND` **or** `NOT_FOUND` | the brief writes "`NOT_FOUND`", the ratified vocabulary + spec §4.6 write `PRODUCT_NOT_FOUND` — question Q-R3-3 below. Money property (refused, no sale) unchanged. |
| S3.16 | same key + different payload ⇒ **only** `IDEMPOTENCY_CONFLICT` (was "original sale or conflict"); adds a different-payMethods variant and a byte-identical retry that must return the original sale | controller task text "same key different payload ⇒ IDEMPOTENCY_CONFLICT"; returning the old sale silently lets a till believe a qty-3 bill was paid while qty 1 was recorded |
| S5.2 | also fails when a `pos.register.*` key exists in only one locale | acceptance A6 "th/en key parity", spec §6.1 "identical key tree" |
| S5.6 | ORACLE-EDIT per Q4: `register/page.tsx` debt must be 0 (or its debt row gone); `register-ui.tsx` debt may stay ≤ baseline 22 while the flag exists (was: both 0 or file gone) | Q4 ruling |

### Removed
None. Header comment block extended with a round-3 map (ruling → check ids). Residue counts (S9.1) now also cover `menuOptionGroup`, `menuOptionChoice`, `posProductOptionGroup`, `recipeLine`.

## 3. Check catalogue by group (101)
Round-1/2 checks keep their meaning (see `pos-P0.3-register.md` §4 for the one-line table); the rulings they enforce:
- **S1 grid/search (26)** — S1.1–S1.22 (R2 R3 R4 R8, C2 C3 C5 C6) · S1.23 Q6 · S1.24 Q9 · S1.25–S1.26 Q21.
- **S2 pure pricing (14)** — S2.1–S2.14 (spec §7.1, VAT bill-level, ceiling refusal not clamp; `priceCart` keeps `couponDiscountSatang` per Q12).
- **S3 server quote/submit (35)** — S3.1/S3.5/S3.31 re-read prices (R2 + money rule) · S3.2/S3.6/S3.32 Σ payMethods · S3.14/S3.15/S3.16 idempotency (S3.15 = 10 parallel on separate PrismaClients × 3) · S3.10/S3.11/S3.12/S3.24/S3.35 branch/tenant scope (R8) · S3.7/S3.33 ceiling · S3.8/S3.23/S3.28 Q8 · S3.21/S3.34 line/qty bounds · S3.17/S3.18 races · S3.25 C2 · S3.26 Q6 · S3.27 Q9 · S3.29 Q12 · S3.30 Q22/Q7 · S3.36 Addendum · S3.4 R5 · S3.13 member scope · S3.20 X8 · S3.22 legacy createSale (F15.2 behaviour).
- **S4 status (6)** — S4.1–S4.4 · S4.5 Q23 · S4.6 Q25.
- **S5 static (17)** — S5.1–S5.10 (spec G1–G8, F15.2) · S5.11/S5.12 Q4 · S5.13 Addendum i18n mapping · S5.14 Q10 + shared helpers · S5.15 Addendum actions · S5.16 Addendum F15.5/F15.6 · S5.17 G9.
- **S6 (1)** — S6.1 P1.6 BLOCK policy, own SKIP guard (unchanged).
- **S9 residue (2)** — S9.1 counts · S9.2 fingerprint.
X-coverage: `-=41 X4=29 X2=11 X3=9 X1=3 X6=3 X8=1 X7=1 X11=3`.

Money rules → the check that catches a violation: re-read at quote = S3.1, S3.30 · at submit = S3.5, S3.31 · Σ payMethods exact = S3.6, S3.32 · idempotency = S3.14, S3.15 (10 parallel, separate connections, ×3), S3.16 · branch/tenant scope never priced = S3.12, S3.35 (+ S3.10/S3.11/S3.24 unit scope) · ceiling refused not clamped = S2.6, S3.7, S3.33 · qty bounds = S2.11, S3.34 (+ S3.21 200 lines OK) · line ≥ 0 = S2.4, S3.33 · open price / custom only with the key = S3.8, S3.23, S3.28 · stock default sells negative = S3.18, S3.27.

## 4. Run records (all in this tree; times UTC from `date -u`)
- `--list`: `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p1.3.mts --list` → exit 0 · `qc-pos-p1.3 — 101 ข้อ` · `X-coverage: -=41 X4=29 X2=11 X3=9 X1=3 X6=3 X8=1 X7=1 X11=3` · no DB.
- normal: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.3.mts` → **exit 0** `⏭️ SKIPPED` · reasons: `pricing-shared.ts` missing · `register.ts` lacks `registerCatalog, registerScan, quoteRegisterCart, submitRegisterSale, registerStatus` · seed coffee ✅ resto ✅ · `registered: 101` · read-only A5 counts printed.
- forced: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.3.mts` (19:24:01Z → 19:24:32Z) → **exit 1**, `ผ่าน 5/101 (QC_FORCE)`, no `💥`, no fixture warning; cleanup `{"outbox":2,"audit":245,"payment":2,"line":2,"sale":2,"product":522,"category":1,"menuGroup":2,"invJournal":15,"invItem":18} · สาขา 3 · ระบบ 3`; `"a5":{"drift":[]}`.
  - **Green on the base, and why that is right**: S3.22 (legacy `createSale` path for other modules — a regression guard), S5.10 (F15.2 contract snapshot), S5.12 (legacy files byte-identical — the guard must be green until someone touches them), S9.1 + S9.2 (the oracle's own residue: it must leave QC4 as found even when everything else is red).
  - **Red and why (all "not built yet")**: S2.* `MISSING:priceCart` (S2.13 `file:false`) · S1.*/S3.*/S4.* `MISSING:registerCatalog|registerScan|quoteRegisterCart|submitRegisterSale|registerStatus|registerVatConfig` — the sandbox itself is built through the accepted P1.1a catalogue (S3.31's `setPrice` reports `set true`; S3.18 shows onHand 1 untouched) · S5.1 "ขาด 51" keys · S5.2 "ยังไม่มีคีย์ pos.*" · S5.3/S5.7/S5.9 "ยังไม่มีไฟล์หน้าขายใหม่" · S5.4 36 testids missing · S5.5 23 rows missing · S5.6 `page.tsx=5 · register-ui.tsx=22` (only page.tsx is red) · S5.8 no `pos-reg-search` · S5.11 `strict:false path:false screens:false guard:true seed:false` · S5.13/S5.14 `register-shared.ts` missing · S5.15 `register-actions.ts` missing · S5.16 P1.3 files missing (fitness part already green) · S5.17 no `"use client"` register files · S6.1 `[ยังไม่มีโค้ด oversellPolicy]` (forced past its own guard).
- regex sanity for the new static checks (positive + negative samples, scratch script outside the repo): flag strict/path, G9 import classifier, scripts-import, `checkCatalogWrite` argument, action-file export/`requireTenant`/`catch` (incl. helper-wrapped actions) — all as intended.
- single-file type-check of the oracle (scratch tsconfig extending the repo's, `--listFiles` confirms the file was included) → exit 0; full `pnpm typecheck` once at the end → see §8.
- fitness: `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` → exit 0 `{"total":40,"passed":40,"findings":[]}` · `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` → exit 0 `{"total":40,"passed":40,"findings":[]}`.

## 5. Questions for the controller (not guessed silently — the oracle's current tolerance is stated)
1. **Q-R3-1 Required-option refusal code** (Q6, server): `OPTIONS_REQUIRED` (proposed), `INVALID_LINE` or `VALIDATION`? S3.26 accepts all three today; narrow it on ratification. Spec §4.6 only names the client key `errors.optionsRequired`.
2. **Q-R3-2 What is the "submitted expectation" behind `PRICE_CHANGED`?** The brief says "`PRICE_CHANGED` when the submitted expectation differs", but the spec's cart (§3.3) sends no per-line price for catalogue lines, so the only expectation is the payment total (→ `PAYMENT_MISMATCH`). Options: (a) per-line `unitPriceSatang` on submit = expectation; (b) an `expectedGrandTotalSatang` field; (c) none — `PAYMENT_MISMATCH` covers it. S3.5/S3.31 accept `PRICE_CHANGED | PAYMENT_MISMATCH`; the safety property (no sale at a stale price, sells at the new one after re-quote) is strict.
3. **Q-R3-3 Product from another branch/tenant**: brief "`NOT_FOUND`" vs ratified vocabulary/spec table "`PRODUCT_NOT_FOUND`". S3.12/S3.35 accept both; the UI key differs (`errors.notFound` "this branch isn't available" vs `errors.productNotFound` "an item was removed") — `PRODUCT_NOT_FOUND` reads better to a cashier. Please pick one.
4. **Q-R3-4 Payment types through the register**: the interim dialog is CASH + PROMPTPAY. Should `submitRegisterSale` refuse `DEPOSIT` / `ROOM_CHARGE` (they need a `refSaleId`/folio and are other modules' paths) and `TRANSFER`? And should `cashReceivedSatang` below the cash portion be refused? Untested today.
5. **Q-R3-5 Mapping keys outside the spec table**: `CONFLICT` (catalogue) and `OPTIONS_REQUIRED` — S5.13 only demands an existing key. Which keys?
6. **Q-R3-6 `pos-reg-coupon-line`** is still required in code by S5.4 although Q12 defers coupons (the row can never render in P1.3). Keep it as a P1.12 seam (current) or drop it from S5.4?
7. **Q-R3-7 Legacy byte pins (S5.12)** rot if a later merge legitimately edits `register-ui.tsx` / `actions/pos.ts` (e.g. a CRM change to `pos-deal-select`, or a POS hotfix). Intended as a tripwire = ORACLE-EDIT with a new hash; confirm that is wanted rather than "diff vs merge-base" (the merge-base of `session/pos` does not contain `hotfix/pos-page-authz`, so a merge-base diff would be red on the base).
8. **Q-R3-8 `CATALOG_SYSTEM_ACTOR` "not in register code at all"**: S5.16 applies it to the new P1.3 files and `page.tsx`, **not** to `register.ts`, because P1.1b edits `setItemSalePrice` in the same file in parallel (`register.ts` stays under fitness F15.5). Confirm.
9. **Q-R3-9 `limit: 0`, malformed cursor**: refuse (`VALIDATION`) or ignore (first page)? S3.36 accepts either as long as nothing is thrown.
10. **Q-R3-10 Thai literals in `page.tsx`'s legacy branch**: spec §4.7 lets the legacy wrapper stay or move into a legacy component; A6 says "no Thai literal in register files". S5.3 only scans files carrying a `pos-reg-` testid, so a `page.tsx` that renders `<RegisterScreen>` (no testid of its own) with a Thai legacy header passes. Is that the intended reading?
11. **Q-R3-11 Option groups have no catalogue API in P1.1a**: the Q6 fixture writes `MenuOptionGroup`/`PosProductOptionGroup` rows directly (like `qc-pos-p1.1`), and 300 filler `PosProduct` rows via `createMany` for the >500 clamp. Ratify, or require an API (P1.2)?

## 6. Not testable here (needs the running app or a person) — CONTROLLER-RUN / reviewer
- Server-action wrappers end to end (session → actor, a STAFF session cannot reach OWNER behaviour through the action, `{ok:false}` survives Next's production error masking) — S5.15 is static only.
- The flag at runtime: a POS with `registerV2` absent/`"true"`/`false` renders today's screen pixel-identical; `qc-pos-register` + `qc-crm-c2.7` identical before/after (acceptance A2).
- Visual parity, touch sizes, hot keys, autofocus, offline banner, pay-dialog idempotency-key lifecycle (spec §3.4 unknown-result retry) — visual-pos + reviewer.
- BUSY / INTERNAL actually produced by the catalogue under lock contention and shown as `errors.busy` / `errors.unknown` (only the mapping is tested).
- `soldOutReason` precedence when a product is both 86 and out of stock (not specified; not asserted).

## 7. Files the builder will have to create/change (my reading of brief + spec + oracle)
New: `src/lib/modules/pos/pricing-shared.ts` (`priceCart`) · `src/lib/modules/pos/register-shared.ts` (types, constants, `refusalMessageKey`, `moneyText`, `displayName`, `cartToQuoteInput`, `cartToPriceInput`) · `src/lib/modules/pos/register-actions.ts` (`"use server"`, 4 actions) · `src/components/pos/register/*.tsx` (spec §3.1 list: RegisterScreen, RegisterTopContext, RegisterModeTabs, SearchRow, CategoryChips, ProductGrid, ProductCard, CartPanel, CartLine, LineEditor, BillDiscountDialog, CouponDialog (soon), CustomItemDialog, OpenPriceDialog, ClearBillDialog, InterimPayDialog, SaleDone, MobileCartBar, MobileCartSheet, RegisterStatusBar) · `src/messages/th/pos.json`, `src/messages/en/pos.json`.
Changed: `src/lib/modules/pos/register.ts` (new exports in their own region: `registerCatalog`, `registerScan`, `quoteRegisterCart`, `submitRegisterSale`, `registerStatus`, `registerVatConfig`) · `src/app/app/sys/[id]/pos/register/page.tsx` (flag gate, guard verbatim) · `src/i18n/request.ts` (one hunk) · `src/lib/core/permissions.ts` (one line `pos.sale.priceOverride`) · `scripts/pos-ui-inventory.json` (rows + `page.tsx` debt → 0) · `scripts/seed-pos-qc.mts` (one hunk `registerV2: true`) · `src/components/app-shell/NavRail.tsx` + `Topbar.tsx` (Q1/Q2 hunks).
Untouched (S5.12): `src/lib/modules/pos/register-ui.tsx`, `src/lib/actions/pos.ts`.

## 8. Final gates
- typecheck (once, at the end): `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (19:26:06Z → 19:28:14Z incl. lock) → **exit 0**, `tsc --noEmit` no diagnostics.
- fitness with/without env: exit 0, 40/40 (§4).
- commit: one commit on `wip/pos-p1.3` + push of that branch only.
