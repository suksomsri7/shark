# P2.5 S review R1: `wip/pos-p2.5` 6ed2d5ce (code 86392e7d, base 4449123f)
**Verdict: MERGEABLE-AFTER-FIXES.** The allocator is exact, the stock is cut once and the lock orders are sound. One Medium reversal gap must close first (F1). F2–F4 are Low.

## Findings
- **F1 (Medium) A void of a part on a DONE plan cannot complete once a newer plan is OPEN on the same session.** `releaseSplitPartInTx` (`table-split.ts:548-553`) flips the old plan DONE→OPEN, but the partial unique `PosTableSplit_session_open_key … WHERE status='OPEN'` allows one OPEN plan per session, and create refuses only an OPEN plan (`table-split.ts:292`).
  - Input: A5 plan P1 EQUAL-2, both parts paid (DONE) → a dessert round is sent (session stays OPEN) → the cashier splits it (P2 OPEN) → part 1 of P1 is voided (wrong tender).
  - Result: the consumer transaction (`table.ts` P2.5 hunk ≈:637) unlinks the items, then hits P2002 when it re-opens P1. Everything rolls back and `pos.sale.voided` retries until FAILED. Part 1 stays PAID with the voided `saleId` and its items stay linked, so the table can close without re-collecting the voided bill (lost revenue). `compose` still runs the other bridges (`outbox-consumers.ts:452-462`).
  - Smallest fix: in `releaseSplitPartInTx`, re-open the plan only when no other OPEN plan exists for its session; otherwise leave it DONE and mark the part OPEN. Its unpaid items then fall to P2 (replace) or to whole-table pay once P2 is DONE, and `checkSplitPlanInTx` already refuses paying a part of a non-OPEN plan. Add ORACLE-ADD X5 (DONE P1 + OPEN P2 + void a P1 part ⇒ drain ok, items unpaid, no FAILED event).
- **F2 (Low) A concurrent second payer of the same ITEM/SEAT part gets the wrong code.** `regSubmitSplitPart` claims items before locking the part (`register.ts:2867-2871`). Input: two devices submit part 2 (whole items) with different keys. The loser's claim returns 0 rows, because the winner settled them, so it gets `TABLE_ITEMS_CHANGED` instead of `TABLE_SPLIT_PART_PAID`. No money is written. Fix: on a claim shortfall, read the part status (no lock); PAID ⇒ `TABLE_SPLIT_PART_PAID`.
- **F3 (Low) EQUAL with service off: the phantom service charge grows with the item count, not "−1/−2 satang" (deviation 3).**
  - Item shares give +1 to the lower parts for each item whose u×unit is not divisible by N. So b₁−b_N can reach the number of such items (≤ 200), while t is pinned to q/q+1.
  - Input: 30 odd-priced single items, EQUAL-3, service 0%. Part 1 books `s₁ ≈ −20` satang, moved into the bill discount; part 3 books `s₃ ≈ +10` satang of "service charge" in a shop with service off.
  - Totals and Σ are exact and VAT is computed on t_i, so there is no VAT distortion. Per-bill service and discount lines and the service-charge report are off by up to ~฿2 (200 items). The impact is cosmetic, but it appears on a part's full tax invoice.
  - Fix (needs a ruling, since row 12 pins "+1 to parts 1..r"): rotate the per-item remainder start (item k → parts (k mod N)+1…) so the bases stay within ±1. Or cap the owner-line wording to "up to the number of items".
- **F4 (Low, P2.9 merge) The STORE_CREDIT pre-check needs the part's member.** P2.9 adds `if (STORE_CREDIT && !req.cart.memberId) ⇒ STORE_CREDIT_NOT_OWNER` early in `submitRegisterSale`. P2.5 lets a part submit omit `memberId` (the server takes `part.memberId`, deviation 5; the U contract says `memberId?`). After the merge, a member part paid with store credit is refused unless the client sends `memberId`. Either make `memberId` mandatory in the P2.5U contract when the part has a member, or run P2.9's check after `regSplitCart`. `git merge-tree` 86392e7d × origin/wip/pos-p2.9 (318ef7aa) gives a textual conflict only in `POS-OWNER-PENDING.md`. Gift-card rows reach `createSale(callerTx)` unchanged in `regSubmitSplitPart`.

