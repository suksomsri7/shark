# H5.2 money hunter — paths between tickets, from time data to money · 14 Nov 2026

Tree `shark-hr` branch `wip/hr-h5.2-money` (from local `session/hr` 60659e7c0). Lane DB = ep-nameless-sea (via `scripts/qc-hr.sh`, gate lock held for every run).
`prisma generate` ran through `scripts/iso.sh`. `prisma migrate status` (wrapped) = "Database schema is up to date" (226 migrations), so `migrate deploy` had nothing to apply.
Executed: 5 probes in `scratchpad/h52m/` (`common.mts` = the H3.10 fixture with slug `qc-h52m-`, plus `p1-chain` `p2-adjust` `p3-races` `p4-bounds` `p5-scale`; output in `p*.out`).
p1 ran twice: the first run failed to compile, then it ran fully. p3 ran twice: the first run had a probe sequencing error in R3b/R4, then it ran fully.
Every run ended with `RESIDUE none (… activeLaw=0->0)`. The only rows created were in my own tenants (`qc-h52m-*`) and my own ACTIVE law rows (sourceKey `qc-h52m-<tag>-*`, using the json in `scripts/fixtures/hr-h3.4-vectors.json`: SSO max 17,500 from 2031-01-01). All of them were removed.
No src/prisma/scripts edits, no commits.
Already covered by H3.10 and not repeated here: opening YTD and the first run in mid-year, salary-only end-to-end with reverse and re-run, book-switch races, privacy.

## Findings

| # | sev | title | cause (file:line) |
|---|---|---|---|
| M1 | MAJOR | A give-back REFUND is still paid after its claim's deduction run was reversed and the claim was cancelled. The employee is refunded money that was never deducted, and the debit goes to 4900 | `payroll.ts:3499-3505` (reverseRunH37 unbinds the claims) and `:1261-1268` (v1 path); neither checks for `refund:<claimId>` rows · `payroll.ts:397-431` cancelAdjustment deletes an unbound claim even when live refunds point at it · `payroll-journal-rules.ts:47-55` treats an UNKNOWN refund class as a flag only (written to audit only, `payroll.ts:3362`) |
| M2 | MAJOR | The labour-cost month ACTUAL (H4.2), and the AI `hr_labor_percent` built on it, leave out advance and claim recoveries and include REFUNDs. It does not match the wage cost in the journal | `labor.ts:632,652` sum `grossSatang + ssoEmployerSatang` · v2 `grossSatang` = e0 + add − (unworked + advance + claim) (`payroll-run-rules.ts:510-511`), while the accrual books expense = Σlines + advance + damages + overpay − refund (`payroll-journal-rules.ts:113`) |
| m3 | MINOR | A payroll whose run total is over int4 (more than 21,474,836.47 ฿ a month) cannot be created in v1 or v2. The user gets a raw Prisma error instead of a refusal | `payroll.prisma:104-110`, the run totals are `Int` · there is no guard before `payroll.ts:2633` (v2) or `:755` (v1) |
| m4 | MINOR | A back-dated leave decision on a month whose payroll is APPROVED or PAID is accepted silently: no pay effect, no adjustment, nothing shown. A time correction in the same situation is refused with "PAID" | `leave.ts:434-451` / `service.ts decideLeave` have no payroll-period gate · work entries are frozen (`work-entries.ts:354`) · correction gate `correction.ts:171-181` |
| m5 | MINOR | Branch of a borrowed shift: ACTUAL charges it to the home branch, ESTIMATE to the rostered branch. The holiday lookup also uses the home branch | `judge.ts:1125-1126` (`unitOfDay`, not the roster unit, goes into HrWorkDay.unitId and the holiday lookup) vs `labor.ts:354` |
| m6 | MINOR (part of known D4) | A rehire in the same month (two HrEmployee rows with the same national id) gets 2 × the SSO ceiling, and the SSO 1-10 file has 2 lines for the same national id | the SSO clamp is per item (`payroll-run-rules.ts:434`) · `filings/sso.ts:165` writes one line per item |
| m7 | MINOR | v1 manual OT "by hours" rounds twice (the rate first, then hours × rate). v2/H2.9 round once | `payroll-rules.ts:108,114` → `payroll.ts:235-238` |
| K1 | known, deferred (H3.3 D-8 / NA-12, `hr-H3.4-design.md:108`) | Quantified: the final-period WHT of a leaver is still projected over the remaining months | `payroll-run-rules.ts:440` (`regular = base` even when `finalPeriod`) |

No BLOCKER found. No double count, no lost deduction and no deadlock on the time → pay chain (p1, p3: `pg_stat_database.deadlocks` stayed 0).

