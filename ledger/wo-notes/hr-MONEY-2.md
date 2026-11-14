# HR-MONEY-2 — builder notes (14 Nov 2026)

Tree `/root/projects/shark-hr` · branch `wip/hr-money-2` (from session/hr 60659e7c0; oracle commits 85ffe50d7 + db37e6b4b) · brief `ledger/hr-briefs/hr-brief-MONEY-2.md` · oracle `scripts/qc-hr-money-2.mts` (49 checks, not edited) · green run `hr-MONEY-2-green.txt`.
No schema / migration. `payroll-rules.ts` byte-identical (ST1). Files of ST2 untouched.

## 0. Checkpoint
- done: R1–R5 code · oracle 49/49 · regression (list in green.txt) · ORACLE-EDITs below · typecheck.
- next: controller full regression + reviewer + hunter.

## 1. What changed where
| file | what |
|---|---|
| `hr/payroll.ts` | **R1** `money2VoidRefundsInTx` (reverse v1 path after `reverseCarryInTx` + `reverseRunH37` both modes): run's DEDUCTION claims FOR UPDATE → their live `refund:<claim>#…` rows FOR UPDATE → unbound ⇒ REJECTED (runId NULL, decidedAt now) · bound to APPROVED/PAID run ⇒ `LATER_RUN` · bound to a DRAFT or UPDATE count < read ⇒ `REFUND_BOUND` (fixed text `MONEY2_TEXT.refundBound`, audited by `reverseRefused`) · audit `hr.payadjust.refund_void {code DEDUCTION_REVERSED, claimId, runId}` after commit. `cancelAdjustment` of an unbound DEDUCTION → `money2DeleteClaim` (delete + void unbound live refunds in one tx, audit code `CLAIM_CANCELLED`). Build backstop `money2HeldRefundsInTx` in `buildRunV2InTx` (both modes): refund whose claim does not stand is not bound, stays APPROVED, item flag `REFUND_HELD`; at approve the bound-mode rebuild drops it ⇒ digest differs ⇒ `INPUTS_CHANGED`. **R4** `money2OverV1` (createPayrollRun · rebuildDraftRun) and `money2OverV2InTx` in `writeRunV2InTx` (totals · item money columns · every `accrualAmountsV2` amount) ⇒ `RUN_LIMIT` / `PayrollInputError` / `{ok:false, reason}` before any write; `Run2Code` + `"RUN_LIMIT"`. Reader `payrollAccrualInputsOfRuns` for labor.ts. |
| `hr/labor.ts` | **R2** month ACTUAL wage per item = `accrualAmountsV2([item], bound, claims).salaryExpenseSatang` (v2 with lines) · v1 = base + add − bound LATE/ABSENT · no lines / inconsistent = gross; + employer SSO. **R3** day unit = unit of `sourcesJson.rosterEntryIds` entry (fallback `HrWorkDay.unitId`); `money2Split` floors shares, remainder → home if it has minutes else most minutes (tie lowest id). Privacy gate (`g.sees(home)`, excludedHeadcount) unchanged. `largestRemainder`/labor-rules untouched. |
| `hr/leave.ts` | **R5** `leavePaidRunRefusalInTx` (policy `paid === false` ∧ APPROVED/PAID run of the HR system in any BKK month of the leave ⇒ `CORRECTION_TEXT.paid`, imported) · `applyLeaveDecision` approved ⇒ CANCELLED + audit `hr.leave.apply_refused {code PAID}`. Same rule as correction.ts `paidMonthsOf` (that file is frozen, so the 1-query rule is restated, not exported). |
| `hr/service.ts` | R5 on `decideLeave` (PENDING→APPROVED and APPROVED→REJECTED) · `requestLeave` owner auto-approve (rolls back, no row) · `cancelLeave` of an approved owner leave. |
| `src/messages/{th,en}/common.json` | `hr.…fl_REFUND_HELD` label (JSON has no marker). |

