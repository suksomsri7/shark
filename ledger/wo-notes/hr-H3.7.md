# H3.7 — builder notes (lane 3 · branch wip/hr-h3.7)

Base: merged `51793cdb0` (controller session/hr head: H3.4 + H3.5 + H2.12 + gate lock) into 4dbc97b56 — **clean merge, no conflicts**. prisma generate ok · lane DB already had every migration (`migrate status` up to date) · seed-hr-qc 34/34.
Statics need `QC_H37_BASE=51793cdb0` (the default `merge-base HEAD origin/session/hr` is the old origin head 8e52db009 without H3.4 ⇒ S1.6/S1.7 compare against a pre-H3.4 tree and go red for H3.4's own files).

## What was built (every hunk marked `HR H3.7`)
- **Pure** `hr/payroll-journal-rules.ts` (one `import type` from the account facade): `claimClassOf` · `accrualAmountsV2` (INCONSISTENT on missing lines · non-integer · Σ lines ≠ gross · gross ≠ net + ee + wht · ADVANCE/DEDUCTION ref not a bound row of the employee · DEDUCTION class null · any part < 0 · receivable amount not a non-negative integer) · `payrollAccrualDay` · `paidOnOk`.
- **account/gl.ts** — one block after `postPayrollJV` (additive, 0 removed lines): `PAYROLL_REF_TYPE` · `PAYROLL_ACCOUNTS` · template (13 rows) · `payrollAccrualTemplate` · strict `payrollLedgerIdsInTx` (mapping + ledger of this book, not archived; never SUSPENSE) · `payrollPeriodGateInTx` (same CLOSED text as `assertPeriodOpen`, same `isLockedDate`/`lockedMessage`) · `payrollKeyInTx` (key already in this book ⇒ reused · in another book ⇒ OTHER_BOOK) · `ensurePayrollLedgersInTx` (dorm pattern) · `postPayrollAccrualJV` · `postPayrollPayJV` · `reversePayrollRunJV` (pay then accrual through `reverseEntry`) · `payrollPayAccountsOf` · `postPayrollV1KeyedJV` (Q2, below). Every post goes through `commitEntry` (no second idempotency mechanism).
- **account/connections.ts** — import of 3 gl setup helpers · HR card `toggles: []`, `accountKeys: [PAYROLL_SALARY_EXPENSE, PAYROLL_SALARY_PAYABLE]` (+ 2 FALLBACK_CODE rows) · `connect(kind HR)` refuses `HR_OTHER_BOOK` when another book holds the HR system and, after a successful account-side connect, readies the payroll chart · EOF block `payrollBookOf` (raw SQL bound to tenantId: enabled + not archived link · ACCOUNT system active of the tenant · HR system of the tenant) · `linkPayrollBook` (one tx on the chosen book: advisory lock per HR system → other HR links of that HR system disabled → connect → `ensureAccounting` + `ensurePayrollLedgersInTx`; journal sequences after commit).
- **account/index.ts** — 1 comment + 2 export lines after the payroll export.
- **account/coa.ts** — 1 comment + 8 `PAYROLL_*` lines in `MAPPING_KEY_LABEL` (Q3).
- **hr/payroll.ts** (additions only; 6 inserted lines in existing functions + EOF block):
  - imports (2 lines);
  - v1 `approveRun`: one line shadows `postPayrollJV` inside the `try` with `postPayrollV1KeyedJV(c, runId, i)` (Q2);
  - `reverseRun`: one dispatch line → `reverseRunH37` (runs with a recorded book, and finalized v2 runs with no JV/no book — Q1); everything else keeps the old path (v1, H3.4-era one-step JV — Q9);
  - `approveRunV2`: one dispatch line after the claim / RETRY_FINAL → `finalizeRunV2H37` (H3.4's old final block below it is no longer reached; additions-only rule of qc-hr-h2.11 S13.2 forbids deleting it);
  - `markPaidV2`: one guard line — a run with a recorded book goes to `markPaidRun` (a booked run can never become PAID without its pay entry);
  - EOF: texts `H37_TEXT` / `H37_CODE_TEXT` / `h37PageText`, `finalizeRunV2H37`, `markPaidRun`, `reverseRunH37`, `setPayrollBook`, `setPayrollPayAccount`, `getPayrollAccounting`, `payAccountsOfRun`.
- **UI**: settings card `hr/payroll-accounting-ui.tsx` (book `hr-pay-book` · pay account `hr-pay-account` · state · flash · fixed advance note `hr-pay-advance-note`) wired on the HR settings page (`?pacct=` fixed codes); pay form of the v2 run section gets `hr-markpaid-account` + `hr-markpaid-date` (DateInput) when the run is booked. Actions: `payRunV2Action` / `markPaidAction` → `markPaidRun`; `approveRunV2Action` / `payRunV2Action` map valued refusals to fixed texts (`h37PageText`); new owner-only `setPayrollBookAction` / `setPayrollPayAccountAction` (no assertHrCan — the service checks OWNER). Messages `hr.payacct.*` th = en keys. 10 inventory rows (wo H3.7).

## Final transaction (v2) — exactly
claim tx (H3.4, unchanged) → `finalizeRunV2H37`: read `payrollBookOf` (MANY ⇒ BOOK_AMBIGUOUS) → tx on the book's scope (or HR scope when NONE): lock P → run row FOR UPDATE (APPROVED/PAID · no JV · not finalized, else NOT_DRAFT) → re-read `payrollBookOf` inside the tx (MANY ⇒ BOOK_AMBIGUOUS · changed ⇒ POST_FAILED) → stored figures by raw SQL (items + bound rows of the run) → `accrualAmountsV2` (INCONSISTENT) → accrual day = min(BKK pay day, last day of P) → `postPayrollAccrualJV` (MAPPING_MISSING / PERIOD_CLOSED / PERIOD_LOCKED / OTHER_BOOK) → UPDATE journalEntryId + accountSystemId + note + finalized (same guard as H3.4) → carry rows. Refusal/failure ⇒ whole tx rolled back, H3.4 rollback (DRAFT, approver cleared, work days unbound), audit `hr.payroll.post_failed {engineVersion, code}`, `{ok:false, code, note}`. Success audit `hr.payroll.approve {engineVersion, journalEntryId, accountSystemId, carryRows}`. NONE ⇒ finalized without JV, note `noteNoBook`, result `approvedNoBook` (also for a shop with no ACCOUNT system at all).

## Lock order
approve final: P → run row → (account: journal-number sequence only) → carry target periods > P ascending · markPaidRun: P → run row → account · reverse (H3.7 path): P → run row → carry rows FOR UPDATE (later periods by row lock only, as H3.4) → account reversals · linkPayrollBook: advisory `account:hr-payroll-link:<tenant>:<hr>` → link rows → ledgers/mappings (never under P) · setPayrollPayAccount: `hr:clockpolicy:<sys>` (same key as setPayrollEngine; `settings.hrPayroll` is shared). No path takes a lock of a smaller rank than one it holds.

## Q2 — v1 orphan JV (done, additive, no pin moved)
`postPayrollV1KeyedJV`: same lines/book/refType/source as `postPayrollJV` (`AccountManualJV` · PAYMENTS · 6000/6000/1010/2100/2130 — S4.20 golden control and every v1 total unchanged) but `refId = runId` and `event = HR_PAYROLL_V1:<period>:<gross>:<ssoEe>:<ssoEr>:<wht>:<net>` through `commitEntry`. A retry with the same figures finds the live entry in the same book and returns it (approve links it — no second JV); figures changed while the run was back in DRAFT ⇒ a new entry is posted and the stale, never-linked entry of that run is reversed in the same tx (its own book). refType stays `AccountManualJV` (not `hr-payroll`) because S4.20 pins `refType AccountManualJV` and "no hr-payroll key" for v1. Pins checked: qc-hr-h0.1 S4.2/S4.3, qc-hr-h0.6 S8.4, qc-hr-h1.3 S5.6 (they pin markPaid / computeItem / rules / the CRM block — not approveRun) all green; H3.7 S1.7 (v1 approveRun block minus marked lines) green. New check S4.25 (ORACLE-EDIT) proves both cases.

## ORACLE-EDITs (all marked in the files)
qc-hr-h3.7 (harness / additions; no expected amount or text changed):
- S4 group (22 checks) ran green on first contact after the H3.4 merge — **no harness fix was needed**.
- + S4.24 bank file (CSV GENERIC) total = Cr 2120 of the accrual = run net, for PAID D and APPROVED-unpaid F2 (controller ruling H3.5/H3.6) · `R.F2 = run2` in S4.14 · BANK module import.
- + S4.25 v1 orphan (controller ruling Q2).
qc-hr-h3.4:
- fixture keeps the ACCOUNT id (`ACCT34`), links system A (`setPayrollBook`) and creates a BANK money account `FIN34` of that book (1010).
- S4.10 JV total **12,509,167 → 13,501,667**: old = one-step JV gross 12,299,167 + employer SSO 210,000. New = accrual: salary expense = Σ lines 12,299,167 + advances 665,000 (eC) + claims 327,500 (mA damages) − refund 50,000 (mB) = 13,241,667; Dr = 13,241,667 + 210,000 + refund 50,000 = 13,501,667; Cr = net 12,027,709 + SSO 420,000 + WHT 61,458 + 1140 665,000 + 4900 327,500 = 13,501,667 (= old + 665,000 + 327,500; carry 372,500 / 235,000 not booked).
- S4.11 and S4.15: `markPaid` → `markPaidRun(…, {financeAccountId: FIN34, paidOn: 2031-09-30 / 2031-10-31, now: N_OCT1 / N_NOV1})` — a booked run is paid with its pay entry (markPaid of a booked v2 run now delegates to markPaidRun, whose default date "today" is outside the 2031 wage month). Expectations unchanged.
- S4.21 / S4.34 (lib): the new shop links the ACCOUNT book before approving (they assert a JV).
- S1.6 frozen list: `account/gl.ts` passes when every hunk vs base is additive and marked `HR H3.7` (brief R6).
qc-hr-h1.3 S6.1: `PAY_MARKED["HR H3.7"] = 4` (sourceRef in h37RunFiguresInTx: row type · SELECT · map ×2) + `hr/payroll-journal-rules.ts` ignored for the token sourceRef only (pure classifier of the carry suffix). Before the edit: payroll.ts+4, payroll-journal-rules.ts+3 → after: 63/63.

## Not followed / deviations (with reason)
- `clsOf` of `planCarryRows` not replaced by `claimClassOf`: payroll.ts is additions-only (qc-hr-h2.11 S13.2); the pure copy is identical (S2.6 + 3,000-run fuzz vs the oracle's rule).
- H3.4's old final block in `approveRunV2` stays in the file (unreached after the dispatch line) — same additions-only rule.
- No read-only pre-checks before the claim (brief "recommended"): a refusal in the final tx already rolls back to DRAFT with the H3.4 rollback; adding pre-checks would duplicate every gate.
- v1 key uses refType `AccountManualJV` (not `hr-payroll`) — S4.20 golden control.
- `markPaidV2` guard (extra, not in the brief): without it `markPaid()` on a booked v2 run would mark PAID with no pay entry (2120 never cleared). Only scripts call `markPaid` directly.

## Open risks
- A run approved while linked and later the book is archived/deactivated: pay/reverse still target the recorded book (JV_REVERSE_FAILED when the AppSystem row is gone; pay refuses on mapping/finance).
- `payrollBookOf` requires the ACCOUNT system `active`; a deactivated book counts as no link (approve finalizes without JV).
- Approve-time accrual day uses the BKK day of `payDate`; a pay date before the first day of P puts the accrual before P (H3.4 does not forbid such pay dates).
- H3.4's makers rule and my final tx are independent; RETRY_FINAL by a maker is allowed (unchanged from H3.4).

## Accountant list (H3.10) — design §6 AC1–AC16 + HQ16, plus
- **AC7 (controller ruling)** advance pay-outs are not booked by HR; the settings card says so (fixed th/en note: Dr employee receivable / Cr cash or bank, recorded in accounting). Question stays: should HR book the pay-out later?
- **AC17** v1 retry after a failed link reuses the posted JV; if figures changed meanwhile the stale JV is reversed (dated today / next open period) and a new one posted — confirm reversal over silent reuse.
- **AC18** a booked run is paid only through the pay entry (markPaid of a booked run requires a pay account and a date in the wage month … today).

## Runs (lane DB wo-hr-qc-l3 · QC_H37_BASE=51793cdb0) — full output `ledger/wo-notes/hr-H3.7-green.txt`
qc-hr-h3.7 56/56 forced ×2 + unforced (residue none) · seed 34/34 · h3.4 85/85 · h3.5 53 · h3.2 64 · h3.1 58 · h3.3 51 · h2.11 70 · h2.9 58 · h4.6 69 · h1.1 81 · h1.2 73 · h1.3 63 · h0.1 67 · h0.6 55 · qc-payroll 19 · payroll-reverse 14 · payadjust 27 · bulk-ops 13 · hf-hr-privacy 194 · audit-trail 21 · account-cpa 107 · account-gatea all · account-deep 10 · account-p2p3 all · fitness + fitness-hr env/noenv exit 0 · clean typecheck 0 errors.
Not runnable on the lane DB (need the account QC seed; every failure is a seed-read check): qc-acc-v2-journal · -period-assets · -policy · -coa · -permissions.
