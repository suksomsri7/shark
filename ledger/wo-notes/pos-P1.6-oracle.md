# POS P1.6 — oracle notes (`scripts/qc-pos-p1.6.mts`)

Oracle writer · cloud run · 4 Oct 2026 · base `wip/pos-p1.6-oracle` = `session/pos` 315da19e (P1.3 merged).
Container has **no DB** (TCP 5432 blocked), so the suite has never run against data. What was verified here: esbuild syntax, `pnpm exec tsx scripts/qc-pos-p1.6.mts --list` (47 ids, exit 0, no DB), and the no-DB groups (V1 V2 U4 R2 R3) run through a scratch harness against the current tree. All five are red, each for the expected reason (details below). The first real run is CONTROLLER-RUN on the VPS:

```
bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.6.mts              # expect SKIPPED, exit 0
QC_FORCE=1 bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.6.mts    # expect 8 green / 40 red, exit 1, Z1+Z2 green
```

House style is copied from `qc-pos-p1.3.mts`: the `CHECKS` registry and `--list`, the whole-suite SKIP gate (`QC_FORCE=1` runs it anyway and the result must be red for the right reason, never a crash), `call()`/`callSync()` wrappers, the `qc-p1.6-<rand>` tag plus `KTAG` for register keys, sandbox units and systems in the QC coffee tenant, cleanup in `finally`, the A5/Z1 row counts plus receipt-counter sum, the Z2 fingerprint, and `JSON_SUMMARY`.

What I added on top of the P1.3 style:
- **Strict QC4 write gate.** `assertQc4BeforeWrite()` runs immediately before the first `create`. `DATABASE_URL` (and `DIRECT_URL` if set) must contain `ep-frosty-lab`. `POS_QC_ALLOW_HOST` does not bypass it.
- **New columns and enums are detected, not assumed.** Detection uses the Prisma DMMF, falling back to `information_schema` when the DMMF is absent. Enum values come from `pg_enum`. The skip reason states client ✓/✗ and DB ✓/✗ separately, so "generated but not migrated" can be told apart from "migrated but not generated".
- **`quietTx`.** Any sale on a POS linked to an accounting book runs inside the oracle's own tx. The `pos.sale.paid` outbox row is deleted before commit, and a non-ok result rolls the whole tx back. This means no journal entry or AccountDocument is ever posted to a real or sandbox book (V3–V5, K, U2, U3).

## Check list (48)

