# C5.4-C — independent money-bug hunt, round 9 (target 80be6e11 = r8b; context c10ee3f9..80be6e11)

QC2 only · probes `scripts/pending/hunt-54c-r9/probe-r9{a..f}.mts` · logs `/tmp/c54c-logs/r9hunt/probe-r9{a..f}.log` · every probe ends `CLEAN left=0`.
No src/prisma edits. Nothing committed.

## Findings

| id | sev | origin | one line |
|---|---|---|---|
| R9-1 | BLOCKER | pre-existing (main); extended to siblings by r8b | Bounce keeps the per-payment auto tax invoices (service, ON_PAYMENT) live. Re-collecting then issues a second set, so output VAT is declared twice. |
| R9-2 | BLOCKER | pre-existing (main) | DEPOSIT_RECEIPT paid by cheque then bounced: deposit JV not reversed and bounce posts Dr AR. Result: phantom AR, deposit liability and VAT for money never received. |
| R9-3 | MAJOR | pre-existing (main); extended to siblings by r8b | Bounce/voidCheque takes back only `amount`, not WHT. paidTotal ≠ Σ live payments (I1); WHT certs (WTI / 50-ทวิ) and 1160 stay on voided payments. |
| R9-4 | MAJOR | pre-existing window (main); bypasses r7 B2c + r8b sibling rule | voidPayment/voidVendorPayment of a child inside the recordGroupPayment window (payments committed, cheque not yet linked) succeeds. createCheque then links the cheque to the VOIDED payment. Bounce/voidCheque over-posts AR/AP by that child's cash. 12/12 sales, 12/12 purchase. |
| R9-5 | MAJOR | pre-existing (main) | createCheque refused AFTER the child payments committed (UI: cheque no. filled, bank blank · REST: `" "`). Op returns failure but children are PAID with CHEQUE payments, events emitted and 1040 loaded, with no cheque. UI retry (same key) answers "บันทึกแล้ว 0 ใบ". |
| R9-6 | MAJOR | pre-existing (main) | Bounce never calls syncGroupStatus. The billing note stays PAID (paidTotal 21,400,000, truth 0) and recordGroupPayment is refused. |
| R9-7 | MINOR | pre-existing, outside batch | `nextJournalNo` = count+1 without a lock. Concurrent postings in one book fail with P2002 (11–12/12). Inside the recordGroupPayment loop this leaves a partially-paid batch with no cheque (a second trigger for R9-5). |
| R9-8 | NOTE | pre-existing | Different clientKeys collide (`#`→`-`, 60-char cut, `""`). The second group payment returns `ok(recorded 0)` and nothing is recorded. |

None is a regression introduced by r8b. r8b's own claims held: siblings are restored on bounce (paidTotal/status), sibling void is refused while the cheque is live, no deadlocks, events fire once, and batches are isolated. But R9-1/-2/-3 live in `restoreDocForCheque`, which this batch rewrote, and since r7 B2c it is the ONLY way to unwind a cheque payment. R9-4 defeats the B2c/sibling rule the batch adds.

---

### R9-1 BLOCKER — bounce leaves per-payment tax invoices live → double output VAT
- Where: `src/lib/modules/account/cheque.ts:501-527` `restoreDocForCheque`. It voids the payment row and subtracts paidTotal, but does not do what `service.ts:3093-3105` (`voidPaymentInTx`) does: void `TAX_INVOICE where sourcePaymentId = payment` + `reverseFor`. The tax invoice is issued per payment in `recordPayment` (`issueServiceTaxInvoice`).
- Repro: `probe-r9a` T1 (group cheque, 2 service invoices vatTiming ON_PAYMENT) and T1s (single invoice, form path).
  - `T1 group cheque pay ok(recorded 2) · auto TIs {"total":2,"live":2,"liveVat":1400000…} · 2200 Δ -1400000 · 2210 Δ 1400000` (positive control)
  - `T1 bounce ok · docs [AWAITING_PAYMENT ×2] · auto TIs {"live":2,"liveVat":1400000,"liveOnVoidedPayment":2}`
  - `T1 re-collect by transfer … auto TIs {"total":4,"live":4,"liveVat":2800000,"liveOnVoidedPayment":2} · output VAT 2200 Δ -2800000 (expect −1,400,000) · 2210 Δ 2800000 (expect 0)`
  - `T1s … 2200 Δ -1400000 (expect −700,000) · 2210 Δ 1400000 (expect 0)`
