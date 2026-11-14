# HR-MONEY-2 — money fixes from the H5.2 hunt (M1 M2 m3 m4 m5) · mini-brief

Base `session/hr` 60659e7c0 · branch `wip/hr-money-2` · oracle `scripts/qc-hr-money-2.mts` (+ `-lib`) · 56 checks (35 RED-by-design, 21 GREEN) · hand numbers `ledger/wo-notes/hr-MONEY-2-oracle.md` · hunt `ledger/wo-notes/hr-H5.2-money-hunt.md`.
Mark every hunk `HR MONEY-2` (ST3). No schema/migration.

## Problem
M1 a give-back REFUND is still paid after its deduction run is reversed / its claim cancelled · M2 labour ACTUAL = run gross + er, but v2 gross is net of recoveries and includes refunds · m3 a run over int4 gives a raw DB error · m4 back-dated unpaid leave in an APPROVED/PAID month is accepted silently · m5 a borrowed shift is charged to the home branch in ACTUAL.

## Rulings (contract)
**Scope of R1** = REFUND rows whose `sourceRef` starts `refund:` (give-backs). Plain REFUND rows (null ref) are untouched. A claim *stands* when its row exists, kind DEDUCTION, status APPROVED, `runId` set and that run is APPROVED or PAID. No amount re-check against lines (h3.7 S4.31 inserts claims without lines).

**R1 (M1)**
- *Reverse* (v2 `reverseRunH37`, both booked and no-book, and the v1 path ~l.1240): in the same tx, lock the run's bound claims FOR UPDATE, then each live refund of them:
  - PENDING or APPROVED and unbound → `REJECTED`, `runId` NULL, `decidedAt` now · audit `hr.payadjust.refund_void` {code `DEDUCTION_REVERSED`, claimId, runId}.
  - Bound to a later DRAFT → refuse the whole reversal with code `REFUND_BOUND` and text "การคืนเงินของรายการหักในรอบนี้อยู่ในรอบจ่ายงวดถัดไปแล้ว — ลบร่างหรือกลับรายการรอบงวดถัดไปก่อน แล้วจึงกลับรายการรอบนี้". This follows the CARRY_BOUND precedent. Audit via `reverseRefused`.
  - Bound to an APPROVED/PAID later run → today's `LATER_RUN` (unchanged; pinned GREEN R1.8).
  - An UPDATE that touches fewer rows than it read means the refund was bound meanwhile ⇒ `REFUND_BOUND` (same as the `n !== rows.length` rule in `reverseCarryInTx`). Both paths must touch the refund row (race R1.9/R1.10 holds that row lock).
- *Cancel* (`cancelAdjustment` of an unbound claim): its live refunds → REJECTED in the same tx · audit code `CLAIM_CANCELLED`.
- *Build backstop* (`buildRunV2InTx`, unbound mode — the H3.2 "held" mechanism, see `attendanceUnbindableInTx`): a refund whose claim does not stand is not bound. It stays APPROVED, and the employee's item gets flag `REFUND_HELD` (label `fl_REFUND_HELD` in th+en, ST4).
- *Approve backstop* (`approveRunV2`): the bound-mode rebuild applies the same rule ⇒ digest differs ⇒ existing `INPUTS_CHANGED`.
- Re-creating the reversed run restores nothing (refund stays REJECTED).

**R2 (M2)** labour ACTUAL per item = wage cost + `ssoEmployerSatang`:
- v2: wage cost = `accrualAmountsV2([item], bound, refundClaims).salaryExpenseSatang`. That is Σlines + advance/claim recoveries − give-back refunds; WAGE-class refunds stay in; LATE/ABSENT stay reduced. ⇒ ACTUAL = accrual Dr 6000 (salary) + Dr 6010 of the run, to the satang. Read the bound rows and claims like `h37RunFiguresInTx` / `h37RefundClaimsInTx`.
- An item without a `lines` array (hand-made fixtures only) → wage cost = `grossSatang`.
- v1: wage cost = `snapshot.baseSalarySatang + addSatang` − LATE/ABSENT deductions bound to the run for that employee.
- `hr_labor_percent` reads `laborMonth` (no change in ai.ts). ESTIMATE months unchanged.
- Privacy unchanged: money only for employees whose HOME unit the viewer sees; others are counted in `excludedHeadcount`.

**R3 (m5)** Split each employee's cost by worked minutes per unit.
- The unit of a worked day is the unit of the roster entry the day was judged against; fall back to `HrWorkDay.unitId` when there is none.
- No minutes → home unit.
- Floor each share; the remainder satang go to the HOME unit when it has minutes, else to the unit with the most minutes (tie → lowest unit id; controller Q1, R3.4). Do not change `largestRemainder` (pinned by the h4.2 lib).
- Do it in labor.ts; judge.ts and work-entries are frozen.
- Limited viewer: sees only home-unit employees' cost, in the units they may view. An outsider who worked in their unit counts in `excludedHeadcount` and none of his cost leaks.