### M1 repro (p2, executed). v2, booked; e2 at 20,000 ฿
1. Aug: claim dA 3,000 ฿ (DEDUCTION, no consent). The s.76 cap is 10% × 2,000,000 = 200,000 sat, so the line is `DEDUCTION:dA:-200000/300000` and the carry of 100,000 sat goes to Sep. Approve, then pay.
2. `giveBackClaim(dA, 50,000, 2031-09)` is accepted and approved. 150,001 is correctly refused (cap = 200,000 − 50,000).
3. Sep draft is created, then reverse Aug: refused with `CARRY_BOUND` (correct). Delete the Sep draft, then reverse Aug: ok. Result: carries REJECTED, dA unbound (APPROVED, runId null), 2 reversal entries. **REFUND row stays APPROVED.**
4. `cancelAdjustment(dA)` → `{ok:true}`, so the claim row is deleted.
5. Re-create Aug: e2 has only `BASE 2,000,000`, so nothing is deducted. Approve. Then Sep: e2 `REFUND:+50000`, gross 2,050,000, net 1,962,500. Approve ok.
   Sep accrual shows **Dr 4900 50,000** (damages recovery reversed, although no recovery remains on the books after step 3).
   Expected: refund 0. Either the reverse must refuse or withdraw the dependent refund, or the cancel must refuse, or approve must refuse a refund whose claim is gone. Overpaid: 500.00 ฿.

### M2 numbers (p1, executed; also p2)
p1 Aug, 3 staff. eB: 20,000 ฿ with advance 5,000 ฿ and damages 3,000 ฿, of which 2,000 ฿ applied because of the cap.
- Accrual (balanced 7,755,209 / 7,755,209): Dr 6000 7,492,709 + 6010 262,500 = Cr 2120 6,530,209 + 2150 525,000 + 1140 500,000 + 4900 200,000.
- `laborMonth` ACTUAL: all units = 7,055,209 = run gross 6,792,709 + employer SSO 262,500. Journal wage cost (6000 + 6010) = 7,755,209. Difference: **−700,000 sat (7,000 ฿) = eB's advance + damages**. eB's own labour cost shows 13,875 ฿ instead of 20,875 ฿.
- p2 Sep: e2 has a 500 ฿ REFUND, so ACTUAL is overstated by 50,000 sat. e1's carried advance of 587,500 sat is understated.
- The invariant the brief asked for still holds: Σ branches = run gross + employer SSO (p1: u1 5,667,709 + u2 1,387,500 = 7,055,209; p4: 15,124,100 + 1,543,750 = 16,667,850). The AI tool equals `laborMonth` (p4).
- The gap is the meaning of `gross`. Recoveries and refunds are not labour cost, so ACTUAL should be Σ(gross + advance + claim applied − refund) + employer SSO.

### m3 (p5, executed)
30 × 800,000 ฿ = 24,000,000 ฿. v2 → `PrismaClientKnownRequestError … tx.hrPayrollRun.create() payroll.ts:2633`; v1 → same error at `payroll.ts:755`. 0 runs written (rolled back, no corruption).
A single 21,000,000 ฿ salary works (item gross 2,100,000,000; WHT 724,149,375).
Account lines are also int4 (`account_gl.prisma:508`), so the journal side has the same ceiling.

### m4 (p1 §7, executed)
After the Aug run was PAID: correction on 5 Aug → `"เดือนนี้อนุมัติเงินเดือนแล้ว — แก้เวลาย้อนหลังไม่ได้"` · PENDING unpaid leave for 14 Aug, then `decideLeaveAs(APPROVED)` → `{ok:true}` · build → frozen · sync → created 0, refunds 0 · Sep run → eA `BASE` only.
In this fixture the day was already deducted as ABSENT, so no money is wrong. A back-dated *paid* leave on an absent day, though, would never be refunded and nothing tells the user.
This is not implemented, not a computation bug: there is no retro pay adjustment for leave, holiday or roster changes in a closed month.

### m5 (p1, executed + read)
eC was rostered at u2 on 25–29 Aug and eB at u1 on 18 Aug, but HrWorkDay.unitId = home unit (eC u1, eB u2). So ACTUAL split eC 100% to u1.
With HrEmployeeUnit history (p4), the split is right: mover 4 days u1 / 4 days u2 = 1,543,750 / 1,543,750.

### m6 (p4, executed)
rehA 60,000 ฿ ends 5 Feb → wage 10,000 → SSO 500 · rehB (same national id) starts 20 Feb → 18,000 → base 17,500 → SSO 875. Total ee SSO 1,375 ฿ (+1,375 employer) vs the monthly max 875 ฿. SSO 1-10 has two lines for national id 1103700012389 (10,000.00 + 17,500.00).
This rarely happens. It is the same root as D4 (rehire = new row).

