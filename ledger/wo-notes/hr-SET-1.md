# HR-SET-1 — AppSystem.settings writers in hr/** share one lock order, write only their own key

Branch `wip/hr-set-1` from local `session/hr` @ 13c9eae57 (H3.9 merged) · lane 2 tree `/root/projects/shark-hr-b` · QC DB wo-hr-qc-l2 (ep-orange-dust) only.
No schema change. No change to validation, refusal texts, audit rows or return values (pinned by qc-hr-set-1 S4.1–S4.3).

## Helper — `src/lib/modules/hr/settings-lock.ts` (new)
- `lockHrSettings(tx, ctx, ownLocks = [])`: advisory `hr:clockpolicy:<sys>` → each `ownLocks` advisory key in the given order → `SELECT "id" FROM "AppSystem" WHERE id · tenantId · type HR FOR UPDATE` → re-read settings → `{ id, settings }` (a copy) or null.
- `writeHrSettingsKeys(tx, ctx, patch)`: row lock again (re-entrant in the same tx) → re-read → change only the patch keys (`undefined` = delete key) → `updateMany` → `{ count }`.
- Type-only import; no law table / payroll rules access. `FOR UPDATE` (not `FOR NO KEY UPDATE`) so reports.ts could move onto the helper with identical lock behaviour.

## Lock-order table (after HR-SET-1)
| path | locks, in order |
|---|---|
| saveClockPolicy · saveAttendancePolicy (clock-settings) | hr:clockpolicy → AppSystem row |
| judge saveCursor (own tx, not nested) | hr:clockpolicy → AppSystem row |
| setNormalMinutesPerDay (work-entries) | hr:clockpolicy → AppSystem row |
| setPayrollEngine (payroll) | hr:clockpolicy → AppSystem row → (reads: HrPayrollRun draft check, loadLawSet — no locks) |
| saveAttendancePayPolicy (attendance-pay) | hr:clockpolicy → hr:attpay:policy (X) → AppSystem row · then (separate tx, after commit) withdrawPendingOnOff: period locks |
| setReportSettings (reports) | hr:clockpolicy → AppSystem row (unchanged sequence, now via helper) |
| saveOtPolicy (ot) | hr:clockpolicy → hr:otpolicy → AppSystem row (was: hr:otpolicy only) |
| saveLifecyclePolicy (lifecycle) | hr:clockpolicy → hr:lifepolicy → AppSystem row (was: hr:lifepolicy only) |
| attendance-pay sync | hr:payroll:run:<P> → hr:attpay:policy (S) → target periods (ascending) → hr:attpay:<emp>:<P> |
| payroll period paths (create/rebuild/approve run, markPaid, reverse, decideAdjustment, OT pay, corrections, stock charge) | period locks ascending → hr:attpay / hr:ot / hr:clock / hr:judge / hr:stock … (see attendance-pay.ts header) — none takes hr:clockpolicy, hr:otpolicy, hr:lifepolicy, hr:attpay:policy (X) or the AppSystem row |
| claim / give-back (claimApproveExpected, markPaid row claims) | period lock → HrPayrollRun row — no settings locks |

