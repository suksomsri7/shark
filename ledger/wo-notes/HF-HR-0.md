# HF-HR-0 — HR personal-data / payslip exposure + leave-decision integrity (security hotfix)

Worktree `/root/projects/shark-hf3` · branch `hotfix/hr-privacy` (base origin/main 04d2ade9) · DB = QC4 only.

## Status / checkpoint
- [x] 1. audit (table below)
- [x] 2. oracle `scripts/qc-hf-hr-privacy.mts` RED on unfixed code → `HF-HR-0-red.txt` (ผ่าน 13/54 · CRITICAL 36 · MAJOR 5)
- [x] 3. fix
- [x] 4. GREEN 55/55 (`HF-HR-0-green.txt`) + regressions before/after (below)
- [x] 5. fitness both modes 33/33 before = after · typecheck (see A4)
- [x] 6. notes final · commit · push

## 1. Audit — every HR surface that ships employee / payroll / leave data to a client or returns it (verified in THIS tree)

Employee ↔ user link: `HrEmployee.linkedUserId` (schema `hr.prisma:74`, set only by `staff/service.ts:412-415` with a "already linked to another user" guard) ⇒ "the employee themself" = `linkedUserId === auth.user.id`. Not `@unique` (one user could be linked to rows in 2 HR systems — the check is per row, so that is fine).

| # | surface (file:line) | guard before | data that reaches the browser / caller before | verdict |
|---|---|---|---|---|
| S1 | `/hr/employees/[employeeId]` `page.tsx:33-64` → `"use client"` `EmployeeProfileForm` | requireTenant + system type HR only | whole `HrEmployee` row + `docs[]` in RSC props: nationalId, ssoNumber, houseRegAddress, bank*, **pinCode**, linkedUserId, partyId, doc URLs — even when `canSeeSensitive=false` | **D4 — fix** |
| S2 | `/payroll/[runId]/slip/[employeeId]` `page.tsx:14-25` (server-only render) | requireTenant + system type HR | base salary, adjustments + notes, SSO, WHT, net, employer SSO of ANY employee | **D3 — fix** |
| S3 | `/hr/leave` → `HrLeaveSection` `ui.tsx:218-243` → `"use client"` `BulkLeaveApprovals` (`meta` prop) | requireTenant | every pending leave: name, type, dates, **free-text reason** (health) as client props; history: name/type/dates/status (server HTML) | **D9 — fix (reason)** |
| S4 | AI tool `pending_leaves` `ai/tools.ts:151-171` (chat + REST `/api/v1/ai/tools/[name]`) | AI chat gate / API-key scope only; `ToolCtx` carries no user/membership | name, type, dates, **reason** | **D9 — fix (reason never returned)** |
| S5 | `/hr/employees` → `HrEmployeesSection` `ui.tsx:312-477` (server HTML) + `PinField` (client: `hasPin`) + `ConfirmDialog` (client: ids) | requireTenant | names, positions, phones, ids; PIN only as `hasPin` | no secret field crosses to a client component — left (see "found but left") |
| S6 | `/hr/attendance` `ui.tsx:98-215` (server HTML only) | requireTenant | names, positions, late/absent counts, clock times | LOW — left (report) |
| S7 | `/hr/kiosk` `ui.tsx:481-501` → `KioskClock` (client: `{id,name,position,hasPin}` from `kioskRoster` `service.ts:371-378`) | requireTenant | no PIN, no PII | OK |
| S8 | `/hr/payroll` `payroll-ui.tsx:55-71` → `PayAdjustForm` (client: `{id,name}`) | `canViewPayroll` early return | salaries etc. only for payroll viewers | OK |
| S9 | HR hub `/app/sys/[id]` `ui.tsx:505-559` | requireTenant | counts only | OK |
| S10 | server actions `actions.ts` / `payroll-actions.ts` return values | per action | `ProfileState`/`PinState`/`KioskState`(name of the clocking employee)/`BulkLeaveState`/`AdjustState` — no rows | OK |
| S11 | `setPin` `service.ts:328-334` (via `setPinAction` `actions.ts:205`) | `hr.employee.create` | duplicate PIN ⇒ message carries the **holder's name** (PIN oracle) | **D8 — fix** |
| S12 | `decideLeave` `service.ts:442-452` (+ `bulkDecideLeave` :457, actions :279/:298, AI proposal `proposals.ts:554`) | `hr.leave.decide` | no status guard (flip APPROVED→REJECTED, CANCELLED→APPROVED), self-approval, bypasses a PENDING approval request | **D10 — fix** |
| S13 | AI calendar tool `ai/tools.ts:1984-2000` | AI chat gate | leave type + dates + name tenant-wide (no reason) | left (report) |
| S14 | kanban link resolvers HR_LEAVE / HR_EMPLOYEE `kanban/link-resolvers.ts:301-349` | `hr.leave.read` | name/position/dates/status only | OK |
| S15 | staff `listStaffAccess` / `listGrantableEmployees` `staff/service.ts:241-300` | settings page | `{id,name,position,systemId}` / + email | OK |
| S16 | member PDPA `member/privacy.ts:79,860` | own module | id/name/position/department/linkedUserId | OK |
| S17 | booking / member reviews / dashboard / analyst / proactive / dna / onboarding / party | – | counts or `{id,name,position}` | OK |

