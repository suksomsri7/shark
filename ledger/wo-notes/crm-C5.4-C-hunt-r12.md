# C5.4-C — independent money-bug hunt, round 12 (target 9a867b46; change = `git diff a67501ac 9a867b46 -- src/`)

QC2 only · new probe `scripts/pending/hunt-54c-r12/probe-r12a.mts` → `/tmp/c54c-logs/r12hunt/probe-r12a.log`.
Regression sweep re-run by me on r12 code: `/tmp/c54c-logs/r12hunt/regress-*.log`, summary `regress-SUMMARY.log`. Everything ends `CLEAN left=0`, 0 FATAL.
No src/prisma edits. Nothing committed. The tree's `scripts/acc-v2-expected.json` modification is not mine.

## Findings

| id | sev | origin | one line |
|---|---|---|---|
| R12-1 | MAJOR | pre-existing root (path ② attach); reachable through the r11/r12 retry flow | A cash-sale draft receipt whose attach committed but whose issue failed, approved again with a NEW key, gets a second live payment set (and a second cheque). The receipt editor starts with an empty payment list and a fresh key on every mount, so a user who reopens the draft and re-enters the payment does exactly this. Result: paidTotal 1,070,000 vs Σ live 2,140,000 (I1), a phantom cheque ON_HAND in the register, and 2 × payment.recorded. |
| R12-2 | NOTE | design (F-07) + r12 DRAFT rule | After a bounce, the draft stays DRAFT with no live payments. Issuing it (or approving with no payment rows) books a cash sale into 1000 (+1,070,000), status PAID with paidTotal 0. This is the F-07 default ("cash sale without payments = cash"), but the screen doesn't warn that the only payment bounced. |
| R12-3 | NOTE | r12 event symmetry | Cash-sale receipts now emit `account.payment.recorded` (docType RECEIPT) to webhooks and user automations. CRM counts only INVOICE/DEPOSIT_RECEIPT, and member journeys don't trigger on it (read). The only visible effect is for webhook/automation subscribers, who now see receipt payments — correct, just new. |

---

### R12-1 MAJOR — second payment set on a draft receipt that already holds one
- Where:
  - `payment.ts:~383-412` `approveReceiptWithPayments`: the skip-attach branch only fires when every `keyBase:i` already exists. A different keyBase goes to `attachReceiptPaymentsWithChequesInOneTx` → `attachDraftReceiptPaymentsInTx` (`service.ts ~3720-3765`), which does not check for live payments already on the draft and overwrites `paidTotal` with the new rows' sum.
  - UI: `DocEditorV2.tsx:183` `useState<PayBox[]>([])` and `:185` `payKeyRef` = new key per mount. A reopened draft shows no payments and sends a new key.
- Repro `probe-r12a` N1/N2 (attach committed, issue not done, then approve with a new keyBase):
  - `N1 cheque … approve again with a NEW keyBase ok → receipt {"status":"PAID","docNo":"RE-2026-10-0001","paidTotal":1070000,"grandTotal":1070000} · live payments 2 (expect 1) · cheques 2 · unbalanced JEs 0 · TBΔ ["1040:1070000","2200:-70000","4000:-1000000"] · payments 2 recorded 2 voided 0`
  - `N2 transfer … live payments 2 (expect 1) … TBΔ ["1010-01:1070000","2200:-70000","4000:-1000000"] · payments 2 recorded 2`
- Money:
  - The GL is right at issue: the receipt JV falls back to one line because Σ ≠ grand.
  - The sub-ledger is not. Σ live payments 2,140,000 vs paidTotal 1,070,000. N1 leaves a second cheque ON_HAND for 1,070,000 that the customer never wrote twice.
  - Clearing it later: bank +1,070,000 and 1040 −1,070,000 that don't exist. Bouncing either cheque: the unwind (MIRROR, receipt JV posted) sets AR@customer +1,070,000 and paidTotal 0 on a receipt the customer did pay.
  - Webhooks get two payment.recorded events of 1,070,000.
- Reachability: needs an issue failure after the committed attach — e.g. the journal-number race (R11-2), which fails 80 % of concurrent postings under load — then the user reopening the draft and re-entering the payment. The same-key retry (clicking again without leaving) is safe and recovers.
- Origin: the attach-without-checking-existing-payments is pre-existing (path ② since WO 1.4). The retry flow around it was reworked in r11 (atomic attach + skip-attach retry) and r12 (voided refusal), and this new-key branch is the one case it doesn't cover.
- Fix idea: `attachDraftReceiptPaymentsInTx` refuses when the draft already has live payments ("ร่างนี้มีรายการรับเงินผูกอยู่แล้ว — กดอนุมัติเพื่อออกเอกสาร หรือยกเลิกร่าง"). Alternatively, the approve path treats "draft already fully paid" as skip-attach whatever the key. And the editor should show the attached payments.

