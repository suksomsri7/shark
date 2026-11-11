# HR SYNC merge review (ee483dc75 + a00d0e7da + dc1c7b72d)

Reviewer: independent, read-only (no typecheck, build or DB). Tree: shark-hr-b @ 753c94219.
Method: `git show ee483dc75 --remerge-diff` per conflicted file; read both parents (85c6527be HR, a242405dd main);
grepped callers; diffed the 15 src files both sides changed against base 71a1f363f.

**Verdict: FIX FIRST.** One MAJOR (a one-line fix). Everything else is MINOR or held up.

---

## Findings

### MAJOR-1: POS sweeper still counts REVERSED runs as "period has a run"
`src/lib/modules/hr/payroll.ts:290` (`rehomeStrandedSystemAdjustments`, from main/POS P3.5 fix2 N1)
```ts
const runs = new Set((await db.hrPayrollRun.findMany({ where: { systemId: sys.id }, ... })).map((r) => r.periodKey));
```
No `...liveRunWhere()`. Main wrote this before HR H0.6 added REVERSED runs. Every other "run exists for period" lookup
in the merged file uses `liveRunWhere()`: lines 175, 245, 251, 669, 1302, 1334, 1339, 1397, 1434, 1538, 1573.
POS's own period picker (`pos/staff-commission.ts:362` → `payrollRunPeriods`) also uses the live notion.
- Failure scenario: the owner reverses run 2026-12. `reverseRun` (payroll.ts ~1171) sets `runId = NULL` on that run's
  adjustments, so P is open for a corrected run. The next POS sync calls `hrRehomeStrandedSystemAdjustments`
  (`pos/hr-link.ts:254`). That sweep still treats 2026-12 as taken, so every POS staff-commission row in 2026-12
  (APPROVED or PENDING, runId null) moves to 2027-01. The corrected December run leaves out the POS commissions,
  which then get paid a month late. The payslip no longer matches the run that was reversed.
- There is also a ping-pong: POS now files new rows into the reopened period (live view), and the sweeper moves them
  out again (all-runs view).
- `nextRunlessPeriod(..., runs)` also skips periods whose only run is REVERSED, so the target period is wrong too.
- Smallest fix: `where: { systemId: sys.id, ...liveRunWhere() }` at line 290. Optionally add a qc case:
  reverse a run that has a POS row bound, then sweep → the row stays in P.

### MINOR-1: `isSystemAdjustment` is now dead code
`payroll.ts:277`. Main's only caller was the old `decideAdjustment` move rule, and the merge took HR's version instead.
That is correct: HR's under-lock path moves *every* adjustment approved into a period that has a live run, so it covers
POS. The function is not exported and no longer called. There is no ESLint config at the repo root and `noUnusedLocals`
is off, so no gate fails. Remove it, or keep it and add a comment pointing to the sweeper's inline filter. The comment
block at lines 269–273 still says the move rule is "for system adjustments", which is stale.

### MINOR-2: The sweeper takes no period lock
`payroll.ts:301` (pre-existing on main, not caused by the merge). The sweeper moves rows into period `to` without
`lockRunPeriod(to)`. It can race a `createPayrollRun(to)` that already took its snapshot, and the row then strands in
`to`. It heals on the next sweep because `to` is now in `runs`. HR's H0.2 invariant ("no stranded row without someone
seeing it") holds only eventually for POS rows. Possible fix: run each move in a tx under `lockRunPeriod(tx, ctx, to)`
and re-check `to` against live runs, the way `moveCommissionAdjustmentPeriod` does at line 1334.

### MINOR-3: A POS clock-in just after midnight can be deduped onto yesterday's IN
`service.ts:452` together with `pos-seam.ts:100-103`. `clockSelf` now passes an explicit `kind` into HR's `clock()`, which
dedupes when the last row has the same kind and is newer than `CLOCK_DEDUPE_SEC`.
- Scenario: IN at 23:59:40, then POS IN at 00:00:10. `nextClockKind` says IN because the day rolled over, so the gate
  passes. `clock()` then returns yesterday's row as `deduped` and writes no IN for today. POS reports `ok:true`.
