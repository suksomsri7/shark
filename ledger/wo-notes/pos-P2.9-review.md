# P2.9 S review R1: head b9e562c3 (code 0e9e3144 · gates at 08cb294c) · read-only · 14 Oct
**VERDICT: MERGEABLE-AFTER-FIXES.**
- Every satang on the walked ฿300 bill balances.
- The PIN is never stored, logged or echoed.
- Reversals are complete and idempotent.
- One lock-order defect needs a one-line fix (F1). The other findings are Low: an owner line or a small fix each.

## Findings
- **F1 Medium · lock-order cycle (item 2 "no cycle" fails).**
  - The tender path locks the card first, then the receipt counter: `prepareSaleTenders` → `lockTenderCards` (pos/service.ts:322, called from :655), then `posReceiptCounter.upsert(unit, period)` at :693.
  - Two existing paths lock in the opposite order, counter first and card second:
    - `reload`: giftcard/service.ts:780 `createSale(callerTx)`, then the card `updateMany` at :789.
    - The legacy discount `memberChoices.giftCard`: `member.applyOnSale` → `use` at pos/service.ts:769, after :693.
  - Input: register 1 pays with card A while register 2, on the same unit, reloads card A or uses it as a legacy discount at the same moment.
  - Result: Postgres detects a deadlock (40P01) and aborts one transaction. `createSale` (:562) and reload only retry P2002, so the cashier sees INTERNAL. No money is lost, because both transactions roll back whole.
  - Smallest fix: move `lockTenderCards` out of `prepareSaleTenders` to just after the counter upsert (:693). Prepare and the PIN check stay before the counter. Every path then locks stock → counter → card.
  - Two tender bills still serialize on the counter or the sorted card ids. C1–C4 hold the card lock from a third transaction, so they stay valid.
- **F2 Low · a void onto an EXPIRED card strands the liability.** `refundTenderUse` (giftcard/service.ts:1392) adds the balance back whatever the card's status, and leaves the status as it is.
  - Input: bill paid by card → the card expires (expireDue books Dr 2110 / Cr 4900 for the leftover and sets the balance to 0) → the bill is voided.
  - Result: the sale JV reversal credits 2110 by X and the EXPIRED card gets balance X. The card is unusable and is never swept again, so 2110 stays overstated forever.
  - Fix (owner rule): when the card is EXPIRED, book an EXPIRE txn plus `postGiftCardExpire(X)` in the same step, or redirect the money to store credit. Add one V-check.
- **F3 Low · a member merge orphans store credit on a later void.** `foldStoreCreditOnMerge` (:1487) empties the merged member's credit card and sets `ownerCustomerId=null`.
  - Input: a pre-merge bill paid with that credit is voided after the merge.
  - Result: the balance goes back to the ownerless card (:1392). `prepareStoreCreditTender` finds cards by owner, so nobody can spend it and the 2110 stays stranded.
  - Fix: in `refundTenderUse`, if the card is STORE_CREDIT with no owner, credit the keeper's card instead. Keeping the gone card owned by the keeper is blocked by the unique index, so redirecting is the cleaner fix. Add the merge oracle check (see item 7).
- **F4 Low · store-credit cards accept gift-card operations.**
  - `loadByNumber` (:212) has no `kind` filter, so reload, sell-replay and suspend all work on `SC-…` numbers.
  - Staff can read full SC numbers in the gift-card list, which also has no kind filter (the builder already has an owner line for that).
  - Input: reload ฿500 cash onto an SC card.
  - Result: the bill is flagged `giftCardId`, so its revenue post is skipped. `accountingDocId` is null, so no reload JV is posted either. The cash is never booked, and the later STORE_CREDIT payment posts Dr 2110 for it, driving 2110 negative.
  - Fix: `loadByNumber` refuses `kind STORE_CREDIT` (NOT_FOUND), or `reload` checks the kind.
- **F5 Low (pre-existing, now exposed at the register) · wrong-PIN counter can lose updates.** `verifyPin` computes `failed = card.pinFailedCount + 1` from an unlocked read (:257). N parallel wrong-PIN submits on one card add only +1. Only staff with `pos.sale.create` can do this.
  - Fix (in the gift-card module): an atomic increment that returns the new count.
  - Related: `verifyPin` takes a second pool connection while the sale transaction holds its own (adapter-pg pool, default max 10). Owner line, not blocking.

