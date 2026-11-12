# H3.1 bug hunt — wip/hr-h3.1 @ 2f3d1d8c7 · lane DB wo-hr-qc-l1 (qc-hr.sh) · 12 Nov 2026

Verdict: **1 MAJOR, 1 MINOR, 2 LOW notes.** The staleness gate, the freeze, partial-period refusal, races and scoping all held under real runs.

## FAIL

**F1 MAJOR: unrostered day = leave pay + full work minutes, no flag, approvable (v2 APPROVED in the probe).**
No-shift days (class WORKDAY from a `NO_SCHEDULE` slot, or UNSCHEDULED) never check worked minutes against leave. `WORKED_ON_LEAVE` only fires for shift slots or `LEAVE`-status slots. For an unrostered employee, H2.5 judges the DAY slot `NO_SCHEDULE` with `leave: null` (judge.ts:310). The builder then adds `workMin += net` and also books the leave on N.
- DB repro (system A, March 2032): unrostered eU has an APPROVED paid full-day leave on 26 Mar and clocks 09:00–17:00. The row is `WORKDAY|WORKED|p0 w480 … pl480`, review is empty, state CURRENT, gate PASS, and `approveRun` (v2) returned ok → APPROVED.
- Same with hourly leave 3 h on 27 Mar: `w480 pl180`.
- Pure fuzz (5 000 days): 74 no-shift days with leave + work are unflagged and approvable. Smallest case is `[NO_SCHEDULE w352] + full leave, N 720` → `w352 pl720`.
- Wanted: work + leave ≤ N, or a blocking flag such as `WORKED_ON_LEAVE`.

**F2 MINOR (false block, no money): split shift with half-day leave is permanently blocked.**
Slot a 07:00–11:00 is LEAVE (AM, f 0.5). Slot b 17:00–22:00 is worked 300 as planned. The leave basis is 0.5 × 540 = 270, so the result is `w270 pl270 un30 | WORKED_ON_LEAVE`. That is blocking, and rebuilding cannot clear it, so the v2 period can never be approved. 30 worked minutes also move to unplanned. Per A5 the 270 is to spec, but the blocking flag is wrong.

## PASS (got = wanted)

**Pure fuzz** (5 000 random days, N ∈ {60, 420, 480, 720}). Every invariant holds on shift days, and the break rule holds:
- I1 integers 0–1440
- I2 planned ≤ 1440
- I3 late + early + absent ≤ max(0, planned − leave − work)
- I4 work + leave + absent + late + early ≤ planned
- I5 leaveDays ≤ 1.0
- I7 break ≤ planned break, only when worked > 300, never leaves less than 300
- I8 holiday: no ab/la/eo and hp = N
- I9 UNSCHEDULED never absent
- I11 leave ≤ hold
- I6 (worked conserved) fails only for an unrealistic input: holiday `NO_SCHEDULE` with otMin < worked. H2.5 always gives DAY_OFF with ot = worked there.

**Literal vectors:**
- hourly 3 h + late 200 → `w280 pl180 la20 ld0.3`
- AM leave + late 30 → `w210 pl240 la30`
- day off 600 with N 420 → `hw420 oh180`
- overnight 22–06 → `p480 w480`
- rostered holiday not worked → `hp480`, no absent
- break: 540/60 → `w480 bd60`; 320/60 → `w300 bd20 eo180`

**Staleness matrix:** 21 changes, one at a time. Each one gave state OUTDATED, the gate was refused, and the rebuild reconverged:
- shift grace 15→5
- hrClock.earlyInMin; hrClock.closeGraceMin
- hrAttendance.otStepMin
- normalMinutesPerDay (owner action; 124 rows rewritten)
- roster entry moved to another employee (H2.3-style)
- leave PENDING created / approved / cancelled
- shop holiday created / deleted; u1 branch holiday created / deleted
- endDate set / cleared
- punch added / voided / time-corrected
- weekday schedule added
- roster breakMin changed

**No holes found.** The previous-period Sunday overnight entry into Mon 1 Mar changed nothing (rebuild wrote 0). Negative checks did not flip state: a punch by an other-branch employee, a punch in April, an edited leave reason, a renamed employee.

**Blocking / partial:**
- PENDING_LEAVE → REVIEW, refused; after reject → PASS.
- One HrWorkDay deleted by hand → OUTDATED, refused.
- An unbuilt run employee → MISSING, refused; building that employee → PASS.
- STALE / ORPHAN / MISSING_OUT / NOT_FINAL / OVER_1440 are already covered by the oracle and fuzz.

**Freeze:** after v2 approve, the digest of every HrWorkDay + HrWorkEntry column stayed byte-identical through all of these:
- build → `frozen`
- recompute → refused
- leave cancel
- normalMinutes change
- job
- per-employee build

The state then showed FROZEN; markPaid succeeded and the digest was still identical.

**Races:**
- Two parallel builds (pageSize 3) ×3: 372 rows, a single build wrote 372 and the other 0, a re-check wrote 0.
- Build ∥ leave flip ×6: never CURRENT with changed rows.
- Build vs recompute, under the held period lock, both orders: consistent (OUTDATED or CURRENT with rebuild 0).
- Build vs approve, both orders, with a leave approved during the wait: refused both times, run stays DRAFT.

**Reversal (simulated status REVERSED):** rebuild is allowed. Changed rows lose their runId; unchanged rows keep the reversed run id. A new run for the period cannot be created ("มีรอบจ่ายงวด … อยู่แล้ว"), which is H0 behaviour.

**Scope:**
- Manager (u2) → u1 employee: `no`. Other tenant, by own ctx or by our systemId: `no`.
- STAFF hr.payroll.read limited to u1, building a u2 employee: 0 employees.
- normalMinutes by MANAGER or STAFF: refused.
- DTO keys: nothing like money, hash or note.

**Scale:** 300 employees × 31 days (100 scheduled):
- build 17 s, 1 round (`next` null), 9 300 rows
- preview 1 s
- approve check < 1 s → ok
- unchanged rebuild: 0 writes
- The H2.5 job took 540 s (×7 runs) to finalise.

## LOW notes
- L1: the finaliser only stores days within 7 days. A day not stored in time stays `NOT_STORED` forever (seen when job runs were skipped). There is no rebuild path, so the v2 period is blocked for good. This is H2.5's, not H3.1's.
- L2: an unscheduled employee's PENDING leave over a day off or empty day still blocks approval. Correct by Q13, but noisy.

## Not tested
- The ~20 s `next` stop: the time budget is not injectable and the 300-employee build finished in 17 s. A partial period is covered by the MISSING/OUTDATED refusals above.
- Real `reverseRun`: needs an ACCOUNT system/JV, so it was simulated.
- A real H2.3 swap and H2.6 correction: simulated by direct row updates. The oracle S6.4 covers the real correction.
- v1 approve during REVIEW: oracle S11.3.

## Cleanup
Every probe created its own tenants and checked residue afterwards: `RESIDUE none` / `RESIDUE-ALL none` on all runs. The seeded tenant was not touched. The probe scripts `scripts/zz-hunt-h31-{fuzz,gate,race}.mts` are deleted; this file is the only one left.
