# C5.4-C — FB-MONEY builder (Opus 5.5 · 28 Sep 2026) — checkpoint

Worktree `shark-crm-c54c` detached @ 9a7c5bf1 · not committed · QC2 only.
NOTE: `scripts/qc-crm-c5.3.mts` shows a diff at L4-M2 (ORACLE-EDIT C5.3-L4-M2 "controller · SF1 of C5.4-A review") that I did NOT make —
it appeared in this worktree while I worked (controller edit). Left untouched.

## Status (code written — proofs pending)
- [x] L2-m4 REST `vatRateBp` `.min(-1)` (`api/ops/deals.ts`)
- [x] L2-M1 reps `cm` CTE = APPROVED+PAID+REVERSED (already periodKey via commissionBase) · ORACLE-EDIT 1 c3.1:409
- [x] L2-m1 home weighted: groupBy (stage, override, value) excl. OMITTED, per-deal round · ORACLE-EDIT 2 c3.2 (o7 700,005 · o10 1,100,003 · o8 OMITTED · SQL per-deal · HAND_O open 14,300,008 weighted 6,710,002)
- [x] L2-m3 approval amount: **cap** at 2^31−1 + flag `approvalAmountCapped` + real `discountSatang` in audit `crm.deal.lines.pending` (policy thresholds are Int ⇒ same decision)
- [x] L2-M2 `WON_VALUE_BASIS = "PRE_VAT"` (payments-shared, one constant) · anchor = account facade `docWonBasis` (preVat = subTotal−discount / vatIncl = grand+depositDeducted) − live CNs · POS won = grand−vat on PRE_VAT · home KPI/leaderboard + quota ledger won = COALESCE(wonValueSatang, valueSatang) · WON deal whose money all reverses ⇒ won = valueSatang (payments afterMoneyChangedInTx) + DTO fallback · DealDto.paidSatang
- [x] L2-m2 autoWon: paid ≥ anchor doc total (vatIncl − CN vatIncl); no anchor ⇒ value · ORACLE-EDIT 5 c2.7 header
- [x] L2-M3 credit notes: CrmDealPayment `CREDIT_NOTE` row per (deal, source doc), satang = −refund where refund = clamp(liveTieOff + ΣCN − grand, 0, ΣCN) capped by money counted from that doc; reconciled like DOC_SETTLE (reverse→rewake) on CN issued/voided (bridges), payment recorded/voided, hourly reconcile · won −CN basis always · commission: negative share for CN rows (clawback split by credited share) → DEDUCTION in payroll; reversal of a clawback → COMMISSION · settle/paidInFull count CNs
- [x] ACCOUNT side (minimal): `docPaymentLedger` + liveTieOffSatang/creditNoteSatang · new `docWonBasis` · `commissionDocRatios` + credits · `recordPayment` fullyPaid counts CN (invoice reaches PAID ⇒ account.invoice.paid ⇒ DOC_SETTLE) · `paymentOutstandingOf` (portal invoice outstanding, payment-request ×4, payment panel ×3)
- [ ] proofs (typecheck · fitness ×2 · C5.3 L2,X · money suites)

## Proofs so far
- typecheck exit 0 (unit c54c-tc1) · fitness 33/33 with QC2 env and with `env -u DATABASE_URL -u DIRECT_URL`
- C5.3 `--only=L2,X` on QC2: **9/9** (K.1 · L2-M1 M2 M3 m1 m2 m4 · X1 · CLEAN) — log /tmp/c54c-logs/c54c-c53a.log
- c2.7: 77/79 — S3.1 + S9.5 red **by the ruling**: they pin `wonValueSatang = invoice grandTotal (VAT-incl, 377926)`; pre-VAT basis gives 353776.
  ORACLE-EDIT proposal 6 (needs controller): c2.7 S3.1/S9.5 expected won = anchor won basis (PRE_VAT: subTotal − discountAmount; VAT_INCL: grandTotal + depositDeducted) − live credit notes, i.e. follow `WON_VALUE_BASIS`.
- c3.1 56/56 (ORACLE-EDIT 1 applied) · c3.2 47/47 (ORACLE-EDIT 2 applied) · c3.3 90/90 (commissions) — runner /tmp/c54c-logs/run1.sh (unit c54c-run1), logs /tmp/c54c-logs/r1/
- c3.5 67/67 · c1.4 110/110 · c2.11 47/47 · hr-payadjust 27/27 · payroll 19/19 · payroll-reverse 14/14
- C5.3 FULL on QC2: 9/54 = K.1 + CLEAN + the 7 L2/X checks; every other check still red for its own finding (unchanged) — /tmp/c54c-logs/c53-full.log
- STOPPED on controller quota order (95%): code done + typecheck/fitness/C5.3 green; runner c54c-run1 (acc suites, /tmp/c54c-logs/r1/SUMMARY) and probe c54c-probe1 (/tmp/c54c-logs/probe1.log) still running unread · c2.7 S3.1/S9.5 red by ruling (proposal 6) · acc-v2-adjust 96/96

### Controller ruling (28 Sep ~06:10 UTC) — proposal 6
✅ ORACLE-EDIT `qc-crm-c2.7.mts` S3.1 + S9.5: won value = the BEFORE-VAT basis (controller default for owner Q14, pending). Expect the pre-VAT amount; take the basis from the same single constant the product uses so a later owner ruling flips product + oracle together. Mark `// ORACLE-EDIT C2.7-S3.1/S9.5 (C5.4-C · won basis = before VAT · Q14)`. The L4-M2 edit in qc-crm-c5.3.mts is the controller's (3xx ruling) — leave it.