Why there is no cycle:
- `hr:clockpolicy`, `hr:otpolicy`, `hr:lifepolicy` and exclusive `hr:attpay:policy` are now taken only inside `lockHrSettings` (static: qc-hr-set-1 S1.4), always with hr:clockpolicy first and the row last. Every holder of the row lock already holds everything it will ever wait for, except reads.
- `hr:otpolicy` / `hr:lifepolicy`: only their save functions take them, at position 2, while holding only hr:clockpolicy. Nobody holds them and then waits on anything but the row.
- `hr:attpay:policy`: the saver takes X while holding hr:clockpolicy; sync takes S while holding only its period lock. Sync never waits on hr:clockpolicy or the AppSystem row (it reads settings with a plain SELECT, and no HR/payroll table has an FK to AppSystem — `grep 'AppSystem *@relation' prisma/schema/{hr,payroll}.prisma` = 0 — so its inserts take no key-share lock on the row). The saver waits on sync (S) but holds nothing sync wants. Period holders never take hr:clockpolicy (unchanged rule from attendance-pay.ts header).
- Payroll period locks / claim locks: no settings writer takes them while holding a settings lock, and no period/claim path takes a settings lock. setPayrollEngine's reads under the row lock take no lock.
- Settings writers are top-level transactions (no writer runs inside another open tx — saveCursor is its own `$transaction` after the job's page transactions finished; withdrawPendingOnOff runs after the settings tx committed).
Concurrency evidence: S3.1 OT+reports, S3.2 lifecycle+reports, S3.3 clock+attendance-pay ×10 rounds each — all ok, both keys every round, no TIMEOUT.

## Per-writer before → after (file:line on base 13c9eae57 → this branch)
| writer | before | after |
|---|---|---|
| ot.ts saveOtPolicy | :177 lock hr:otpolicy · :178 findFirst · :183 updateMany `{...base, hrOt}` | :178 `lockHrSettings(tx, ctx, [hr:otpolicy])` · :183 `writeHrSettingsKeys({ hrOt })` |
| lifecycle.ts saveLifecyclePolicy | :271 lock hr:lifepolicy · :272 settingsOf · :276 updateMany `{...base, hrLifecycle}` | :272 `lockHrSettings(tx, ctx, [hr:lifepolicy])` · :276 `writeHrSettingsKeys({ hrLifecycle })` |
| clock-settings.ts saveClockPolicy | :247 clockpolicy · :248 findFirst · :253 updateMany | :248 helper · :253 `{ hrClock }` |
| clock-settings.ts saveAttendancePolicy | :321 · :322 · :335 | :321 helper · :334 `{ hrAttendance }` |
| judge.ts saveCursor | :698 clockpolicy · :699 findFirst · :701–704 whole-object write | :699 marker · :700 helper · :702 `{ hrAttendanceCursor: next \|\| undefined }` (null/"" = delete, as before) |
| work-entries.ts setNormalMinutesPerDay | :114 · :115 · :119 updateMany `base` | :115 helper · :119 `{ hrWork }` |
| payroll.ts setPayrollEngine | :2293 clockpolicy · :2294 findFirst · :2310 updateMany `base` | :2294 helper · :2310 `{ hrPayroll }` — only those 3 stale lines removed (S1.5 checks this); markPaid / computeItem untouched (h0.6 S8.4 · h1.3 S5.6 · h0.1 green) |
| attendance-pay.ts saveAttendancePayPolicy | :136 clockpolicy · :137 attpay:policy · :138 findFirst · :144 updateMany `{...base, …}` | :137–138 `lockHrSettings(tx, ctx, [policyLockKey(ctx)])` · :144 `{ hrAttendancePay, hrAttendancePayInForce }` |
| reports.ts setReportSettings | :726 clockpolicy · :727 FOR UPDATE · :729 findFirst · :733–734 whole-object write | :727 helper (same sequence: clockpolicy → FOR UPDATE → re-read) · :731 `{ hrReports }` — same ACK / NO / OK results, same audit |
+ one marked import line per file. Every hunk carries `HR-SET-1`.

## RED evidence (oracle committed first, 0639fc421; run on the unchanged base with QC_FORCE=1 → `hr-SET-1-green.txt` §RED)
- S2.1 OT: A (raw holds hr:clockpolicy) `blocked=false key=false` — OT does not wait and its hrOt is overwritten by the stale write; B (raw holds the row) `blocked=true key=true marker=false` — OT read before the lock and wrote the stale object back. C (hr:otpolicy) passes.
- S2.2 lifecycle: same pattern as OT.
- S2.3/S2.4/S2.5/S2.6/S2.7/S2.9 (clock ×2, work, engine, attendance-pay, judge cursor): A passes (they already took hr:clockpolicy), B `marker=false` — read without the row lock, so a writer that holds only the row lock is overwritten.
- S2.8 reports: GREEN control (already correct) both ways.
- S3.1 / S3.2: lost updates by race on the base (3/10 and 10/10 rounds lost hrReports) → registered RED.
- Statics S1.1–S1.5 RED (helper absent · 8 files write settings · 9 fns not via helper · lock acquisitions outside helper · no marked hunks).
Judge cursor is driven deterministically without a hook: 2 active employees, nothing scheduled, `runAttendanceJobs({ tenantId, pageSize: 1, maxPages: 1 })` → cut after one → saveCursor(ids[1]); a sentinel cursor is planted before each round.
"Blocked" = the writer appears in `pg_blocking_pids` of the raw transaction's backend, and is still pending 400 ms later.

## ORACLE-EDITs (each marked `ORACLE-EDIT (builder HR-SET-1 · 13 Nov)`; unmarked hunks still fail)
1. `scripts/qc-hr-h3.2.mts` S1.8 — frozen files: a hunk marked `HR-SET-<n>` counts like `HR H<n>` (HR H3.2-marked hunks still rejected).
2. `scripts/qc-hr-h3.6.mts` S1.6 — in-base branch: later-ticket hunks marked `HR-SET-<n>` accepted alongside `ORACLE-EDIT … H<n>.<n>`.
3. `scripts/qc-hr-h3.4-lib.mts` S1.6 — base-aware: once H3.4 is in the base (payroll-run-rules.ts), a frozen file may differ only by hunks marked `HR-SET-<n>` / `HR H<n>.<n>` (not H3.4).
4. `scripts/qc-hr-h3.9.mts` S1.5 — base-aware: once H3.9 is in the base, frozen .ts/.mts files may differ only by later-ticket-marked hunks.
5. `scripts/qc-hr-h3.9.mts` S1.10 — base-aware: once H3.9 is in the base its own hunks are gone; shared files may only carry ticket-marked hunks, hub/json presence n/a. **This one failed on plain session/hr 13c9eae57 too (not caused by HR-SET-1)** — the H3.9 merge round ran before H3.9 was in the local base.
No other suite needed an edit (h2.9 · h3.1 · h3.5 · h4.4 · h4.6 · h1.x · h0.x frozen checks pass as-is).

## Not done / notes for the controller
- AppSystem.settings writers OUTSIDE hr/** (pos/member/kanban/point/crm modules, `actions/systems.ts`) are out of scope; they touch non-HR systems. If anything ever writes an HR system's settings from outside hr/**, it is not covered by S1.2.
- H3.7 (lane 3) files untouched. If H3.7 adds a settings writer later, S1.2 fails it until it uses the helper.
- The judge cursor round needs ~2 s per round on QC (job overhead); whole suite ≈ 2–3 min.
- Scratch logs of the first run were removed by something outside this session (shared scratchpad); summary lines were captured before that and the edited suites + set-1 ×3 + seed were re-run into a separate log dir.