## The ฿300 bill, walked by hand (฿100 gift card + ฿200 cash + ฿20 tip · VAT 7% · tip ledger 2190 LIABILITY)
- **Submit:** `GIFT_CARD 10000 {number, pin}` + `CASH 22000`, tip 2000. Σ 32000 = grand 30000 + tip, and the tip 2000 ≤ the cash-like 22000 (service.ts:282–286).
- **Inside one transaction:**
  1. Advisory lock and duplicate check.
  2. Prepare: card found by tenant + number, kind GIFT, usable, 10000 ≤ balance, PIN checked by sha256 (the fail counter is written outside the transaction).
  3. Card row locked → receipt counter → PosSale with grand 30000.
  4. Two PosPayment rows (ids set by the code).
  5. `useTender`: `updateMany … ACTIVE, gte 10000` → USE 10000, `refType PosPayment`, `refId` = the payment id, key `pos-gct-<saleId>-<cardId>`, `balanceAfter` read from the locked row.
  6. `PosPayment.giftCardId/giftCardTxnId` written.
  7. Outbox `giftcard.used {tender:true}` with no PIN.

  There is no `postGiftCardUse`.
- **JV `PosSale#<id>#PAID`:**

  | Account | Dr | Cr |
  |---|---|---|
  | 1000 cash | 220.00 | |
  | 2110 stored value | 100.00 | |
  | 4000 revenue | | 280.37 |
  | 2200 output VAT | | 19.63 |
  | 2190 tips | | 20.00 |
  | **Total** | **320.00** | **320.00** |

  `splitIncludedVat(30000)` gives base 28037 and VAT 1963. The ABB document total is 300.
- **Shift:** expected cash goes up by 220.
- **Void:** `voidSale` sets VOIDED, then the `pos.sale.voided` consumer runs:
  - (a) `reverseFor(PosSale)` posts the mirror entry: Dr 4000 280.37, Dr 2200 19.63, Dr 2190 20, Cr 1000 220, Cr 2110 100.
  - (b) `tenderSaleVoided` (outbox-consumers.ts:750, a main step that throws on failure, so it retries) writes REFUND 10000 under `FOR UPDATE` with key `giftcard-refund-<USE>`. The card goes DEPLETED→ACTIVE and no JV is posted.
  - (c) The member bridge's `refundUsesForSale` only picks `refType "PosSale"`, so it adds nothing.
  - Draining the queue twice writes no second REFUND. Net 2110 = 0 and the card is back to 100.
- **Partial refund** (line of 225 → 100 to the card + 125 cash): `planRefundTenders` caps the card at its share (325) minus what was already refunded to it. `refundToCard` writes REFUND 100 (`refType PosRefund`, key `pos-refund-<refundId>-<cardId>`) inside the refund transaction. The credit note credits 2110 100 and cash 125.

## Deviations (vs §10 rulings)
| # | Deviation | Ruling |
|---|---|---|
| 1 | `prepareGiftTender` + `useTender` instead of `use({tender:true})` | **Accept.** `use()` stays frozen (§7), the decrement happens inside the sale transaction (r13), and a wrong PIN gives no bill but keeps the counter. The builder's lock-order reason is partly wrong (F1). |
| 2 | REFUND type reused, with `refType PosRefund` / `GiftCardTxn` | **Accept.** §3 forbids GiftCardTxn enum changes and the refType tells them apart (r10). |
| 3 | No deposit column or table | **Accept** (r6, deposits are P2.9b). |
| 4 | HOTEL means `BusinessUnit.type` | **Accept.** There is no HOTEL system type (r8). |
| 5 | Store-credit merge fold | **Accept**, with F3 fixed and an oracle check added. |
| 6 | Prod `PosPayment` row count left as a controller line | **Accept.** Adding nullable columns is metadata-only. |
| 7 | `payOrder` also refuses STORE_CREDIT | **Accept.** Screen 09 has no member-owner step, so this is safer (in the spirit of r14b). |
| 8 | Tip-funding rule applies to every createSale bill with a tip | **Accept.** Tips could not be turned on before this card. |

