# P1.6 — payment screen: split · numpad · change · service charge / tip · VAT stored (brief DRAFT · controller · cloud run · 3 Oct 2026)

> Status: DRAFT written without DB access. Before an oracle writer starts: (1) P1.3 accepted and merged into `session/pos`; (2) re-verify every file:line below on that head; (3) owner answers §6 (O19–O21). Lane rules + COMMON apply; the money regression set (COMMON §7 + `qc-pos-account`) is mandatory.
> Base: `session/pos` after P1.3 merge (includes `hotfix/inventory-atomic` + `hotfix/pos-page-authz`). Mockups: `ledger/design-pos/02-payment.png` (desktop/iPad), `05-mobile.png` (pay sheet). Debts routed here: REVIEW §6 #5 (VAT), #9 (idempotency on VOIDED), #13 (unit↔system pairing), P1.3 Q5 (delete interim dialog), Q11 (bill note), S3.19/S6.1 (oversell BLOCK), O3 (AI `pos_create_sale` wrong system — only the `createSale` guard; the AI file is CRM-hot).

## 1. Facts as built (verified 3 Oct on `wip/pos-p1.3` 5f97add4 — re-check)
- `pos/service.ts:42-63` `CreateSaleInput`: lines, billDiscount, coupon, member choices, `payMethods: {type, amountSatang, refSaleId?}[]`, `idempotencyKey`. No tendered/change, no tip/service charge, no note.
- `service.ts:145` `const vat = 0; // MVP` → `PosSale.vatSatang` always 0; `grandTotal = subtotal − billDiscount − coupon (+0)`; `PAYMENT_MISMATCH` when Σpay ≠ total (no member).
- `service.ts:102-111` duplicate key returns the stored sale **even if VOIDED**, no payload comparison (P1.3 `submitRegisterSale` already compares order-independently and returns `IDEMPOTENCY_CONFLICT` + status — legacy callers do not).
- Accounting bridge `account/index.ts:122-125` derives VAT itself from gross: `base = round(gross/(1+rate))`, `vat = gross − base`, only when the POS system is linked to a VAT-registered book.
- `PosPayType` = CASH · TRANSFER · PROMPTPAY · DEPOSIT · ROOM_CHARGE (no CARD/VOUCHER/STORE_CREDIT/PLATFORM).
- `createSale` does not check that `unitId` belongs to `systemId` (REVIEW #13).
- P1.3 interim pay dialog: `src/components/pos/register/InterimPayDialog.tsx` (+ `SaleDone.tsx`), props `{quote, open, onClose, onPaid}`; key lifecycle stays in `RegisterScreen`.

## 2. Contract (proposed rulings — controller; additive only, F15.2)
R1 **VAT stored, same formula as the ledger.** `createSale` computes `vatSatang` with exactly the bridge's rule (`gross − round(gross/(1+rate))`, INCLUDED mode; rate from the linked book; unlinked or not VAT-registered ⇒ 0). One shared pure helper used by BOTH `createSale` and the bridge (prove equality on 10k random grosses + every existing money suite unchanged). No EXCLUDED mode in P1.6 (no "price excl. VAT" exists — P2.2). `grandTotal` unchanged (VAT is inside the price).
R2 **Split tender.** `payMethods` 1…N (cap 10), each `amountSatang > 0` integer, Σ = grandTotal exactly; types allowed from the register = CASH, PROMPTPAY, TRANSFER, CARD (manual/EDC reference, no gateway — gateway is P1.7). Add enum value `CARD` (migration, additive). Other callers keep their types.
R3 **Cash tendered / change.** New optional `cashTenderedSatang` on the CASH method (or on the sale — builder proposes, controller rules); change = tendered − cash portion, ≥ 0, stored for the receipt/Z (P1.9). Tendered < cash portion ⇒ `PAYMENT_MISMATCH`.
R4 **Service charge / tip** — gated by O19/O20. Proposed: service charge = % per POS setting, inside the VAT base, a separate `serviceChargeSatang` column, included in grandTotal; tip = separate `tipSatang`, NOT revenue, NOT in VAT base, posted to a liability account only if accounting rules it so — otherwise tip ships disabled.
R5 **Bill note** `PosSale.note` (≤500, plain text) + line note/discount reason (Q11) stored on the line (`note` column) — additive.
R6 **Idempotency for every caller:** duplicate key + same payload ⇒ return stored sale with its status; different payload ⇒ `IDEMPOTENCY_CONFLICT` error; VOIDED stored sale ⇒ returned with `status: "VOIDED"` so callers can decide (restaurant re-checkout case `restaurant/order.ts:~419` must be checked — no behaviour change for legacy callers without an oracle proving it).
R7 **Unit ↔ system guard** in `createSale`: `unitId` must be a unit of `systemId` (AppSystem link as P1.1a uses) ⇒ else `UNIT_SYSTEM_MISMATCH`, before the receipt counter. Run every caller's suite (19 call sites, REVIEW §3.2) — "first POS of tenant" callers on multi-POS tenants will now fail loudly instead of mis-filing: list them and decide per caller (O21).
R8 **Oversell policy** `settings.pos.stock.oversellPolicy` = `ALLOW_NEGATIVE` (default, today) | `BLOCK`: BLOCK checks and decrements inside the sale tx under the inventory row lock (`FOR NO KEY UPDATE`, inventory-atomic order) ⇒ `STOCK_INSUFFICIENT`, no bill (qc-pos-p1.3 S6.1 must turn green).
R9 **UI** = mockup 02 / 05ข: method tiles, numpad (integer satang, quick notes 100/500/1000/exact), split list with remaining, change display, PromptPay static QR + manual confirm (dynamic = P1.7), card ref field; delete `InterimPayDialog.tsx`/`SaleDone.tsx` and keep `RegisterScreen`'s key lifecycle and all B2.x guards (single submit, beforeunload, focus restore, refusal cards). ≥44px, `pos.*` th+en, F4 open / Enter confirm / Esc close.
R10 **Refusal codes** (returned as data from actions): existing + `UNIT_SYSTEM_MISMATCH`, `STOCK_INSUFFICIENT`, `TENDER_TOO_LOW` (or reuse `PAYMENT_MISMATCH` — oracle writer proposes), `SPLIT_INVALID`.

## 3. Order of work
1. Oracle writer: `scripts/qc-pos-p1.6.mts` (~45 X4 + X1/X6 + S6.1 reuse) — VAT helper equality, split edge cases (0-baht bill = empty payMethods, 1-satang splits, 10 methods), tendered/change, idempotency matrix (same/different payload × PAID/VOIDED × legacy/register callers), unit↔system, BLOCK race (10 lanes × 3 rounds), refusal-as-data statics; RED/SKIPPED for the right reason on base; QC4 residue check.
2. Builder S (server + migration: enum CARD, columns note/serviceCharge/tip/tendered/line note — `migrate diff` → read SQL → deploy QC4 only) → builder U (UI) → controller visual (02, 05ข × 3 sizes + EN) → parity reviewer → code reviewer → hunter (money lane) → accept.

## 4. Acceptance
`qc-pos-p1.6` green ×2, no residue · `qc-pos-p1.3` incl. S6.1 green · `qc-pos-p1.1` · money set COMMON §7 + `qc-pos-account` identical before/after · fitness both modes · typecheck · build · visual parity.

## 5. Out of scope
Dynamic PromptPay/Beam/card gateway (P1.7) · refunds/CN (P1.8) · shifts/drawer/Z (P1.9) · printing (P1.10) · member rights at pay (P1.12) · full tax invoice (P1.13) · PIN/approval (P1.15).

## 6. Owner questions (must be answered before the builder; oracle writer may start with defaults)
- **O19 Service charge**: do shops need it now? Default proposal: % per POS, inside VAT base, off by default.
- **O20 Tip**: accounting treatment (owed to staff = liability vs shop revenue) — accountant to decide; default: ship disabled until ruled.
- **O21 Unit↔system guard**: callers that pick "first POS of the tenant" (shop, clinic, school, rental, AI) will start refusing on multi-POS tenants instead of silently filing to the wrong POS — accept the loud failure (recommended) or keep legacy behaviour for those callers until P2.1?

## 7. Owner answers (3 Oct 2026)
- **O19 + O20 → configurable.** Service charge and tip are both POS settings, OFF by default. Service charge: % per POS system, inside the VAT base, its own `serviceChargeSatang` column, included in grandTotal. Tip: its own `tipSatang`, not revenue, not in the VAT base. The tip's ledger account is a setting; while it is unset, the tip toggle cannot be switched on (the UI says why). The oracle covers OFF (no change to today's totals) and ON for both.
- **O21 → ACCEPTED by owner (4 Oct)** — refuse loudly only when it is ambiguous. A caller that picks "first POS of the tenant" keeps working when the tenant has exactly 1 POS; with 2+ POS and no explicit system it returns `UNIT_SYSTEM_MISMATCH` + a Thai message ("เลือกจุดขายก่อน"). Explicit wrong pairs are always refused.

