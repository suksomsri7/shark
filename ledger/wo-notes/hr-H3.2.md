# WO H3.2 — late/early/absent → PENDING HrPayAdjustment(DEDUCTION) pro-rata (opt-in) · builder notes

> Tree `/root/projects/shark-hr` · branch `wip/hr-h3.2` (base 364fe5dd7 + merge of session/hr 960ef6e9e) · lane DB wo-hr-qc-l1 (`scripts/qc-hr.sh`).

## 0. Checkpoint
- done: migration (applied to lane DB) · pure rules · service · payroll.ts writer/gates · work-entries export · actions · UI · messages · inventory · visual spec 3.2 · ORACLE-EDITs.
- results: §6.

## 1. Files
| area | file | note |
|---|---|---|
| schema | `prisma/schema/payroll.prisma` (model appended) · `prisma/migrations/20270105000000_hr_attendance_pay/migration.sql` | 1 table, unique adjustmentId + (tenant, emp, P, rule, gen), 2 indexes, 8 CHECKs · `refundOfIds` (controller Q8a) |
| pure | `hr/attendance-pay-rules.ts` | policy reader · `attendanceDeductionOf` · `attendanceDigest` (per rule) · `attendanceDeltaPlan` · texts · BE month label · imports node:crypto only |
| service | `hr/attendance-pay.ts` | policy get/save (+ OFF withdraw) · sync · stale gate · preview · lines · self reader — writes only HrAttendanceDeduction |
| payroll | `hr/payroll.ts` (EOF `HR H3.2` block + one-line `HR H3.2 ◂` hunks: import · decideAdjustment lock + check · cancelAdjustment · cancelBoundDraftAdjustment · moveStrandedAdjustment · buildRunRows · claimApproveExpected · approveRun) | only HrPayAdjustment writer |
| work entries | `hr/work-entries.ts` EOF `workEntryStatesInTx` (pure addition) | |
| UI | `hr/attendance-pay-actions.ts` · `hr/attendance-pay-ui.tsx` · settings + attendance pages (marked) · `hr.attpay` th=en · inventory 14 rows · `visual-hr.mts` "3.2" | |
| misc | `core/scope.ts` · `scripts/hr-qc-env.mts` · `hr/index.ts` | |

## 2. Lock order (no cycle)
- sync page tx: `hr:payroll:run:<sys>:<P>` → target period(s) (> latest live run ≥ P, ascending, re-checked) → `hr:attpay:<sys>:<emp>:<P>` (id order).
- policy save: `hr:clockpolicy:<sys>` (own tx, committed) → OFF withdraw tx per P: P → row periods (ascending, ≥ P).
- decideAdjustment APPROVED: P (from sourceRef, only when P < row period) → row.periodKey → moveTo (ascending) → reads (stale gate) → claim.
- work-entries build: P only · createPayrollRun / recompute / delete / approve / markPaid / reverse: run period first, then run row; the H3.2 bind/approve gate only READS work-period state (never locks P under the run-period lock — that would invert the order).
- corrections (H2.6): periods (sorted) → hr-corr → hr:clock → hr:judge · OT settle (H2.9): pPrev, P0 → target → hr:ot → hr:judge · stock charge (H4.6): hr:stock → periods · self advance: no such writer in this tree.
- Every period-lock holder takes periods ascending and nobody waits for `hr:clockpolicy` / `hr:attpay` while holding a smaller period than one it already holds ⇒ no wait cycle.