## Hand-walked EQUAL-3 (15B table, Σ items 124,000 · service 10% · VAT 7% incl.)
- Shares per item, u×unit/3 (+1 to the lower parts):
  - ต้มยำ 6000 ×3 · กะเพรา 19800 → 6600 ×3 · ข้าว 6000 → 2000 ×3
  - ปลาหมึก 23000 → 7667/7667/7666 · ยำวุ้นเส้น 5000 ×3
  - ชาไทย 20700 → 6900 ×3 · ลาเต้ 15000 → 5000 ×3 · บราวนี่ 6500 → 2167/2167/2166
- Bases b = **41,334 / 41,334 / 41,332** (Σ 124,000). D = 0. S = halfUp(124,000×1000/10000) = 12,400.
- EQUAL totals: T = 136,400 = 3×45,466 + 2, so t = **45,467 / 45,467 / 45,466**.
- Service s = t − b + d = **4,133 / 4,133 / 4,134** (Σ 12,400).
- VAT per part (`splitIncludedVat`) = 2,974 / 2,974 / 2,974 = 8,922, against the whole-table 8,923: a 1-satang difference, within ⌊(N+1)/2⌋ (owner line).
- Stock: every share line of part 1 carries `components = u × recipe` plus the PRODUCT's own InvItem (`register.ts:1479-1486`). Parts 2 and 3 carry none.
- Voiding part 1 restores the stock through the sale void. Voiding part 2 restores nothing (it had none).
- The items become PAID with part 3's `saleId` (the completing part, `markSplitPartPaidInTx`).

## Deviations (§11.14 accepted)
| # | verdict |
|---|---|
| 1 replace ignores `expectedItemsHash` | Accept. `version` + item claim FOR UPDATE + a "plan items still unpaid" re-check cover lost updates; new rounds stay outside the plan. |
| 2 move/merge lock session → table advisory | Accept. It matches the P2.4 void consumer and `unlinkTableItemsInTx`. Pay takes items → part → session and move/merge never touch items, so there is no cycle. |
| 3 EQUAL service-off negative s → discount | Accept for totals, but the magnitude is understated → F3. |
| 4 lenient part quote / strict submit | Accept. Submit re-checks unpaid items and claims them under the transaction. |
| 5 part member from the plan | Accept, but see F4 (U must send `memberId`). |

## Verified OK
1. **Schema/migration.** `20261210100000_pos_p25_split`: SET/RESET lock_timeout 3s · DO-block enums · `CREATE TABLE IF NOT EXISTS` ×3 · partial uniques (session OPEN, part `saleId`) · no FK · no ROI/TableSession/PosSale change. Scope: `PosTableSplit: sys()`, Part/Line `tenant` (§11.3). `POS_MODELS` +3. QC4 deploy output is in the notes ("All migrations have been successfully applied").
2. **Money.** `table-split-shared.ts:89-197` is pure (only `@/lib/money/vat`; BigInt largest remainder, ties to the lower bill number).
   - Discounts and service:
     - D uses the priceCart rule and `d = LR(D, b)`.
     - S = halfUp once for the table.
     - ITEM/SEAT: `s = LR(S, b−d)`.
     - EQUAL: `t` pinned and `s = t−b+d` (§11.1).
   - Table discount lives on the plan. The member, coupon and choices apply only to the part's member (`regSplitCart:1765`). Parts >200 items or lines ⇒ `TOO_MANY_LINES`. `tableSplitSaleAmounts` keeps the sale grand total = t_i.