| id | X | what |
|---|---|---|
| **V1** | X4 | `splitIncludedVat` equals the bridge formula `gross − Math.round(gross/(1+r/10000))` on 0…2000 and 10,000 log-random grosses up to 10⁹, at rates 0/100/300/500/700/900/1000/1500 bp. base+vat = gross, all Int. At 700 bp it also equals priceCart INCLUDED VAT. |
| **V2** | X4 | Static: `account/index.ts` imports `@/lib/money/vat` and has no inline `Math.round(gross / (1 + …`. `service.ts` has no `const vat = 0` and calls the helper. `vat.ts` is pure. |
| **V3** | X4 | createSale on a POS linked to a VAT-registered 7% book: `vatSatang = helper(grand)` for 0 · 1 · 15 · 6500 · 10700 · (6500 − bill discount 500). grandTotal is unchanged. |
| **V4** | X4 | vat = 0 when the POS is unlinked, when the book is not VAT-registered, and when `AccountSystemLink.enabled = false`. |
| **V5** | X4 | Register on a VAT POS: stored vat = quote vat = helper(grand). |
| **T1** | X4 | 0-baht bill with empty payMethods is PAID with 0 payment rows and vat 0, through both legacy createSale and the register. |
| **T2** | X4 | 1-satang splits CASH 1 + PROMPTPAY 1 + TRANSFER 1 + CARD rest: 4 rows, exact multiset, Σ = grand. |
| **T3** | X4 | 10 methods (duplicate types allowed) is PAID with 10 rows. 11 methods is `SPLIT_INVALID` with no bill. |
| **T4** | X4 | Σ ±1 is `PAYMENT_MISMATCH`. An entry of 0, −1 (compensated) or 1.5 is `VALIDATION`. No bill in any case. |
| **T5** | – | CARD `reference` is stored verbatim (`PosPayment.reference` if that column exists, otherwise `.note`), through the register and through legacy createSale. |
| **T6** | X4 | Register accepts CASH, PROMPTPAY, TRANSFER and CARD. TRANSFER-only and CARD-only are PAID. DEPOSIT, ROOM_CHARGE and garbage are `VALIDATION`. |
| **T7** | X4 | `closeDaySummary.byMethod` includes CARD equal to the sum of CARD payments. `cashInDrawer` excludes card. `closeDayBills` label is not "—". |
| **C1** | X4 | Register: CASH 4000 + PROMPTPAY, received 5000 → change 1000. The CASH `PosPayment` row stores `tenderedSatang` 5000 / `changeSatang` 1000; other rows store none. PROMPTPAY-only has no CASH row. |
| **C2** | X4 | createSale `payMethods[].cashTenderedSatang` 10000 on CASH 6500 → CASH row `tenderedSatang` 10000 / `changeSatang` 3500. |
| **C3** | X4 | Tendered 1 satang below the cash portion is `PAYMENT_MISMATCH` in both the register and createSale. No bill, and the unit's counter does not move. |
| **C4** | X4 | A legacy caller that sends no tendered amount is still PAID. |
| **K1** | X4 | Off (no settings, or `enabled:false` with a rate): serviceCharge 0, tip 0, totals equal today's priceCart. Legacy rows store 0/0. |
| **K2** | X4 | SC 10% on: 6500 → 650 / 7150. Stored with vat 468 (SC is inside the VAT base). Paying 6500 is `PAYMENT_MISMATCH`. |
| **K3** | X4 | SC is rounded half-up on the total after discounts: 3335 → 334 (not 333). 13000 − 1000 → 1200 / 13200. Client `priceCart({serviceChargeBp})` gives the same result. |
| **K4** | X3 | Enabling tip with no ledger account, or with a ledger of another book (sandbox book N), is `TIP_ACCOUNT_REQUIRED` (as data) and tip stays off. A ledger of the book linked to POS-V turns it on. Fixture creates both ledgers (code 2195, LIABILITY) in the sandbox books. |
| **K5** | X4 | Tip 500 on 6500: `tipSatang` 500, grand 6500, vat 425 (not 458), Σpay 7000. Paying 6500 is `PAYMENT_MISMATCH`. |
| **K6** | X4 | Tip off but `tipSatang` 500 sent is `VALIDATION`. Tip on but −1, 1.5 or "500" is `VALIDATION`. |
| **K7** | X3 | STAFF changing settings is `PERMISSION_DENIED`. rateBp 1.5, −1 or 10001 is `VALIDATION`. Settings are unchanged afterwards. |
| **K8** | X4 | SC is on at the POS, but a legacy createSale (restaurant-style, with its own SC line) stores serviceCharge 0 and grand 6600. |
| **K9** | X3 | POS not linked to any book (POS-S): enabling tip, even with an existing ledger id, is `TIP_ACCOUNT_REQUIRED` (as data); tip stays off. |
| **N1** | – | Bill note of 500 chars is stored verbatim (register and createSale). 501 is `VALIDATION`. |
| **N2** | – | Line note is stored on `PosSaleLine.note`. 501 is `VALIDATION`. |
| **I1** | X1 | Legacy, same payload (including reordered lines) on a PAID sale: same saleId, `status:"PAID"`, 1 bill, 1 payment set. |
| **I2** | X1 | Legacy, different qty, price, pay type or split on a PAID sale: `IDEMPOTENCY_CONFLICT`, 1 bill, total unchanged. |
| **I3** | X1 | Legacy, same payload on a VOIDED sale: same saleId, `status:"VOIDED"`, no new bill, counter unchanged. |
| **I4** | X1 | Legacy, different payload on a VOIDED sale: `IDEMPOTENCY_CONFLICT`. |
| **I5** | X1 | Register matrix (P1.3 contract kept): PAID+same → dup. PAID+diff → CONFLICT+saleId. VOIDED+same or diff → CONFLICT + saleStatus VOIDED. |
| **I6** | X1 | Restaurant checkout → voidCheckout → re-checkout with the same items ends **PAID** on a new sale (the caller mints a new key when the stored sale is VOIDED): exactly one PAID bill for the unit, and the first bill is still VOIDED. |
| **I7** | X6 | Legacy, same key from 10 connections × 3 rounds: all ok, one saleId, 1 bill per round (no P2002 reaches the caller). |
| **U1** | X2 | Explicit wrong pair (unit linked to another POS) while that unit's receipt counter is locked from another connection: `UNIT_SYSTEM_MISMATCH` without blocking (< 1.5 s), no bill, counter unchanged after release. |
| **U2** | X2 | Tenant with 2+ POS, unit linked to no POS: `UNIT_SYSTEM_MISMATCH`, message contains "เลือกจุดขายก่อน", no bill, no counter row. |
| **U3** | X2 | Tenant with exactly 1 POS (QC resto), unit not linked: PAID as today. A correctly linked pair (sandbox) is PAID. |
| **U4** | – | Static: the guard string is present in `service.ts`. The createSale call-site inventory matches 18 sites in 15 files (table below). |
| **B1** | X4 | BLOCK, stock 2, sell 3: `STOCK_INSUFFICIENT`, no bill, stock 2, OUT 0, counter unchanged. Sell 2: PAID, stock 0, exactly 1 OUT for the sale. An untracked product still sells. |
| **B2** | X4 | BLOCK through a legacy createSale line with `itemId`: stock 1, sell 2 → `STOCK_INSUFFICIENT`, no bill, stock 1. |
| **B3** | X6 | BLOCK, last unit, 10 lanes × 3 rounds: PAID 1, SI 9, stock 0, no other codes (deadlock/BUSY/INTERNAL/THROW). |
| **B4** | X6 | BLOCK, two items (5 each), lanes alternate [X,Y]/[Y,X], 10 × 3: PAID 5, SI 5, stock 0/0, no deadlock. |
| **B5** | X4 | No policy, or `ALLOW_NEGATIVE`: oversell is PAID and stock goes to −1 (today's behaviour). |
| **R1** | – | Eight collected refusals (T3, C3, K4 ×2, K9, K6, N1, B1) are returned as `{ok:false, code, message}`. None is thrown. |
| **R2** | – | Static: every `src/lib/modules/pos/*actions*.ts` file has "use server", exports only async functions, has no `throw`, and has a `catch` per action. `updatePosPaymentSettingsAction` exists. |
| **R3** | – | `refusalMessageKey` maps UNIT_SYSTEM_MISMATCH, SPLIT_INVALID, STOCK_INSUFFICIENT and TIP_ACCOUNT_REQUIRED to `errors.unitSystemMismatch`, `.splitInvalid`, `.stockInsufficient`, `.tipAccountRequired`. Each key exists in th and en. en has no Thai. th unitSystemMismatch contains "เลือกจุดขาย". |
| **Z1** | – | Row counts for both QC tenants (29 models) and the receipt-counter sum are equal before and after. |
| **Z2** | – | Fingerprint of the existing QC rows (10 models, all columns) is equal before and after. |

Groups: V = VAT (R1) · T = split (R2) · C = cash (R3) · K = SC/tip (O19/O20) · N = note (R5) · I = idempotency (R6) · U = unit↔system (R7 + O21) · B = BLOCK (R8) · R = refusals (R10) · Z = residue.

## Expected results on the current base (315da19e)

**Unforced:** `SKIPPED — qc-pos-p1.6`, exit 0, `JSON_SUMMARY {skipped:true, …}` with A5 counts. Expected reasons:
- `src/lib/money/vat.ts` is missing.
- PosSale.note, serviceChargeSatang and tipSatang, and PosSaleLine.note, are missing (client ✗ · DB ✗).
- No `cashTenderedSatang` column exists.
- PosPayType has no CARD.
- `REGISTER_PAY_TYPES` lacks TRANSFER/CARD.
- `service.ts` has no UNIT_SYSTEM_MISMATCH.
- No `oversellPolicy` reader exists.
- `payment-settings.ts` is missing.

**Forced (`QC_FORCE=1`):** exit 1. Expected **green (8)**: V4, T1, C4, I5, U3, B5, Z1, Z2. These are regression guards: the behaviour they pin is already correct today and must survive the build.

Expected **red (40)**, with reasons:
- **V1** `MISSING:splitIncludedVat`.
- **V2** All 6 static findings (verified here).
- **V3, V5** Stored vat is 0 where 425/700/… is expected.
- **T2–T6** The register rejects TRANSFER, CARD and the `reference` key with VALIDATION, and caps payMethods at 2. On T4 the CARD leg makes the result VALIDATION instead of PAYMENT_MISMATCH.
- **T7** No CARD payments exist, and closeDay has no CARD row.
- **C1, C2** `PosPayment.tenderedSatang`/`changeSatang` are absent. C1's response `changeSatang` is already 1000.
- **C3** The legacy leg ignores tendered and goes PAID.
- **K1–K9** `serviceChargeSatang`/`tipSatang` are undefined, `MISSING:updatePosPaymentSettings`, and the register refuses the `tipSatang` key (VALIDATION, so K6 partly matches but still fails on the settings calls).
- **N1, N2** `note` is an unknown register key. The line note is parsed but not stored.
- **I1, I3** The result has no `status`.
- **I6** Today the re-checkout returns the VOIDED sale (same key), so it never ends PAID.
- **I2, I4** The stored sale is returned silently.
- **I7** P2002 surfaces to some lanes (REVIEW §3.5).
- **U1** The call blocks on the counter, then goes PAID on the wrong POS.
- **U2** PAID on an unlinked unit (inside `quietTx`, so nothing is posted).
- **U4** No guard string. The inventory already matches 18/15 (verified here).
- **B1–B4** Oversell goes PAID.
- **R1** Codes differ or are missing.
- **R2** Only `updatePosPaymentSettingsAction` is missing. `register-actions.ts` itself passes (verified here).
- **R3** Three keys map to `errors.unknown` and their th/en keys are missing. stockInsufficient already passes (verified here).

If Z1 or Z2 is red on the forced base run, that is an oracle cleanup bug. Report it to me.

## Names I had to invent (controller must ratify)

| name | where | note |
|---|---|---|
| `splitIncludedVat(grossSatang, rateBp) → {baseSatang, vatSatang}` | `src/lib/money/vat.ts` | Kept outside `src/lib/modules` so both `pos` and `account` can import it without a new F2 edge (account→pos is not allowed). Integer half-up and the float bridge formula agree on every V1 case (checked here), so either implementation passes. |
| createSale input `note`, `lines[].note`, `serviceChargeSatang`, `tipSatang`, `payMethods[].cashTenderedSatang`, `payMethods[].reference` | `pos/service.ts` | Additive. The oracle also sends a top-level `cashTenderedSatang` (same value) in case the controller rules sale-level input. |
| Columns `PosSale.note/serviceChargeSatang/tipSatang`, `PosSaleLine.note`, `PosPayment.tenderedSatang` + `PosPayment.changeSatang` on the CASH row (ruled §8.2), optional `PosPayment.reference` | migration | The oracle accepts either tender location (R3 is still open). The card ref falls back to the existing `PosPayment.note`. |
| `SaleResult.status` on a duplicate key | createSale | `"PAID"` / `"VOIDED"` (R6). |
| Register submit keys `note`, `tipSatang`, `payMethods[].reference`. Quote field `serviceChargeSatang` | register.ts | |
| `priceCart` input `serviceChargeBp` → output `serviceChargeSatang` | pricing-shared.ts | Needed so the client total equals the quote when SC is on (K3). |
| `posPaymentSettings(ctx)`, `updatePosPaymentSettings(ctx, actor, patch)`, `updatePosPaymentSettingsAction` | `pos/payment-settings.ts`, `pos/*-actions.ts` | Storage: `AppSystem(POS).settings.pos.serviceCharge {enabled, rateBp}` and `.tip {enabled, ledgerAccountId}`. Patch is a partial merge. |
| Codes `SPLIT_INVALID` (only for > 10 entries), `TIP_ACCOUNT_REQUIRED`. Message keys `errors.unitSystemMismatch`, `errors.splitInvalid`, `errors.tipAccountRequired` | register-shared + `src/messages/{th,en}/pos.json` | No `TENDER_TOO_LOW`: R3 already says PAYMENT_MISMATCH. |
| Oversell setting = `BusinessUnit.settings.pos.stock.oversellPolicy` | — | Same place P1.3 S6.1 writes it, so one implementation turns both green. |

## createSale call sites covered (U4 inventory · REVIEW §3.2 said "19")

Actual count is 18 `createSale(` calls in 15 files. The 19th grep hit is the dead interface in `src/lib/contracts.ts:79`, which is excluded.

| file | n | how the POS system is chosen | O21 class |
|---|---|---|---|
| actions/pos.ts:421 | 1 | client systemId + posUnitIsLinked | explicit |
| actions/booking.ts:140 | 1 | systemForUnit | linked |
| ai/proposals.ts:771 | 1 | **first POS of tenant** + any active unit | first-POS |
| modules/shop/service.ts:228 | 1 | **first POS of tenant** | first-POS |
| modules/booking/service.ts:818 | 1 | systemForUnit | linked |
| modules/clinic/service.ts:287 | 1 | **first POS of tenant** | first-POS |
| modules/ticket/service.ts:364 | 1 | systemForUnit | linked |
| modules/school/service.ts:242 | 1 | **first POS of tenant** | first-POS |
| modules/giftcard/service.ts:403, :673 | 2 | resolvePosForMember / per unit (caller tx) | linked |
| modules/rental/service.ts:244 | 1 | **first POS of tenant** (returnAsset) | first-POS |
| modules/rental/service.ts:425 | 1 | systemForUnit (deposit) | linked |
| modules/member/subscription.ts:113 | 1 | resolvePosForMember | linked |
| modules/restaurant/order.ts:430 | 1 | systemForUnit (key built at :418) | linked |
| modules/hotel/service.ts:452, :714 | 2 | systemForUnit | linked |
| modules/pos/api/ops/sales.ts:129 | 1 | actor.systemId + posUnitIsLinked (new since REVIEW) | explicit |
| modules/pos/register.ts:1131 | 1 | regScope (new since REVIEW, P1.3) | explicit |

How the guard is covered in the DB tests: the guard lives in createSale, so U1–U3 exercise it directly for every caller. The five first-POS callers are behaviourally the U2 case (2+ POS, unit not linked → refuse) or the U3 case (1 POS → works). No per-module fixtures (shop orders, clinic visits, …) were built. Their own suites in the COMMON §7 money set must be run by the controller after the build.

## Drift found in brief §1 (re-verified on 315da19e)

- `service.ts:42-63` CreateSaleInput: ✓ exact.
- `const vat = 0` is at **:144**, not :145.
- Duplicate lookup is at **:102-113**, not :102-111. Behaviour is as described: the stored sale is returned whatever its status, with no payload comparison.
- Bridge: `vatConfigOf` is at **:121** and the formula at **:123-125**. The brief said :122-125; REVIEW said :124-125. The bridge does not validate the rate itself; register `regVat` (register.ts ~:825) clamps it to 1…10000.
- `PosPayType` (pos.prisma:14-20): ✓ CASH, TRANSFER, PROMPTPAY, DEPOSIT, ROOM_CHARGE.
- createSale has no unit↔system check: ✓.
- **InterimPayDialog props have drifted.** The brief says `{quote, open, onClose, onPaid}`. Actual: `dueSatang, quotePending, quoteError, itemCount, promptpayId, phase, error, conflict, memberAttached, salesHref, onConfirm, onRetry, onClose, onNewBill, onRemoveMember` (`InterimPayDialog.tsx:24`). The key lifecycle is still in RegisterScreen.
- REVIEW §3.2 "19 call sites" is actually 18 in 15 files (table above). The line numbers moved (actions/pos 425→421, clinic 274→287). Two sites are new since the REVIEW (ops/sales.ts, register.ts).
- The restaurant key is at `order.ts:418` (the brief said ~:419).
- Not in the brief, but relevant:
  - `PosPayment.note String?` already exists (pos.prisma:90), so it can hold the card ref.
  - `register.ts:771` already validates `lines[].note` (≤500, clean text) and then drops it.
  - `REGISTER_PAY_TYPES = ["CASH","PROMPTPAY"]` (register-shared.ts:20). `regParseSubmit` caps the count at `REGISTER_PAY_TYPES.length` (:973) and refuses duplicate types (:980). Both must go for 10-method splits.
  - `closeDaySummary` `PAY_TYPE_ORDER` (service.ts:498) has no CARD, so card money would vanish from close-day (T7).
  - `account-bridge.channelOf` default sends CARD to TRANSFER (bank). That is fine, but it is implicit.
  - The stock cut runs after commit and only when createSale owns the tx (service.ts:307-310). BLOCK has to move the cut into the tx and avoid a second cut afterwards (B1 checks for exactly 1 OUT).
  - The restaurant has its own service charge line (`Math.floor`, `RestaurantSetting.serviceChargeBps`, order.ts:414-417). That is why K8 exists.

## Questions for the controller

1. **Tip versus "Σ payMethods == grandTotal" (COMMON §1).** The oracle keeps tip out of `grandTotal`, because it is not revenue, and requires Σpay = grandTotal + tipSatang. Is that right? The alternative is tip inside grandTotal, with VAT and revenue computed on grand − tip.
2. **SC rounding and base.** The oracle uses half-up on the total after line, bill and coupon discounts. SC applies only to register sales; legacy callers get it only if they pass `serviceChargeSatang`. Confirm.
3. **R3 tender location.** The oracle accepts the sale level or the CASH payment row. Which one? Once ruled, I will tighten C1/C2. The change column name is assumed to be `changeSatang`.
4. **R6 VOIDED + different payload.** The oracle expects `IDEMPOTENCY_CONFLICT`. Consequence: a restaurant re-checkout that changes the pay method now returns ok:false instead of silently reusing the VOIDED sale. I6 accepts either outcome, provided no PAID bill is created. Also, the underlying trap (re-checkout after a void books no revenue) remains as today. Is that P1.8's to fix?
5. **I7 (legacy concurrent same key returns the stored sale, not P2002)** goes beyond the brief's matrix but follows from "idempotency for every caller". Keep it or drop it?
6. **O21 as encoded in createSale.**
   - Unit linked to another POS: refuse.
   - Unit linked to no POS: allowed when the tenant has exactly 1 POS; refused with "เลือกจุดขายก่อน" when it has 2+.
   - Unit linked to the given POS: allowed, even in a 2+ POS tenant. This includes a first-POS caller whose unit happens to be linked to that first POS, which is not ambiguous.

   Confirm. In particular, "1 POS + unlinked unit → allowed" keeps shop/web units working.
7. **Payment settings API.**
   - Names and storage as above. Should the `TIP_ACCOUNT_REQUIRED` check also verify that the ledger account belongs to the POS's linked book? K4 currently passes an AccountLedger id from the seed coffee book, while the sandbox POS-V is linked to a sandbox book with no ledgers. Strict validation would turn K4 red; if you want it strict, I will change the fixture.
   - Is OWNER-only correct for changing settings, with STAFF getting PERMISSION_DENIED and MANAGER not tested?
8. **P1.3 oracle edits needed.**
   - **S3.38** expects TRANSFER/CARD → VALIDATION at the register; P1.6 flips that.
   - **S3.43** keeps VALIDATION for 0-amount entries, and the P1.6 oracle agrees.
   - P1.3 has no check that depends on the duplicate-type refusal.

   Please ORACLE-EDIT S3.38 when P1.6 is accepted.
9. **Line note cap.** The oracle uses 500 for line notes as well (same as the P1.3 parse). OK?
10. **The R7 guard can turn other suites red** where they call createSale with an unlinked unit/system pair, e.g. sandbox fixtures in `qc-pos-account` or the module money suites. Please include the full COMMON §7 set in the builder's gate.
11. **T7 (CARD in close-day)** is not in the brief but prevents card money from disappearing from Z/close-day. Keep it?
12. **UI (R9: mockups 02/05ข, deleting InterimPayDialog/SaleDone)** is not covered by this oracle; it is left to visual and controller review. Should I add statics such as F4/Enter/Esc and testids?

## Commands run here

- `esbuild scripts/qc-pos-p1.6.mts --loader:.mts=ts` → OK.
- `pnpm exec tsx scripts/qc-pos-p1.6.mts --list` → 48 ids, exit 0, no DB. X-coverage: X4=24, -=9, X1=6, X3=3, X6=3, X2=3.
- Scratch harness (not committed) running V1/V2/U4/R2/R3 against the tree → all red, each for the expected reason listed above.
- Scratch check of the bridge formula: float vs integer half-up gives 0 differences over 12,001 grosses at all 8 rates. priceCart at 700 equals the bridge (0 differences).

## Round 2 — controller rulings applied (pos-brief-P1.6.md §8 · session/pos 359f79c1)

- §8.2 → C1–C3 and the SKIP gate now require `PosPayment.tenderedSatang` + `changeSatang` on the CASH row (no sale-level fallback). createSale input stays `payMethods[].cashTenderedSatang` (ratified §8.10); register input stays `cashReceivedSatang`.
- §8.3 → I6 tightened: re-checkout ends PAID on a new sale, exactly one PAID bill, first bill still VOIDED. The changed-pay-method leg was dropped. I3/I4 unchanged (VOIDED + same → `status:"VOIDED"`, different → `IDEMPOTENCY_CONFLICT`).
- §8.6 → K4 uses a ledger created in the book linked to POS-V, and adds the wrong-book refusal; new **K9** refuses tip on an unlinked POS. Total now **48** checks.
- §8.4 I7 kept as is. §8.1/§8.5/§8.7–§8.10 need no oracle change.
- Expected on base: unforced SKIPPED exit 0; forced **8 green / 40 red** (I6 moved to red; K9 is new and red), Z1/Z2 green. Note §8.11 still says 9/38 — this round supersedes it.
- Re-verified here: esbuild OK · `--list` 48 ids exit 0 · no-DB checks V1 V2 U4 R2 R3 red for the same reasons as round 1.

Questions 1–12 above are answered by §8 and kept for history.
