# HR-MONEY-2 — oracle note (writer, 14 Nov 2026)

Branch `wip/hr-money-2`, from local `session/hr` 60659e7c0. Oracle `scripts/qc-hr-money-2.mts` + `scripts/qc-hr-money-2-lib.mts`. Brief `ledger/hr-briefs/hr-brief-MONEY-2.md`.

Run:
`bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_MONEY2_BASE=60659e7c0c93e858a6e4a38abd9463c9c5eeedef pnpm exec tsx scripts/qc-hr-money-2.mts`

Base run (lane ep-nameless-sea, 14 Nov): **BASE-EXPECTATION 42/42 as registered**. 16 GREEN, 26 RED, every RED for the reason below. `RESIDUE none`, activeLaw 0→0, deadlocks unchanged.
Targeted tsc (temp tsconfig, since deleted) on both files: 0 errors.

## 1. Fixture
One tenant `qc-hr-money2-*` with units u1 and u2.

Own ACTIVE law rows: SSO, TAX_BRACKET and DEDUCTION, from `hr-h3.4-vectors.json`, effective 2031-01-01. The suite refuses to insert them if any `qc-hr-money2-*` row is present (Z0), and deletes only its own rows in `finally`. SSO is 5 % on a base capped at 17,500 ฿, so the maximum is 87,500 sat (verified by hunt p1).

Users:
- owner
- pay1 (`*`, create/approve/payadjust)
- payU1 ([u1], hr.payroll.read)
- payU2 ([u2], hr.payroll.read)

Runs are created by pay1 and approved by owner. Each scenario has its own HR system.

## 2. R1 — numbers
Every claim scenario uses one employee at 20,000 ฿ (E = 2,000,000):
- The s.76 cap is 10 % × E = 200,000.
- The claim is 150,000 (≤ cap), so there is no carry.
- Aug line `DEDUCTION:-150000`. The give-back of 50,000 is ≤ 150,000 − 0 and goes to the first open period, 2031-09.
- Sep draft with the refund = `BASE:2000000` + `REFUND:50000` (R1.0, GREEN). Without it = `BASE:2000000`, gross 2,000,000.

Results:
- **R1.1** On base the reverse is ok but the refund stays APPROVED, with no audit. RED.
- **R1.2** The re-created Aug run rebinds the claim (`DEDUCTION:-150000`, seen on base). On base Sep still carries `REFUND:50000`. RED.
- **R1.3 / R1.4** Legacy state is made by raw SQL, reproducing exactly what pre-fix code leaves: the Aug run is REVERSED, the claims are unbound, the refunds are APPROVED.
  - On base, cancel ok but the refund stays APPROVED (R1.3 RED).
  - On base, Sep binds e4's refund (R1.4 RED).
- **R1.5** The claim is unbound by raw SQL while Sep is a DRAFT. On base, approve ok. RED.
- **R1.6** The refund is bound to the Sep DRAFT. On base the reverse is ok. RED.
- **R1.7** After the draft is deleted, the reverse is ok and the refund is REJECTED. On base this is RED only as a knock-on, because R1.6 already reversed: the result is `ALREADY_REVERSED`.
- **R1.8** Sep is approved with `REFUND:50000`, then Aug is reversed: `LATER_RUN`. GREEN on base. This is today's rule for dependent paid items: the reversal is refused, not flagged.
- **R1.9 / R1.10** The holder locks the refund row FOR UPDATE.
  - Race A: on base the create waits and the reverse does not (`blocked [true,false]`). The reverse succeeds and Sep then binds the refund.
  - Race B: on base `blocked [false,true]`, the reverse is ok and Sep still carries `REFUND:50000`. RED.
  - With the fix both calls wait, because the reverse must touch the refund row. Either a P(Sep) lock or the row lock passes (the chain is detected transitively).
- **R1.11** v1 system: 15,000 ฿, claim 5,000 ฿ (v1 has no cap). The engine is switched to 2 by settings SQL, then a give-back of 200,000 is made and approved. The v1 reverse (path at payroll.ts ~1240, the run has a JV) is ok on base, but the refund stays APPROVED. RED.

## 3. R2 / R3 — numbers (booked system A, book BA)
Staff:
- eM: home u1, 30,000.
- eB: home u2, 20,000.
- eR: home u2, 18,000.

Jul:
- Claim eR 100,000. 10 % × 1,800,000 = 180,000 ≥ 100,000, so it is taken in full.
- The run is approved and booked.
- Give-back eR 40,000 → Aug, approved. The claim was booked, so the class is DAMAGES.