3. **Plan lifecycle.**
   - Create/replace lock items → session → parts → plan. Cancel locks parts → plan.
   - Once a part is PAID or the plan is DONE ⇒ `TABLE_SPLIT_LOCKED`. `TABLE_SPLIT_EXISTS` carries `{splitId, version}` (`:292`). 2–20 parts.
   - While a plan is OPEN, these return `TABLE_SPLIT_OPEN`: whole-table quote/submit (`regTableLines`, in-transaction guard at submit), item cancel (`table.ts:483`, checked after the item lock), whole-table pre-bill and merge.
4. **Part pay.** `regSubmitSplitPart` (`register.ts:2838`) runs in one transaction:
   - Order: intents → idempotency advisory → items FOR UPDATE → part FOR UPDATE → session FOR UPDATE → plan FOR UPDATE.
   - Then `regCreateSale(…, callerTx(tx))` → part PAID → completing items settled → close when no drafts. `afterSaleCommitted` runs after commit.
   - No `ticketForSale` (`register.ts` still has 2). Share lines are price-only with no `itemId`.
   - Replay ⇒ the existing sale (`existed` short-circuit). EQUAL part pays serialise on the shared item rows.
5. **Reversal.** The void hunk unlinks the part's items via `unlinkTableItemsInTx` (session → table advisory → items, same as `unlinkTableSaleInTx`), then `releaseSplitPartInTx`.
   - A replay finds no part holding the sale, so it is a no-op.
   - Stock is restored only for the owner part (it alone had components). Refunds do not touch items.
   - Voiding any part unlinks the items it shares that were already completed (they are no longer fully paid); items not yet completed were unpaid anyway. Gap: F1.
6. **Move/merge.** `moveTableSessionInTx` / `mergeTableSessionsInTx` (`pos-tables.ts`) take session FOR UPDATE → table advisory locks (sorted), with no item rows.
   - The vacated table gets `dirtySince`.
   - The merge guard refuses an OPEN plan and drafts in two sessions, and re-points a single draft.
   - Rounds follow the session: KDS reads `session.table.name` because `RestaurantOrder` has no table column (deviation 10).
   - Legacy `moveSession`/`mergeSession` are untouched (L PAR green).
7. **Pre-bill.** `registerTablePreBill` (`table.ts:780`) builds the payload from that session's or part's own quote: no receipt/tax/doc numbers, one `pos.table.preBill` audit, no state change. `pre-bill-render.ts` is pure (only `receipt-render`), with the th title per ruling 9 and the en "PRE-BILL — NOT A RECEIPT".
8. **Boundaries.**
   - `service.ts` and the contract sha are untouched (fitness-pos 8). The only call is the existing `regCreateSale` (p1.6 48/48).
   - No P2.9 region edited (merge-tree clean). No new permission keys.
   - `table-split-actions.ts`: `"use server"`, 6 async exports.
   - Keys: 70 new (7 errors + 63 screen), th/en parity, no Thai in en.
9. **Oracle.** e50c132b..86392e7d `scripts/` = `pos-qc-env` registrations only; e9af3b45 = the dated M4 ORACLE-EDIT (2 lines moved, no assertion changed). p2.5 40/40 ×3 (e9af3b45), residue 0, leaks 0. `--no-db` 7/7 per the notes; no separate log found.
10. Deviations: see the table.
11. **Gates.**
    - `gates/` at fbad0b15/e9af3b45, `dirty=0`: typecheck exit 0 · fitness 50/50 ±env · fitness-pos 8 · p2.6 67 · p2.8 60/61 (ST6 wip).
    - `gates-pre/` at 86392e7d/f3e19d82: p2.4 50 · hf-tx 22 · p1.3 128 · p1.1 180 · p1.6 48 · p1.8 49 · p1.10 40 · p1.12 72 · p1.13 33 · p1.15 39 · p1.16 28 · p1.18 81 · p2.3 46 · authz 81 · restaurant 6/6/19/11.
    - p2.6 66/67 at f3e19d82 was the comment token, fixed at 86392e7d → 67.