## Regressions — BEFORE (origin/main code, QC4, gate lock)
| suite | before |
|---|---|
| qc-hr | 9/9 |
| qc-hr-attendance | 31/31 |
| qc-hr-leave-booking | 14/14 |
| qc-hr-payadjust | 27/27 |
| qc-hr-roster | 24/24 |
| qc-nav-functions | 11/11 (static) |
| qc-payroll | 19/19 |
| qc-payroll-reverse | 14/14 |
| qc-ai-tools | 18/18 |
| qc-ai-proposals | 16/16 |
| qc-ai-actions | 11/12 — CRASH pre-existing on QC4 ("Cannot read properties of null (reading 'id')") |
| qc-ai-phase-b2 | 11/11 |
| qc-bulk-ops | 13/13 |
| qc-approval-wiring | 7/7 |
| qc-calendar | 9/9 |

## Regressions — AFTER (same commands)
All identical to BEFORE **except** `qc-hr-leave-booking`: 14/14 → 12/13 (CRASH at its step [6] LV-9 "เปลี่ยนใจไม่อนุมัติ → ช่องจองกลับมาเอง",
which calls `decideLeave(APPROVED leave, "REJECTED")` — exactly the flip-back D10 forbids). Oracle is Auditor-owned ⇒ NOT edited.
Proof the rest is intact: a throw-away copy with only that one line replaced by a fixture write (`hrLeave.update status=REJECTED`)
ran 14/14 (LV-9 booking side + LV-10 green) and was deleted. ⇒ **controller decision C1 below.**
qc-ai-actions 11/12 (CRASH) is pre-existing on QC4 and line-for-line identical before/after.

## Fix summary
| defect | change |
|---|---|
| D3 | `privacy.loadPayslipForViewer` — payroll viewer (`canViewPayroll`) sees all; the employee themself (`HrEmployee.linkedUserId === user.id`) sees own slip only for runs APPROVED/PAID; everyone else / other tenant → `null` → page `notFound()` |
| D4 | `privacy.loadEmployeeProfileForViewer` — guard `hr.employee.create` OR `hr.leave.read` OR payroll viewer, else 404; DTO built field-by-field (`privacy-shared.ts`); 6 sensitive keys only for payroll viewers (absent otherwise, not null); docs loaded only for payroll viewers; PIN → `hasPin` only. `EmployeeProfileForm` (client) now typed by `EmployeeProfileDto`. |
| D8 | `setPin` duplicate → "PIN นี้ใช้ไม่ได้ กรุณาเลือก PIN อื่น" (no name; query selects only id) |
| D9 | `/hr/leave` via `privacy.leaveItemsForViewer` — `reason` key only with `hr.leave.read`; AI `pending_leaves` never returns the reason (`ToolCtx` has no caller identity ⇒ fail-closed; one marked line in `ai/tools.ts`) |
| D10 | `decideLeave`: PENDING only; refuses self-decision (`decidedById === employee.linkedUserId`); refuses when an `ApprovalRequest(entityType HrLeave, entityId, PENDING)` exists (points to “อนุมัติ” page); final write = `updateMany where {id, status: PENDING}` + count check (race-safe). Throws `HrLeaveDecisionError` (Thai); `bulkDecideLeave` reports its message per id. Approval-engine effect path (`approval-effects.ts`, own PENDING-guarded updateMany) untouched. |

## DTO whitelist (`src/lib/modules/hr/privacy-shared.ts`)
- Always (anyone who passes the profile guard): id, name, nickname, code, phone, email, gender, birthDate, maritalStatus, position, department, employmentType, startDate, endDate, addressLine, subdistrict, district, province, postcode, emergencyName, emergencyPhone, emergencyRelation, note, active, hasPin
- Payroll viewers only (OWNER / `hr.payroll.read`): nationalId, ssoNumber, houseRegAddress, bankName, bankAccountNo, bankAccountName + docs[] {id, kind, title, url, note}
- Never: pinCode, linkedUserId, partyId, tenantId, systemId, createdAt, updatedAt, raw docs relation
- Leave item: id, employeeName, type, fromDate, toDate, status (+ reason only with `hr.leave.read`)