- Money: +700,000 satang output VAT per invoice (10,700,000 incl. 7 %) that was bounced and then re-collected. 2210 ends with a debit of the same amount. VAT output is overstated before re-collection too (tax invoice for money never received).
- Workaround exists but nothing prompts it: manual `voidDocument(TI)` cleans 2200 (`probe-r9f` M1: `voidDocument(TI) ok … 2200 Δ 0`).
- Origin: pre-existing. c10ee3f9 restore had no tax-invoice cascade (read `git show c10ee3f9:…/cheque.ts:439-453`). r8b now applies the same omission to every sibling. r7 B2c removed the voidPayment path, which did cascade.

### R9-2 BLOCKER — deposit receipt paid by cheque, then bounced
- Where: `cheque.ts:501-527` (no deposit JV reversal — compare `service.ts:3077` in `voidPaymentInTx`: `reverseFor("AccountDocument", deposit)` when AWAITING_DEDUCT) + `cheque.ts:654` bounce posts `Dr AR cq.amount / Cr 1040`, but a deposit receipt never posted AR.
- Repro `probe-r9e` D1 (QUOTATION → DEPOSIT_RECEIPT 3,210,000 · recordPayment CHEQUE + createCheque{paymentId} · bounce):
  - `bounce ok → {"status":"AWAITING_PAYMENT","paidTotal":0} Δ since before pay {"ar":3210000,"dep":-3000000,"vat":-210000,"transit":0} (expect all 0)`
  - `after bounce: voidPayment → FAIL(รายการชำระนี้ถูกยกเลิกแล้ว)` (no way out)
  - control D1v (transfer + voidPayment): `Δ {"ar":0,"dep":0,"vat":0,"transit":0}`.
- Money: expected 0 / 0 / 0. Actual: AR 1100 +3,210,000 (no AR document behind it), deposit liability 2110 −3,000,000, output VAT 2200 −210,000. UNVERIFIED: re-paying the deposit reposts the deposit JV (`depositRepostEvent`) and doubles 2110/2200.
- Origin: pre-existing (c10ee3f9 restore identical in this respect; bounce line identical). Not group-specific.

### R9-3 MAJOR — WHT not unwound by bounce/voidCheque (I1)
- Where: `cheque.ts:515` `newPaid = paidTotal − pay.amount`. `recordPayment` added `amount + wht`, and `voidPaymentInTx` subtracts `amount + whtAmountSatang` (`service.ts:3059`), voids the WHT cert (`service.ts:3083`) and reverses 1160 via `reverseFor`. restore does none of these.
- Repro `probe-r9a` W1 (group cheque, WHT 300,000 on each of 2 children), W1s (single invoice), W2 (purchase, voidCheque):
  - `W1 bounce ok · docs [{"status":"PARTIAL","paidTotal":300000}×2] · Σlive [0,0]`
  - `W1 I1 ["… paidTotal 300000 ≠ Σlive 0" ×2] · GL AR Δ -600000 (sub-ledger Δ -600000) · 1160 Δ 600000 · certs after {"liveCertDocs":2,"voidedPaymentsWithLiveCert":2}`
  - `W1 re-collect … I1 ["paidTotal 10700000 ≠ Σlive 10400000" ×2]`
  - `W1s … doc {"paidTotal":300000} Σlive 0 · 1160 Δ 300000`
  - `W2 purchase … voidCheque ok · I1 [… 300000 ≠ Σlive 0 ×2] · certs after {"liveCertDocs":2,"voidedPaymentsWithLiveCert":2}`
  - `probe-r9f` M1: manual `voidDocument(WTI) ok` but `1160 Δ 300000` remains, so there is no clean manual path.
- Money: per child, expected paidTotal 0 / 1160 0 / certificate VOIDED; actual paidTotal 300,000 / 1160 +300,000 / certificate ISSUED. Purchase side: a 50-ทวิ certificate and the WHT payable stay live for a payment that never happened, and would be filed/remitted on the PND. GL = sub-ledger (I2 holds), so this is I1 plus tax documents. Semantics need a ruling, but the behaviour is inconsistent with voidPayment.
- Origin: pre-existing (c10ee3f9 restore subtracted `pay.amount` only). r8b extends it to siblings.

### R9-4 MAJOR — void inside the recordGroupPayment window → cheque linked to a voided payment
- Where: `group.ts:573-617`. Each child payment commits in its own tx. Only then `createCheque({paymentId: firstPaymentId})` links the cheque, and `cheque.ts:406-416` never checks `voidedAt` nor re-checks siblings. During the window `chequeIdsHoldingPayments` finds no cheque, so voidPayment/voidVendorPayment pass the B2c gate.
- Repro `probe-r9c` (void child 1 once all 3 child payments exist; ×12 each side):
  - `R1c race tally {"pay ok(recorded 3) · void ok · cheque yes · linked-voided true":12}`
  - `R1c … after bounce I2/1040 broken in 12: bounce ok · sub-ledger Δ 0 vs GL AR Δ 10700000 · 1040 Δ -10700000`
  - `R1p … 12/12 … voidCheque ok · sub-ledger Δ 0 vs GL AP Δ 10700000 · 2300 Δ 10700000`
  - Deterministic replay `probe-r9b` R1d: `createCheque{paymentId: voided payment} → ok … bounce → GL AR Δ 10700000 · 1040 Δ -10700000`.