## Verified OK
1. **Schema/migration** `20261209100000`:
   - `lock_timeout 3s`, `ADD VALUE IF NOT EXISTS` ×2, nullable columns, guarded `CREATE TYPE`, `kind DEFAULT 'GIFT'`.
   - Partial unique index `(systemId, ownerCustomerId) WHERE STORE_CREDIT`.
   - Nothing dropped or renamed; the QC4 deploy shows rc 0 in the notes.
2. **Gift card paid inside the sale transaction:**
   - Rows are checked before the counter (service.ts:259–287): ≤3 distinct cards, `giftCard` only on GIFT_CARD rows, not on gift-card sale bills, not combined with `memberChoices.giftCard`.
   - STORE_CREDIT needs the bill's member as owner (`prepareStoreCreditTender`); the register refuses walk-in bills earlier (register.ts:2271).
   - The decrement is a guarded `updateMany gte`, so the balance cannot go negative.
   - A replay hits the advisory lock and duplicate check, so there is no second PIN check or decrement.
   - C1/C2 are deterministic: they wait for ≥2 waiters via `pg_blocking_pids`.
   - `afterSaleCommitted` is unchanged and there is no new `createSale` call site.
3. **PIN:**
   - Only `verifyPin` reads it (sha256 compare); `createMany` writes explicit fields only.
   - No PIN in the outbox payload, the lookup DTO (masked number) or the receipt/bill `card {kind, numberMasked, balanceAfterSatang}`.
   - Refusal messages are fixed text and the `console.error` guards log only the exception.
   - Held carts and approval snapshots do not store pay rows with a PIN.
   - The APIN check searches the audit log, outbox, payment rows, txns, DTOs and error text.
4. **Accounting:**
   - GIFT_CARD/STORE_CREDIT map to the `STORED_VALUE` channel → Dr 2110 (account-bridge.ts:21–26, index.ts:192), so revenue and VAT post on the full bill.
   - The card payment posts no JV of its own. CD1b holds because the Dr 2110 does not depend on `accountingDocId`.
   - The tip credits the settings ledger. It is checked as LIABILITY both at posting (`liabilityLedgerOf`) and at save (payment-settings.ts:108); if the ledger is invalid, posting throws and retries.
   - A refund row of type `STORED_VALUE` credits 2110. The `account/**` changes are additive (`crExtra`, a reader).
5. **Reversals:**
   - The void step is retryable, works for walk-in bills, and is idempotent per USE (key, re-read under lock, P2002 path).
   - Refund-to-card is capped per card and serialized by the bill lock (V9).
   - A suspended or expired card at refund time gets `REFUND_METHOD_INVALID`, the transaction rolls back and the cashier picks cash or store credit.
   - Tips are never refunded (T4), and voiding a bill that already has refunds is blocked by `HAS_REFUNDS`.
   - The one gap is EXPIRED-at-void (F2).
6. **Other callers:**
   - `payOrder` refuses card payments (order.ts:1115).
   - The API's `EXTERNAL_PAY_TYPES` plus `.strict()` refuse them too (O1/O2).
   - The contract diff against 57dc226b is exactly the 3 new keys plus the `order.ts` caller line.
   - The U4 and HT6 registries are unchanged.
7. **Store credit:**
   - Created by an `ON CONFLICT` insert, then lock and increment, with key `pos-credit-<refundId>`.
   - The PIN is a random hash, `expiresAt` is null (expireDue skips it) and it sits in 2110.
   - Lookup and prepare refuse kind STORE_CREDIT as a gift card.
   - There is no merge check yet (risk: F3). Smallest check to add: merge X+Y with credit on both ⇒ one card with the summed balance, the other DEPLETED with no owner, 2 ADJUST rows, total balance unchanged, and X can then pay with the credit.
8. **Tiles/actions:**
   - `registerPayTenders` keeps deposit visible but disabled ("SOON") and shows room charge only on HOTEL units.
   - The two new actions are async, check session and scope, and use no raw prisma.
   - The receipt shows the card number masked to the last 4, plus a balance line.
   - th/en messages pass (ST4) and authz is 81/81.
9. **ORACLE-EDITs:**
   - Only p1.6 K4/K5 `TIP_BOOKED=true` and p1.12 ST4 (now VOUCHER only), both with the dated marker.
   - Otherwise `scripts/` only adds `qc-pos-p2.9` (48 checks) and the contract snapshot.
   - The red-before is credible: 6/45, then block 2 at 24/48; L/A2/Z are green by design.