## RESUME after reset (28 Sep)
- Ruling 6 applied: c2.7 S3.1/S9.5 expect `wonBasisOf(doc)` from `payments-shared.WON_VALUE_BASIS` (5 marks `ORACLE-EDIT C2.7-S3.1/S9.5 (C5.4-C · won basis = before VAT · Q14)`) → **c2.7 79/79**
- run1 rest: acc-v2-adjust 96/96 · acc-v2-payments 162/162 · account-api-write-payments 32/32 · account-api-webhooks 22/22 · account-qc7 46/46 · account-cpa 107/107 · acc-v2-groups 174/174 · acc-v2-detail 85/85 · acc-v2-promptpay 81/82 = CRASH at PP16 `findUniqueOrThrow(E.promptPay.staticPending.requestId)` — seed request id from acc-v2-expected.json absent on QC2 (seed/env, not batch C; PP16.1/16.2 themselves passed)
- probe-cn (scripts/pending/c54c/probe-cn.mts) 7/7: CN-before-payment · CN-after-full-payment + redelivery idempotent · CN voided via bridge restores paid/won/commission (no void tag) · CN + WHT ⇒ DOC_SETTLE = WHT only · CLEAN
- typecheck EXIT=0 (unit c54c-tc2) · fitness 33/33 ×2

## Review round 2 (money reviewer: NOT MERGEABLE → fixes)
- B1 account `receivableStatusOf(grand, paid, CN)` = ONE status function: recordPayment · voidPayment (INVOICE) · issueDocument(CN) + voidDocument(CN) via `rederiveInvoiceStatusInTx` (locks source; →PAID emits account.invoice.paid, same key)
- S1 settleTargetOf = grand − (CN − refund) − cash · S2 clawbackParts only APPROVED+PAID (net) · S3 clawback rows born APPROVED (SYSTEM_CLAWBACK audit, events created+approved; reject() only takes PENDING)
- Q2 dashboard monthlyStatusSeries revenue PAID bucket (and its grand) = grand − live CN (2nd query only on revenue side with PAID docs) · agingReport OUT outstanding − live CN
- 1-satang: netOfPayments rounds once per ratio (PAYMENT + DOC_SETTLE of one doc summed first)
- probe-cn 13/13 incl. D = REAL account paths (issue/recordPayment/voidDocument/agingReport + real outbox events → bridge handlers), reviewer B1 numbers · C5.3 L2,X 9/9 · typecheck 0 · fitness 33/33 ×2 · runner run2 → /tmp/c54c-logs/r2/SUMMARY
- Round 2 results (QC2, units c54c-run2/probe3/tc4): probe-cn 14/14 (+ D3 dashboard paid bucket 20,330,000) · C5.3 L2,X 9/9 · c2.7 79/79 · c3.3 90/90 · c3.1 56 · c3.2 47 · c3.5 67 · c1.4 110 · c2.11 47 · hr-payadjust 27 · payroll 19 · payroll-reverse 14 · qc7 46 · cpa 107 · acc-v2-adjust 96 · payments 162 · groups 174 · detail 85 · api-write-payments 32 · api-webhooks 22 · account-deep 10 · promptpay 81/82 (same seed crash PP16) · acc-v2-overview/dashboard NOT RUNNABLE on QC2 (answer key bound to QC1 host; QC2 has no acc-v2 seed) — covered by probe D3 · typecheck 0 · fitness 33/33 ×2 · acc-v2-expected.json restored (no diff)
- R3 STOP (quota 91%): round-3 code done (no invoice.paid on zero-cash CN · payload +paidTotalSatang/creditNoteSatang + docs regen · CN cap under source lock · backfill dry-run QC2 = 0) · probe-cn 17/17 · C5.3 L2,X 9/9 · c3.3 90/90 · typecheck 0 · fitness 33/33×2 · NEXT: read /tmp/c54c-logs/r3/SUMMARY (unit c54c-run3 still running) then hand back
- R3 DONE: run3 all green (promptpay 81/82 = same seed crash) · handed back
- R4 (hunt F1–F5): family credit helpers (docFamilyIds/familyCreditInTx/familyCreditByInvoice/invoiceOfDocInTx/creditMoneyDocOf) wired into recordPayment · liveCredit · paymentTargetOf · docPaymentLedger · docWonBasis · commissionDocRatios · portal · overviewStats · aging · dashboard · creditAvailable (family cap under IV lock) · rederive→parent IV · F3 lock order in voidDocument · F5 type check · CRM onCreditNoteChanged/hourly map to parent IV · backfill family+bigint · hunter probes GREEN (H1 refused, H2 paid 0/won 0/comm 0, H3 refused, R4 0 deadlocks) · probe-cn 22/22 · typecheck 0 · fitness 33/33×2 · suites run4 → /tmp/c54c-logs/r4/SUMMARY
- R4 DONE: run4 all green (promptpay 81/82 same seed crash) · typecheck 0 (tc7) · handed back
- R5 (G1 REFUSE: CN chain ending at a DEPOSIT_RECEIPT refused · G2 chain docs must be live · G3 voidDocument refuses while a live CN exists in the family) · probe-family GREEN (N2a refused, N3/N4 void refused) · probe-hunt/race hold · probe-cn E4 regex updated to the deposit message · run5 → /tmp/c54c-logs/r5/SUMMARY
- R5 DONE: run5 suites all green (promptpay 81/82 same seed crash) · probe-cn 23/23 (probe5) · typecheck 0 (tc8) · fitness 33/33×2 · handed back
