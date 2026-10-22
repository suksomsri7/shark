# H0.6 — money hunter report

> Tree `/root/projects/shark-hr` · branch `wip/pos-hr-h0.6` · head **d838fccf** (verified) · 22 Oct 2026 · hunter: Claude Opus 5.5
> No product code or oracle edited. Probes ran on QC4 only, one at a time, through `iso.sh qc4.sh with-gate-lock.sh`. Tenants were `qc-hunt-h06-<rand>` and `-b`.
> Probe: `.hunt-h06/probe.mts`. After the run it was moved out of the repo to `/tmp/hunt-h06-artifacts/` (with `run1.log` and `run2.log`).
> Controlled ordering: a separate transaction holds `SELECT … FOR UPDATE` on one `CrmCommission` row. The probe polls `pg_blocking_pids` until the handler under test is waiting on that row, runs the competing real function(s), then releases the lock. So the interleaving is deterministic and does not depend on timing.

## Verdict: **ACCEPT WITH NOTES**
The R3 fix works for the interleaving it targets (P1), on replay (P1), and under 20 random concurrent rounds (P9). Money invariants, cross-scope checks, outbox and privacy all held.

Two problems remain, and neither loses money for the current data model:
- **F1:** the same check-then-act class still exists in two other orders (P2, P3). It only leaves a CRM status wrong.
- **F2:** the pre-H0.6 data hazard (reviewer R2) is confirmed with numbers. It needs a real backfill tool or a guard, not just the pre-check SQL.

If the controller wants the status to converge in every order before merge, F1's fix is small (about 15 lines in the H0.6/C3.3 CRM block). Otherwise log it as a debt.

## Findings

| id | sev | where | probe result (exact) | smallest fix |
|---|---|---|---|---|
| **F1a** | LOW-MEDIUM (CRM status drift, money-neutral) | `crm/commissions.ts:1409-1426` `onPayrollPaid` (C3.3), racing `hr/payroll.ts` `reverseRun` + `onPayrollReversed` :2128 | **P2 (mirror order).** markPaid(R1) commits. `onPayrollPaid(R1)` reads `adjustmentsOfRun` (PAID) and its UPDATE is then held. reverseRun(R1) commits, and `hr.payroll.reversed#R1` is delivered: 0 rows, because C is still APPROVED. Release. `onPayrollPaid` writes PAID. Result: `R1=REVERSED adj.runId=null C=PAID unpaidAudits=0`. The commission says PAID, but its adjustment is unbound and it was never paid by a live run. It converges once the period is re-run and that run is paid (`P2.mirror-converges-after-R2-paid`: C=PAID, bound to R2). | See F1 fix below. |
| **F1b** | LOW-MEDIUM (same class, **inside the new R3 code**) | `crm/commissions.ts:2175-2189` (R3 re-check → repay) | **P3.** reversed#R1 un-pays C while R2 is APPROVED. markPaid(R2) commits. The handler's re-check sees R2 PAID, and its repay UPDATE is held. reverseRun(R2) commits and reversed#R2 is delivered: 0 rows, because C is APPROVED at that moment. Release. The repay writes PAID. Result: `R2=REVERSED adj.runId=null C=PAID unpaid=1 repaid=1`. The handler fixes the order it was written for, but opens the next one: its re-read and its write are still two steps. | Same as F1. |
| **F2** | MEDIUM (deploy/data; real money if prod has such rows) | migration `20261202000000` + `liveRunWhere` `payroll.ts:32-35` + `buildRunRows` `:467-472` (`runId IS NULL`) | **P8.** A run reversed the pre-H0.6 way (status REVERSED, adjustments still bound, no event, commission PAID). After H0.6, `createPayrollRun(P)` succeeds and binds **0** rows. `totalAdd` was 420000 on R0 and 0 on R1, so **4,200 THB (OT 120000 + COMMISSION 300000 satang) is silently dropped.** `strandedAdjustments` does not list the rows, C stays PAID, and nothing surfaces it. The reviewer's pre-check SQL **does** find it (`P8.pre-check-sql-finds-it`: R0 found, n=2). **But the runbook's backfill "call the same steps" has no tool:** `reverseRun(R0)` returns `{"ok":false,"note":"รอบนี้กลับรายการไปแล้ว","code":"ALREADY_REVERSED"}`. | (a) Make the pre-check a **hard deploy gate**: 0 rows, or the owner rules first. (b) Cheap code guard, recommended: in `createPayrollRun`, under the advisory lock, refuse with a fixed Thai text if any REVERSED run of `(systemId, periodKey)` still has bound `HrPayAdjustment` rows. This turns the silent loss into a visible refusal. (c) If rows exist, a one-off script per run, in one tx: `SELECT … FOR UPDATE` the bound rows → `runId = NULL` → `emitOutbox hr.payroll.reversed#<id> {runId, periodKey, adjustmentIds}`. It must run **before** any new run of that period is created. If a new run already exists, the unbound rows become stranded, and the minute sweeper moves them to the next free period. That is acceptable but should be noted. |
| **F3** | LOW / INFO | `crm/commissions.ts:2136-2146` | **P7.** The handler trusts `payload.adjustmentIds` and does not check that each id was actually unbound from `runId`. In an otherwise valid event for an own REVERSED run, I added the id of an adjustment still bound to a *legacy* REVERSED run (F2 data) whose commission is PAID. The handler un-paid it: `C(bound legacy REVERSED run, not in this run)=APPROVED`. An id bound to a PAID run was correctly skipped. Only internal code emits this event, so this only matters together with F2 legacy rows or a future buggy backfill. | In the pair loop, also skip `r.runId !== null && r.runStatus === "REVERSED"`. After H0.6 a REVERSED run never has bound rows, so such a row is legacy and not ours to touch. One condition. |
| **F4** | LOW (analytic, not probed: needs a kill between two statements) | `crm/commissions.ts:2174-2176` | The R3 re-check only looks at `changedPairs` (rows changed *in this attempt*). Suppose the process dies or an audit write throws after the un-pay UPDATE commits but before the re-check, and markPaid(R2) plus `onPayrollPaid(R2)` (0 rows) land in that gap. The outbox retry then changes 0 rows, re-checks nothing, and C stays APPROVED while R2 is PAID. This is the original R3 end state, reached through a retry. | Re-check over all `pairs`, not `changedPairs`. Any APPROVED row bound to a PAID run should be PAID; that is `onPayrollPaid`'s invariant. F1's fix removes this too. |

