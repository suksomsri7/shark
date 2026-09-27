# C5.2 HUNTER — lens L2: MONEY & NUMBERS (read-only hunt · 27 ก.ย. 2569 · Opus 5.5)

Tree: main `/root/projects/shark-crm` @ 1576edcb (brief said 130ca0c1; HEAD had moved on, so I hunted the current tree) · no source edits.
Probe: `scripts/pending/hunt-l2/probe-l2-money.mts`. I ran it on **QC2** in a throwaway tenant `qc-hunt-l2-qbqqqaba-a`. Cleanup finished with 0 tenants, users, outbox rows, deals and docs left.
Run: `bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l2/probe-l2-money.mts`. It reproduced all 5 probe checks (L2-1 … L2-5 = BUG-REPRODUCED).
I did not re-report anything already known: C3.3 H1–H6, the C2.7-fix items, the C2.7 N2 cheque event, `refundDeposit` and C5.1 F1–F8.

**Counts: BLOCKER 0 · MAJOR 3 · MINOR 4** (+ 1 cross-lane note for the ACCOUNT lane)

---

## MAJOR

### M1 — The reps report "commission" column ignores clawbacks (gross, not net) · CONFIRMED + reproduced (L2-1)
- `src/lib/modules/crm/reports.ts:508-511` (`repsOf`, CTE `cm`): `cc."status"::text NOT IN ('REVERSED','REJECTED')`.
- The C3.3 reversal model (`commissions.ts:717-735`, `reverseRows`) does **not** change the status of the original row. The original stays APPROVED or PAID. The clawback is a **separate row** with `status REVERSED`, a negative amount, `reversedOfId` pointing at the original, and the next free period.
  - So the filter drops the clawback and keeps the original.
- `commissions.report` / `mineTotals` (`commissions.ts:1879, 1970`) compute net = APPROVED + PAID + REVERSED.
- Scenario (probe):
  - Rep A has 500,000 satang PAID.
  - The payment is voided, which writes a reversal row of −500,000 (REVERSED).
  - `reports.reps` shows **commissionSatang 500,000**, but `commissions.report` shows **net 0**.
  - The same wrong gross figure goes out in the CSV export and in scheduled report e-mails (`toCsv` :811).
  - The column also counts PENDING rows, which the commission page does not count toward net.
- Why the oracles miss it:
  - `qc-crm-c3.1.mts:409` copies the same `NOT IN ('REVERSED','REJECTED')` SQL. The C3.1 brief (:54) was written before C3.3 decided that REVERSED means "the negative clawback row" rather than "the original row was reversed".
  - c3.3 never checks the reports tab.
- Minimal fix: in `cm`, `cc."status"::text NOT IN ('REJECTED','PENDING')` (= the same net as `commissions.report`). Or keep PENDING and include REVERSED — the controller should pick one definition. Then ORACLE-EDIT c3.1:409 to match.

### M2 — `wonValueSatang` anchors on the invoice `grandTotal`, which is **net of the deducted deposit**, so won value is understated · CONFIRMED + reproduced (L2-2)
- `payments.ts:260-283`: `anchorGrandOf` returns `docLinkInfo(invoiceDocId ?? quotationDocId).grandTotal`, and `wonValueInTx` sets won = that anchor.
- Account `totals.ts:125`: `grandTotal = grandBeforeDeposit − depositDeducted`. `setDocDeposits` (`service.ts:1803`) is the normal Thai flow: quotation → deposit receipt (มัดจำ) → invoice that deducts the deposit.
- Scenario (probe):
  - Quotation 107,000 (100,000 + VAT). Deposit receipt 32,100, paid, so wonValue = 107,000.
  - An invoice is issued from the quotation with the deposit deducted: grand 74,900. `linkInvoiceFromBridge` sets `invoiceDocId`.
  - The customer pays 74,900. **wonValue becomes 74,900** while paidSatang = 107,000.
  - After the move to WON, `reports.overview` shows wonValueSatang 74,900 and avgWon 74,900 (paid 107,000).
- Every report that uses `WONV = COALESCE(wonValueSatang, valueSatang)` (`reports.ts:398`) is understated by the deposit (28 % here):
  - overview won/avg, forecast "closed", reps won value, sources won value and ROI.
  - Also the company `wonValueSatang` cache and the AI company brief.
- Related inconsistency, same root: "won value" is measured on three different bases. Report these together.
  - VAT-inclusive document or bill totals, for deals that received money.
  - Pre-VAT `valueSatang`, for deals won without money.
  - Quota ledger (`quotas.ts:137`) and home leaderboard (`home-data.ts:292`), which sum `valueSatang`.
  - Result: one rep in one month gets a different "ชนะ" figure on the home page than on the reports page.