## 2. §F self-check
1 n/a (no page/route) · 2 ✔ inside every new `$transaction` only the tx client (`money2DeleteClaim`; reverse/build/leave helpers take the caller's tx) · 3 n/a (no new scope surface; labor viewer scope unchanged) · 4 ✔ refusals are fixed Thai texts (REFUND_BOUND, RUN_LIMIT, CORRECTION_TEXT.paid), no ids · 5 ✔ new tx uses H34_TX (60 s) like the neighbours · 6 n/a no migration · 7 ✔ no second connection under a lock (audits after commit) · 8 n/a · 9 n/a no new outbox event · 10 ✔ files ⊆ brief list (+ messages, notes, 3 oracle edits).

## 3. ORACLE-EDITs (pre-authorised kind — minimal, marked)
- `qc-hr-h1.3.mts` S6.1: `PAY_MARKED` + `"HR MONEY-2": 10` (10 × sourceRef in the marked MONEY-2 block of payroll.ts: refund hold/void readers + accrual-input reader for labour ACTUAL).
- `qc-hr-h3.2.mts` S1.8: marked-hunk regex `/HR H\d|HR-SET-\d/` → `/HR H\d|HR-SET-\d|HR MONEY-2/` (leave.ts, service.ts hunks).
- `qc-hr-h3.4-lib.mts` S1.6 `laterOnly`: `/HR-SET-\d+|HR H\d+\.\d+/` → `+ |HR MONEY-2` (same files).
- `qc-hr-h3.6.mts` S1.6 `laterMarked` regex `+ |HR MONEY-2` (payroll.ts, service.ts hunks).
- `qc-hr-h3.9.mts` S1.5 `laterMark`: `/HR-SET-\d+/` → `/HR-SET-\d+|HR MONEY-2/`.
- `qc-hr-h4.3-lib.mts` S1.6 (in base only): hr-frozen files / older oracles pass when every hunk carries "HR MONEY-2"; the ticket's own new oracle files `qc-hr-money-2(-lib).mts` are not "other oracles" (S1.6 was already RED at the oracle commit db37e6b4b because of them — controller please confirm) · S1.7 `anyMark` + `|HR MONEY-2`.
No expectation/golden changed. h4.2 S4.11/S5.1/S5.7/S7.1 unchanged as the oracle note predicted (E: 1,391,667 / 695,833).

## 4. R6 — accountant list (no code)
1. **m6 (+D4)** same-month rehire = two HrEmployee rows ⇒ SSO clamped per item ⇒ up to 2 × ceiling, and SSO 1-10 has two lines for one national id.
2. **m7** v1 manual OT by hours rounds twice (rate, then hours × rate) — v1 frozen; +1 sat at 10 h, +93 sat at 744 h on 15,123 ฿.
3. **K1 / NA-12** leaver's final-period WHT still projects the remaining months (e.g. 1,566.25 ฿ where the true year tax is 0).
4. **N1 (HF-SSO hunt)** two v2 runs paid in the same January both get month index 1 ⇒ the second projects 13 months of income.

## 5. Production note
No migration. Labour-cost ACTUAL figures (`laborMonth`, AI `hr_labor_percent`) change for months with advance/claim recoveries or give-back refunds (now = accrual Dr 6000 + Dr 6010) and for borrowed shifts (split to the rostered unit). Give-back refunds whose deduction no longer stands are held (flag REFUND_HELD) or voided on reverse/cancel; a reverse whose refund sits in a later draft is refused REFUND_BOUND. Existing legacy APPROVED refunds of already-reversed claims will be held at the next build (not paid) — visible as REFUND_HELD; owner may reject them by hand.

## 6. Decisions / notes for the controller
- Cancel of an unbound claim voids only unbound live refunds; a refund already bound to a DRAFT is left for the approve backstop (INPUTS_CHANGED, then rebuild holds it). Not pinned by the oracle.
- R4 v1 checks run totals + item money columns only (brief); the v1 one-step JV uses the same totals.
