# P1.12U — reviewer re-check of fix round 1 (read-only, Opus) · head ec9e91de vs 2913621d · 9 Oct 2026 14:4xZ
(saved verbatim by the controller · prompt `pos-briefs/pos-prompt-accountB-P1.12U-R2.md`)

# P1.12U fix round 1: reviewer re-check (read-only) · `wip/pos-p1.12u` ec9e91de (code 0fd2db17 + ledger merge 3ff5fe25) vs 2913621d

**Verdict: MERGEABLE-AFTER-FIXES.** The seam is correct, and the submit refactor preserves behaviour line for line. Two items remain. F2 is a 2-line fix. F1 needs a ruling: either a small fix or accept it as a follow-up. F3 is the controller's call.

**Findings**
- **F1 Medium (ruling): the override quote uses the session actor, but submit uses the staff-token actor.**
  - Where: `register.ts:2182`. The holder check `held.heldByUserId === s.actor.userId || pos.sale.manage` and the caps in `quoteRegisterCartOverride` (:1473) run on the session user. Submit swaps in the token actor first (`register.ts:1893–1899`). Recall already sends `tokenArgs()` (`RegisterScreen.tsx:1151`); neither quote action does.
  - Case: the device is logged in as a STAFF account without `pos.sale.manage`. Cashier B unlocks with a PIN, holds the bill for approval, and it gets approved and recalled with B's token. The override quote returns `APPROVAL_MISMATCH`, and `onOverrideRefused` (:869) drops `discAuth` and shows a toast. Submit would have accepted it.
  - The builder lists this as a follow-up, but the UI now acts on the refusal, so it is no longer harmless.
  - Fix: add `staffToken?` to `RegisterQuoteOverrideInput`, forward `tokenArgs()`, and resolve the actor exactly as submit does (bad token ⇒ `STAFF_TOKEN_INVALID`). Or rule "accepted, shared login always has manage".
- **F2 Low: a stale override quote survives when the auth is dropped within the same `cartVer`.**
  - Where: the effect reruns on `overrideKey` (:918), but the refusal branch (:903–905) never clears `quote`. So `quoteServer` (:920) keeps the old OK override totals.
  - Case: member cart + PIN, override OK. Submit then gets `PIN_LOCKED`, `PIN_INVALID` or `APPROVAL_MISMATCH`, and `setDiscAuth(null)` (:1624). The plain quote returns `DISCOUNT_EXCEEDS_LIMIT`, but `quoteFresh` still holds the manager-priced total. Pay stays enabled (:1044) and the old due is shown with no authority.
  - Money-safe: the server re-prices and refuses, or starts ③. But this is a regression from P1.15U, where pay was disabled straight away.
  - Fix: at the start of a re-run for the same `ver`, `setQuote((q) => (q?.ver === ver ? null : q))`. Or tag the stored quote with `overrideKey` and require a match.
- **F3 Low (controller call): on an approved member/coupon cart, any edit permanently drops the approval.**
  - Case: an edit changes the hash ⇒ the override quote returns `APPROVAL_MISMATCH` ⇒ `discAuth` is cleared and the `heldCartId` is lost. P1.15U non-member carts keep `discAuth`, so undoing the edit restores the approval. That matches ruling 1 as written, but quotes run on every edit while submit runs once.
  - Option: for `kind:"approved"`, skip the override while `auth.inputJson !== cartInputJson` (the plain discount-over card shows) and drop only at submit.

**Verified OK**
1. **Seam (`register.ts`)**
   - `quoteRegisterCartOverride` :1473: plain `regPrice` (:1491) is returned unchanged unless it is `DISCOUNT_EXCEEDS_LIMIT`; `via:"none"` returns it as-is (:1498). Pricing uses `regPrice(…, pay, cap)`, so `memberChoices`/coupon apply; same body as `quoteRegisterCartWithCap` plus pay settings, so totals match submit.
   - `regResolveOverrideCap` :2160 against the old ①/②, diffed line by line: same held-cart `where`, DISCARDED check, `approvedDiscountOf(…, key)`, holder/manage check, hash ⇒ `APPROVAL_MISMATCH`, `≤ ap.discountSatang`, `≥10000 ⇒ null` cap, fall-through to `priced.code`, `heldCartId && !pin ⇒ exceeds`, `verifyManagerPin` with the same scope/args, and the `regMaxDiscountBp(v.actor, caps)` cap.
   - `regDiscountOver` :2210: `discountBp`, `exceeds` and `free` are computed from the same `free`. `cancelOpenPosRequest` (:2228) still runs after pricing, as before; ③/④ untouched.
   - `regParseOverrideAuth` :1609 keeps the old `optStr` limits (32/200/200), message order and texts. `staffToken` is still checked first in submit (:1672–1675).
   - Quote's empty key `""` never matches `consumedBySaleKey`, so a consumed approval ⇒ `DISCOUNT_EXCEEDS_LIMIT`.
   - No side effects: no hold, request, claim, cancel or audit; only the PIN counter.
   - No PIN leak: `regGuard`/`unexpected` log exception objects only, and `verifyManagerPin` uses `logSafe` (name/code only).