10. **Deviations:** see the table above.
11. **Gates** (notes, head=08cb294c dirty=0), all as requested:
    - typecheck 0 · fitness 50/50 ±env · fitness-pos 8
    - p2.9 48 ×3 · hf-tx 22 · p1.6 48 · p1.8 49 · p1.12 72 · p1.3 128 · p1.1 180
    - account 16 · p1.7 33 · authz 81 · p2.8 59/61

    The two p2.8 reds, ST6 and L2, both accept the merge-base sha (qc-pos-p2.8.mts:732, :751), so they go green after the merge. `qc-account-cpa` 107 only ran at a72b170b, before the CD-P29-1 patch; that patch does not touch account. I checked the gates against the notes only; the raw logs are outside my read scope.
12. **Merge hygiene:**
    - a72b170b changes nothing outside the ledger.
    - 08cb294c's non-ledger changes are line-for-line the upstream P2.6U changes (57dc226b..23561d97, 41 files).
    - The register.ts P2.6/HF-PP2 hunks are intact (6 marks before and after).
    - The giftcard/service.ts HF-GC/GC2 hunks are intact; P2.9 only adds code there, plus one line in `mergeGiftCards`.

## Follow-ups
- **P2.9U:**
  - The PIN must stay in component state only.
  - A GIFT_CARD_CHANGED banner should trigger a fresh card lookup.
  - The store-credit chip reads `registerMemberBenefits.giftCards`, which needs a kind filter.
  - Visual states per §9.
- **P2.9b:** deposits (VAT split, `PosDeposit`, U4/HT6.4 ORACLE-EDIT).
- **P2.11 / API card:** gift card and store credit through the API and online orders.
- **Owner lines:**
  - F2: rule for a void onto an expired card.
  - F4: kind filter on the gift-card list/KPI and `loadByNumber`.
  - F5: atomic PIN counter, and the second pool connection.
  - CD1b, and reloads while the accounting link is off (2110 goes debit).
  - CD9: 2111 split.
  - O24: accounting owner confirms the VAT model before go-live.

Report saved at `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p29-r/REPORT.md`.

## Hunter (money, parallel to R1 — `pos-P2.9-hunt.md`): FINDINGS — H1 Med cash-out of the card/credit share on refund · H2 Med PIN lockout bypass with parallel wrong PINs (= F5) · H3 Med store credit restored into a merged-away card (= F3, + `issueStoreCredit` race) · H4 Low void onto EXPIRED card (= F2) · H5 Med archived/retyped tip ledger dead-letters every tipped bill's JV · H6 Low (forward, U) PIN in sessionStorage / PIN-less replay refused ⇒ double charge.