## 8. Controller rulings on the oracle writer's questions (4 Oct · oracle `wip/pos-p1.6-oracle` 5a264e71, 47 checks)
1. **Tip is outside grandTotal**: payments = grandTotal + tip. This amends COMMON §1 for tip only; tip is pass-through and not revenue.
2. **Tendered/change live on the CASH `PosPayment` row** (`tenderedSatang`, `changeSatang`). Tighten C1–C3 to that location in the next oracle round.
3. **VOIDED stored sale**:
   - Every caller gets the stored sale back with `status: "VOIDED"` (R6).
   - A different payload on the same key ⇒ `IDEMPOTENCY_CONFLICT`.
   - The restaurant re-checkout must still end PAID. The restaurant caller mints a new key when the stored sale is VOIDED.
   - I6 must assert: re-checkout ends PAID, there is exactly one PAID bill, and the voided bill stays VOIDED.
4. **I7 kept**: concurrent same-key legacy calls return the stored sale, never a P2002 (money lane).
5. **O21 encoding confirmed**: an unlinked unit is allowed when the tenant has exactly 1 POS, and refused when it has 2+.
6. **Tip ledger account must belong to the book linked to that POS.** On an unlinked POS, tip cannot be enabled. K4 is adjusted accordingly.
7. **P1.3 S3.38**: ORACLE-EDIT approved at build time; TRANSFER and CARD become valid register pay types.
8. **Gate runs the full COMMON §7 set plus all createSale callers' suites.** Any suite that relies on an unlinked pair gets a fixture fix, never a weakened guard.
9. **UI (R9)** is covered by controller visual + parity, not by this oracle.
10. **Invented names are ratified as proposed**: `splitIncludedVat` in `src/lib/money/vat.ts`, the input fields, the payment-settings API, `SPLIT_INVALID`, `TIP_ACCOUNT_REQUIRED` and the message keys.
11. **Next step**: run the oracle once on the VPS against base, unforced and forced. Expect unforced SKIPPED exit 0, and forced 8 green / 40 red with Z1/Z2 green (48 checks after e39c8d02). Then accept the oracle and merge it into session/pos, then builder S.