- Why the oracles miss it: C2.7-S3.1 and S9.5 only use invoices without a deposit (anchor = the whole invoice). No oracle uses `depositDeducted` together with wonValue.
- Minimal fix: anchor = `grandTotal + depositDeducted` (the same correction H3 applied to `commissionDocRatios`). Add `depositDeducted` to `DocLinkInfo`.
  - The owner/controller should rule separately on whether won value is pre-VAT (`subTotal − discount`, same as T) or VAT-inclusive, and then use that one basis everywhere.

### M3 — Credit notes (ใบลดหนี้) are invisible to CRM: paid, wonValue, commission and quota never come down · CONFIRMED by trace + probe (L2-3)
- Account side:
  - A CREDIT_NOTE is converted from an INVOICE (`CONVERT_MAP` `service.ts:166`). It reduces revenue in the GL (`service.ts:2232`) and emits only `account.document.issued`.
  - It fires no `payment.voided` or `document.voided`.
- CRM side:
  - The only consumer, `crm-bridges/core.ts:284` `onDocumentIssued`, returns unless the doc type is INVOICE or TAX_INVOICE.
  - `crm/**` has no reference to CREDIT_NOTE anywhere.
- Scenario (probe):
  - Invoice 107,000 is fully paid, so CRM paid = 107,000.
  - A credit note of 10,700 (customer returns part of the goods or gets money back) is issued.
  - CRM stays at paid 107,000 and wonValue unchanged. PAID-basis commission on 100,000 pre-VAT is never clawed back, and PAID quota attainment stays inflated.
- Second effect:
  - Account `recordPayment` caps a payment at `grand − paid − CN` (`service.ts:2550`). But PAID is only set when `newPaid ≥ grandTotal` (:2573).
  - So an invoice with a credit note **never reaches PAID** and `account.invoice.paid` never fires.
  - Consequence 1: the DOC_SETTLE (WHT) row is never written, so the deal stays short by the WHT forever.
  - Consequence 2: `crm.money.reconcile` cannot help.
- This is the same class as the already-known `refundDeposit` gap, but a separate path that nobody has reported.
- Why the oracles miss it: no qc-crm-* suite creates a CREDIT_NOTE.
- Minimal fix:
  - Handle CREDIT_NOTE in `onDocumentIssued`: resolve the deal through `sourceDocId` (`dealIdForDoc`) and write a negative money row, `refType "CREDIT_NOTE"`, `refId = cnId`, under the same unique key and lock.
    - Either that, or record it as an adjustment that `wonValueInTx` and the commission basis read.
  - Handle `document.voided` of a credit note as the reverse.
  - Account lane: `fullyPaid` should use `newPaid + cnTotal ≥ grandTotal` (owner ruling needed).

---

## MINOR

### m1 — Home KPI "ถ่วงน้ำหนัก" counts OMITTED deals and rounds differently from the board and reports · CONFIRMED + reproduced (L2-4)
- `home-data.ts:224-229, 248, 260`: `openW = kind OPEN` has no `forecastCategory <> 'OMITTED'` filter. The sum is rounded once over all deals.
- `deals.getBoard` (`deals.ts:1747`), `deals.forecast` (:1784) and `reports.overview` (`reports.ts:410`) exclude OMITTED and round per deal.
- Probe: one open OMITTED deal of 1,000,000 and one normal deal of 1,000,000, both at 20 %. Home = **400,000**; board = reports = **200,000**.
- Why the oracles miss it:
  - This is encoded in the spec. The C3.2 brief §8.2 says "over the same deals".
  - The c3.2 oracle (:659) mirrors it, and its comment "values are multiples of 100 satang ⇒ every rounding scheme agrees" hides the rounding difference.
- Fix: add `{ forecastCategory: { not: "OMITTED" } }` to the weighted groupBy, then ORACLE-EDIT c3.2. Optionally round per deal to match.

### m2 — `autoWonOnPaid` compares VAT-inclusive cash with the pre-VAT deal value, so the deal is WON with the invoice still PARTIAL · CONFIRMED + reproduced (L2-5)
- `deals.ts:2229`: `paidSatang < BigInt(valueSatang)`. `paidSatang` is cash including VAT (and WHT through DOC_SETTLE); `valueSatang` is net before VAT.
- Probe: deal 100,000, invoice 107,000. The first instalment of 100,000 moves the deal to **WON automatically** while 7,000 is still unpaid. The activity text says "รับเงินครบตามมูลค่าดีล".
- Knock-on effect: WON-basis commission rules pay in full at that moment.
- Why the oracles miss it: the contract itself says "Σ COUNTED ≥ deal value" (c2.7 header :89), and the fixtures have no VAT.
- Fix: compare against the anchor document's total (`anchorGrandOf`, corrected per M2) when the deal has a doc anchor; or compare `paid × net/grand` against value. This needs an owner ruling.