- Money: expected GL AR Δ = sub-ledger Δ = 0, 1040 back to 0. Actual: AR +10,700,000 and 1040 −10,700,000 (sales); AP +10,700,000 and 2300 +10,700,000 (purchase). The voided child's cash is counted twice. If the cheque clears instead, the bank holds 32,100,000 while child 1 shows as owed, so the customer is asked to pay it again.
- Origin: the window is pre-existing (c10ee3f9 group.ts:606-620, same createCheque link without a voidedAt check; there, restore also skipped a voided linked payment, which was worse). It defeats the r7 B2c rule and r8b's "sibling void refused while cheque live". The same window exists in the single-document form path (`payment.ts:290-310`).

### R9-5 MAJOR — failed group cheque payment leaves committed payments and no cheque
- Where: `group.ts:601-617`. `createCheque` validates `chequeNo`/`bankName` (`cheque.ts:314-315`) only after the loop committed every child. The retry path `group.ts:491` returns the earlier batch without creating the cheque. Reachable:
  - UI `GroupPaymentPanel.tsx:202` sends the cheque when the cheque no. is filled, even with the bank blank; `keyRef` is only reset on success (`:217`).
  - Server action `group-actions.ts:165-178` passes `draft.cheque` unchecked.
  - REST `payments-write.ts:103-104` `z.string().min(1)` accepts `" "`.
- Repro `probe-r9a` X1 + `probe-r9e` X1r:
  - `X1 … bankName " " → FAIL(กรุณากรอกชื่อธนาคาร) · committed payments 2 (channel CHEQUE, chequeId ,) · docs [PAID ×2] · cheques +0 · 1040 Δ 21400000 · AR Δ -21400000 · outbox +4`
  - `X1 retry same clientKey with a valid bank → ok(recorded 0) · cheques +0 · group head {"status":"AWAITING_PAYMENT","paidTotal":0}`
  - `X1 retry with a NEW clientKey → FAIL(ยอดเกินยอดคงค้าง… ฿0.00)`
  - Recovery exists: `X1r … voidGroupPayment ok(voided 2) → … Δ all 0`.
- Money: a refused operation clears 21,400,000 of AR, parks 21,400,000 in 1040 with no cheque to deposit/clear/bounce, and emits payment.recorded + invoice.paid ×2, which CRM counts (I3). The group head is left out of sync.
- Origin: pre-existing (c10ee3f9 group.ts identical flow).

### R9-6 MAJOR — billing note head not re-synced after bounce
- Where: `cheque.ts` bounce/void → `restoreDocForCheque` updates only the children. `syncGroupStatus` is called only from `group.ts` record/void (no other caller in src/).
- Repro `probe-r9a` H1 and `probe-r9b` H1b:
  - `H1 … bounce ok → head {"status":"PAID","paidTotal":21400000} · panel outstanding 21400000 canRecord false · pay the group again by transfer → FAIL(ใบวางบิลนี้รับชำระไม่ได้ในสถานะปัจจุบัน)`
  - `H1b … pay child 1 directly ok → head {"status":"PAID","paidTotal":21400000} (truth PARTIAL 10,700,000) · voidGroupPayment(bounced batch) ok(voided 0) → head {"status":"PARTIAL","paidTotal":10700000}`
- Money: the billing note shows 21,400,000 paid when 0 was, and collection through the group is blocked. The only (non-obvious) re-sync is "void" on a batch the panel already shows as voided.
- Origin: pre-existing.

### R9-7 MINOR — journal number race (outside the batch; amplifies R9-5)
- Where: `gl.ts:290-303` `nextJournalNo` = `count(...) + 1`, no lock. The unique number collides.
- Repro `probe-r9d`:
  - `U2 voidPayment(A) ∥ recordPayment(B) {"ok|GENERIC":12} · raw P2002 … accountJournalEntry.create() … gl.ts:246`
  - `U1 … {"ok|GENERIC":11}`
  - Group loop, `probe-r9b` R1b: `pay FAIL(IV-…: บันทึกชำระไม่สำเร็จ)` → `state #1 payments 2 live 1 channels CHEQUE,CHEQUE · docs [AWAITING, PAID, AWAITING] · 1040 Δ 10700000 · cheques 0`