2. **Action** (`register-actions.ts:125`): same `session` + `sessionScope` guards as the plain quote, and it forwards only the 4 keys. The file stays `"use server"` with async exports only. The type lives in `register-shared.ts:328`. Client files add only `next-intl`, `lib/ui/date` (pure) and `register-member-shared` imports.
3. **ORACLE-EDIT** c9446939 (own commit).
   - U3: wrong PIN ⇒ `PIN_INVALID` with `failedCount` 1; the next correct PIN ⇒ OK and 0. No audit, held cart or request, with a POS_DISCOUNT_OVER policy present (a strong negative).
   - U2: the `PRICE_CHANGED` totals JSON is byte-equal to the override quote, and the sale burns 500 points.
   - U4: approved + WELCOME50 ⇒ 6,000/5,000/29,000; consumed ⇒ `DISCOUNT_EXCEEDS_LIMIT`.
   - Fail-before `p112-failbefore.log` d8456e05: 68/71, U2–U4 `MISSING:quoteRegisterCartOverride`, EXIT 1. `pos-P1.12-oracle.md` records 71.
4. **UI**
   - `overrideAuthOf` (:861) applies only to member/coupon carts with a pin/approved auth. Same 250 ms debounce and `quoteSeq` guard, so an older response is dropped. PIN_INVALID/LOCKED ⇒ disarm + toast.
   - Non-member carts: key null, `overrideQuote` unchanged, `localQuote` path unchanged. The submit PIN/`heldCartId` and the PRICE_CHANGED guard are intact (:1698–1703).
5. **F2 lifecycle**: parked at handoff (:1731); kept only for the same id via approval (:1172); restored once in `openPay`/`openPayPoints` (:1561), and the `[payOpen]` clear effect does not undo it. Re-quote before the due (`totalsPending`). Dropped on discard, reject, staff switch and other recall. "Clear bill" leaves the ref, but it is unreachable without a matching `discAuth`. Deviation 1 (21B PIN) is covered.
6. **F3** (:1175, :1017, once per version) ✓ · **F4** (:971) ✓ · **F5** (`QuickRegisterForm.tsx:44–55`, rekey only after a failure, on phone/name) ✓ · **F6** (`formatShortDate`, th = `formatThaiDate`) ✓ · **F7** (exact regex, grey fallback keeps the name) ✓ · **F8** (:1608) ✓.
7. **Fixture**: `prepQcCoupon` (`visual-pos.mts:1593`) uses only system/coupon module calls, with no SQL and no delete. Top-up key `-<date>-<balanceBefore>` (:1568). Member states use in-stock lines. S3.29 runs on the sandbox unit, and `systemForUnit` is per unit (`register.ts:1361`), so the silom link cannot reach it.
8. **390 fix**: body = `min-h-0 flex-1 overflow-y-auto overscroll-contain` (:202), fixed header, inner column, no `h-screen`. The phone search field is `shrink-0` (:277). At ≥ md, `sm:flex-1` restores the row layout.
9. **Deviations**: 1 accept · 2 accept · 3 accept · 4 accept.
   - **Gates** (all `tree=/root/projects/shark-pos-p11`, head 3ff5fe25, EXIT 0): p1.12 71/71 ×3, residue 0 · p1.15 39 · p1.3 128 · p1.13 33 · p1.5 21 · p1.16 28 · p1.11 38 · authz 56 · fitness 41 ×2 · fitness-pos 8.
   - Header gaps (minor): `tc-2` TC_EXIT=0 is on the c9446939+dirty tree, 12 s before commits e766b764/0fd2db17. The dry plans are at e766b764 dirty=7.

**Follow-ups**
- F10 (accepted).
- F1 if accepted: the plain quote also prices member carts with the session cap, as already flagged by the builder.
- The flex-column bodies of `HeldBillsDrawer` and `TaxInvoiceDialog` need the same treatment (builder note).
- Each override quote re-verifies the PIN. Overlapping requests with a wrong PIN can count +2 before the disarm lands.

---
## Controller rulings (14:4xZ) → fix round 2 (`pos-prompt-accountB-P1.12U-fix2.md`)
F1 fix (staffToken on the override quote, actor resolved as submit) · F2 fix · F3 fix per the reviewer's option (approved + edited cart ⇒ no override quote until the input matches again; drop only at submit) · follow-ups recorded (HeldBillsDrawer/TaxInvoiceDialog bodies · overlapping PIN count · plain quote caps on member carts).