### R12-2 NOTE — issuing a bounced draft books cash
- `/tmp/c54c-logs/r12hunt/regress-r11c.log`: `U1 exit issueDocument → ok → {"status":"PAID","docNo":"RE-2026-10-0001","paidTotal":0} · TBΔ ["1000:1070000","2200:-70000","4000:-1000000"]`.
- By design (`gl.ts:~536` F-07: no payments ⇒ Dr cash 1000), so not a bug. Worth an on-screen warning ("รายการรับเงินของร่างนี้ถูกยกเลิก/เช็คเด้ง") because the paidTotal 0 + PAID combination and the cash booking are surprising after a bounce.

### R12-3 NOTE — receipt payment.recorded events (new, correct)
- `probe-r12a` E1: transfer and cheque cash sales each give recorded 1 → voided 1 after void/bounce. A retry with the same key does not duplicate.
- Payload: `{"docType":"RECEIPT","paymentId":…,"documentId":…,"amountSatang":1070000}`.
- Consumers (read): `outbox-consumers.ts:842` → CRM `onPaymentRecorded` counts only `PAYABLE_DOC_TYPES = INVOICE, DEPOSIT_RECEIPT` (`crm/payments.ts:77`); member journeys (`JOURNEY_TRIGGER_EVENTS`) don't include it; user automations and webhooks do receive it.

---

## Held (ran it)
New r12 behaviour, `probe-r12a`:
- **Partial deposit by cheque (NONE-kind line):**
  - P1a ON_HAND bounce: `TBΔ [] · deposit JEs 0`.
  - P1b CLEARED bounce: `TBΔ []`, 0 unbalanced.
  - P1c CLEARED, then completed by transfer (one deposit JE, bank +3,210,000, 1040 0), then bounce: `TBΔ []`.
- **PAYMENT_VOID (cleared cheque on a cash sale):**
  - voidDocument: `TBΔ []`, register stays CLEARED, 1 PAYMENT_VOID entry.
  - Second void: `FAIL(เอกสารถูกยกเลิกแล้ว)`.
  - Later bounce of that still-CLEARED cheque: ok, `TBΔ []`.
  - DRAFT with a CLEARED cheque → CANCELLED, `TBΔ []`.
- **Converted receipt keeps the status rule (C1):** voidDocument(receipt) ok, the invoice's payment stays; voidPayment(invoice) then nets `TBΔ []`.
- **Events once (E1):** recorded 1 / voided 1, transfer and cheque.
- **`syncGroupStatus` / `syncGroupHead`:** no caller left in src (`group.ts:669` is only the definition; read), so there is no own-transaction head sync on a live path to deadlock.

Regression sweep on r12 code (my own runs):

| probe | rc | result |
|---|---|---|
| r10a | 0 | Q1 corrected expectations hold · cheque unwind matrix `M summary red 0/22` |
| r11b | 0 | R1a/R1d retry right · R1b refused · **R1c now `TBΔ []`** (R11-1 fixed) · **R2 voidDocument with a CLEARED cheque ok, `TBΔ []`** (R11-3 fixed) · R3 [] · D1a/D1b [] · D2 = control · D3 releases · D4 note · HV head right 20/20 |
| r11c | 0 | U1: bounce keeps DRAFT; exits: recordPayment refused, voidDocument → CANCELLED `TBΔ []`, approve-again ok, issueDocument = R12-2 note |
| r10b D2,D3,P2 | 0 | mixed deposit bounce `TBΔ []` (both orders, with/without clear) · P2a/P2b refusals · P2c path ② atomic 8/8 |
| r10c D3b,H2 | 0 | D3b `TBΔ []` ×2 · H2 head right 20/20/10/10 |
| r10g G6 | 0 | head right 20/20 ×3 pairings, no deadlock |
| r9c | 0 | R1c/R1p void in the window refused 12/12 each, cheque linked to voided 0/12, I2 broken 0 |
| r9a W1,W2,T1,H1,X1 | 0 | WHT certs/1160 unwound, I1 []; T1 one set of tax invoices, 2200 −1,400,000; H1 head resynced and repayable; X1 nothing written |

## UNVERIFIED (read only)
- How often the issue step fails after a committed attach in production (drives R12-1 frequency). Under a 2-cashier load in round 11 approvals won 12/12 (`probe-r11d` U2).
- A cheque bank account changed between clear and PAYMENT_VOID: no edit-cheque path exists (only status CAS writes), and both sides use the same `financeAccountId → ledgerAccountId ?? BANK` resolution.

## Verdict
MERGEABLE AFTER R12-1
- A small guard in `attachDraftReceiptPaymentsInTx`: refuse, or treat as already attached, when the draft holds live payments. Everything else in r12 holds, and the r9–r11 regression sweep is green on r12 code.
- R12-2/R12-3 are notes. R11-2 (journal numbering) stays the separate card.