- Money: each tx rolls back on its own. But any concurrent posting in the same book/day aborts a group payment mid-loop and leaves the R9-5 state (a child paid by "cheque" with no cheque).
- Origin: pre-existing, not touched by c10ee3f9..80be6e11.

### R9-8 NOTE — clientKey collisions are silent
- `group-batch.ts:30-31` (`#`→`-`, `.slice(0,60)`).
- Repro `probe-r9b` C1: `#→-: 1st ok(recorded 1) 2nd ok(recorded 0) → docs PAID,AWAITING_PAYMENT` — same for `truncate@60`, `empty`, `%_`.
- REST hashes to 40 chars and the UI uses `grp-<ms>`, so this is reachable only by direct server-action callers or two submits in the same millisecond. Pre-existing.

---

## Held (ran it, invariant held)
- Same clientKey double-submit by cheque ×8: always 2 payments, 1 cheque, one ok / one calm refusal — `probe-r9a` R2.
- CLEARED group cheque: voidPayment(sibling) and voidGroupPayment refused with 0 outbox / 0 JE written; bounce after clear restores both; payment.voided 2/2 — `probe-r9b` L1.
- voidDocument on a sibling while the cheque is live is refused ("มีการรับชำระค้างอยู่"); allowed after bounce — `probe-r9b` VD1.
- 3× concurrent bounce + retry: one ok, payment.recorded 3/3, payment.voided 3/3, cheque.changed BOUNCED 1/1, I1 held — `probe-r9b` E1.
- Isolation: a form-path cheque payment (key `kb…:0`) on child 1 is not voided by the group cheque's bounce and vice versa — `probe-r9b` K1.
- Same clientKey on two different groups: independent batches — `probe-r9b` C1.
- WHT batch: GL AR/AP Δ = sub-ledger Δ (I2) even though I1 breaks — `probe-r9a` W1/W2.
- Orphan batch (R9-5) is recoverable by voidGroupPayment (no cheque → B2c not triggered) — `probe-r9e` X1r.
- CN on a PAID sibling while the cheque is live: refused by the family cap (`คงเหลือ ฿0.00`), so that partial state cannot be built — `probe-r9b` CN1 (inconclusive for the CN-then-bounce lead).

## UNVERIFIED (code reading only)
- Key forgery (lead 1) is believed closed. Every writer of `AccountDocumentPayment.idempotencyKey` was traced: form/REST `payment.ts:275,391` `<keyBase>:<n>`; REST keyBase `api:<key>:<idem>`; group REST sha256[0..40]; PromptPay `pp:` / `pp-manual:` / `pp-stmt:` (`payment-request.ts:463,560,752`); AI `ai-<id>`; createCheque{documentId} creates rows with no key. `groupBatchKeyOfPayment` needs exactly 4 `#`-parts with part 4 = the row's own documentId (cuid, no `:`), so none of them can parse as a batch key. Only `recordGroupPayment` writes GRP keys. K1 confirms the form shape at runtime.
- CRM I4 after R9-3: `reconcileDocSettle` re-derives DOC_SETTLE from the book (grand − Σ live cash when PAID), so deal money should end at grand after re-collect. Not run.
- A registry cheque created with `documentId` (not the form path) on a service ON_PAYMENT invoice creates its payment inside `createCheque` without `issueServiceTaxInvoice`/`postPayment`. So no tax invoice is issued and VAT stays parked in 2210 even when the cheque clears. Pre-existing, outside r8b.
- Legacy data: a batch whose first child's payment was voided on main while its cheque was live will, when bounced under r8b, over-post AR exactly like R9-4.
- R9-2 follow-on: re-paying the bounced deposit doubles 2110/2200 via `depositRepostEvent`. Not run.

## Suggested fix direction (not implemented)
- One helper shared by `voidPaymentInTx` and `restoreDocForCheque` for the per-payment cascade: tieOff = amount + WHT, WHT cert void + 1160 reversal, per-payment tax invoice void + reversal, and deposit document reversal. The cheque's own JV stays the single GL owner of cash/transit, so reverse only non-cash legs. R9-1/-2/-3 would close together.
- `createCheque{paymentId}`: under the document lock, refuse if the payment or any same-batch sibling is voided. Better: validate the cheque draft before the loop and link inside one tx. This closes R9-4 and R9-5; also validate trimmed chequeNo/bankName in `recordGroupPayment` before any write.
- `bounceCheque`/`voidCheque`: re-sync the group head of any restored child (R9-6).
