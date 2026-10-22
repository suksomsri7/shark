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

## Round 2 (R12) — 6d8a466d

> Diff `ee68d4a5..6d8a466d`. Commits: be2ae0e9 (oracle S10 addendum), 5c03a42a (fixes), 6d8a466d (notes).
> Builder notes §9a, D-6…D-8, read. The `### R12` block is not in this tree's copy of `hr-brief-H1.1.md`, so I took the rulings from the coordinator message and notes D-6/D-7/D-8.
> Probe: `/tmp/hr-hunt-h11/probe2.mts`. It is pure (no DB reads or writes) and was run through `iso.sh → qc4.sh → with-gate-lock.sh`.

### Verdict: **MERGE**

All round-1 blocking findings (C-1, M-1, M-2) and m-2 are fixed. I found no new CRITICAL, MAJOR or MINOR issue; only the INFO notes below remain.

### (1) C-1: fixed
- **Code:** `scope.ts:142`. `unitTargetOf` now returns `{ok:true}` with no `unitId` for an all-branch scope. `hrHomeTarget` (actions.ts:103-110) is split into `unitId` (stored) and `checkUnit` (passed to `assertCan`, explicit lists only).
- **probe2, writes now allowed:**
  - Covered: STAFF `[]` (keys employee.create, attendance.clock, leave.decide, payroll.create, payadjust.approve) and MANAGER `[]`, against employees in u1, u2 and null.
  - Result: every one of those actions passes. That covers edit, remove, restore, profile, docs, setPin, schedule, clock and kiosk (same `hrTarget`), decide and bulk-decide, salary, and adjustments request/decide/cancel/move (same `payTarget`).
- **probe2, writes still refused:**
  - MANAGER `[u1]` and STAFF `[u1]`: a u2 employee is refused with `พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ`. A null-unit employee is refused with `พนักงานคนนี้ยังไม่ระบุสาขาประจำ — ผู้ดูแลทุกสาขาเป็นผู้จัดการ`.
  - Neither text contains a unit id (`leaksId:false`).
  - A u1 employee is allowed, and `unitId` is still forwarded to `assertCan` for an explicit list.
- **(5) The split stores the right unit:**
  - The stored `unitId` comes only from `hrHomeTarget().unitId` (create at actions.ts:123-125, profile move at :241-242), which always carries the validated unit.
  - `hrTarget` and `payTarget` results are used only for checks and never stored.
  - `leaveBranchRefusal` (service.ts:946) uses only `.ok`.
  - So an all-branch actor's create or move still stores the chosen unit, now without passing it to `assertCan`.

### (2) M-1: fixed
- **Calendar** (calendar/service.ts, one R12 hunk):
  - OWNER, `[]`, malformed or `*` gives no filter, the same as before.
  - A list filters to home unit ∈ list, OR a borrowing (`hrEmployeeUnit` per system, take 5000) whose window covers the leave's `fromDate`.
  - Null-unit employees are excluded, because `unitId in [...]` never matches null.
- **AI `upcoming_schedule`** (tools.ts hunk):
  - Uses `scopedLeaveWhere(hrScopeOf(lm))` per HR system, OR-ed with `systemId`.
  - With no HR systems the result is `OR: []`, which returns nothing (fail closed).
  - An `apiKey` actor and all-branch viewers are unchanged.
- **D-6 inline copy vs `hrScopeOf` + `scopedLeaveWhere`:**
  - probe2 compared 3 roles × 12 `unitAccess` shapes: `[]`, `*`, `u1`, `u1,u2`, a duplicate, the string `"u1"`, `null`, `[123]`, `[" "]`, `[" u1"]`, `["u1","*"]`, `[" *"]`.
  - They are identical except for whitespace-padded entries. `hrScopeOf` trims, so `" u1"` becomes `u1`; the calendar does not trim, so `" u1"` matches nothing.
  - The calendar is therefore never wider than HR, only narrower, and only for malformed padded ids (fail closed). INFO R2-I1.
  - The borrowing window logic (`fromDate gte b.fromDate`, `lte b.toDate` when closed) is identical.