**R4 (m3)** Before writing (create v1/v2, recompute v1/v2): if any run total, item money column, or (v2, with or without a book) any `accrualAmountsV2` amount = journal line would exceed 2,147,483,647, refuse. Dr 6000 = Σ gross + recoveries can exceed int4 while gross fits (R4.6); the payment line = Σnet ≤ gross cannot. Nothing is written.
- v2: `{ok:false, code:"RUN_LIMIT", reason}`. v1: `PayrollInputError(reason)`. Recompute: `{ok:false, reason}`; the draft is untouched.
- reason = "ยอดรวมของรอบจ่ายนี้เกิน 21,474,836.47 บาท ซึ่งเป็นยอดสูงสุดที่ระบบเงินเดือนรับได้ต่อรอบ — แยกพนักงานไปอีกระบบ HR แล้วสร้างรอบจ่ายแยกกัน"
- Exactly 2,147,483,647 is accepted.

**R5 (m4)** Reuse the correction rule `paidMonthsOf` (correction.ts): any APPROVED/PAID run of that HR system for a BKK month the leave touches.
- Approving a leave, or withdrawing/cancelling an APPROVED one (`decideLeave` APPROVED→REJECTED · `cancelLeave`; controller Q2), (`decideLeave`, so `decideLeaveAs`; `requestLeave` owner auto-approve; chain `applyLeaveDecision` → CANCELLED + `hr.leave.apply_refused` code `PAID`) whose policy has `paid === false` is refused with `CORRECTION_TEXT.paid`, imported, not copied (ST5). The leave stays PENDING / no row is written.
- Paid or legacy (no policy) leaves are accepted as today. Check under the existing hr-leave locks.

**R6 debts (no code)** D4 + m6 same-month rehire doubles the SSO ceiling (two HrEmployee rows) · m7 v1 OT by hours rounded twice — v1 frozen → accountant list · K1 the leaver's final-month WHT projects future months → NA-12.

## Files
Likely touched: `hr/payroll.ts` (R1, R4) · `hr/labor.ts` (R2, R3) · `hr/service.ts` + `hr/leave.ts` (R5) · `src/messages/{th,en}/common.json` (fl_REFUND_HELD).
Frozen:
- `payroll-rules.ts` (byte, sha).
- Unchanged vs base: `payroll-run-rules.ts` · `payroll-journal-rules.ts` · `labor-rules.ts` · `judge.ts` · `work-entries(-rules).ts` · `correction(-rules).ts` · `ai.ts` · `src/lib/modules/account/**` · `prisma/**`.

## Run list (lane wrapper, gate lock)
qc-hr-money-2 · qc-hr-h0.6 · h1.1 · h1.3 · h2.4 · h2.7 · h3.1 · h3.2 · h3.4 · h3.4-ytd · h3.6 · h3.7 · h3.8 · h3.9 · h4.2 · h4.3 · h4.8 · qc-payroll · qc-payroll-reverse · qc-hr-payadjust · qc-account-cpa · qc-audit-trail · qc-hf-hr-privacy · targeted tsc (temp tsconfig).
Older goldens: 7 places checked, none expected to change under this spec (note §6). Watch h3.7 S4.35+ (PENDING give-backs, if a later check reverses that run).

## Controller rulings 14 Nov (folded in)
R1 mechanism, the three spec choices, and the REFUND_BOUND / RUN_LIMIT texts are accepted.
- Q1 → R3.4: remainder goes to the unit with the most minutes when home has none.
- Q2 → R5.6 / R5.7 (+ R5.8 control): withdraw or cancel refused.
- Q3 → R4.6: accrual-line guard.
- Q4 → R5.9 (+ R5.10 control): approval-chain path pinned.
- **R6 (re-hunt N1, 15 Nov).** Approving any leave refuses with `CORRECTION_TEXT.paid` and writes nothing when:
  - the leave is paid or unpaid,
  - it covers a day carrying an ABSENT_RULE/LATE_RULE deduction,
  - that deduction is bound to an APPROVED/PAID run.

  This covers `decideLeave`, owner create-as-approved, and the chain `applyLeaveDecision` (→ CANCELLED + code PAID).
  - Revoking an approved PAID leave in a paid month is refused as for unpaid (R5.8 flipped from control to RED).
  - A paid leave on a non-deducted day, or in an open month, stays allowed (R6.4/R6.5).
  - The auto-refund into the next period is out of scope (debt).

  Checks R6.1–R6.5, plus review checks R1.12 (a PENDING refund is voided too; GREEN at fix tip 8175c1a92) and R4.7 (recompute with only the accrual overflowing → RUN_LIMIT, draft untouched; GREEN at the tip).

  There is no leave date-edit entry point in src, so "edit onto a deducted day" has no check.