Aug:
- eB has an advance of 500,000 and a claim of 150,000. The cap is 200,000, so no carry. Available net is 2,000,000 − 87,500 ≥ 650,000.
- eM is rostered 09:00–17:00 on Mon 4 and Tue 5 at u1 and on Wed 6 at u2, punching exactly on shift. The judge makes 3 days of equal workMin (R3.0 GREEN on base). The unit is not asserted, since that is an implementation choice.

Item lines and figures:

| emp | lines | gross | salaryExpense (Σlines + adv + dmg − refund) | er |
|---|---|---|---|---|
| eM | BASE 3,000,000 | 3,000,000 | 3,000,000 | 87,500 |
| eB | BASE 2,000,000 · ADVANCE −500,000 · DEDUCTION −150,000 | 1,350,000 | 1,350,000 + 500,000 + 150,000 = 2,000,000 | 87,500 (SSO wage = E, capped) |
| eR | BASE 1,800,000 · REFUND +40,000 | 1,840,000 | 1,840,000 − 40,000 = 1,800,000 | 87,500 (cap) |

Journal and totals:
- Accrual (R2.0, GREEN on base): Dr 6000 = 6,800,000 · Dr 6010 = 262,500 · Dr 4900 = 40,000 (the refund).
- **ACTUAL all units = 6,800,000 + 262,500 = 7,062,500** (R2.1, R2.2, and the AI tool R2.3). On base: Σgross + er = 3,000,000 + 1,350,000 + 1,840,000 + 262,500 = 6,452,500 (seen).

Split (R3). Floor each share, then the remainder goes to home:
- eM cost 3,087,500 at 2:1 → floor 2,058,333.33 = 2,058,333 and floor 1,029,166.67 = 1,029,166. Σ = 3,087,499, so +1 to home u1.
  - **u1 = 2,058,334** (R3.1).
  - Largest-remainder would give u2 +1 instead. The case is discriminating on purpose: the controller ruled the remainder goes to home.
- eB and eR have no minutes, so their cost goes to home u2: 2,087,500 + 1,887,500 = 3,975,000.
- **u2 = 1,029,166 + 3,975,000 = 5,004,166**. u1 + u2 = 7,062,500 (R3.2).
- On base: u1 3,087,500 and u2 3,365,000 (seen).

Limited viewers:
- [u2] on u2 = eB + eR = **3,975,000**, excludedHeadcount **1** (eM worked at u2), partial (R2.5). On base: 3,365,000 / 0 / false.
- [u1] on u1 = **2,058,334**, excluded 0 (R3.3). On base: 3,087,500.

Doubling eM's Aug item: every money column and every line ×2, kept consistent, then restored.
- eM cost 6,175,000 → floor 4,116,666.67 = 4,116,666 and floor 2,058,333.33 = 2,058,333, remainder 1 to u1.
- Owner **u1 4,116,667**, **u2 2,058,333 + 3,975,000 = 6,033,333** (R2.7). On base: 6,175,000 / 3,365,000.
- The [u2] limited canon is identical (R2.6, GREEN on base, and it must stay so).

v1 (R2.4): base 1,500,000, claim 500,000 → v1 gross 1,000,000, deduct 500,000, er 75,000 (v1 SSO 5 % of 15,000).
- Wage cost = base + add = 1,500,000, so **ACTUAL 1,575,000**. On base: 1,075,000.
- The v1 approve (one-step JV) is ok on base.

## 4. R4 — numbers
- v2: salaries 1,073,741,823 + 1,073,741,824 = **2,147,483,647** = int4 max. Created on base (R4.1 GREEN). WHT, net and SSO are all < gross; add and deduct are 0.
- Recompute after raising one salary by 1 → total 2,147,483,648. On base this is PrismaClientKnownRequestError at payroll.ts:2638 (`updateMany`), rolled back, and the draft is unchanged. R4.2 RED.
- Create over the limit: on base the error is at :2633. R4.3 RED.
- v1: the same boundary is created on base (R4.4 GREEN). Over the limit: error at :755 (R4.5 RED). 0 runs.

## 5. R5 — numbers and dates
Weekdays (UTC check): 14 Aug Thu, 15 Aug Fri, 20 Aug Wed, 11 Sep Thu, 17 Sep Wed.

Fixture:
- The Aug run is APPROVED before the published roster rows are added on those days, so leaves count 1 day.
- Policies: unpaid (`paid:false`, unlimited) and paid (unlimited).

Results:
- R5.1: on base → `{ok:true, APPROVED}`. RED.
- R5.2 and R5.3 are GREEN.
- R5.4: owner-linked employee, `requestLeave` auto-approve, 20 Aug. On base a row is created. RED.
- R5.5: same on 17 Sep, created APPROVED on base. GREEN, which proves R5.4 fails on base for the PAID reason only.

