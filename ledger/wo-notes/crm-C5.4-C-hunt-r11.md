# C5.4-C — independent money-bug hunt, round 11 (target 3e7dbb88; change = `git diff 7cb12d3d 3e7dbb88 -- src/`)

QC2 only · probes `scripts/pending/hunt-54c-r11/probe-r11{a..d}.mts` · logs `/tmp/c54c-logs/r11hunt/probe-r11{a..d}.log` · every probe ends `CLEAN left=0`.
No src/prisma edits. Nothing committed. The tree's `scripts/acc-v2-expected.json` modification is not mine.
The lock-order sweep was done by reading, by a read-only sub-agent. Its table is summarised in the proposal section and is marked "read".

## Answers

**Q1 — agree; my r10b P2b "truth" is superseded.**
- It assumed voidPayment un-pays a cash-sale receipt. Under the R10-5 decision it is refused and the receipt is voided instead.
- Ran it (`probe-r11a` Q1):
  - UI/REST path `voidPaymentAny` → `FAIL(รายการรับเงินนี้บันทึกพร้อมใบเสร็จขายสด — … ให้ยกเลิกใบเสร็จแทน …)`, `written by the refusal: [] outbox +0`.
  - `voidDocument(receipt) ok → VOIDED, payment voided true · TBΔ since before approve []`.
  - Events: document.voided 1, payment.voided 1.
- NOTE: this payment never had an `account.payment.recorded` (path ② attach emits none), so webhook subscribers now see payment.voided without a prior payment.recorded. The same holds in `probe-r11b` R3.

**Q2 — agree; r10g G5 "first 50 only" is refused by design.**
- `probe-r11a` CAP: `n=40: ok(40) in 12.1 s · payments +40 JE +40 cheques +1`.
- `n=41: FAIL(การชำระครั้งนี้กระจายลงเอกสาร 41 ใบ — บันทึกได้ครั้งละไม่เกิน 40 ใบ …) in 0.1 s · written payments +0 JE +0 cheques +0`.
- Paying 40 of those 41 works.
- Server action and REST go through the same `recordGroupPayment` (read). The panel check is client-side (read).

**Q3 — journal-number race, measured on 3e7dbb88** (`probe-r11a` Q3). Mix in one month:
- 2 cashiers posting single payments (form path, 8 + 7);
- 1 cashier running six 5-child cheque batches;
- 1 cashier running one 40-child cheque batch, then 5 singles.

| | sequential baseline | concurrent round 1 | concurrent round 2 |
|---|---|---|---|
| single payments | 5/5 ok | **4/20 ok (80 % fail)** | **4/20 ok (80 % fail)** |
| 5-child cheque batches | 2/2 ok | 6/6 ok | 6/6 ok |
| 40-child cheque batch | 1/1 ok | **0/1 ok** | **0/1 ok** |
| raw errors | — | P2002 journal no. ×16 + 1 wrapped | same |

- **User-visible messages:** singles → `ครั้งที่ 1: บันทึกชำระไม่สำเร็จ` (×16 per round); 40-child batch → `IV-…: บันทึกชำระไม่สำเร็จ`. Neither says "try again" or why.
- The 5-child batches win here; the builder's G2 run saw batches lose (4/10). Who loses depends on who inserts journal number n first. Any operation can lose, and the longer transactions lose more often.
- Path ② approvals with a cheque vs 2 posting cashiers: approvals 12/12 ok (singles lost) — `probe-r11d` U2.

## Findings