**F1 fix (covers F1a, F1b, F4).** Replace "read HR, then write" with a reconcile done under the commission row lock. Do it in both `onPayrollPaid` and `onPayrollReversed`, per chunk, inside one `prisma.$transaction`:
1. `SELECT … FROM "CrmCommission" WHERE id = ANY(...) AND "tenantId" = … FOR UPDATE`.
2. Then read HR state with `adjustmentsByIds`, which reads committed state.
3. Then set `PAID` where the adjustment is bound to a PAID run (and the employee has an item, H4), and `APPROVED` otherwise. Apply this only to `status IN (APPROVED, PAID)` rows with `reversedOfId IS NULL` and the pair rule.

Why this converges: every HR change (markPaid, reverseRun) commits **before** its event's handler runs, and that handler queues on the same row lock. So the last handler to hold the lock always reads the final HR state.

Why it is money-neutral today: `reverseRows` (commissions.ts:748-826) claws back APPROVED and PAID the same way (negative row plus DEDUCTION), so the drift does not change what the employee is paid. It does make CRM commission reports wrong, showing PAID for a period that was reversed and never re-run, until the period is re-run and paid.

## What held (coverage, beyond the oracle's 47)

| probe | result |
|---|---|
| **P1.** R3 exact interleave: handler read with R2 APPROVED, handler UPDATE held → markPaid(R2) + `onPayrollPaid(R2)` (0 rows) → release | HELD: `R2=PAID C=PAID amount=200000 unpaid=1 repaid=1` (C@mid PAID) |
| P1 replay: reversed#R1, paid#R2, paid#R1, each ×2 | HELD: `C=PAID unpaid=1 repaid=1` (no double un-pay, no extra audit) |
| P1 privacy of `crm.commission.repaid` | HELD: `{before:{status:APPROVED}, after:{via:PAYROLL_PAID_DURING_REVERSE, runId, status:PAID}}`, actor null, no amounts or names |
| **P4.** Documented order: handler completes, then markPaid(R2) → paid#R2 | HELD: mid APPROVED → PAID, repaid 0 |
| **P2b.** Out-of-order delivery: markPaid(R1) → reverseRun(R1) → reversed#R1 before paid#R1, then both ×2 | HELD: `C=APPROVED adj.runId=null unpaid=0` (`onPayrollPaid` refuses a REVERSED run) |
| **P9.** 20 rounds of reversed#R1 handler ∥ (markPaid(R2) → paid#R2), random 0–40 ms offsets | HELD: 20/20 end `C=PAID`, `unpaid ≤ 1`, `repaid ≤ unpaid`. The repay path ran in 7/20 rounds. |
| **P5.** Two reversals of one period plus a late OT (฿700) after the first reversal | HELD: R2 binds 4 (3 + late, +70000 exactly once); R3 binds the same 4 with totals = R2's; R1/R2 items byte-identical after reversal; Σitems = run totals on R1/R2/R3; both JVs REVERSED, each with exactly one balanced mirrored reversal (Dr = Cr = original); adjustment amounts/kind/period/status unchanged; commission amount unchanged; trail PAID→APPROVED→PAID→APPROVED→PAID with 2 unpaid audits; 1 event per reversed run; 1 live run in the period |
| **P6.** Cross-tenant / cross-system crafted payloads: own reversed runId + other tenant's and other HR system's adjustment ids; another tenant's runId under T; T2's real event re-addressed to T/H; direct `onPayrollReversed` calls | HELD: victims byte-identical (status + updatedAt), direct calls `unpaid 0/0` |
| **P10.** Outbox ⇔ state over 56 runs: reversed event iff REVERSED (legacy raw rows excepted) · consumer `hr.payroll.reversed` and bridge export are real functions (widened union, no cast) · 29 event payloads have exactly the keys `{adjustmentIds, periodKey, runId}`, all string ids | HELD |
| Races #2 (double reverse, reverse ∥ markPaid, reverse ∥ create, approve ∥ reverse) | Not repeated: oracle X6.1–X6.4 + S6.5 (2 processes × 5 lanes × 3 rounds) cover them. Code read confirms the same advisory key (`payroll.ts:596/656`) and the row lock order. |
| Event emitted inside the tx | Code `payroll.ts:1089` uses `emitOutbox(tx…)` inside the work tx. Oracle S5.4 proves a JV-failure rollback leaves no event. |

## Residue / processes
- run1 (P1, P4): `RESIDUE tenants=0 rows=0 audit=0 outbox=0`
- run2 (P2, P2b, P3, P5–P10): `RESIDUE tenants=0 rows=0 audit=0 outbox=0`. No crash.
- Every blocker tx was released and every handler promise resolved `ok`.
- No `iso-*` unit of mine is running. I touched no POS unit, no `hr-ctl-*` unit and not `/tmp/shark-gate-pos.lock`. No `.env*` was read.
- The repo has no scratch left (`.hunt-h06/` was moved to `/tmp/hunt-h06-artifacts/`). This file is not committed.