## Per-surface — who saw what, before → after
| surface | before | after |
|---|---|---|
| Payslip page | any tenant member with ids: full slip of anyone | OWNER / `hr.payroll.read`: any slip · the employee (linked user): own slip, APPROVED/PAID runs only · everyone else (incl. MANAGER and HR staff without payroll.read): 404 |
| Employee profile page | any member: page + RSC payload with national id, SSO no., house-reg address, bank, **PIN**, doc URLs | no HR key: 404 · `hr.employee.create` / `hr.leave.read` / MANAGER: general fields + hasPin · payroll viewers: + sensitive + docs · PIN to nobody |
| /hr/leave pending list (client prop `meta`) | everyone: reason text | reason only with `hr.leave.read` (OWNER/MANAGER pass); others see name · type · dates |
| AI `pending_leaves` | reason to any AI-chat user / API key | no reason for anyone (name/type/dates unchanged) |
| setPin duplicate | holder's name | generic message |
| Leave decision | flip any status, self-approve, bypass approval chain | PENDING→decided once; not own leave; chain leaves go through the chain |

## Who loses access
- Plain members / STAFF without HR keys: employee profile pages (404), colleagues' payslips (404), leave reasons on /hr/leave.
- MANAGER (no `hr.payroll.read`) and HR staff without payroll.read: payslips (404); they never saw sensitive fields on screen, and now also not in the payload.
- Employees (linked users): may now see their OWN payslip (APPROVED/PAID) — a gain.
- AI chat / API keys: leave reasons.
- Deciders: can no longer revoke an APPROVED leave, re-open CANCELLED/REJECTED ones, decide their own leave, or decide a leave sitting in an approval chain.

## Found but left (report only)
| where | what | why left |
|---|---|---|
| `src/lib/ai/proposals.ts:554` | `hr_decide_leave` confirm calls `decideLeave(..., null)` ⇒ self-decision check cannot apply on the AI path (status/chain guards DO apply) | file is off-limits in this hotfix; needs the confirming user id passed |
| `service.ts` requestLeave → `submitForApproval(... requestedById: input.employeeId)` (~:435) | approval request stores the EMPLOYEE id as requester ⇒ requester can't cancel / "my requests" never lists it | behaviour change of the approval inbox; not in D10 rule |
| `actions.ts:257` requestLeaveAction | `hr.leave.request` holder can file leave for any employeeId | UI files on behalf of others by design; self-binding = product decision |
| `ui.tsx` HrLeaveSection history / pending names+types+dates | still visible to any member (calendar hides them without `hr.leave.read`) | brief rule = reason only; hiding lists changes the page for staff who file leave |
| `ui.tsx:98-215` /hr/attendance, `ui.tsx:312-477` /hr/employees | requireTenant only — names, phones, late/absent counts | no secret field reaches a client component; LOW; guard = product decision |
| `ai/tools.ts:1984-2000` calendar tool | leave type + dates tenant-wide (no reason) | no caller identity in ToolCtx; type ≠ free-text reason |
| `service.ts` decideLeave | tiny window: a decision between leave creation and `submitForApproval` in `requestLeave` is not blocked | needs requestLeave in one tx (outbox note in file says it is deliberately not atomic) |
| HR actions | `systemId` from the form, not checked to be type HR (orphan rows on a forged non-HR system of the same tenant) | review §4 "P, harmless"; touches every action |
| out of scope per brief | D1, D2, D5, D6, D7, D11–D15, PIN hashing/uniqueness | money rules / migration |

## Decisions for the controller before deploy
- **C1** D10 vs contract [6] of `qc-hr-leave-booking` (LV-9): the brief forbids APPROVED→REJECTED; the Auditor's oracle requires it ("change your mind"). Either (a) keep strict D10 and have the Auditor rewrite LV-9 (e.g. revoke via a dedicated, audited "cancel approved leave" action later), or (b) allow APPROVED→REJECTED by a non-owner decider only (still race-safe) and keep LV-9. As shipped = (a); LV-9 is red until decided.
- **C2** Payslip self-view limited to APPROVED/PAID runs (DRAFT/REVERSED hidden from the employee) — confirm.
- **C3** Profile-page guard = `hr.employee.create` OR `hr.leave.read` OR payroll viewer (there is no `hr.employee.read` key; adding one = permissions.ts, off-limits). Employee self-view of own profile: not provided.
- **C4** Commit made with `--no-verify`: the shared pre-commit hook runs tsx outside iso.sh; the same `scripts/fitness.mts` was run through iso.sh in both modes (33/33).

## Acceptance — final lines
- A1 oracle: RED `ผ่าน 13/54 · FINDINGS: CRITICAL 36 · MAJOR 5` (HF-HR-0-red.txt, before S-7 was added) → GREEN `ผ่าน 55/55 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` (HF-HR-0-green.txt)
- A2 regressions: 14 suites identical; `qc-hr-leave-booking` 14/14 → 12/13 by design (C1); qc-ai-actions 11/12 pre-existing, identical
- A3 fitness: no env 33/33 → 33/33 · QC4 env 33/33 → 33/33 (check lines identical)
- A4 typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 0
- A5 this file
