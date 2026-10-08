# C5.4-C — independent money-bug hunt, round 10 (target 01d9dbd8 = r10 d04d7527 + controller oracle edit; change = `git diff afa8833c d04d7527 -- src/`)

QC2 only · probes `scripts/pending/hunt-54c-r10/probe-r10{a..g}.mts` · logs `/tmp/c54c-logs/r10hunt/probe-r10{a..g}.log` (+ `probe-r10g-G6.log`) · every probe ends `CLEAN left=0`.
No src/prisma edits. Nothing committed. The tree's `scripts/acc-v2-expected.json` modification is not mine.

## Answers to the builder's questions

**Q1: my r9 T1/T1s "2210 Δ (expect 0)" was wrong; the builder is right.**
- I measured 2210 from before the payment (after invoice issue). Issuing a VAT-on-payment invoice parks the VAT in 2210 (credit), and the one net collection moves it to 2200 once. So the right expectation after bounce + re-collect is 2210 +1,400,000 (T1) and +700,000 (T1s), with 2200 −1,400,000 / −700,000.
- The r9 finding itself stood on 2200 (−2,800,000 vs −1,400,000) and the double tax invoices.
- Re-run with the corrected oracle (`probe-r10a` Q1): `after bounce 2200 Δ 0 2210 Δ 0 · after re-collect 2200 Δ -1400000 (expect −1,400,000) · 2210 Δ 1400000 (expect +1,400,000)` and `T1s … 2200 Δ -700000 · 2210 Δ 700000`. Green.

**Q2: the R1d state as replayed is no longer reachable through the product, but the same residue (a voided CHEQUE payment, no cheque, 1040 loaded) still is, via approveReceiptWithPayments path ②.**
- R1d records child payments outside the group transaction. The product can't do that any more:
  - The group path is one transaction: children locked ↑id, duplicate check inside, cheque created and linked in the same transaction.
  - The form path is payment + cheque + link in one transaction.
  - `createChequeInTx{paymentId}` locks the document and refuses a voided payment (R1d shows that refusal).
  - `recordPaymentAction` (channel taken from the form) has no UI caller, and REST/AI derive the channel. (Read, not run.)
- **Still reachable (ran it):** `probe-r10b` P2c. A void landing between issue and cheque link in path ② succeeds 8/8. It leaves the receipt issued, the payment voided, no cheque, 1040 +1,070,000, and retry blocked — see R10-6 (the residue comes from R10-5).

## Findings