### m3 — The discount approval request can overflow `ApprovalRequest.amountSatang Int` · PLAUSIBLE (traced, not run)
- `deals.ts:1212-1215`: `amountSatang = gross − value`, where `gross = Σ lineGross` of up to 200 lines, each ≤ 2e9. `checkDealLines` caps only the subtotal after discounts (≤ 2e9).
- `approval/service.ts:176` writes it without clamping; the column is `Int?` (`approval.prisma:59`).
- Scenario: 3 lines at list ฿15,000,000 with a 60 % line discount by a STAFF over the cap. Value ฿18M passes, but discount = ฿27M > 2,147,483,647 satang.
  - Postgres then fails with "out of range", and `setLines` gives an unmapped error/500 instead of submitting for approval.
- Fix: `Math.min(INT_MAX, …)`, the same pattern as `commissions.ts:845`.

### m4 — The REST line schema rejects `vatRateBp: -1` (VAT exempt), which the service and screen accept · CONFIRMED (trace)
- `api/ops/deals.ts:116`: `z.number().int().min(0)`. Compare `deals-shared.ts:417`: `-1 = ยกเว้น`.
- API and AI clients cannot create VAT-exempt lines, so their quotations charge 7 % on exempt items (the account default rate applies).
- Fix: `.min(-1)`.

---

## Cross-lane note (ACCOUNT lane · not CRM code · PLAUSIBLE)
- The portal `invoiceDto` (`portal.ts:500`) and account `createPaymentRequest` (`payment-request.ts:208`) compute outstanding as `grandTotal − paidTotal` **and ignore credit notes**.
  - Account's own F-05/F-06 (`service.ts:2539, 3188`) do subtract them.
- Result: the customer portal shows the credit-note amount as still owed, and "จ่ายเงิน" requests the full amount.
  - The gateway callback's `recordPayment` would then throw "ยอดชำระเกินยอดคงเหลือ": the money is received but not recorded.
  - The invoice also stays PARTIAL forever (M3).

---

## Checked and found sound (with file refs)
- **Deal value input:** `cleanValue` (safe int, ≥ 0, ≤ 2e9) · `checkDealLines` (qty > 0 rounded to 3 dp, unit price safe int, bp 0–10000, line and total caps) · REST `satang` int ≥ 0 · `bahtTextToSatang` rejects more than 2 dp · currency is always the default THB (never written).
- **Line maths:** `lineAmountSatang` / `dealTotals` versus account `computeTotals`. CRM sends `discount = gross − amount`, so the account base equals the CRM line amount. Deal discount = `round(subtotal × bp)` = `discountAmount`.
- **Forecast / pipeline:** per-deal `round(value × prob / 100)` in SQL, cast to bigint. Board, `deals.forecast` and reports agree (home differs — m1).
- **Timezones:**
  - `thaiDayUtc` stores the expected close date as midnight UTC of the Thai day.
  - Reports `per()` uses Thai-day bounds [00:00 +07, next 00:00 +07), which contain that midnight-UTC value exactly. Forecast `to_char(+7h)` is correct.
  - `commissionPeriodOf` (+7 h), quota `periodRange`/`tsq`, and home `closedIn` all use UTC instants and never call `getDay()`.
- **Quota:**
  - `quotaPct` uses BigInt floor. Every ledger sum is SQL bigint.
  - `setQuota` takes an advisory lock per owner and period. `checkReached` uses insert-or-skip on the outbox key and runs after commit.
  - The derived team target sums USER targets.
- **Money counters:**
  - `paidSatang` is updated with increment/decrement inside the money tx under `lockMoney` plus row locks.
  - The flag row is written before the increment (`createMany skipDuplicates`).
  - Company caches are recomputed in a single UPDATE under the row lock.
- **Payments:**
  - Voiding a document requires voiding its payments first (`service.ts:3143`), so `payment.voided` always fires.
  - Deposit and invoice payments are not double counted (the invoice grand is already net of the deposit).
  - POS gift-card bills are excluded.
  - Multi-CRM double-link of one POS bill is only reachable if something calls `linkSaleToDeal` twice with the same saleId. The POS register links once, so there is no finding.
- **Commission maths:**
  - `commissionOf` TIERED is marginal with ascending caps enforced by `checkRuleConfig`.
  - `cumulativeOf`/`shareOf` floor on the running total, so no satang is lost.
  - `splitParts` gives the remainder to the owner.
  - HR hand-off is capped at INT_MAX (`payroll.ts:566`), and the approval amount is clamped.
- **Serialisation:** REST and webhook money is plain numbers (DTOs call `Number()` on bigint). The deals CSV uses `/100` exactly; the company CSV rounds to whole baht (cosmetic).

## Why the existing oracles miss the class
They check each surface against its own SQL mirror (c3.1 reps, c3.2 home), so a definition error is copied into the oracle. They also use money fixtures with no VAT, no deposit deduction and no credit note (c2.7). No oracle compares **one number across surfaces**: reports vs home vs commission page vs quota. A cross-surface consistency suite would have caught M1, M2 and m1.