### m7 (read only, hand-derived)
Monthly 15,123 ฿: rate = round(1,512,300 / 30 / 8 × 1.5) = round(9,451.875) = 9,452 · 10 h → 94,520 vs exact 94,518.75 → 94,519 (+1 sat) · 744 h → 7,032,288 vs 7,032,195 (+93 sat).

### K1 (p4, executed)
rehA's final Feb item: gross 10,000 ฿, SSO 500, **WHT 1,566.25 ฿**, net 7,933.75. By hand (k = 9): projected income 10,000 + 60,000 × 9 = 550,000 · SSO 500 + 875 × 9 = 8,375 · net income 550,000 − 100,000 − 60,000 − 8,375 = 381,625 · tax 7,500 + 8,162.50 = 15,662.50 ÷ 10 = 1,566.25.
True year for this employer: 10,000 ฿ of income, so tax 0. Recommend raising NA-12.

## Probes — invariant · expected (by hand) · result
**p1 time → pay chain, v2, Aug 2031** (shift 09–17, grace 5, N 480; eA 30,000 u1 / eB 20,000 u2 / eC 25,000 u1).
- Rates for eA: base / 14,400 = 208.33 sat per minute; one day = base / 30 = 100,000.
- Expected days, all seen exactly: 04 late 30 → 6,250 · 05 early 45 → 9,375 · 07 late 20 → 4,166 (floor) · 15 late 40 → 8,333 · 06 missing OUT → REVIEW, so create = `WORK_ENTRIES`; owner ADD OUT 17:00 → w480 · 08 PUBLIC holiday 09–19: hw480, oh120 · 11 break shift 09–18/60: w480 · 12 unpaid ul480 · 13 paid pl480 · 14 absent a480.
- OT requests: day 7 = 120 × OT_WORKDAY 1.5× = 37,500; day 8 = 120 × OT_HOLIDAY 3× = 75,000. The holiday band (480) is paid once, as HOLIDAY_WORK 1× = 100,000. No overlap with OT.
- Sync: LATE 28,124 + ABSENT 100,000, approved.
- Correction 15th 09:40 → 09:00 after approval. Create = `ATTENDANCE_STALE`. Re-sync: old row REJECTED, new LATE 19,791 = 6,250 + 9,375 + 4,166 (APPROVED).
- Lines eA: BASE 3,000,000 · HOLIDAY_WORK +100,000 · UNPAID_LEAVE −100,000 · OT +37,500 · OT +75,000 · ABSENT −100,000 · LATE −19,791.
- Totals:

  | | gross | SSO ee | SSO er | WHT | net | add | deduct |
  |---|---|---|---|---|---|---|---|
  | eA | 2,992,709 | 87,500 | 87,500 | 0 | 2,905,209 | 112,500 | 119,791 |
  | eB | 1,300,000 | 87,500 | 87,500 | 0 | 1,212,500 | 0 | 700,000 |
  | eC | 2,500,000 | 87,500 | 87,500 | 0 | 2,412,500 | 0 | 0 |

  All 3 equal the hand values.
  eA's SSO wage = E − holiday work = 2,780,209, clamped to 1,750,000. WHT = 0 because projected net (month 8, k 4) ≈ 10,588 ฿, which is under the 0% band.
- Trace: 6 bound adjustments, 6 lines, every bound row exactly once, every adjustment line bound to this run, work-day refs unique, Σlines = gross for each item, run totals = Σitems.
- Idempotent: jobs, settle, build (93 unchanged), sync (created 0) and recompute → same inputDigest, same items, still 7 adjustments and 2 OT rows.
- Approve and pay ok. Carry: eB DEDUCTION 100,000 → 2031-09 (exactly 1).
- Sep draft: eB `DEDUCTION −100000/100000`, eA BASE only.
- Shift swap: in p1 the request was refused (requester home u2, entries at u1, reason not captured). In p5 (both at u1) request → accept → approve worked: 18 → eY, 19 → eX, both WORKED w480, no absence, both paid 3,000,000 with 0 deductions.

**p5 reconciliation of the messy month (p1 §6)**, Σitems: g 6,792,709 · n 6,530,209 · sso base 5,250,000 · ee 262,500 · er 262,500 · 40(1) income 7,492,709 · WHT 0.

| document | value | matches Σitems |
|---|---|---|
| bank CSV | 6,530,209 | = net |
| PND1 | 3 lines, 7,492,709 / tax 0 | = income / WHT |
| SSO 1-10 | wages 5,250,000, contrib 525,000 | = base, ee + er |
| journal: accrual | balanced; Cr 2120 = net | yes |
| journal: pay | Dr 2120 / Cr 1010, 6,530,209 | = net |
| payslips | 3 of 3 = item net | yes |
| payroll-month report | | 7 of 7 |
| API pay report (key with hr.payroll.read) | totals | = report |
| labour ACTUAL | = gross + er | yes, but ≠ journal wage cost (M2) |
| AI labour % | = laborMonth (p4) | yes |