| id | sev | origin | one line |
|---|---|---|---|
| R10-1 | MAJOR | NEW in r10 | Group head lost update. `syncGroupHeadInTx` reads the children before taking any head lock, so two concurrent child changes of one group each write a head from a stale sibling. Wrong 20/20 (bounce ∥ bounce), 20/20 sales + 10/10 purchase (pay ∥ pay in different months), 10/20 (bounce ∥ voidPayment). |
| R10-2 | MAJOR | NEW in r10 | Deadlock: recordGroupPayment (one tx) ∥ bounce of another cheque batch on the same group — 8/20 with Postgres 40P01, 13/20 with one side failing. |
| R10-3 | MAJOR | NEW in r10 (bounce arithmetic; builder-admitted edge) | Deposit paid transfer-first then cheque, then bounce: bank 1010 +2,210,000 and 1040 −2,210,000 remain (control []). The DEPOSIT cash leg is taken from the deposit JV (the first payment's account). |
| R10-4 | BLOCKER | pre-existing (posting, outside batch) | A deposit paid by a mix of transfer + cheque posts the whole deposit to ONE cash account (the first payment's). Transfer-first then clear: bank +5,420,000 / 1040 −2,210,000 (truth bank +3,210,000, 1040 0). Cheque-first: 1040 holds the transfer. |
| R10-5 | BLOCKER | pre-existing | voidPayment (UI and REST `payments.void`) on a cash-sale receipt reverses nothing, because the cash leg is on the receipt's own JV. Bank stays +1,070,000, AR 0, while the receipt shows unpaid. Re-paying: bank +2,140,000, AR@customer −1,070,000. The "ONE unwind" (VOID mode) keeps this gap; CHEQUE mode (bounce) handles the same receipt correctly. |
| R10-6 | MAJOR | pre-existing window (builder-admitted: path ② not atomic) | Void inside approveReceiptWithPayments path ② (after issue, before cheque link): 8/8. Approve fails, receipt issued, 1040 +1,070,000 with no cheque (via R10-5), retry refused ("ใบเสร็จนี้ออกแล้ว"). |
| R10-7 | BLOCKER | pre-existing | A deposit applied to an invoice stays DEDUCTED after that invoice is voided. The applied-guard then passes but the unwind (VOID or CHEQUE) skips the deposit JV reversal (it requires AWAITING_DEDUCT). Cash/1040 +3,210,000, 2110 −3,000,000, 2200 −210,000 remain while the deposit shows unpaid. It is also the documented exit of the new "deposit applied" bounce refusal. |
| R10-8 | MINOR | NEW in r10 | One-tx group payment has a size ceiling. 50 children (WHT + auto tax invoice + cheque) take 23.9 s; 100 children fail at 40.2 s with a generic error and write nothing. Round 9's per-child transactions had no ceiling. |
| R10-9 | MINOR | pre-existing (R9-7, not fixed by ruling D) | Journal-number race under load: while one cashier pays 5-child cheque batches, 22/30 concurrent single payments by two other cashiers fail (P2002); batches 10/10 ok. Whole batches now abort, not half-batches. |
| R10-10 | NOTE | pre-existing (scope of ruling C) | A credit note on a child does not re-sync the head: head PARTIAL/1,070,000 while the panel shows outstanding 0 (truth PAID/2,140,000). |

---

### R10-1 MAJOR — group head lost update (NEW)
- Where: `service.ts:3243-3274` `syncGroupHeadInTx` reads relations + children's paidTotal (READ COMMITTED), then `update` on the head. No `FOR UPDATE` on the head before the read. Callers hold only their own children's locks (`recordPayment` `service.ts:~2723`, `voidPayment` :2987, `restoreDocForCheque` via `syncGroupHeadsOfDocsInTx`, `recordVendorPayment`/`voidVendorPayment`).
- Repro:
  - `probe-r10c` H2 (children paid in different months so the journal-number race doesn't pre-empt): `H2 IN pay∥pay ×20: {"ok|ok head WRONG":20} · e.g. head PARTIAL/10700000 vs children truth PAID/21400000` · `H2 OUT pay∥pay ×10: {"ok|ok head WRONG":10}`.
  - `probe-r10g` G6: `bounce(batch1 a,b) ∥ bounce(batch2 c,d) ×20: {"ok|ok head WRONG":20} · e.g. head PARTIAL/3210000 vs truth paid 1070000` · `bounce(batch1) ∥ voidPayment(e) ×20: {"ok|ok head WRONG":10,"ok|ok head right":10} · e.g. head PARTIAL/3210000 vs truth 2140000`.
- Money: billing-note / combined-payment head paidTotal off by one child's amount (10,700,000 / 1,070,000–2,140,000) with the wrong status. No GL impact. Two cheques bounced from one bank statement is a normal day.
- Origin: NEW. The sync is new in r10; before, the head just wasn't synced on these paths (R9-6).

### R10-2 MAJOR — deadlock: group payment ∥ bounce of another batch on the same group (NEW)
- Repro `probe-r10d` G3: `group(a,b by cheque) ∥ bounce other batch cheque ×20: {"GENERIC|ok":5,"ok|ok":7,"ok|GENERIC":8} · raw {"thai-refusal":5,"DEADLOCK":8}`.
- The other pairings ran clean (recordPayment/CN/voidDocument on a child → clean refusal; voidPayment on another child → ok|ok).
- Money: none — the victim rolls back and gets "บันทึกชำระไม่สำเร็จ". It is an I5 violation, 40 % in this pairing.
- Origin: NEW. Both transactions now update the group head (r10 C). Mechanism UNVERIFIED (see below).

### R10-3 MAJOR — mixed deposit, bounce arithmetic (NEW, builder-admitted)
- Where: `service.ts:3197-3207` (DEPOSIT gl: `cashLine` = the one debit line of the deposit JV, amount = this payment) + `cheque.ts` `chequeUnwindLines` DEPOSIT branch.
- Repro `probe-r10b` D2:
  - Control: `transfer-only partial … TBΔ []`.
  - `D2 transfer-first: pay ok → TBΔ ["1010-01:3210000","2110:-3000000","2200:-210000"] · bounce ok → … TBΔ ["1010-01:2210000","1040:-2210000"]`
  - Same with CLEARED: bounce ends the same.
  - Cheque-first bounce is right (`TBΔ []`).
- Money: expected [] (the design does not post a partial deposit). Actual: bank +2,210,000 of money that never arrived, 1040 −2,210,000.

### R10-4 BLOCKER — mixed-channel deposit posting (pre-existing, outside the batch)
- Where: `gl.postDocument` deposit case — posts the whole deposit's cash leg to the finance account of one payment.
- Repro `probe-r10b` D2:
  - `transfer-first + CLEARED: … after clear ["1010-01:5420000","1040:-2210000",…] (truth: bank 1010 +3,210,000, 1040 0)`
  - `cheque-first + CLEARED: … after clear ["1010-01:2210000","1040:1000000",…]`
- Money: bank overstated 2,210,000 (transfer-first) or understated 1,000,000 with 1040 stuck +1,000,000 (cheque-first), with no bounce involved.
- Normal user reachable (deposit paid part transfer, part cheque). R10-3 sits on top of this.

### R10-5 BLOCKER — voidPayment on a cash-sale receipt (pre-existing)
- Where: `service.ts:3191` VOID mode = `reverseFor(payment)` only. A cash-sale RECEIPT (path ②) has no payment JV — the cash is on the receipt's own JV (`gl.ts ~519`). Reachable from UI `payment-actions.ts:176` `voidPaymentV2Action` → `voidPaymentAny`, and REST `payments-write.ts:247` `payments.void`. No receipt guard.
- Repro `probe-r10b` P2b:
  - `cash-sale by transfer ok → voidPayment ok → {"status":"AWAITING_PAYMENT","paidTotal":0} · TBΔ ["1010-01:1070000","2200:-70000","4000:-1000000"] (truth: bank 0, 1100@cust +1,070,000)`
  - `re-pay ok → TBΔ ["1010-01:2140000","1100@cust:-1070000",…] (truth: bank +1,070,000 once, 1100 0)`
  - Contrast, same receipt paid by cheque then bounced (CHEQUE mode, MIRROR): `P2a … TBΔ ["1100@cust:1070000","2200:-70000","4000:-1000000"]`, which is right.
- Money: bank +1,070,000 phantom, AR under by 1,070,000, per voided cash-sale payment.
- Origin: pre-existing (c10ee3f9 voidPaymentInTx did the same `reverseFor(payment)`). It survives the r10 "one unwind" parity claim.

### R10-6 MAJOR — void inside approveReceiptWithPayments path ② (pre-existing window)
- Where: `payment.ts:383-446`: attach → issue → WHT cert → createCheque{paymentId} are separate transactions. The new `createCheque` voided-payment guard turns the link into a refusal but leaves the rest committed.
- Repro `probe-r10b` P2c:
  - `void inside path ② ×8: {"approve FAIL(รายการชำระนี้ถูกยกเลิกแล้ว — ผูกเช็คไม่ได้ …) · void ok · cheque none":8}`
  - `P2c state receipt {"status":"AWAITING_PAYMENT","paidTotal":0} payment voided true · TBΔ ["1040:1070000","2200:-70000","4000:-1000000"] · retry approve → FAIL(ใบเสร็จนี้ออกแล้ว)`
- Money: 1040 +1,070,000 that no cheque can clear; the receipt shows 1,070,000 owed while GL AR is 0. Needs a second user voiding within the window (8/8 with a poller).

### R10-7 BLOCKER — deposit stays DEDUCTED after the deducting invoice is voided (pre-existing)
- Where:
  - `service.ts:2369-2372`: issuing the invoice sets the deposit to DEDUCTED; nothing sets it back when that invoice is voided.
  - `assertDepositNotAppliedInTx` (`service.ts:3128`) only checks the relation target's status, so it passes.
  - `unwindPaymentInTx` `service.ts:3197` reverses the deposit JV only when `doc.status === "AWAITING_DEDUCT"`.
- Repro `probe-r10c` D3b:
  - `cheque→bounce: pay ok dep AWAITING_DEDUCT → deduct+issue ok dep DEDUCTED → voidDocument(inv) ok dep DEDUCTED → bounce ok → dep {"status":"AWAITING_PAYMENT","paidTotal":0} · TBΔ since before pay ["1040:3210000","2110:-3000000","2200:-210000"] (truth [])`
  - `transfer→voidPayment: … TBΔ ["1010-01:3210000","2110:-3000000","2200:-210000"]`
  - Via the new bounce refusal's exit, `probe-r10b` D3: `bounce cheque#2 FAIL(ใบมัดจำนี้ถูกหักในเอกสารอื่นแล้ว …) · exit: voidDocument(invoice) ok → bounce again ok · … TBΔ ["1040:3210000","2110:-3000000","2200:-210000"]`
- Money: expected all 0. Actual: 3,210,000 cash/transit + 3,000,000 deposit liability + 210,000 output VAT for a deposit the system now says is unpaid.
- Origin: pre-existing (voidDocument/deposit status untouched by the batch; same guard in c10ee3f9). The r10 refusal message sends the user straight into it.

### R10-8 MINOR — one-transaction group payment size ceiling (NEW)
- Repro:
  - `probe-r10d` G1: `n=20: ok(20) in 11.6 s` · `n=50: ok(50) in 23.9 s`
  - `probe-r10g` G5: `n=100: FAIL(IV-…: บันทึกชำระไม่สำเร็จ) after 40.2 s · payments 0 · JE +0 · outbox +0` · `workaround: first 50 only → ok(50)`
- Money: none (atomic). About 0.4 s per child with WHT cert + auto tax invoice on QC2 latency, so roughly 85+ children cannot be paid in one go and the user gets a generic error. Prod latency may move the threshold.

### R10-9 MINOR — journal-number race rate (R9-7, carried)
- Repro `probe-r10d` G2: `3 cashiers same month: group batches ok 10/10 · single payments ok 8/30 · raw {"P2002(journal/doc no.)":22}`.
- H2 void∥void also shows P2002 from the reversal path (`gl.ts:888`).
- Money: none (rollback). With batches now in one long transaction a batch can't be half-written, but concurrent cashiers lose ~73 % of their single payments during a batch. (The "orphan CHEQUE payments 108" in that log line is my own query counting unlinked group siblings — ignore it.)

### R10-10 NOTE — head not synced on credit note (scope)
- `probe-r10g` H4: `full CN on child 2 ok → head {"status":"PARTIAL","paidTotal":1070000} (truth PAID/2,140,000 — panel outstanding 0, canRecord false)`.

---

## Held (ran it)
- `chequeUnwindLines` matrix, 22/22 green: full trial balance by (account, contact) Δ = 0 after bounce/void-cheque; 0 unbalanced JEs; I1 holds; AR/AP lines carry the document's contact (`@c`/`@v`). `probe-r10a` M. Shapes:
  - sales single noWHT/WHT × ON_HAND/DEPOSITED/CLEARED, plus WHT CLEARED on a VAT-on-payment invoice
  - sales group×3 with WHT on none/one/two/all, ON_HAND/CLEARED, VAT on issue/on payment
  - registered cheque ON_HAND/CLEARED
  - purchase single noWHT/WHT and group×3 WHT none/two
  - deposit receipt ON_HAND/CLEARED, deposit payment
  - simulated legacy earlier-voided linked + sibling, ON_HAND/CLEARED
- Fee + cheque cannot be built (refused in group and form), so fee lines are untested by construction.
- Cash-sale receipt paid by cheque, voidPayment refused (B2c), bounce → AR@customer +1,070,000, 1040 0 — `probe-r10b` P2a.
- Deposit cheque-first bounce → TBΔ [] — `probe-r10b` D2.
- CRM I4 (round-9 UNVERIFIED, now run) on real documents and outbox:
  - Deal paid 10,700,000 → 0 after bounce → 10,700,000 once after re-collect, noWHT and WHT (DOC_SETTLE 300,000 reversed and re-counted), group of 2 deals.
  - Commission rows: +1,000,000 → REVERSAL −1,000,000 (next period) → +1,000,000, Σ 1,000,000, identical to the transfer → voidPayment control.
  - Events: payments 2 · recorded 2 · voided 1 · invoice.paid 1 per invoice; redelivery a no-op; 0 consumer errors.
  - `probe-r10e` + `probe-r10f`. My r10e "commAll 8,000,000" was a single-month report read; the clawback lands next month — not a finding.
- In-flight idempotent retry ×8: `ok(3) | ok(0) · payments 3 · linked cheques 1` — `probe-r10d` G4.
- Group payment ∥ recordPayment / CN / voidDocument on its own child: clean refusal, no deadlock ×20 each — `probe-r10d` G3.
- Group payment ∥ direct payment on a child outside the batch: head right 10/10 — `probe-r10c` H3.
- New bounce refusals and period lock: the exits exist and are not permanent. Unlock the policy → void the CN → bounce ok (`probe-r10b` L1); void the deducting invoice → bounce ok (`probe-r10b` D3 — but see R10-7).
- Blank cheque fields / X1: not re-run by me; the builder's GREEN run of `probe-r9a` X1 covers it.

## UNVERIFIED (read only)
- R10-2 mechanism: both transactions finish by `UPDATE`-ing the group head, and the journal-number unique insert (`nextJournalNo`, count+1) makes one wait on the other's uncommitted entry. That is a plausible cycle (head row ↔ journal unique key). Not traced in pg_locks.
- New row lock in `recordVendorPaymentInTx`: callers are `expense-actions.ts:189` → `recordVendorPayment`, `payment.ts:307` (same wrapper), `group.ts:610` (children already locked ↑id), `cheque.ts:371` (form path, nothing locked before). No payroll or expense-approval caller found, so no inverted order is visible.
- Purchase-side `account.payment.voided` on voidCheque: the CRM consumer's tombstone path needs `dealIdForDoc(expense doc)`, which returns null for expense documents, so nothing is written. Not run with a purchase document.
- REST/AI-skill surfaces of the new refusals (bounce refusals, group size timeout, deadlock victims): not run. By reading, errors go through `safeReason` → Thai text or the generic Thai fallback, with no internals.
- G5 ceiling on prod latency.

## Verdict
MERGEABLE AFTER R10-1, R10-2, R10-3, R10-5, R10-7
- R10-1/-2/-3 are new in r10.
- R10-5 and R10-7 are pre-existing but live in `unwindPaymentInTx`, the "one unwind" this round claims parity for (same gating logic as round 9).
- R10-4, R10-6, R10-8, R10-9, R10-10 can be follow-ups. R10-3's full fix needs R10-4.