## Controller rulings — fix round 1 (account B, 14 Oct 18:2xZ) — binding
1. **F1 → fix**: lock the tender card rows **after** the receipt counter upsert (prepare + PIN check stay before); global order stock → counter → card. C1–C4 stay valid.
2. **H1 → fix**: `planRefundTenders` caps cash-like refund rows at (cash-like paid − cash-like already refunded); the card/credit share goes back to the card; when the card is unusable (SUSPENDED/EXPIRED/LOST) the share goes to the bill member's store credit, and only for a walk-in bill may it go to cash (manager approval path + audit reason). **ORACLE-EDIT V4** (dated) to a pro-rata/capped split; **ORACLE-ADD** R-cap (100 % GC bill → refund CASH ⇒ `REFUND_METHOD_INVALID`; card SUSPENDED + member ⇒ store credit; card SUSPENDED + walk-in ⇒ CASH allowed with approval).
3. **H2/F5 → fix** in the gift-card module: one SQL `UPDATE … SET pinFailedCount = pinFailedCount + 1, pinLockedUntil = CASE … END WHERE id = $1 AND (pinLockedUntil IS NULL OR pinLockedUntil <= now()) RETURNING …`; zero rows ⇒ LOCKED; the lock check uses the returned row. **ORACLE-ADD** 20 parallel wrong-PIN submits ⇒ `pinFailedCount ≥ 5` + `GIFT_CARD_LOCKED`, 0 bills. Owner line for the second pool connection (reviewer F5 note).
4. **H3/F3 → fix**: `refundTenderUse`/`refundToCard` on a STORE_CREDIT card with no owner follow the MERGE ADJUST txn (`refId` = keeper card) and credit the keeper; `issueStoreCredit` re-reads customer status ≠ MERGED under the card lock. **ORACLE-ADD** merge check (X+Y credit → merge ⇒ one card with the sum, the other DEPLETED ownerless, 2 ADJUST, total unchanged; X pays with it) + (credit spend → merge → void ⇒ keeper +300, orphan 0).
5. **H4/F2 → fix**: restore onto a card that is EXPIRED (or past `expiresAt`) writes REFUND then EXPIRE for the same satang and posts `postGiftCardExpire` when `accountingDocId` is set (2110 net 0 — expiry policy wins; owner line). **ORACLE-ADD** C4 + void ⇒ balance 0, 2110 net 0, 1 EXPIRE JV.
6. **H5 → fix** both sides: `createSale` re-runs `tipLedgerOk` when `tipSatang > 0` (VALIDATION, no bill, clear message) **and** `account/coa.ts archiveLedger`/type edit refuses a ledger referenced by a POS tip setting (approved exception to §OUT "no account writers": marked hunk ≤ 15 lines, read-only lookup of the setting). **ORACLE-ADD** 2190 archived after enable ⇒ tipped submit refused, 0 DEAD `pos.sale.paid`; archive attempt ⇒ refused.
7. **F4 → fix**: `loadByNumber` refuses `kind STORE_CREDIT` as NOT_FOUND for reload/sell-replay/suspend/transfer; gift-card list/KPI readers filter kind GIFT (SC numbers never listed). **ORACLE-ADD** reload onto an SC number ⇒ refused, 0 PosSale.
8. **H6 → S part now**: `regParseSubmit` accepts a PIN-less GIFT_CARD row **only** when the idempotency key already has a sale (duplicate lookup before the PIN regex) ⇒ replay returns the same bill; **ORACLE-ADD** PIN-less replay of a committed key ⇒ same sale, no second decrement; PIN-less first submit ⇒ VALIDATION. P2.9U contract line: strip `giftCard.pin` in `savePending`; PIN stays in component state.
9. Oracle first for every add (dated markers), red-before block 3 on the current head → `P2.9-red.txt`; expected `qc-pos-p2.9` ≈ 57. Gates: typecheck · fitness ±env · fitness-pos · p2.9 forced ×2 + unforced (residue 0) · hf-tx 22 · p1.6 48 · p1.8 · p1.12 72 · p1.3 128 · p1.1 180 · account 16 · `qc-account-cpa` 107 (account hunk) · p1.7 33 · authz 81 · p2.8 (ST6/L2 wip-only). Then **R2 (hunks) + hunter re-check** in parallel → merge upstream (P2.6U already in) → merge gates on tree b → merge → **29/55**.

## R2 (account B, 14 Oct 19:1xZ) — head affd5640 / gates 2612ee53 — **MERGEABLE-AFTER-FIXES** (full report `pos-P2.9-review-R2.md`)
Rulings 1–9 implemented; oracle credible (9 adds + V4/V6/V7 edits dated; red3 49/57). **G1 Medium**: the H4 fix treats `expiresAt ≤ now` as expired even while the card is still ACTIVE (sweep not yet run) ⇒ refunds X, expires only X, sets EXPIRED ⇒ the remaining balance B is stranded in 2110 forever (expireDue only sweeps ACTIVE). Fix: immediate refund-then-expire only when `status === "EXPIRED"`; a past-date ACTIVE card stays ACTIVE for the next sweep; ORACLE-ADD C5b. G2/G3 Info (V5 figure; cash cap not forced pro-rata — acceptable). All R1/H findings closed except F2/H4 reopened as G1; H6 UI part = P2.9U contract.

## Hunter re-check (`pos-P2.9-hunt.md` §Re-check): H1 H4 H6 closed · H2 partial (success path trusts the stale row ⇒ N hashes evaluated per window, latency reveals the PIN = N3) · H3 closed with a Low race (`mergeTargetOf` resolved before the lock) · H5 closed with a Low residual (`setLedgerActive(false)` unguarded) · **N1 Med = R2 G1** · N2 Low (partial refund STORE_CREDIT for a merged member impossible) · N3 Low (reserve-before-verify).

