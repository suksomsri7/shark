# P5.1 FIX batch A+C+D — builder (account B · 23 Oct 2026 · tree p11 · branch `wip/pos-p5.1-fix-acd`)
Base: `origin/wip/pos-p5.1-oracle` 8b3622cb + merge `origin/session/pos` 656882a3 (ledger-only delta) = 70302bcf. Rulings applied: CD-P51-O1/O2 (F12/F13 untouched) · O3 · O4 · O5.
Scope kept to batches A/C/D owning files: `pos/service.ts` · `pos/refund-math.ts` · `pos/refund.ts` · `pos/account-bridge.ts` · `actions/pos.ts`. `account/gl.ts` not touched (MA11 closed in the bridge). No migration, no `prisma/`, no contract JSON, no new error code, no new `createSale(` call.

## 1. Check → commit → file:line (before @70302bcf → after @HEAD)
| check | commit | change |
|---|---|---|
| MA8 | 7386ed7a | `service.ts:255` → `:256-269` validateSaleInput: qty integer ≥ 1 · unitPrice integer ≥ 0 · 0 ≤ line discount ≤ gross · 0 ≤ bill discount ≤ Σ lines · `:292` → `:307` every pay row ≥ 0 · `:936` → `:952` beforeMember < 0 ⇒ VALIDATION (grand ≥ 0). All VALIDATION. |
| MA1 | 124a3730 | (b) `service.ts:1125` → `:1142-1152` member benefits ≤ beforeMember − service charge: the excess comes off the tier discount (and the TIER line in memberBenefits); still over (voucher/points/gift card) ⇒ VALIDATION, whole tx rolls back · (a) `refund-math.ts:31-38` → `:34-55` lineNets allocates at most Σ lines (net ≥ 0) + new `serviceChargeNet` (SC − excess) · `refund.ts:590` → `:590-596` refund SC from scNet · (c) `:598-600` REFUND_EXCEEDS when grand > sale.grandTotal − Σ prior refund docs. Normal bills: byte-identical (excess = 0). |
| MA9 | a4ed7058 | `refund.ts:626-627` → `:636-646` partial-refund VAT = min(grand, VAT left, share): if today's POS rate still splits the bill's VAT exactly ⇒ `splitIncludedVat(grand, rateNow)` (old path, p1.8 A4 unchanged) else half-up(sale VAT × grand / sale grand). |
| MA10 | 9f41dafb | `account-bridge.ts:102-111` → `:102-121` withoutTip cuts the tip from CASH/PROMPTPAY/TRANSFER/CARD rows first (the TIP_FUNDING_TYPES set), and only then from the other rows (old bills). |
| MA11 | 4b829554 | `account-bridge.ts:167` → `:173` `p36RetryOnceOnUnique(true, …)`: retries once on P2002 for every bill (before: ON_ACCOUNT only). The loser's retry sees the winner's `PosSale#<id>#PAID` ⇒ skipped. |
| MA3 | 7592e34f | `actions/pos.ts:358-391` → `:404-436` (+ helpers `:71-90`): refuse when `posRegisterV2On` (after key replay) · `assertLegacySaleAllowed(ctx, membership, uncatalogued lines)` · PROMPTPAY (REGISTER_MANUAL_METHODS) with no pos.shift.manage + `manualConfirmRequiresManager` ⇒ REGISTER_MANUAL_MANAGER_MESSAGE. |

## 2. Results (QC4 · ISO_MEM 3G · POS gate lock · logs in lane scratch `p51-fix-acd/`)
`qc-pos-p5.1` run 1 (dirty = same code) + run 2 @7592e34f: **10/15 each** — MA1 MA3 MA8 MA9 MA10 MA11 ST1 ST2 Z1 Z2 green · MA2 MA4 MA5 MA6 MA7 red (batch B, as expected) · residue 0 · guardHits 0 · pumpErrors 0.

| regression | result |
|---|---|
| qc-pos-p1.6 (actions) | 48/48 |
| qc-pos-p1.8 (refund) | 49/49 |
| qc-pos-p2.9 / p2.9b | 62/62 · 53/53 |
| qc-pos-p3.6 | 52/52 |
| qc-money-mapping | 5/5 (findings 0) |
| qc-hf-tx | 22/22 |
| qc-hf-o23 (legacy action) | 16/16 |
| qc-pos-p2.10 --no-db | 1/2 — ST2 **lane pin only** (service.ts hunk vs LANE_PIN f4e965ac) ⇒ controller re-pin at merge (same pattern as CD-RP18*) |
| qc-hf-fu --no-db | 3/4 — ST1 **lane pin only** (service/account-bridge/refund-math/refund changed vs base c3c52ef1). Not a migration, not a contract change, createSale count unchanged ⇒ re-pin at merge |
| fitness (pre-commit ×6) | green |
| pos-pre-submit core @f73db659 | VERDICT red: wo run1/run2 10/15 (batch-B reds only) · nodb 2/2 · p1.1 180/180 · p1.6 48/48 · p1.18 81/81 · hf-tx 22/22 · fitness ±env 53/53 · fitness-pos 8/8 · gen-check ok · hf-fu ST1 + hf-fu2 ST1 = lane pins · **p1.3 127/128 S5.12** (§3) |