| id | sev | origin | one line |
|---|---|---|---|
| R11-1 | MAJOR | NEW in r11 | A never-issued (DRAFT) cash-sale receipt holding a cheque (committed attach+cheque, issue step failed = the builder's "worst remaining state"): a bounce flips it to AWAITING_PAYMENT with no document number, and every exit is refused or wrong. Following the refusal message (bounce → void): 1040 +1,070,000 / AR@customer −1,070,000. Paying it: bank +1,070,000 / AR −1,070,000 with no revenue/VAT. Cleared before the bounce: bank +1,070,000 / 1040 −1,070,000 stay after the bounce. |
| R11-2 | MAJOR | pre-existing (R10-9, carried) | Journal-number race (`gl.ts:290-303` count+1): 80 % of concurrent single payments and 2/2 forty-child batches fail with a generic message under a 3-cashier load (Q3). |
| R11-3 | MINOR | NEW in r11 (design) | A cash-sale receipt whose cheque CLEARED can only be voided by first recording a bounce on a cleared cheque. The books net to 0, but the cheque register then says "bounced" for a cheque that cleared. |
| R11-4 | NOTE | pre-existing (design) | A partial deposit posts nothing until complete. A partial deposit paid by a cheque that clears leaves bank +2,210,000 / 1040 −2,210,000 with no deposit liability, and voiding the transfer part of a mixed deposit lands in the same state. |
| R11-5 | NOTE | pre-existing (design) | A deposit applied to an invoice that is later fully credited stays DEDUCTED. Refund, void payment and void invoice are all refused; the only exit is void CN → void invoice → refund. |

---

### R11-1 MAJOR — bounce of a cheque held by a never-issued cash-sale receipt (NEW)
- Where:
  - `service.ts:3296` `unwindPaymentInTx` writes `newPaid > 0 ? "PARTIAL" : "AWAITING_PAYMENT"` for any document type, including a DRAFT receipt, so the draft becomes an unnumbered "unpaid" receipt.
  - `service.ts:3778` `voidDocument` `wasIssued = doc.status !== "DRAFT"` then treats it as issued, and `service.ts:3808` → `undoBouncedReceiptClaimsInTx` (`:3178`) posts the new RECEIPT_VOID cheque entry (Dr 1040 / Cr AR) for a receipt that never posted anything.
  - `service.ts:3320`: the MIRROR leg needs a posted JV, so the bounce of a CLEARED cheque on a draft posts nothing.
  - The refusal at `service.ts:3766` tells the user to "บันทึกเช็คเด้ง … ก่อน แล้วค่อยยกเลิกใบเสร็จ", which is this exact path.
- Repro:
  - `probe-r11c` U1 (attach+cheque committed, no issue; each exit on a fresh copy):
    - `attach ok → receipt {"status":"DRAFT","docNo":null,"paidTotal":1070000} → bounce ok → receipt {"status":"AWAITING_PAYMENT","docNo":null,"paidTotal":0} · TBΔ []`
    - `exit issueDocument → FAIL(เอกสารนี้ออกแล้ว)` · `exit approve again → FAIL(ใบเสร็จนี้ออกแล้ว)`
    - `exit recordPayment(transfer) → ok → {"status":"PAID","docNo":null} · TBΔ ["1010-01:1070000","1100@cust:-1070000"]`
    - `exit voidDocument → ok → VOIDED · TBΔ ["1040:1070000","1100@cust:-1070000"] (expect [])`
  - `probe-r11b` R1b (the guided exit): `voidDocument FAIL(ใบเสร็จนี้รับเงินเป็นเช็คที่ยังมีผลอยู่ — บันทึกเช็คเด้ง …) → bounce ok → voidDocument ok → … TBΔ ["1040:1070000","1100@cust:-1070000"] (expect [])`
  - `probe-r11b` R1c: `cheque deposit ok clear ok → TBΔ ["1010-01:1070000","1040:-1070000"] → bounce ok → TBΔ ["1010-01:1070000","1040:-1070000"] (expect []) → voidDocument(draft) ok → TBΔ ["1010-01:1070000","1100@cust:-1070000"]`
- Money:
  - via void: expected []; actual 1040 +1,070,000 and a customer credit of 1,070,000 that doesn't exist.
  - via payment: bank +1,070,000 against AR with no sale recorded (revenue/VAT 0) on an unnumbered receipt.
  - cleared case: a bounced cheque's money stays in bank 1010.
- Reachability: needs the issue step to fail after the committed attach+cheque (the builder names it the worst remaining state). The documented retry (approve again, same keyBase) recovers it (`probe-r11b` R1a, R1d), but a user who follows the refusal message goes the wrong way. Under a 2-cashier load, approvals won 12/12 (`probe-r11d` U2), so it is not frequent.
- Origin: NEW. In r10 a draft receipt never held a cheque (the cheque was linked after issue), and RECEIPT_VOID is new in r11.

### R11-2 MAJOR — journal-number race rate (pre-existing, R10-9)
- See Q3. The raw error is P2002 on `AccountJournalEntry` from `gl.ts:303` `count + 1`.
- Money: none (each transaction rolls back). But 80 % of cashier payments and every 40-child batch fail during a busy minute with a generic Thai error.

### R11-3 MINOR — cleared cheque on a cash-sale receipt (design)
- `probe-r11b` R2: `voidDocument FAIL(… เช็คที่ยังมีผลอยู่ …) → (exit) bounce a cleared cheque ok → voidDocument ok → TBΔ []`.
- A customer return on a cash-sale paid by a cleared cheque can only be recorded by falsely marking the cheque bounced. There is no refund-style exit.

### R11-4 NOTE — partial deposits are unposted (pre-existing design)
- `probe-r11b` D2 control: `partial deposit paid only by a CLEARED cheque 2,210,000 → PARTIAL · TBΔ ["1010-01:2210000","1040:-2210000"]`.
- Mixed then void of the transfer part: `voidPayment(transfer) ok → PARTIAL · TBΔ ["1010-01:2210000","1040:-2210000"]` (same as the control).
- A partial deposit paid by transfer posts nothing at all (r10b D2 control: TBΔ []). Out of this batch's scope; listed so it isn't mistaken for an r11 regression.

### R11-5 NOTE — deposit consumed by an invoice that is later fully credited (pre-existing design)
- `probe-r11b` D4: `CN for the whole remaining ok → invoice PAID · refund deposit FAIL(ใบมัดจำนี้ถูกหักในเอกสารอื่นแล้ว …) · voidPayment(deposit) FAIL(same) · voidDocument(invoice) FAIL(… มีใบลดหนี้ที่ยังมีผลอ้างอิงอยู่ …) → dep DEDUCTED`.
- Not stuck forever (void CN → void invoice → refund), but a cancelled job settled by CN keeps the deposit locked.

---

## Numbering proposal — gapless journal numbers without cycles (next card)

**Finding that drives the design.** "No path takes a row lock after its first posting" is **false today** (read, sweep of 3e7dbb88). Violators — a shared, pre-existing row locked or updated after the transaction's first journal insert:
- recordPaymentInTx (`service.ts ~2854` postPayment → auto tax invoice number `reserveSeq` TAX_INVOICE `service.ts ~2951`, WHT cert counter `wht.ts:218`). The same applies to recordVendorPaymentInTx (`expense.ts:1245` → WHT_CERT counter `expense.ts:1278`) and every child of a group batch.
- unwindPaymentInTx (`service.ts:3300` reverseFor → WHT-cert document update `:3326`, never locked beforehand).
- voidPaymentBatchInOneTx / restoreDocForCheque: payment 2's CAS (`:3282`) and cert happen after payment 1's reversal.
- voidDocument / voidExpenseDoc (reverseFor → `releaseDepositDeductionsInTx` deposit rows `service.ts:3232`).
- issueDocument (postDocument → bundle/inventory `consumeInTx` InvItem / InvLocationStock / AccountProduct).
- issueExpenseDoc (postDocument → PURCHASE_TAX_INVOICE counter `expense.ts:1043`).
- reconcile createEntryFromLine (post → statement-line update `reconcile.ts:879`).
- finance opening entries (post → `AccountFinance` update `finance.ts:382`).
- asset depreciation / dispose (post → `AccountFixedAsset` update).
- POS sale with gift card (post → `Coupon.usedCount`).
- gl.reverseFor itself: the n-th original entry is updated after the (n−1)-th reversal insert.
- Also: the document-number counters (`AccountDocSequence`, UPSERT = a row lock until commit) are already the "counter row" design, and they are taken late.

**Options (no code):**
1. **Advisory lock per (system, book, period) at the FIRST posting.** Not cycle-free with the violators above: T1 holds book B and waits on row R; T2 holds R and waits on book B at its first posting. It becomes cycle-free only if either (a) every violator is reordered so that all row locks and counters come before the first posting (a large refactor across tax invoice/WHT/deposit/inventory/POS/reconcile/asset), or (b) the lock moves to **step 0 of the lock order** — taken at transaction start, before cheques/docs. (b) is cycle-free by construction but serialises every money transaction per book per system. A 12 s 40-child batch would then block every cashier for 12 s, and `recordPayment`'s transaction uses Prisma's default 5 s timeout and 2 s maxWait (`service.ts ~2723`), so cashiers would still fail, now as timeouts. (b) also needs all books a transaction may touch known up front, and taken in ↑ order.
2. **Counter row per (system, book, period)** (like `AccountDocSequence`): the same lock semantics as 1. The same cycle analysis applies, plus row-lock queueing in place of advisory locks. It gives no benefit over 1(b), and 1(a)'s refactor is still needed if it's taken late.
3. **Retry with savepoints on P2002/40P01:** turns losers into later winners when there is no cycle, but the losing insert first *waits* for the winner's commit (unique-index ShareLock), so the waits and the deadlocks stay. It adds latency and loops. It needs raw `SAVEPOINT` in interactive transactions. A mitigation, not a fix.
4. **Allow gaps: number from a Postgres SEQUENCE** (`nextval` is non-transactional, never blocks), one sequence per system+book (created lazily), formatted `<book>-<yyyy>-<mm>-<n>`. It is cycle-free and contention-free, and zero changes to the lock order are needed. The cost is gaps after rollbacks, and per-month resets need either a sequence per period or a display rule.
5. **Number after commit:** insert entries with a NULL number, then a short follow-up transaction (or a single serial worker) assigns `max+1` under one counter-row lock that nothing else holds. Gapless in the end, no cycle (the worker holds only that one lock). But entries sit unnumbered for a moment, reports/prints must tolerate a pending number, and the worker is one more moving part.

**Recommendation:** use option 4 for journal-entry numbers; they are internal voucher numbers and gaps are acceptable if documented. Keep gapless numbering only where the law needs it (tax invoice, WHT certificate, purchase tax invoice, receipts): those counters are already per docType and are the only late locks left inside payment transactions. Move their reservation to before the first posting in recordPaymentInTx / recordVendorPaymentInTx / issueExpenseDoc (reserve the number, then post), and add them to the documented lock order as step 4½ (counters by docType, fixed order) — with a probe like `probe-r11a` Q3 as the acceptance test. If the owner insists on gapless journal numbers, choose option 5 over 1(b): 1(b) moves the 80 % failures into 5 s timeouts.

---

## Held (ran it)
- Q1 refusal writes nothing; voidDocument nets to [] (`probe-r11a` Q1).
- Cap 40/41 (`probe-r11a` CAP).
- Path ② retry with the same keyBase after a failed issue: skips attach, issues, cheque linked, TB right, also after the cheque cleared (`probe-r11b` R1a, R1d).
- Cash-sale by cheque → bounce → re-collect → voidDocument refused until the re-collect is voided → void → TB [] (`probe-r11b` R3).
- Deposit per-payment legs: cheque + WHT 90,000 → bounce after clear → TB [] (D1a). 50 % transfer then 50 % cheque → one deposit JE with a leg per payment, then bounce → TB [] (D1b).
- releaseDepositDeductionsInTx with two deductors: void A → AWAITING_DEDUCT, deductible 2,000,000, void of the deposit payment refused while B lives, re-deduct on C → DEDUCTED (D3).
- voidGroupPayment ∥ recordPayment on another child: head right 20/20 — the post-transaction `syncGroupStatus` (`group.ts:705`, unlocked) did not lose an update in 20 runs (HV). Read-only concern stays in UNVERIFIED.
- Builder's own GREEN reruns of my r10 probes (`/tmp/c54c-logs/r11/`) — not re-run by me except where listed above.

## UNVERIFIED (read only)
- `group.ts:705` voidGroupPayment calls `syncGroupStatus` → `updateGroupProgress` after its locked transaction, with no head lock. It is a lost-update window against a concurrent child payment (held 20/20 in HV, but the write is unlocked).
- Lock-order violators listed in the proposal: no cycle reproduced this round. The document-number counters are the most likely second cycle once journal numbers stop failing fast.
- The RECEIPT_VOID entry is keyed per cheque (`AccountCheque#<id>#RECEIPT_VOID`). A cheque that paid two cash-sale receipts is not possible through the product (one payment per cheque), so not tested.
- REST/AI error bodies for the new refusals: not run. By reading, they go through `safeReason` (Thai text or a generic Thai fallback).

## Verdict
MERGEABLE AFTER R11-1
- R11-1 is the only new money bug. The fix: keep a DRAFT receipt DRAFT on unwind, and base `wasIssued` / RECEIPT_VOID on a posted receipt JV rather than on the status.
- R11-2 becomes the numbering card (proposal above). R11-3..5 are design notes.