## 6. Older suites whose goldens could move (grep `laborMonth|hr_labor_percent|ACTUAL|giveBackClaim|refund:` over scripts/)
Under this spec, none change:
- No-lines item → gross.
- Remainder goes to home.
- Unit falls back to `HrWorkDay.unitId`.
- Standing = bound to a live run, with no amount re-check.

| place | today | after MONEY-2 |
|---|---|---|
| qc-hr-h4.2.mts:387-388 S4.11 (Jan ACTUAL U1 1,391,667 · U2 695,833) | E item has no `lines`; home U1 | unchanged (wage = gross; remainder → home U1 = the largest-remainder result) |
| qc-hr-h4.2.mts:426 S5.1 month 1,391,667 | same item | unchanged |
| qc-hr-h4.2.mts:70 S5.2 limited U2 Jan actual 0, excl 1 | E home U1 | unchanged |
| qc-hr-h4.2.mts:495/509 S5.7 doubling (updates gross/er only) | no lines | unchanged *only if* no-lines → gross (brief R2) |
| qc-hr-h4.2.mts:252-253/530 S7.1 June ACTUAL 3,075,000 | no lines, no work days → home | unchanged |
| qc-hr-h4.2-lib.mts:277 `largestRemainder` canon | pure | unchanged (do not edit labor-rules.ts) |
| qc-hr-h4.3.mts:356 M3 (AI = laborMonth) | MONTH 2026-09 has no run (ESTIMATE) | unchanged |
| qc-hr-h3.7.mts S4.31 (F refunds through approve) | claims bound to PAID runs | unchanged (claims stand); r4 has a null ref, so out of scope |
| qc-hr-h3.4-lib.mts S4.20 plain REFUND (null ref) | — | out of R1 scope, unchanged |

Watch item: qc-hr-h3.7.mts S4.35 (~l.1143–1190) creates PENDING give-backs. If any later check reverses or cancels their claim's run, those refunds are now REJECTED.

H5.1 walk fixtures: none touch labour. Not a suite: hunt probe p1 `6.labor` 7,055,209 → would read 7,755,209.

## 7. Base facts found (for the controller)
- **R1 mechanism.** The engine has two precedents:
  - (a) Build, unbound mode: rows that cannot be bound are *held* (left APPROVED and unbound) — `attendanceUnbindableInTx` for attendance refunds.
  - (b) Approve: a bound-mode rebuild plus a digest compare → `INPUTS_CHANGED` (or `ATTENDANCE_STALE` for attendance rows).
  - The oracle pins both (R1.4 hold + flag `REFUND_HELD`; R1.5 `INPUTS_CHANGED`).
- For a dependent row bound to a *later DRAFT*, the reversal precedent is the `CARRY_BOUND` refusal. R1.6 pins the analog `REFUND_BOUND`, with a new text, because the carry text speaks of carries.
- **Already-paid refund today** (later run APPROVED/PAID): `reverseCarryInTx` refuses with `LATER_RUN` before anything changes. It is not silent, so it is pinned as GREEN R1.8.
- Correction PAID rule = `paidMonthsOf` (correction.ts): any APPROVED/PAID run of the HR system for that month, *not* per employee. R5 reuses it as is.

## 8. Debts (R6, no code)
- D4 + m6: same-month rehire, 2 × SSO ceiling and 2 lines in SSO 1-10.
- m7: v1 OT by hours rounded twice (v1 frozen) → accountant list.
- K1 / NA-12: the leaver's final WHT projects future months.

Not ticketed: the holiday lookup on a borrowed shift uses the home unit (second half of m5).

## 9. ORACLE-EDIT — controller rulings 14 Nov (Q1–Q4)
After this edit the base run (forced, lane wrapper) gives **BASE-EXPECTATION 49/49 as registered**: 31 RED, 18 GREEN, residue none. The 42 earlier checks are unchanged.

### R3.4 (Q1) — home branch has no minutes
eN has home u3 and a salary of 30,000. Own system sN, no book. Rostered Mon 4 Aug at u1, Tue 5 and Wed 6 at u2, punches on shift.
- Cost is 3,087,500.
- u1 share: 1,029,166.67 → floor 1,029,166.
- u2 share: 2,058,333.33 → floor 2,058,333.
- Remainder 1 goes to u2, the unit with the most minutes. Result: **u1 1,029,166 · u2 2,058,334 · u3 0 · all 3,087,500**.
- Largest-remainder would give the satang to u1 (fraction .67), so the case discriminates.
- Base: u1 0, u2 0, u3 3,087,500. RED.