- Main's version would have inserted a new row. HR's kiosk (`NEXT`) has the same edge, so this is an accepted HR
  semantic, not merge damage.
- Note it, or make the dedupe also require `last.at >= dayStart(at)`.

### MINOR-4: `nextClockKind` doc comment is now wrong
`service.ts:499-500`. The comment says the function is display-only and that the real decision is made under the lock.
POS `clockSelf` uses it as a gate before taking HR's lock (it holds POS's own per-user lock).
- I checked the race: a kiosk tap landing between the gate and `clock()` produces the same kind, which dedupes. So
  there is no wrong row. Only the comment is stale.
- Alternative: have `clockSelf` call `clock(kind:"NEXT")` and compare `res.kind`. That keeps one decision under one
  lock. It changes the frozen seam's ALREADY_CLOCKED semantics slightly, so it is not required.

### MINOR-5: Stale comment in `hr/index.ts`
`src/lib/modules/hr/index.ts:67` says "ไม่ประกาศ onShiftToday ที่นี่" ("onShiftToday is not declared here"). The POS
block a few lines below (line 77) now exports `onShiftToday`. The comment should say the seam is now exported, and that
switching it to read the roster (H2.1 rosterOnDay) or the H1.1 unit axis is still pending. Today `onShiftToday`
ignores `unitId` and uses the weekly `HrWorkSchedule`. That is consistent with what `clock()` uses (roster.ts:5 debt
D1 → H2.4/H2.5).

### MINOR-6: F16.3 exemption check is weak
`scripts/fitness-hr.mts:290,616`. Exempting the booking-queue kiosk page is sound: the page imports only `next`, the
queue component, `../../actions` and `booking/public-line`, and no HR guard applies to a public queue screen. But the
re-entry test is a plain substring match on `"@/lib/modules/hr"` in the page file. It misses:
- relative imports;
- HR data that arrives through another module. `booking/service.ts` already imports hr (`staffWindows`), and X-HR.1
  will make that return real roster data.

Suggestion: also fail the exemption if the page imports `../../actions` *and* that file imports hr, or add a comment
on `staffWindows` saying it must stay free of names and money (it already returns ids and minutes only).

### MINOR-7: Wasted leave-branch queries when HR is off
`src/lib/ai/tools.ts:2198` vs `:2215`. `leaveBranch` (one `appSystem` query plus one `scopedLeaveWhere` per HR system)
is computed before `offHr` is known. When the owner has HR turned off, those queries run for nothing. The behaviour
is still correct: leaves are skipped via `seesLeaves && !offHr`. An empty `OR: []` still means "match nothing", which
is the correct deny. Fix: guard with `!offHr` (move the `offHr` lines above).

---

## Verified: these held

1. **payroll.ts `decideAdjustment`.** HR's path is a strict superset of main's N1 rule. It covers all kinds, including
   CRM and POS system rows, runs in one tx under `lockRunPeriod` (source and target), re-checks the target against
   live runs, and the claim is guarded by `periodKey`. REJECTED keeps the old path, as on main.
   `POS_STAFF_COMMISSION_NOTE_PREFIX` is unchanged (exported, used by the sweeper filter and the guard at :293/:301).
   `rehomeStrandedSystemAdjustments` is intact and re-exported once (index.ts:80). `adjustmentStatuses` keeps
   `periodKey`. POS's PERIOD_CLOSED hop (`staff-commission.ts:403`) pairs with HR's live check at payroll.ts:1397.
