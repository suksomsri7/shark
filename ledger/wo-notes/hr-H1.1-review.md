# H1.1 review: reviewer + privacy/money hunter

> Tree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h1.1` @ ee68d4a5 (base session/hr 323a01e5) · 22 Oct 2026 · read-only on code
> Read: brief H1.1 (R1–R11, controller rulings 1–13, D-1 amendment) · COMMON · builder notes `hr-H1.1.md` · `git diff 323a01e5..ee68d4a5` (src, prisma, backfill, seed, env) · ORACLE-EDIT commits 1e55819d and ee68d4a5
> Probe: `/tmp/hr-hunt-h11/probe1.mts`. It is pure (rbac.evaluate + scope.hrScopeOf/unitTargetOf, no DB read or write) and was run through `iso.sh → qc4.sh → with-gate-lock.sh`.

## Verdict: **FIX FIRST**

One CRITICAL finding blocks the merge: the D-1 amendment is only half-built and breaks writes in production after the backfill. There are also two MAJOR branch escapes, one on leave data and one on money data, that the controller should rule on before merge. Everything else held.

## Findings

### C-1 CRITICAL · blocks merge: `unitAccess []` is tenant-wide for reads but every write is refused once the target employee has a unit
- **Where:**
  - `src/lib/modules/hr/actions.ts:51-65`: `assertHrCan(auth, action, unitId)` and `hrTarget`.
  - `src/lib/modules/hr/payroll-actions.ts:34-56`: `assertHrCan` and `payTarget`, plus `:266-268` (requestAdjustment `assertCan … unitId`).
  - `src/lib/modules/hr/scope.ts:142`: `unitTargetOf` returns `unitId: emp.unitId` for an all-branch scope.
- **Cause:** `hrScopeOf` maps `[]` and malformed `unitAccess` to `"*"` (D-1, scope.ts:45). `hrTarget`/`payTarget` then forward the employee's home `unitId` into core `assertCan`. Core `canAccessUnit` (`rbac.ts:22-26`) only accepts `"*"` or an exact id, so for `[]` it fails.
- **Evidence (probe1):**
  ```
  emp u1 · STAFF [] hr.employee.create → scope "*" · target {ok, unitId:u1} · assertCanPasses:false
  emp u1 · MANAGER []                  → scope "*" · target {ok, unitId:u1} · assertCanPasses:false
  emp null · STAFF [] / MANAGER []     → assertCanPasses:true
  ```
- **Impact:** `[]` is the default for every invited STAFF (`staff/service.ts:434`). Runbook step 2 runs the backfill, which gives every employee of a one-unit tenant a `unitId`. From then on, every `[]` STAFF or MANAGER gets a `ForbiddenError` on all of these:
  - clock and kiosk clock (kiosk device accounts stop working)
  - edit, remove, restore, profile and docs
  - setPin and work schedule
  - request leave on someone's behalf, decide leave, bulk decide
  - salary profile and pay adjustments request/decide/cancel/move
  - create employee with a unit
  
  The error surfaces as an error page, and the dev message carries `@<unitId>`. This contradicts the D-1 intent ("deploy แล้วไม่มีใครเสียสิทธิ์").
- **Why the suites missed it:**
  - The regression fixtures with `[]` (privacy, h0.3, h0.7) use employees with no unit.
  - The `qc-hr-v2` seed gives every user `["*"]` except `manager-branch`.
  - No oracle exercises a `[]` actor writing to a unit-bearing employee.
- **Smallest fix:** in `hrTarget`, `hrHomeTarget` and `payTarget`, drop the `unitId` when the scope is all-branch. For example `return isAllBranches(scope) ? {} : { unitId: t.unitId }`, with the scope computed once. The alternative is to pass `unitAccess: ["*"]` into the `assertCan` membership when `hrScopeOf` is `"*"`. Explicit lists still forward the unit, so the oracle S5.10 static stays green.
- **Add a check:** a `[]` STAFF holding `hr.employee.create` and `hr.attendance.clock` edits and clocks a unit-bearing employee → ok.

### M-1 MAJOR · blocks merge (controller rules on scope): leave data escapes the branch through the calendar and AI `upcoming_schedule`
- **Where:**
  - `src/lib/modules/calendar/service.ts:127-152`: the gate is only `evaluate(hr.leave.read)`, then all HR systems and all leaves are read.
  - `src/lib/ai/tools.ts:2073-2094`: `prisma.hrLeave.findMany({ tenantId, … })`, also gated only on `hr.leave.read`.
- **Impact:**
  - A MANAGER with `unitAccess [u1]` passes `hr.leave.read`, because MANAGER is full rights and no `unitId` is passed.
  - They see every u2 and null-unit employee's name, leave type and dates (`ลาป่วย` is health data, which is PDPA-sensitive) in the calendar and in the AI answer.
  - This is exactly the "AI tools" branch escape that acceptance §5 asks the hunter to close. `pending_leaves` is scoped, but these two leave readers were not.
- **Smallest fix:**
  - Calendar: inside the per-system loop, AND the `where` with `await scopedLeaveWhere({tenantId, systemId}, hrScopeOf(membership))`, and skip the system when it returns null.
  - AI tool: the same per HR system, using `aiActorMembership`.
  - The kanban leave/employee link resolvers (`kanban/link-resolvers.ts:307-345`, id-only, name and dates) and the dashboard/proactive counts are INFO. They need an id or only show counts.

### M-2 MAJOR · controller decision (ruling 8 reading): a branch-scoped payroll viewer sees every branch's salary data on `/hr/payroll`
- **Where:** `src/lib/modules/hr/payroll-ui.tsx:87-93`. It calls `listEmployees(ctx)`, `listSalaryProfiles(ctx)`, `listAdjustments(ctx)` and `monthlyAttendance` per employee, all unscoped. The `scope` parameter that the builder added to `listAdjustments` (`payroll.ts:332`) is never passed by its only UI caller.
- **What a `hr.payroll.read` holder with `unitAccess [u1]` can see:**
  - every employee's base salary, taxId, spouse and children deductions (the salary form defaults)
  - every adjustment row (amounts)
  - this month's and last month's attendance summaries for every employee
  - every run's items (slip links with names, negative net amounts) and system totals
- **What they can do:** as MANAGER, or STAFF with the keys, create, recompute or delete a draft run, and approve, mark paid or reverse a run for the whole system (ruling 8 makes this intentional).
- **Effect on the payslip filter:** the branch filter on `loadPayslipForViewer` (`privacy.ts:131`) becomes cosmetic, because the same numbers are on the payroll page.
- **Brief vs ruling:**
  - R4 names "attendance/OT/adjustment lists, payroll preview rows the manager can see".
  - Ruling 8 only exempts "run items/totals".
- **Smallest fix:** pass `hrScopeOf(hrViewerOf(auth))` into `listEmployees` and `listAdjustments` in `PayrollSection`. The salary-profile forms and attendance then follow `employees`. Keep the run block system-wide per ruling 8, or explicitly re-rule that the payroll page is system-wide and drop the payslip filter claim.

### m-1 MINOR · no: the payslip branch filter uses "today", not the run period
- **Where:** `privacy.ts:131`, `employeeInScope` (today).
- **Effects:**
  - After a transfer u2→u1, the u1 payroll viewer sees that employee's old u2 slips, and u2 loses them.
  - An open borrowing into u1 exposes all of the employee's slips, including months before the borrowing.
  - A branch-scoped payroll viewer who is linked to an employee outside their units loses their own slip, because the `payrollViewer && !inScope → null` path never falls back to the own-slip path.
- **Note:** it is moot while M-2 stands. **Fix:** for an own slip (`linkedUserId === v.userId`), skip the branch filter. A period-based unit is H3.x.

### m-2 MINOR · no: `employmentStatus` from the profile form does not touch `active`
- **Where:** `service.ts:226,282`.
- **Effect:** setting the form to "สิ้นสุด" leaves `active=true`. The employee can still clock, verifyPin (`pin.ts` filters on `active`), appear in kiosk and register lists, and enter payroll runs.
- **Note:** this matches the builder's decision ("data only"). **Fix:** either hide ENDED from the form (lifecycle only via remove/restore), or route ENDED through `setEmployeeActive(false)`.
- Reactivation always sets ACTIVE, so a prior PROBATION is lost (INFO).

### m-3 MINOR · no: home-unit filter for dated rows uses the current home unit
- **Where:** `scope.ts` `scopedLeaveWhere` / `scopedAttendanceWhere` (`employee.unitId in ids`).
- **Effect:** after a transfer, the new branch sees the full leave and attendance history and the old branch sees none.
- **Note:** this follows rulings 2/4 (home = current). Record it as a known limit until unit history (H2.x).

### INFO
- **I-1, verifyPin ruling 6:** null-home employees pass any `unitId`. This is the pre-H1.1 tenant-wide behaviour, so no new exposure. The PIN lookup is a tenant-wide unique hash, so `unitId` only narrows. A unit mismatch returns `failed()` without `release()`: the same bytes as a wrong PIN, and the attempt is counted. The limiter is unchanged and there is no oracle for "employee exists in another branch". The legacy plain-PIN upgrade writes before the unit check, which causes only a small timing/side-effect difference and no reply difference.
- **I-2, existence oracles:** both need a cuid and both are low risk.
  - Out-of-branch ids return the branch text, while unknown ids proceed or return "ไม่พบ" (`requestAdjustmentAction`, `hrTarget` `{}` on not-found).
  - The AI `hr_decide_leave` proposal preview names the employee of any leaveId (`tools.ts:2393-2401`), and is refused at confirm.
- **I-3, junk `unitAccess`:** entries like `[" "]` or `[123]` filter to `[]` and become tenant-wide (scope.ts:42-45), while rbac treats them as restricted. This is consistent with D-1 "malformed = unset". Normalising it is a core debt.
- **I-4, borrowing exposure:** a u1 manager sees borrowed-in employees in the register, profile and kiosk, but cannot do employee-level edits on them (ruling 4). The profile DTO lists all borrowings of that employee, including to other units (not sensitive).
- **I-5, linked own rows:** they skip the branch filter only for non-readers' own leaves, so there is no exposure. A reader with `[u1]` whose own employee is in u2 does not see their own leave in the list (UX only).
- **I-6, cross-tenant with the same unit id string:** safe.
  - Every reader uses `tenantDb` (tenant + system).
  - `homeUnitTarget` and `addEmployeeBorrowing` check that the BusinessUnit belongs to the tenant.
  - `verifyPin` scopes `tenantId` and the HR systems.
  - A foreign unit id in `unitAccess` matches nothing.
- **I-7, borrowings:** there is no action or UI writer in H1.1. The only writers are `addEmployeeBorrowing`/`endEmployeeBorrowing`, called from the seed. So a u2 manager cannot create a borrowing into u1. The open-row race is decided by the partial unique → P2002 → fixed text. When H2.x adds the action it must enforce Q3 (access to both units).
- **I-8, R5 completeness:** every exported action in `hr/actions.ts` and `payroll-actions.ts` passes the target unit or carries a `ทุกสาขา` comment. `cancelLeaveAction` (own leave, service-guarded) has neither and is fine.
- **I-9, approvals:** an approval-chain decision via `/app/approvals` is not branch-checked (Q2 → H2.7, unchanged).

## What held
- **R1 migration:**
  - Additive only, 11 statements, one tx, pre-check SQL in the header.
  - `payType NOT NULL DEFAULT 'MONTHLY'`.
  - FK `HrEmployeeUnit.employeeId → HrEmployee ON DELETE CASCADE`, no FK to BusinessUnit (ruling 13).
  - Raw partial unique `HrEmployeeUnit_employeeId_unitId_open_key … WHERE "toDate" IS NULL`.
  - `HrEmployeeUnit: sys()` in core/scope.ts.
  - Reversible by dropping the table, columns and types.
- **R2 backfill:**
  - Dry-run by default; `--tenant` xor `--all` is enforced.
  - Never overwrites `unitId`; status is set only where null.
  - One tx per tenant with an advisory lock; idempotent.
  - Prints counts and slug only.
  - Refuses the prod host unless `HR_BACKFILL_PROD=1`, plus env-file guards.
- **R3 `hrScopeOf`/`unitWhere`:**
  - OWNER, `*`, `[]` and malformed → `*`; an explicit list is de-duplicated.
  - Null units are visible only to `*`.
  - "Borrowed open today" for HrEmployee; dated rows use the row date (leave `fromDate`, attendance Bangkok day). Closed windows keep their rows visible (ruling 7).
  - `unitWhere([])` fails closed.
- **R4 readers scoped:**
  - register, removed list, attendance, leave (and the "ยื่นแทน" picker), kiosk roster, HrHub
  - profile loader (on top of D3/D4, never widening)
  - payslip (payroll path), `leaveItemsForViewer`, AI `pending_leaves`
  - CRM readers in `hr/index.ts` unchanged
- **H0.7 R10/R11 intact:** the row scope is preserved (`leaveListScopeOf` checks `linkedUserId` first). The decide/cancel lock and tx bodies are untouched; the branch check runs before them, and its inputs (employeeId, fromDate) are immutable.
- **R6 money:**
  - No branch path grants `hr.payroll.read`. `payType` is only in the profile when `seeSensitive` is true (`EMPLOYEE_PAYROLL_FIELDS`).
  - DAILY/HOURLY in-run profiles are refused with fixed text in a separate query, and `allProfiles` is untouched, so the MONTHLY digest is byte-identical (oracle S5 green). `recomputeDraftRun` maps the refusal.
  - `setSalaryProfile` with no `payType` keeps the existing value.
- **R7:** ENDED + `endDate` when null, reactivation → ACTIVE, the PIN rule is kept.
- **Refusal texts:** Thai, fixed, no names or ids, and no `e.message` reaches the UI. `HrBranchError` text is produced by scope.ts only.
- **Frozen files:** `payroll-rules.ts` sha256 = `75a66c0c1354e932…` (unchanged). `qc-hr-h0.6.mts`, `qc-payroll.mts` and `payroll-digest.ts` have no diff.
- **ORACLE-EDITs 1e55819d / ee68d4a5:** they match the D-1…D-5 rulings exactly, with no other oracle change.
- **Markers:** hunks are marked `HR H1.1 ▸ … ◂` throughout.

## Residue / running
- **DB:** 0 rows written, none read. probe1 is pure.
- **Files:** `/tmp/hr-hunt-h11/probe1.mts` is my scratch file and was left in place. I wrote only this review file. Nothing was committed and no product code, oracle or notes were edited.
- **Running:** nothing of mine is running. No units were started or stopped, and the gate lock was used only for the single probe run and then released.