h4.2 golden: E (home U1) has minutes in U1 (10 × 600) and U2 (5 × 600). 2,087,500 → floors 1,391,666 / 695,833, remainder to home U1 → **1,391,667 / 695,833**. The golden is unchanged.

### R4.6 (Q3) — a journal line can exceed int4 while every run total fits
Two employees at 1,100,000,000 each; Z1 also takes an advance of 500,000,000.
- Base run (seen): totalGross **1,700,000,000**, net 951,526,250. Every run total fits int4.
- The accrual Dr 6000 = E total = **2,200,000,000** > int4.
- After the fix: create is refused `RUN_LIMIT`. Base: created. RED.

Proof that the payment entry cannot overflow when run totals fit:
- Payment Dr 2120 / Cr bank = Σnet ≤ Σgross (net = gross − SSO ee − WHT, each term ≥ 0).
- Accrual credit lines are each ≤ totalNet, totalDeduct, or SSO.
- Only the debit expense lines can exceed. Hence one check.

### R5.6–R5.10 (Q2, Q4)
Fixture in s5:
- Before the Aug run exists, eL's unpaid 7 Aug and paid 8 Aug leaves are approved, and eO's (owner) unpaid 21 Aug is auto-approved. These days are rostered.
- The judge jobs run, then the Aug run is created and approved (setup ok on base).

Checks:
- R5.6: on base the `decideLeave` withdraw of 7 Aug succeeds. RED.
- R5.7: on base `cancelLeave` of 21 Aug is ok. RED.
- R5.8: control, paid 8 Aug withdraw = ok. GREEN.
- R5.9: ApprovalPolicy and an APPROVED ApprovalRequest are made directly. On base `applyLeaveDecision` for the unpaid 13 Aug leave → applied. RED.
- R5.10: control, 10 Sep → applied. GREEN.

### Watch item h3.7 S4.35 — old → new: unchanged
The give-backs on `${gRun}_bDmg` (hG1) stay PENDING. No later step reverses gRun, cancels the claim, or builds a 2031-10/11 run in hG1, so R1 never fires. The `reversed` case (`R.B`) is still refused `NO` by giveBackClaim.

### Older-suite list after the rulings
Still 0 golden changes. The h4.2 E split is re-confirmed under the Q1 rule.

## 10. ORACLE-EDIT — controller R6 (re-hunt N1) + review a/b, 15 Nov
**Fixture (copied from q7).** System R6, an employee at 30,000 ฿ (1,000 ฿/day), linked to the owner. Rostered 4–8 Aug and punched; 11, 14 and 29 Aug and 1 Sep rostered with no punches. Attendance pay is on. The setup then: judge → build → sync → approve deductions → the Aug run is created and APPROVED with `ABSENT_RULE:-300000`.

| check | action | expected |
|---|---|---|
| R6.1 | SICK leave (paid policy) on 11 Aug via `decideLeave` | `HrLeaveDecisionError(CORRECTION_TEXT.paid)`, leave stays PENDING |
| R6.2 | `requestLeave` of an owner-linked SICK leave on 14 Aug | refused, no row |
| R6.3 | chain apply on 29 Aug | `{applied:false, code PAID}`, CANCELLED |
| R6.4 | paid leave on worked 5 Aug | approved (control) |
| R6.5 | paid leave on 1 Sep, open month | approved (control) |

For R6.1–R6.3, the ABSENT/LATE rows (id, status, runId, amount) and the run row are compared by canon before and after, and must be unchanged.

**R5.8 flipped.** Revoking an approved PAID leave in the APPROVED month is now expected to be refused (ruling: "follow R5").

**Review checks:**
- R1.12: claimFlow with the refund left PENDING, then reverse ⇒ REJECTED with the DEDUCTION_REVERSED audit.
- R4.7: salaries 1.0e9 + 1.1e9 with an advance of 5e8. E = 2.1e9 fits int4 → draft created. Raise the second salary to 1.2e9 → E = 2.2e9, gross = 1.7e9 → recompute refused with RUN_LIMIT, run row canon unchanged.

**Run at fix tip 8175c1a92** (forced, lane wrapper):
- 52/56 pass. Failing: R5.8, R6.1, R6.2, R6.3 — all the builder's R6 work, each RED for the reason stated.
- R1.12 and R4.7 pass, so they are registered GREEN. Against 60659e7c0 both would be RED.
- Residue none · no deadlocks · targeted tsc 0 · suite + lib = 59.9 KB.

**No leave date-edit entry point exists in src** (only `updateLeavePolicy`), so "edit onto a deducted day" has no check.
Open gap: flipping a policy's `paid` flag while approved leaves sit in paid months.