## 3. Notes / what the contract or scope forbade
- **Typecheck not run.** A strict single-file tsc of the 5 touched files (scratch tsconfig) runs out of memory at a 2.8 G heap: it pulls in the whole import graph. The full `typecheck` gate needs ISO_MEM 10.5 G, above this lane's 3 G cap ⇒ the controller runs it at merge. No scripts were touched, so there is no strict tsc on scripts.
- **MA10 "snapshot ledger id" not done.** It needs a new PosSale column (schema/migration) and contradicts the oracle: MA10 asserts Dr 1000 = cash − tip with no tip ledger at drain. With a snapshot, Dr 1000 would be 11,000 + Cr tip ledger. Ask the controller whether it becomes a debt row or a follow-up WO with an ORACLE-EDIT.
- **MA1 register quote not changed** (`register.ts` is outside batch A). The cap now lives in createSale, but `quoteRegisterCart` still refuses only grand < 0. In the edge case (benefits eat the SC), the screen shows the uncapped grand and submit ⇒ PAYMENT_MISMATCH (no bill, no money lost). Follow-up: apply the same cap in register.ts:1699-1701. The `saleForRefund` view and the BillsClient preview still show the full SC for legacy over-discounted bills. The server amount is correct, so only the preview differs.
- **MA3 legacy catalogue.** The legacy screen sells InvItem (posCatalog) + services, not PosProduct. A line whose itemId/serviceId price equals the legacy catalogue price is therefore treated as catalogue. Only the remaining lines (typed-in lines or prices edited in the cart) go to `assertLegacySaleAllowed` (PosProduct name+price, or pos.sale.priceOverride). Without this, every STAFF legacy sale of a stock item would be refused.
- MA8: the old comment "old caller fields are not checked further" is superseded by CD-P51-O5. Refund docs do not pass through createSale.
- **qc-pos-p1.3 S5.12 = an intentional tripwire on `actions/pos.ts`** (sha256 pin of the legacy screen · the file's own rule: a legitimate edit changes the hash only through a controller ORACLE-EDIT). CD-P51-O4 requires editing this file ⇒ the controller should ORACLE-EDIT `LEGACY_SHA[LEGACY_ACTIONS]` at `scripts/qc-pos-p1.3.mts:735` to **`10eb6a6bfbc344abe5b213f43b4f17d947cc6d3366c1db883d6c338242a5e14c`** (sha of `actions/pos.ts` @7592e34f = HEAD). `register-ui.tsx` is unchanged. The builder did not edit the oracle.

## 4. R1 fix round (R1 verdict on ef6693d9 = MERGEABLE-AFTER-FIXES)
- **F1 MED** — 0f795adb ORACLE-EDIT `qc-pos-p5.1` MA3 (CD-P51-O4b): probe c = STAFF sells the catalogue item at 12,000 with billDiscountSatang 11,900 → expected error and no bill. Red-before at 0f795adb (old action): `c → ok, bill 1` · 9/15. Fix ef3ad301 `actions/pos.ts:415-421`: after computeTotals → `registerSellerLimits(actor, unitId, registerDiscountCaps(...))`; refused with "ส่วนลดเกินสิทธิ์ของบัญชีนี้" when maxDiscountBp ≠ null and billDiscount×10000 > max×subtotal + 5000 (same formula as pricing-shared:196-201 · coupon not counted).
- After: `qc-pos-p5.1` 10/15 (MA3 green incl. c · still red = batch B) · `--no-db` 2/2 · `qc-pos-p1.6` 48/48 · `qc-pos-p1.15` 40/40 · fitness (QC4 via iso) 53/53. Strict tsc on `scripts/qc-pos-p5.1.mts` = 0 errors (positive control: a planted TS2322 is caught). tsc on `actions/pos.ts` = OOM at 2.9 G heap (import graph) ⇒ full typecheck at merge.
- F2 (restaurant/order.ts negative option price) → batch B, not touched. F3 accepted (Thai-only message for the V2-on refusal).
- **New sha256 of `src/lib/actions/pos.ts` for p1.3 S5.12: `ccd87cfc5fd9d57ec2017dc0fb8fe06bf34783549a9635a129c2bdb509f4a8d3`** (replaces the 10eb6a6b… in §3).
