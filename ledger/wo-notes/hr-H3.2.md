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
- ~~D-H32-unlocked-read~~ closed by fix r1 R4 (work-period locks before the run-period lock).
- Brief D2–D4 stand (ENDED staff strand; no notification; unpaid leave of monthly staff not deducted here).
- H3.4 must (additions): keep the H3.2 gate in run v2 creation/approve; loop `next` of sync; never price OT/holiday minutes from attendance rows; refund kind (above); deduct unpaidLeaveMin by the same ÷30÷N rule.
- Accountant (additions): A8 an approved deduction is held out of payroll while its time data changed (re-approval needed — delay, never over-deduction); A9 policy OFF keeps approved rows bindable on their own snapshot policy.

## 6. Runs (lane DB wo-hr-qc-l1)
qc-hr-h3.2 forced 51/51 ×2 + unforced 51/51 (residue none) · seed-hr-qc 33/33 ×2 (identical counts) · h3.1 58/58 · h2.9 58/58 · h2.6 55/55 · h4.6 69/69 · h1.2 73/73 · h1.3 63/63 · h3.3 51/51 · h0.1 67/67 · h0.2 58/58 · h0.6 55/55 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hr-payadjust 27/27 · qc-bulk-ops 13/13 · qc-hf-hr-privacy 194/194 · fitness 53/53 + fitness-hr 9/9 with and without env · clean typecheck 0 errors (737 s; first run caught 1 TS7006, fixed 99e1fe55f).

## 7. Fix round 1 (controller rulings after reviewer + hunter · base fdfb98e14)
- **R1 approve gate** (`attendance-pay.ts#attendanceRunGateInTx`, called from `payroll.ts` claimApproveExpected): with the rule ON, every employee of the run must have work period = run period CURRENT/FROZEN and Σ signed live rows (APPROVED+PENDING) = E per rule (a human-waived digest counts as matched, R8), and no APPROVED unbound stale deduction with work period ≤ run period ⇒ else `ATTENDANCE_SYNC` (`ATT_TEXT.runSync`). Consequence: with the rule ON a month can only be approved after its work hours were pulled and deductions computed (also months with no late/absence).
- **R2** (a) sync: an employee with an APPROVED deduction bound to a DRAFT run whose digest ≠ current ⇒ `wait RUN_STALE`, nothing written; (b) a refund (ALLOWANCE) binds only when every `refundOfIds` row is bound to an APPROVED/PAID run, else held and reconciled by the next sync; (c) `runStale` text = recompute run → compute deductions → approve.
- **R3** sync is allowed for a frozen P (writes only to the month after the latest live run, > P). For a frozen P the calc uses the frozen HrWorkDay + the base/N/policy of the latest header of that employee in P (snapshot); no header (legacy freeze without a sync) ⇒ current values (no salary/policy history exists). **Confirmed:** once P has an APPROVED/PAID run, time corrections are refused (`correction.ts#ownerGate` ⇒ PAID) and work-entry rebuilds are refused (`work-entries.ts` frozen); a leave approved later does not change the frozen HrWorkDay (state FROZEN reads stored days).
- **R4** create / recompute / delete-in-draft / approve take the work-period locks of the related attendance rows that are < the run period, ascending, before the run-period lock (`attendancePreLockInTx`), and the bind/approve gates refuse (`lockRetry`, nothing written) if a needed earlier period is not held. Deviation: no automatic retry inside the transaction (a retry would need restructuring frozen run-creation code beyond marked hunks); the pre-read includes PENDING rows of the run period so a mismatch needs a brand-new sync row to appear between pre-read and the run lock — the user presses again.
- **R5** period cap in `attendanceDeductionOf`: Σ all lines of one employee·period ≤ base; lines in day order (absent before late within a day), the crossing line truncated, later lines 0 satang (minutes kept) — part of the digest.
- **R6** service entry points (save · sync · preview · lines) require the viewer's userId to hold an accepted membership of ctx.tenantId with the same role (and `viewer.tenantId`, when given, = ctx.tenantId).
- **R7** OFF withdraw re-lists pending periods after each pass until none remain (≤ 5 passes; stops if the rule is switched on again).
- **R8 (owner-visible behaviour)** a deduction REJECTED by a person is a waiver for that exact data (same employee, rule, day set and digest): sync does not re-create it and the approve gate treats it as settled; when the time data changes (new digest) a new PENDING appears. System rejections (SUPERSEDED / POLICY_OFF) are not waivers.
- N4 done (panel previews one employee) · N5 done (refund rows in "my deductions" carry no minutes/lines).