### (3) M-2: fixed
- **Payroll page** (`payroll-ui.tsx`):
  - Scoped: `listEmployees` (which drives the salary forms and attendance), `listAdjustments(…, scope)`, run-item slip links, draft exclusions and stranded rows. Run totals stay system-wide (ruling 8).
  - Hidden for a branch viewer: the create form and the approve, paid and reverse buttons.
- **Run actions:** `assertRunAllBranches` is called right after the key check, before the form is parsed or the DB is touched. It covers create, approve, reverse, markPaid, deleteDraft and recompute (D-7).
  - probe2: `[u1]` is refused; OWNER, `[]` and `*` are allowed.
  - Refusal text: `รอบจ่ายเงินเดือนครอบคลุมทุกสาขา — ต้องเป็นผู้ดูแลทุกสาขาจึงทำรายการได้`. It is fixed and carries no names or ids.
  - create, approve, deleteDraft and recompute return it as `{ok:false}`. reverse and markPaid are void actions without a try, so it is thrown as `HrBranchError` (an error boundary, still with no write). Their buttons are hidden anyway. INFO R2-I2.
- **Frozen files:** `payroll.ts`, `payroll-rules.ts`, `pin.ts` and `privacy.ts` have no diff in R12. `payroll-rules.ts` sha256 is still `75a66c0c…`.

### (4) m-2: fixed
- Saving the profile with status ENDED on an active employee calls `setEmployeeActive(false)`, which sets `active=false`, status ENDED, and `endDate` = today if empty. It runs after the branch gate and outside the save tx. INFO R2-I3: the save and the deactivation are two statements; a crash between them leaves status ENDED with `active=true`, and the next save repairs it.
- An inactive employee:
  - cannot clock: `clock(…requireActive:true)` is used by both `clockAction` and kiosk `clockWithPin`
  - cannot pass verifyPin: the SQL filters `"active" = true`
  - cannot file leave: `requestLeave` now refuses `!emp.active` with `พนักงานคนนี้พ้นสภาพแล้ว — ยื่นใบลาใหม่ไม่ได้`. This is the shared service, so the AI and approval paths are covered too.
- Restore while ENDED is refused in `restoreEmployeeAction` (fixed text). The register shows a link to the profile instead of the button (D-8).
- The two-step flow works:
  1. The profile loader has no `active` filter, so an inactive employee's profile opens.
  2. The owner saves status ACTIVE or PROBATION; this does not touch `active`.
  3. Restore then works, and `setEmployeeActive(true)` sets ACTIVE.
- INFO R2-I4: between steps 2 and 3 the row reads `active=false` with status ACTIVE (cosmetic). Under R7 every removed employee is ENDED, so every restore is now two steps. That is accepted by D-8.

### (6) Hot files
- `calendar/service.ts`: only the leave-scope hunk inside the HR leave loop.
- `ai/tools.ts`: only the import line (`hrScopeOf`, `scopedLeaveWhere` via the `hr/service` re-export, an existing ai→hr edge) and the `upcoming_schedule` block (`leaveBranch` and the spread into `where`).
- Nothing else in either file changed.
- `service.ts`: the re-export line moved the old H0.5 comment onto the same line (cosmetic).

### Round 2 INFO (none blocks)
- **R2-I1:** the calendar copy does not trim `unitAccess` entries, so it is narrower than HR for whitespace-padded ids (fail closed). Replace it with the hr helpers if the `calendar→hr` edge is approved.
- **R2-I2:** reverse and markPaid surface the branch refusal as a thrown `HrBranchError`. No write happens and the buttons are hidden.
- **R2-I3:** the ENDED save and `setEmployeeActive(false)` are not in one tx.
- **R2-I4:** an intermediate `active=false` + ACTIVE state exists during the two-step restore.
- **Unchanged from round 1:** m-1 (payslip filter uses "today") and m-3 (dated rows follow the current home unit) are still open as recorded.

### Residue / running (round 2)
- **DB:** 0 rows. probe2 is pure.
- **Files:** `/tmp/hr-hunt-h11/probe2.mts` is my scratch file and was left in place. Only this section was appended to this file; nothing was committed or edited elsewhere.
- **Running:** nothing of mine is running. `hr-ctl-h11b` was not touched.