2. **service.ts `clock()`.**
   - The body is exactly HR H0.3 inside `run(tx)`.
   - Every statement under the lock uses the given `tx` with explicit `{tenantId, systemId}`: the advisory lock,
     `hrEmployee`, `hrAttendance` read and create, and `hrWorkSchedule`.
   - The `hrWorkSchedule.findFirst` by weekday reads the same table and fields as main's `getSchedule(ctx, id, opts)[weekday]`,
     so judgement is equivalent.
   - The own-tx branch keeps `{maxWait 5s, timeout 10s}`.
   - `HrTx` is `Prisma.TransactionClient`, so passing POS's tx type-checks by construction.
   - Lock order is POS lock `pos.hr.clock:<tenant>:<user>`, then HR `hr:clock:<emp>`. No path takes them in reverse,
     so there is no deadlock. No second connection is opened under POS's lock.
   - `ClockRefusedError` cannot fire from `clockSelf`, because `linkedEmployeeOf` already confirmed an active employee
     in the same tx. If it ever did, `posClockForShift` catches it and returns INTERNAL.
   - `nextClockKind` is equivalent to main's: kindAfter's dayStart equals main's `at >= dayStart` filter followed by
     the IN→OUT rule. Scope is explicit, and dc1c7b72d is a type-only cast.
   - Callers: kiosk `clockWithPin` (`NEXT`, requireActive), `hr/actions.ts:148` (explicit kind, requireActive) and
     POS `clockSelf`. `onShiftToday` and `ui.tsx:404` call `getSchedule` and are unchanged. Return-shape use: POS reads
     only `r.judgement`, which is still present.
3. **staff/service.ts revoke.**
   - Order: HR tx (unlink employees + `acceptedAt=null`), then link audits, then SEC `pushDevice` unbind, then the
     early return for an already-revoked user, then the `membership.access.revoke` audit.
   - Main's standalone `membership.updateMany` was correctly dropped; HR's tx does it. Nothing is doubled.
   - Delta from main: push unbind now also runs for already-revoked rows. It is idempotent and harmless, arguably a fix.
   - SEC `staff/invite.ts` restore-by-invite does not relink HR employees, which matches HR H0.7 ("restore does not
     relink").
4. **ai/tools.ts** keeps both HR's branch scope and SEC's moduleOff/skip note. **ai/plans.ts**: main's 7-arg
   `runKind(..., opts?.userId ?? null, st.summary)` is kept with HR's comment. `PLAN_HUMAN_ONLY` still blocks
   hr_decide_leave and approval_decide. In proposals.ts, HR's H1.1 branch checks sit on main's restructured file
   (auto-merged, `m` in scope).
5. **hr/index.ts.** There are no duplicate export names (checked across multi-line blocks). The `staffWindows` stub is
   intact. **env.ts**: `HR_PIN_PEPPER` and `POS_DEVICE_KEY` are both kept. **.gitignore**: both kept.
6. **Auto-merged files changed on both sides.**
   - `outbox-consumers.ts` / `automation/labels.ts` / `webhooks/labels.ts`: no duplicate event keys within a file or
     across the automation/webhook lists. `hr.payroll.reversed` and `hr.roster.published` are registered once.
   - `core/scope.ts`: no duplicate model keys; HR H1.x and POS models are disjoint.
   - `approval/service.ts`: HR's `cancelRequest(ctx, id, {tx})` is backward-compatible with main callers. Main's
     unit/self-approval gate doesn't bite HrLeave, because HR submits without `unitId` and `requestedById` is the
     employee's user. HR enforces branch itself.
   - `approvals/page.tsx`, `app/layout.tsx`: additive on both sides.
   - `account/gl.ts systemId_periodKey` is `AccountPeriod`, not affected by HR's partial-unique swap on `HrPayrollRun`.

## Not verified
- Typecheck, build, fitness and qc results (the verification run owns the tree).
- Migration ordering on prod. HR migrations are dated 20261201–20261206, older than main's latest applied
  (20261227100000). `prisma migrate deploy` applies pending ones regardless of order, but I did not check each HR SQL
  against main's interleaved migrations (e.g. 20261217100000_pos_p35_staff_commission references HrPayAdjustment ids).
  On a fresh QC DB they apply in lexical order, before main's.
- Whether `m` in proposals.ts is typed as non-null where HR uses it (compile-level).
- The HR approvals-page path's branch scope for HrLeave decisions (pre-existing HR scope, not merge-related).