### Lock order (global rule: every holder of period locks takes them ascending, the run/work period chain first)
- sync: P → target(s) (> latest live run ≥ P) → `hr:attpay:<sys>:<emp>:<P>`.
- createPayrollRun / recomputeDraftRun / cancelBoundDraftAdjustment / claimApproveExpected: related work periods < R (ascending) → R → run row FOR UPDATE.
- decideAdjustment APPROVED: P (< row period) → row period → moveTo.
- OFF: `hr:clockpolicy` (own tx) → per P: P → row periods.
- build P only · correction: months sorted → hr-corr → hr:clock → hr:judge · OT: pPrev, P0 → target → hr:ot → hr:judge · stock: hr:stock → periods · markPaid / deleteDraft / reverse: R only. No holder waits on a smaller period than one it holds ⇒ no cycle.

### Accountant (corrected)
- A8 (replaces the earlier wording): an approved deduction whose time data changed is held out of payroll and the month cannot be approved until it is recomputed; the recompute rejects it and creates the corrected amount as a new PENDING row that needs approval again — the corrected deduction can therefore land in a later pay month than the work month (not only a delay of the same amount).
- A9: policy OFF keeps approved rows bindable on their own snapshot policy; A10: a frozen month is always settled on its snapshot (salary/N/policy at the last calculation) — a later raise never changes a closed month; A11: monthly cap = base salary per work month; A12: a human reject waives that exact data.

### H3.4 must (updated)
- keep the H3.2 gates (R1 sync-current, bound-stale, refund-held, work-period locks) in run v2 creation and approve; loop `next` of sync;
- refund kind D-H32-refund-kind (non-taxable reversal) and include refunds in v2 totals only when their deductions were taken;
- price unpaidLeaveMin of monthly staff by the same ÷30÷N rule and include it in the R5 cap; never price OT/holiday minutes from attendance rows;
- store pay type in the header snapshot (today a frozen header implies MONTHLY);
- host the sync button on the payroll page (D-H32-ui-payroll); consider automatic retry for `lockRetry`.

### Fix r1 runs (lane DB wo-hr-qc-l1)
qc-hr-h3.2 forced 58/58 ×2 + unforced 58/58 (residue none; new checks RED on fdfb98e14: S2.1 S8.2 S8.7 S8.8–S8.14) · seed 33/33 · h3.1 58/58 · h2.9 58/58 · h2.6 55/55 · h4.6 69/69 · h1.2 73/73 · h1.3 63/63 · h3.3 51/51 · h0.1 67/67 · qc-payroll 19/19 · payroll-reverse 14/14 · payadjust 27/27 · bulk-ops 13/13 · hf-hr-privacy 194/194 · fitness 53/53 + fitness-hr 9/9 ±env · clean typecheck 0 errors (571 s).
Hunter probes (unchanged scripts): money A/B/B2/C/C2 never over-deduct (settled 0, no refund rows; B/B2 end with REJECTED 3,125 + PENDING 1,041) but stop at the R1 gate because the probes never pull/compute September — the same sequences with that step are S8.8–S8.11 (1,041 · 1,041 · 1,041 · 3,125 ×2). Race: 4×sync 1 row · approve∥reject one wins · sync∥create/approve no stranded row · sync∥correction → PENDING 1,041 · sync∥OFF none · cross-tenant sync refused (requestedBy none). Arith: 31 absent days = 1,500,000 (cap); "two rows same day" is impossible in DB (HrWorkDay unique employeeId+date).