## Controller rulings — fix round 2 (account B, 14 Oct 19:2xZ) — binding
1. **G1/N1 → fix (reviewer's variant)**: immediate REFUND-then-EXPIRE only when the locked row's `status === "EXPIRED"`; a past-date ACTIVE card stays ACTIVE (balance B + X) for the next `expireDue` (HF-GC2 locked read ⇒ one EXPIRE B + X, one JV). **ORACLE-ADD C5b**: past-date ACTIVE card balance 200, void a ฿100 tender ⇒ ACTIVE balance 300, no EXPIRE yet; then `expireDue` ⇒ EXPIRE 300, 2110 net 0.
2. **H2/N3 → fix**: reserve before verify — `UPDATE … SET pinFailedCount = pinFailedCount + 1 WHERE id = $1 AND unlocked AND pinFailedCount < 5 RETURNING …` first (0 rows ⇒ LOCKED, no hash compare), then compare; on a match reset the counter with a conditional write (only if not locked). **ORACLE-ADD G11**: 50 parallel submits on a count-0 card, one with the right PIN ⇒ once locked every response is `GIFT_CARD_LOCKED`, `pinFailedCount` ≤ 5, at most 1 bill (if the right PIN beat the lock) — assert the counter never exceeds 5 and no bill after the lock.
3. **H3 residual → fix**: re-resolve `mergeTargetOf` **after** the `FOR UPDATE` (lock old card → resolve → lock keeper in sorted order; if the sorted order puts the keeper first, lock both after resolving under a short advisory lock on the old card id).
4. **H5 residual → fix**: `setLedgerActive(false)` gets the same `usedAsPosTipLedger` guard (same marked block style, ≤ 5 lines).
5. **N2 → fix**: `planRefundTenders` resolves `Customer.mergedIntoId` (bounded chain ≤ 5) to the keeper for STORE_CREDIT refunds; **ORACLE-ADD RC2**: credit bill → merge → partial refund STORE_CREDIT ⇒ keeper credit +x.
6. **H1 functional note → fix**: the walk-in cash-out approval path accepts a manager PIN approval (`managerOk` = `canRefund` **or** a valid manager PIN/approval token, same as the existing refund approval flow) so STAFF + manager can do it; audit keeps `cardShareToCash` + reason + approver. Extend RC1 with the STAFF + manager PIN sub-case.
7. Oracle first (dated markers), red-before block 4 on the current head → `P2.9-red.txt`; expected `qc-pos-p2.9` ≈ 60. Gates as fix round 1 (typecheck · fitness ±env · fitness-pos · p2.9 forced ×2 + unforced · hf-tx · p1.6 · p1.8 · p1.12 · p1.3 · p1.1 · account · cpa 107 · p1.7 · authz · p2.8 wip-only). Then **R3 short (hunks) + hunter final** in parallel → merge upstream → merge gates on tree b → merge → **29/55**.

## R3 (account B, 14 Oct 21:0xZ) — head 318ef7aa / gates 1d6d3abb — **MERGEABLE** (full report `pos-P2.9-review-R3.md`)
All fix-round-2 rulings in place; deviation 08ef0359 (PIN pre-check in its own short tx, slot reserved before compare, sale tx re-checks without comparing) accepted; G1 Info = hunter N5 (keeper merged again during a void); G2 Info (G11 regression guard). Hunter final: N1 N2 N3 H5 H1 closed; **N4 Low** (same key, different card ⇒ served the first bill) · **N5 Low** (keeper re-merge race).

## Controller rulings — fix round 3 (account B, 14 Oct 21:0xZ)
N4 → card number/giftCardId in both idempotency bags for GIFT_CARD rows ⇒ CONFLICT (ORACLE-ADD G12) · N5 → re-resolve the keeper after locking, loop ≤ 5 (ORACLE-ADD MG3). Gates: typecheck · fitness ±env · fitness-pos · p2.9 62 ×3 · hf-tx · p1.3 · p1.1 · p1.6 · account · p2.8 wip-only. Controller reads the diff (no R4) → merge local → merge gates on tree b → push → 29/55.