12. **Owner lines** (7, `POS-OWNER-PENDING.md:163-169`): share qty in reports, share refund restock, per-part VAT, EQUAL service-off, QR after move/merge, void after new guests, orphan drafts. All accurate (F3 wording aside). The P2.5U contract covers 15B/15C and 03 (actions, views, refusal codes, visual states).

## Follow-ups
- **Fix round 1:** F1 (+X5), F2. F3 wording now, algorithm change by ruling. F4 settled in the U contract or at the P2.9 merge.
- **P2.5U:** always send `part.memberId`; a "voided part on a closed session" helper (owner line); a 15C seat drag.
- **P2.11:** orphan HELD drafts sweep.
- **P2.12:** share quantities in product reports.
- **Owner:** the F3 magnitude.

## Hunter (parallel, `pos-P2.5-hunt.md`): N1 Med (= F1) · N2 Med legacy restaurant checkout/cancel ignore an OPEN plan ⇒ double charge / stuck table · N3 Low EXCLUDED-VAT shops: plan totals without VAT · N4 Low DONE plan on a merged-away session reopens as an orphan.

## Controller rulings — fix round 1 (account B, 14 Oct 21:1xZ) — binding
1. **F1/N1 → fix (reviewer's variant)**: `releaseSplitPartInTx` re-opens the plan DONE→OPEN only when no other OPEN plan exists for the session; otherwise the plan stays DONE and only the part goes back to OPEN (its items unlinked, payable via replace of the OPEN plan or whole-table once that plan is DONE); `checkSplitPlanInTx` keeps refusing a part of a non-OPEN plan. The void consumer must never loop: any remaining conflict ⇒ audit row + DONE event. **ORACLE-ADD X5** (DONE P1 + OPEN P2 + void a P1 part ⇒ drain ok, items unpaid/unlinked, event DONE, no FAILED).
2. **N2 → fix** in the actions layer (module bodies pinned): `checkoutAction`/`checkoutPromptPayAction` refuse when `openSplitOfSession` is set; `cancelOrderItemAction` refuses when `itemInOpenSplit`; owner line for the legacy page. **ORACLE-ADD P7** (part 1 paid, legacy checkout ⇒ ok:false, 0 PosSale, plan unchanged; legacy cancel of a plan item ⇒ refused).
3. **F2 → fix**: on an item-claim shortfall read the part status (no lock); PAID ⇒ `TABLE_SPLIT_PART_PAID`, else `TABLE_ITEMS_CHANGED`. Extend C2's assertion if it pins the code.
4. **F3 → wording now, algorithm later**: owner line says "up to the number of items (≤ ฿2 on 200 items), totals exact, VAT on t_i"; the remainder-rotation change goes to a P2.11 follow-up with its own ORACLE-EDIT review (row 12 pin). No S change.
5. **N3 → fix**: `planView`/`splitSummariesOf`/pre-bill part figures carry `t_i + vat_i` in EXCLUDED mode (plan stores net; display adds VAT per part with the same rounding the part sale uses). **ORACLE-ADD M8** with an EXCLUDED-VAT fixture (2 parts of 1,000.00 ⇒ shown 535.00 each, Σ shown = Σ charged).
6. **N4 → fix**: `mergeTableSessionsInTx` repoints DONE plans to the target session; `itemInOpenSplit` ignores plans whose session is not OPEN. **ORACLE-ADD T4** (DONE plan on B, merge B→A, void a B part ⇒ part OPEN on A's session, items payable on A, cancel allowed where no OPEN plan).
7. **F4 (P2.9 interaction) → at the upstream merge**: run P2.9's `STORE_CREDIT_NOT_OWNER` pre-check after `regSplitCart` (server uses the part's member); P2.5U contract: `memberId` mandatory when the part has a member. Add a sub-check once P2.9 is merged (part of a member table paid with STORE_CREDIT ⇒ ok).
8. Sequence: fix round on the current base first (oracle first, red-before block 2 → `P2.5-red.txt`; p2.5 → 44), then merge `origin/session/pos` when the controller sends the P2.9 merge SHA (keep both `POS-OWNER-PENDING.md` sides; item 7), then full gates: typecheck · fitness ±env · fitness-pos · p2.5 44 ×3 · p2.9 62 · p2.4 50 · p2.6 67 · restaurant ×4 · p1.3 · p1.1 · p1.6 · p1.8 · hf-tx · p1.10 · p1.18 · authz · p2.8 (ST6 wip-only). Then **R2 (hunks) + hunter re-check**, then merge → **30/55**.
9. **CD-P25-N3 (builder) → ruled**: the register only has VAT INCLUDED | NONE (`regVat`), so hunter N3 (EXCLUDED display) is unreachable — M8 becomes a static pin (`regVat` ∈ {INCLUDED, NONE}) + invariant (plan part total = part quote grand total in both modes); the dead EXCLUDED branch in the helper is removed. p2.5 = 44.

## Fix round 1 delivered + upstream merge (account B, 14 Oct 23:0xZ) — head 0aded3e6 (code 0e29ffb5)
Builder: merge 392a89fc (P2.9 S 4967ce2d; conflict only `POS-OWNER-PENDING.md`, both sides kept; register/register-shared/pos.prisma/pos.json auto-merged) · ruling 7 a181840e (`register.ts` ≈2475 other member + STORE_CREDIT ⇒ `STORE_CREDIT_NOT_OWNER`; ≈2541 P2.9 owner check after `regSplitCart` with the part's member; P2.5U contract: `memberId` mandatory on member parts) · M9 7cb4bdd6 (p2.5 → 45) · red-before block 3 43/45 (L2 + M9 red) · **63bb1fdc L2 contract sha re-pin 7a418de1 → 72afb258 — unordered ORACLE-EDIT, controller CONFIRMS** (identical to the CD-P29-1 re-pin of p2.4 ST4 / p2.6 L3, dated marker present). Gates on 0e29ffb5 dirty 0: typecheck 0 · fitness 50/50 ±env · fitness-pos 8/8 · p2.5 45/45 ×3 · p2.9 62 · p2.4 50 · p2.6 67 · restaurant 6/6 · money 6/6 · pay 19/19 · void 11/11 · p1.3 128 · p1.1 180 · p1.6 48 · p1.8 49 · hf-tx 22 · p1.10 40 · p1.18 81 · authz 81 · p2.8 60/61 (ST6 wip-only). → R2 (reviewer, hunks 6ed2d5ce..0aded3e6 + 8 questions) + hunter re-check (N1–N4 + split × P2.9 tender surface) sent 23:0xZ.

## R2 (account B, 14 Oct 23:0xZ) — head 0aded3e6 / code 0e29ffb5 — **MERGEABLE-AFTER-FIXES** (reviewer a6c8dd68; full `scratchpad/p25r/R2.md`)
F1 **Medium** `src/lib/ai/proposals.ts:1325-1355` `restaurant_close_bill` calls `restaurantSvc.checkout` directly ⇒ `legacyCheckoutSplitGuard` never runs (= hunter N2 partial) · F2 **Medium** `src/lib/actions/restaurant.ts:289` `mergeSessionAction` → `table.mergeSession` moves the from-session's orders while its OPEN plan stays on the MERGED session ⇒ parts unpayable (`TABLE_SESSION_CLOSED`), whole-table pay on the into-session charges shares already paid · F3 Low `table.ts` P2.5 hunk: the no-reopen retry `once(false)` audits `pos.table.split.voidConflict` and returns 0 on any error ⇒ a deadlock/serialization failure marks the event DONE with the part still PAID (P2002 impossible with reopen=false ⇒ rethrowing `isTxConflict` cannot loop). Answers 1–8 verified (ruling 7 cases: other member ⇒ `STORE_CREDIT_NOT_OWNER` :2478; member part + no client memberId ⇒ part's member used :2482 (ok); part without member ⇒ NOT_OWNER :2522/:2542; createSale owner check still runs; M9 covers all four + no rows on refusal; merge hygiene: only P2.5 files vs 4967ce2d, service/tender/giftcard blobs identical; register.ts P2.9 markers 13→15 = P2.5 comments). Other legacy doors safe: `moveSessionAction`, `closeSessionAction`, `voidCheckoutAction`, `createStaffOrderAction`/`confirmOrderAction`.

## Controller rulings — fix round 2 (account B, 14 Oct 23:0xZ) — oracle first, red-before block 4 in `P2.5-red.txt`
1. **F1 / hunter N2** — marked hunk in `src/lib/ai/proposals.ts` `restaurant_close_bill`: call `legacyCheckoutSplitGuard` (same helper as ruling 2) before `restaurantSvc.checkout`, throw its reason (the proposal shows the refusal text); ORACLE-ADD **P8**: EQUAL-2 plan, part 1 paid ⇒ the proposal executor (call the same exported executor the AI path uses, or the function behind it — cite) refuses, session total unchanged, no sale, plan still OPEN; positive control = no plan ⇒ checkout succeeds (fixture cleaned).
2. **F2** — `mergeSessionAction` (`src/lib/actions/restaurant.ts`) refuses when `openSplitOfSession(from)` or `openSplitOfSession(into)` is set (actions layer like ruling 2; restaurant module bodies stay pinned); ORACLE-ADD **T5**: legacy merge with an OPEN plan on the from side and on the into side ⇒ refused, orders not moved, plan untouched; positive control = DONE plans only ⇒ merge ok and `repointSplitPlansInTx` behaviour (T4) unchanged.
3. **F3** — in the `table.ts` void-consumer hunk, the no-reopen retry rethrows when `isTxConflict(e)` (outbox retry, cannot loop with reopen=false); audit `voidConflict` + DONE only for the non-conflict refusal path. ORACLE-ADD **X5b** static pin (source: the retry catch tests `isTxConflict` before the audit) — X5 behaviour unchanged.
4. **Hunter Low (PIN pre-check)** — `regSubmitSplitPart` and `regSubmitTable` run `preverifyGiftPins` before opening the tx exactly as the register path does (cite the `service.ts:597` condition and widen it, marked hunk; no change to `giftcard/**`); ORACLE-ADD **C6**: 10 parallel part submits with a wrong PIN on one card ⇒ every result is `GIFT_CARD_PIN`/`GIFT_CARD_LOCKED`, no P2028/timeout, counter 5, card LOCKED, part OPEN, no bill (p2.9 G9 pattern; positive control = correct PIN on a fresh card pays the part once).
5. **Hunter residual** (legacy guards run outside the restaurant checkout tx — a plan created + part paid inside that window can still double-charge) → owner line + P2.11 follow-up (moving the guard inside `restaurant` needs the pinned module bodies; out of P2.5).
6. Gates after fix 2 (builder): typecheck · `qc-pos-p2.5` **49** (45 + P8 T5 X5b C6) forced ×2 + unforced · p2.9 62 · p2.4 50 · p2.6 67 · restaurant ×4 · p1.3 128 · p1.8 49 · hf-tx 22 · p1.18 81 · authz 81 · fitness ±env · fitness-pos · p2.8 (ST6 wip-only). Push, notes table (head, dirty=0), report ≤ 8 lines with the real SHA.
7. Then **R3** (reviewer, hunks only) + hunter sign-off on C6/P8 → controller merge gates on tree c (gates81: p2.5 · p2.9 · p2.4 · p2.6 · restaurant ×4 · p1.1 · p1.3 · p1.6 · p1.8 · hf-tx · authz · p2.8 after push · fitness · typecheck) → merge → **30/55** + TG.

## Fix round 2 delivered (account B, 14 Oct 23:5xZ) — head fe2db17b (code a5ff7cd1)
bcc95929 ORACLE-ADD P8 T5 X5b **C7** (C6 already exists — renamed, no other id changed) · red-before block 4 **46/49** (P8 red — the AI close-bill path double-charged a split table for ฿184.80 · T5 X5b red · C7 green-before: 10 wrong-PIN part submits did not exhaust the QC4 pool; ruling 4 applied anyway) · e3e86a83 F1 proposals.ts guard · 56c2120b F2 `mergeSessionAction` refuses with an OPEN plan on either side · 1a964205 F3 no-reopen retry rethrows on deadlock/write conflict · c4194261 hunter Low: `regSubmitTable`/`regSubmitSplitPart` preverify PINs via new marked export `preverifySaleGiftPins` (service.ts; giftcard/** untouched) · a5ff7cd1 owner line (ruling 5) + block 4 · fe2db17b notes (P2.11 F6). Gates head=a5ff7cd1 dirty=0: typecheck 0 · fitness 50/50 ±env · fitness-pos 8/8 · p2.5 49/49 ×3 · p2.9 62 · p2.4 50 · p2.6 67 · restaurant 6/6 · money 6/6 · pay 19/19 · void 11/11 · p1.3 128 · p1.8 49 · hf-tx 22 · p1.18 81 · authz 81 · p2.8 60/61 (ST6 wip-only). → R3 (hunks) + hunter sign-off sent.

## R3 (account B, 14 Oct 23:5xZ) — head fe2db17b / code a5ff7cd1 — **MERGEABLE** (reviewer a6c8dd68; full `scratchpad/p25r/R3.md`)
Rulings 1–5 applied: F1 `ai/proposals.ts:1355-1357` guard before checkout (P8) · F2 `actions/restaurant.ts:291-293` `legacyMergeSplitGuard` (`table-split.ts:604-609`) before `table.mergeSession` (T5) · F3 `table.ts:660-661` rethrow `isTxConflict` (P2034/40P01/write conflict), audit+DONE only on the P2002 branch which is unreachable with reopen=false; next delivery restarts at `once(true)` ⇒ no loop (X5/X5b) · ruling 4 `preverifySaleGiftPins` (`service.ts:364-366`) = marked one-line export of the private `preverifyGiftPins` (same advisory key, same dup short-circuit, slot always committed, no PIN logged; refusals via `PosSaleError` → `regRefuse`); giftcard/** + `pos-sale-contract.json` untouched (C7) · oracle bcc95929 additions only with dated markers, 49 checks, red-before block 4 46/49 · foreign files inside `POS P2.5 ▸ … ◂` only · gates head=a5ff7cd1 dirty=0 as reported · ruling 5 owner line + P2.11 F6 present. **Nit (accepted, follow-up)**: on a part a correct PIN is hashed twice (`createSale` with `callerTx` has `pinsVerified=false`, `service.ts:605`); passing "verified" needs a `CreateSaleInput` field (contract sha) → P2.11 line.
→ Controller: merged locally into session/pos **96cc5f4f** (diff vs a5ff7cd1 on src/prisma/scripts = empty) · gates81 on tree c @96cc5f4f (`pos-gates81-c`: p2.5 · p2.9 · p2.4 · p2.6 · restaurant ×4 · p1.1 · p1.3 · p1.6 · p1.8 · hf-tx · p1.12 · p1.18 · authz · p2.8 · fitness ±env · fitness-pos · typecheck) · controller tree `prisma generate` ✓ · QC5 migrate deploy p25_split ✓ · push after gates81 green **and** the hunter sign-off.