## 3. Stale approved deductions (controller ruling — brief D1 closed)
- `attendanceStaleIdsInTx` (attendance-pay.ts): a LATE_RULE/ABSENT_RULE DEDUCTION is stale when its header is missing/ended, its work period state ∉ {CURRENT, FROZEN}, or the digest recomputed from live HrWorkDay + current profile + N + policy ≠ header digest (policy OFF ⇒ the header's own policy, so Q12 "APPROVED kept" rows still bind).
- buildRunRows (createPayrollRun + rebuildDraftRun, v1 and v2): stale ids are removed from the locked APPROVED set ⇒ left unbound (status APPROVED), shown "ต้องคำนวณใหม่" (preview `staleIds`).
- claimApproveExpected: a run that already binds a stale row is refused (`ATT_TEXT.runStale`, code WORK_ENTRIES so the action shows the fixed text) ⇒ recompute draft unbinds it.
- sync: an APPROVED unbound DEDUCTION whose digest ≠ current is treated as "E < B + A" (rejected SUPERSEDED, new PENDING for E − B) ⇒ after sync + approval the corrected amount binds (oracle S8.5–S8.7).
- ALLOWANCE refunds always bind (employee-favourable).

## 4. ORACLE-EDITs
1. `qc-hr-h3.2`: T.runStale literal + S8.5–S8.7 (system D, eQ ฿15,000, N 480): late 30 ⇒ 1,500,000×30/14,400 = 3,125; correction 09:30→09:10 ⇒ late 10 ⇒ 15,000,000/14,400 = 1,041.67 → 1,041; stale approved 3,125 not bound (item deduct 0); delete draft + rebuild + sync ⇒ 3,125 REJECTED (SUPERSEDED) + PENDING 1,041 g2 ⇒ approved ⇒ binds (item deduct 1,041); 1 h leave after binding ⇒ approveRun refused runStale ⇒ recomputeDraftRun ⇒ unbound (item deduct 0).
2. `qc-hr-h1.3` S6.1: `PAY_MARKED["HR H3.2"] = 6` (sourceRef ×4 in writeAttendanceDeductionInTx, ×2 in attendanceApproveLockInTx).
3. `qc-hr-h0.1` S4.2: payroll.prisma sha 97a2390d… → ba34dee6… (model appended at EOF, diff additive).

## 5. Debts / H3.4 must / accountant
- D-H32-refund-kind (next to D-H46-refund-kind): the refund of an over-deduction is an APPROVED ALLOWANCE today (Q8, accountant A6); H3.4 should give it a non-taxable reversal kind when it opens the engine. The refund header carries `refundOfIds` (bound DEDUCTION ids) and bound − refund = corrected entitlement exactly; idempotent (S8.4).
- D-H32-ui-payroll: the sync button lives on the attendance month view (roster readers); a payroll-only viewer (hr.payroll.read, no roster) cannot reach it — H3.4 payroll page should host it.
- D-H32-unlocked-read: bind/approve gates read work-period state without locking P (lock-order reason); a build committing between gate and bind could slip one stale row in — the next sync refunds/re-deducts the difference.
- Brief D2–D4 stand (ENDED staff strand; no notification; unpaid leave of monthly staff not deducted here).
- H3.4 must (additions): keep the H3.2 gate in run v2 creation/approve; loop `next` of sync; never price OT/holiday minutes from attendance rows; refund kind (above); deduct unpaidLeaveMin by the same ÷30÷N rule.
- Accountant (additions): A8 an approved deduction is held out of payroll while its time data changed (re-approval needed — delay, never over-deduction); A9 policy OFF keeps approved rows bindable on their own snapshot policy.

## 6. Runs (lane DB wo-hr-qc-l1)
qc-hr-h3.2 forced 51/51 ×2 + unforced 51/51 (residue none) · seed-hr-qc 33/33 ×2 (identical counts) · h3.1 58/58 · h2.9 58/58 · h2.6 55/55 · h4.6 69/69 · h1.2 73/73 · h1.3 63/63 · h3.3 51/51 · h0.1 67/67 · h0.2 58/58 · h0.6 55/55 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hr-payadjust 27/27 · qc-bulk-ops 13/13 · qc-hf-hr-privacy 194/194 · fitness 53/53 + fitness-hr 9/9 with and without env · clean typecheck 0 errors (737 s; first run caught 1 TS7006, fixed 99e1fe55f).