Rounding: every document prints the stored item figures; nothing is recomputed. Rounding is one-time and integer in v2 (BigInt). Only m7 shows double rounding.

**p2 adjustment lifecycle** (see M1).
- e1: advance 35,000 on a 30,000 salary. Available = 3,000,000 − 87,500 = 2,912,500 → applied 2,912,500; net 0; carry ADVANCE 587,500 → Sep.
- Cancel of dB (1,000 ฿) while bound to the DRAFT: ok, run rebuilt (e2 carry 200,000 → 100,000).
- Reverse returns adv/dA to payable exactly once; old carries REJECTED. After re-approve: exactly 1 live carry (587,500, bound in Sep).
- v1: deduction 5,000 on 15,000 is taken in full (net 9,250; v1 has no s.76 cap). Deduction 20,000 → net −750, approve = `NEGATIVE_NET`. There is no carry in v1.

**p3 races** (held lock + pg_blocking_pids; each "blocked" = true):

- OT approve ∥ create: OT row bound once · create ∥ OT approve: ok · create ∥ create: ok + `DUPLICATE`, 1 run · correction ∥ approve: approve refused `WORK_ENTRIES`.
- approve ∥ cancel bound adjustment ∥ correction: approve ok; cancel = "อนุมัติแล้ว ลบไม่ได้"; correction = PAID; the 10,000 deduction stays bound and in the item.
- correction ∥ judge job (on hr:clock): day ON_TIME l0 v1, unchanged by the next job.

0 deadlocks.
Info (by design R5): a late deduction recomputed while the Aug run was a DRAFT went to **2031-09** (4,166) and Aug approved without it. August lateness therefore shows on the September slip.

**p4 boundaries.**
- Night shift 31 Jan IN 23:59 → OUT 06:00 1 Feb: Jan, l119 → 24,791 @2031-01. Night shift 28 Feb 22:30 → 06:00 1 Mar: Feb, l30 → 6,250 @2031-02. No double count.
- Run created at 00:30 BKK 1 Mar (17:30Z) with that payDate: ok. monthIndex 3; PND1 lands in **2031-03** (Feb = EMPTY). The accrual stays in Feb.
- ÷30 proration:

  start 15 Feb = 14 d → 14,000 (calendar ÷28: 15,000) · start 28 Feb = 1,000 · end 1 Feb = 1,000 · end 27 Feb = 27,000 (calendar: 28,928.57) · end 28 Feb = 30,000 (full).
  In a 31-day month, ending on the 30th = full pay. Design B4-1 [U] — the code flags the ÷30 divisor for accountant review.
- SSO for a partial month: wage 1,000 → minimum base 1,650 → 83 ฿ (`SSO_MIN_BASE`).
- Branch move via HrEmployeeUnit splits correctly. Leaver receivable: covered by H3.4.

**p5 scale.** 300 × 30,000, v2, booked:

Times: create (incl. building work entries) 14.99 s · approve + accrual 2.28 s · pay 0.32 s · bank file 0.11 s · report 0.20 s · reverse 0.40 s.

Totals exact: g 900,000,000 · ee 26,250,000 · n 873,750,000. Over int4 → m3.

## Executed vs read
Executed: everything in the probe sections above.
Read only: m7; the borrowed-holiday half of m5; reverse vs refund on the v1 path (`payroll.ts:1261`); commission bridge (`requestCommissionAdjustment`, CRM `onPayrollPaid`); stock charges H4.6 (consent / cancel lock at `payroll.ts:401`, `2469`).
Float search: money paths are integer satang. The only float→satang conversions are form inputs `Math.round(baht*100)` (`payroll-actions.ts:88,313`) and v1 OT (m7). `bahtStr` would print negatives wrongly (`rd.ts:36`, `generic.ts:116`), but no negative value reaches it.

## Not implemented (no document or screen found claiming these exist)
(1) Retro pay adjustments for leave, holiday or roster changes in an APPROVED/PAID month (m4). (2) Payout of unused leave in the final pay — no code found. (3) s.76 caps and carry-forward in **v1** (v2 only). (4) Leaver WHT true-up — deferred NA-12 (K1).
(5) DAILY/HOURLY pay in v2 (`V2_VARIABLE_PAY = false`, `payroll.ts:2214`). (6) A rehire detected as the same person for SSO/YTD (D4). (7) Shift swap across branches — refused in p1; whether that is intended was not checked.