## 8. Fix round 2 (controller F1–F4 · base 970de0552)
- **F1** (`attendance-pay.ts#calcSet`): the basis is current values only when the period is open + in force + rule ON; otherwise the latest header snapshot of that employee in P. No snapshot ⇒ `NO_SNAPSHOT`: sync writes nothing, the gate owes nothing. The "current salary/policy" fallback for frozen periods is removed (S8.15: Aug frozen at 1,500,000, raise to 3,000,000, rule on in Nov ⇒ no row; before: PENDING 6,250).
- **F2** in-force intervals in `AppSystem.settings.hrAttendancePayInForce` = `[{from, to|null}]` (separate key: the policy object is part of the digest, so it gets no new field) — **no migration**. Enable opens an interval at the current BKK month (a month with an APPROVED/PAID run ⇒ next month); disable closes it at the current month (an interval that has not started is dropped). Out of force ⇒ `NOT_IN_FORCE`: entitlement 0, sync skips, the gate passes without any sync (runs before the rule existed, reversed old runs). The gate is active for in-force periods even while the rule is OFF; with the rule OFF, sync of an in-force period runs on the snapshot and may only reject/refund (no new DEDUCTION, Q12) — the gate then requires live ≤ entitled instead of =. Rows of out-of-force periods still bind on their own snapshot (A9).
- **F3a** gate: an employee in the run with work-entry state NONE/MISSING and no live rows ⇒ nothing owed. Membership: payroll (`periodMembership` — profile + employed ≥ 1 day + not inactive-without-end) and work entries (`periodEmployees` — same date/active rule) agree for ended staff and mid-period hires; non-MONTHLY staff cannot be in a v1 run at all (PAY_TYPE_NOT_SUPPORTED refuses the whole run), and an employee whose row was deleted is NONE ⇒ passes.
- **F3b** sync: entitlement 0 because of the profile (NO_BASE · PAY_TYPE · NO_PROFILE) with live rows ⇒ the plan runs with E = 0 and supersedes them (system rejection, not a waiver); the employee is still listed in `skipped`.
- **F4** sync holds `pg_advisory_xact_lock_shared(hr:attpay:policy:<sys>)` after the work-period lock for the whole tx and re-reads rule + intervals under it; policy save takes the exclusive side (after `hr:clockpolicy`, holding no period lock) ⇒ an OFF waits for in-flight syncs, then withdraws (5-pass loop kept as a belt). No cycle: save never waits for a period lock; sync waits for the policy lock only while holding P/targets, and nobody holding the policy lock waits for a period.
- Lock order addendum: sync = P → policy(shared) → targets → hr:attpay entity; save = hr:clockpolicy → policy(exclusive).
- Accountant: **the rule never applies to months before it was switched on** (nor to months after it was switched off); a month closed without ever being computed is never deducted afterwards; with the rule off, an in-force month can only lose deductions (rejections/refunds), never gain.
- H3.4 must (adds): show the in-force intervals on the settings card; v2 run creation/approve must call the same gate (in-force aware); the snapshot should also store pay type.

### Fix r2 runs (lane DB wo-hr-qc-l1)
qc-hr-h3.2 forced 62/62 ×2 + unforced 62/62 (residue none; S8.15–S8.18 RED on 970de0552) · seed 33/33 · h3.1 58/58 · h2.9 58/58 · h2.6 55/55 · h4.6 69/69 · h1.2 73/73 · h1.3 63/63 · h3.3 51/51 · h0.1 67/67 · qc-payroll 19/19 · payroll-reverse 14/14 · payadjust 27/27 · bulk-ops 13/13 · hf-hr-privacy 194/194 · fitness 53/53 + fitness-hr 9/9 ±env · clean typecheck 0 errors (1,144 s).
