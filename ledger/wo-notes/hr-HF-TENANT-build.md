# HF-TENANT — build (17 Nov 2026)

Branch `hotfix/hr-hf-tenant` · fix commit **9f05a5fea** (parent 6a3e0c34f oracle · base origin/main bda823d22) · **not pushed** · no prod, no deploy · DB = `hf_tenant` only (via `scripts/qc-hf.sh`).
Oracle `scripts/qc-hr-hf-tenant.mts` and `scripts/qc-hf.sh` not edited.

## Diff (line numbers = after the fix)
| file | change |
|---|---|
| `src/lib/modules/hr/hr-target.ts` | new · `git show session/hr:…` byte copy · `git hash-object` = `d033fd775909d57ccf5e4874ae3069833b73ac21` (= oracle's V2 blob) · no `"use server"` · not re-exported |
| `src/lib/modules/hr/payroll-actions.ts` | :22 import · :47 P1 setSalaryProfile (`{ employeeId }`, `return;`) · :72 P2 createPayrollRun (`return;`) · :86 P3 approve · :108 P4 reverse · :130 P5 markPaid (system only, `return;` — own system + unknown runId still writes the refusal audit, C2) · :178 P6 requestAdjustment (`{ status: "error", message: "ไม่พบพนักงาน" }` — controller ruling: plain literal, not via `adjustmentReplyForViewer`) · :217 P7 decide / :248 P8 cancel (`{ ok: false, reason: "ไม่พบรายการ" }`) |
| `src/lib/modules/hr/actions.ts` | :25 import · `return;` guards (system only) at :52 createEmployee · :71 clock · :85 updateEmployee · :101 removeEmployee · :112 restoreEmployee · :243 requestLeave |
| `prisma/schema/payroll.prisma` | :68 `@@unique([tenantId, systemId, employeeId])` · :92 `@@unique([tenantId, systemId, periodKey])` |
| `prisma/migrations/20261229000000_hr_hf_tenant_unique_keys/migration.sql` | brief §3 SQL, extracted programmatically from the brief's code block (verbatim) |

Every guard sits right after the action's existing input-validation `return` and is the first `await` after `requireTenant()` (T7). Each guard line carries a trailing `// HR HF-TENANT ▸ … ◂` comment (V2 uses `// HR PRIV-3 ▸ …` — merge back: take V2 side, as the brief says).
No code uses the Prisma compound keys `systemId_employeeId` / `systemId_periodKey` of these two models (the only `systemId_periodKey` hit is `accountPeriod` in `account/gl.ts`, unrelated); payroll.ts uses find→update/create.

## Results (all on `hf_tenant` through `iso.sh` + `qc-hf.sh` [+ `with-gate-lock.sh`])
- `--static`: T7 ✅
- Before/after: `--mig-seed` (tenants `qc-hr-hft-mig-mwkz1l53-*`) → `prisma migrate deploy` ("209 migrations found · Applying 20261229000000_hr_hf_tenant_unique_keys · applied") → `--mig-check` **6/6** (M1–M5 + Z1, mig tenants swept).
- Full oracle `QC_FORCE=1`: **17/17**, exit 0, Z1 residue 0.
- `_prisma_migrations` row: `20261229000000_hr_hf_tenant_unique_keys` started 17:33:53.846Z, finished 17:33:53.948Z, `applied_steps_count = 1`, logs NULL, not rolled back · 209 rows total. Indexes now: `HrSalaryProfile_tenantId_systemId_employeeId_key`, `HrPayrollRun_tenantId_systemId_periodKey_key` (old names gone).
- main's HR suites on hf_tenant: qc-hr 9/9 · qc-hr-attendance 31/31 · qc-hr-leave-booking 14/14 · qc-hr-roster 24/24 · qc-hr-payadjust 27/27 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hf-hr-privacy **193/194** (exit 0) — L-5 MAJOR: AI tool `pending_leaves` returns the employee name masked (`เพื่อนร่วมงาน •••••…77`) where the check expects the plain name. That path is `hr.requestLeave` (service) + `tools.runTool("pending_leaves")`; it touches none of the changed files (actions.ts / payroll-actions.ts are not called) and the index change cannot affect it → judged pre-existing on main. **Not verified by a baseline run on unfixed main.** None of these suites sweep their fixtures through the oracle's sweep (hf_tenant now holds their leftover QC tenants; the oracle's own Z1 counts only `qc-hr-hft-*`).
- `pnpm drift` (hf_tenant): exit 2, only `DormUtilityRate` "Removed unique index (unitId, buildingId, kind, periodKey)" = known baseline. No Hr* table.
- `pnpm fitness` 53/53 · `fitness-pos.mts` 8/8.
- typecheck: `ISO_MEM=14000M NODE_OPTIONS=--max-old-space-size=12288 bash scripts/iso.sh pnpm exec tsc --noEmit` exit 0 (MemAvailable 24.6 GB at start).
- Commit through `iso.sh git commit` with the normal pre-commit hook (fitness ✅) — no `--no-verify`.

## Unverified / notes
- Transaction: Prisma recorded the file as one step (`applied_steps_count = 1`, ~100 ms). Prisma's schema engine sends the whole script as one simple-query batch, which PostgreSQL runs as one implicit transaction (no explicit BEGIN/COMMIT in the file; `CREATE INDEX` without `CONCURRENTLY` is allowed in it). This is inferred from Prisma behaviour, not observed (no failure-injection test). `SET lock_timeout` not added (out of scope, brief §3).
- Migration idempotency on a V2 database (V2 indexes already present) not exercised here — only main's state.
- L-5 baseline on unfixed main not run (see above).
- Same-tenant behaviour: only intended change is C3 (own system + non-existent employee on setSalaryProfile is now refused). Covered by C1/C2/C3 + the 8 existing suites.

## Round 2 (after review F1/F2/F6 · oracle d33cee12c · 20 checks)
Only `src/lib/modules/hr/actions.ts` changed; `hr-target.ts` untouched (blob still `d033fd77…`); oracle not edited. Guards follow the oracle notes' round-2 table verbatim (line numbers after the fix):
| action | line | ids | refusal |
|---|---|---|---|
| clockAction | :71 (edited) | `{ employeeId }` | `return;` |
| saveEmployeeProfileAction | :138 (after `assertHrCan`, before service validation) | `{ employeeId }` | `{ status: "error", message: "ไม่พบพนักงาน" }` |
| addEmployeeDocAction | :158 | `{ employeeId }` | `return;` |
| removeEmployeeDocAction | :176 | system only | `return;` |
| setPinAction | :187 (after `assertHrCan`, before PIN validation) | `{ employeeId }` | `{ status: "error", message: "ไม่พบพนักงาน" }` |
| kioskClockAction | :212 (after PIN-format check, **before `checkRateLimit`**) | `{ employeeId }` | `{ status: "error", message: "ไม่พบพนักงาน" }` |
| requestLeaveAction | :248 (edited) | `{ employeeId }` | `return;` |
| decideLeaveAction | :268 | system only | `return;` |
| bulkDecideLeaveAction | :297 | system only | `{ status: "error", message: "ไม่พบระบบ" }` |
| setWorkScheduleAction | :313 | `{ employeeId }` | `return;` |

Results (hf_tenant via iso.sh + qc-hf.sh + with-gate-lock.sh):
- `--static` T7 ✅ (22 actions) · full oracle `QC_FORCE=1` **20/20**, exit 0, Z1 residue 0.
- main's HR suites: qc-hr 9/9 · qc-hr-attendance 31/31 · qc-hr-leave-booking 14/14 · qc-hr-roster 24/24 · qc-hr-payadjust 27/27 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hf-hr-privacy 193/194 (only L-5, confirmed pre-existing by the controller: AI tool masks 9+ digit runs, fixture name has 13 digits).
- fitness 53/53 · fitness-pos 8/8 · typecheck (iso.sh, ISO_MEM=14000M, heap 12288, MemAvailable 25.7 GB) exit 0.

UI caller check (legit user regression):
- `clockAction` (ui.tsx:133/139) · `setWorkScheduleAction` (ui.tsx:370) · `addEmployeeDocAction`/`removeEmployeeDocAction` (employees/[employeeId]/page.tsx:92/101): plain `<form action>`, hidden systemId = page's system, employeeId = an employee listed from that system → guard passes; void return unchanged in shape.
- `requestLeaveAction` (ui.tsx:246): employee `<select>` filled from the same system's employees → passes.
- `saveEmployeeProfileAction` (EmployeeProfileForm.tsx:34), `setPinAction` (PinField.tsx:18), `kioskClockAction` (KioskClock.tsx:13), `bulkDecideLeaveAction` (BulkLeaveApprovals.tsx:12): `useActionState` wrappers; the guard refusal is a state object of the action's own type (`status: "error"`), never `undefined` → no client break.
- `decideLeaveAction`: no UI caller in `src` (only exported).
- Inactive (soft-removed) employees: `HrEmployee` scope is `sys()` with no active/deleted filter, so `hrTargetOwned(..., { employeeId })` still finds them → profile/doc/schedule pages for removed employees keep working.
- Not driven in a browser (static read of callers + oracle C4/C1 which drive the actions as owner/staff A).

## Round 3 (ruling R-R2-1 · oracle 991dbcc15 · 21 checks)
Five lines inserted, each directly after `const auth = await requireTenant();` (before `assertHrCan` / `assertRequestAdjust`, as ruled), text exactly as the oracle table, with a trailing `// HR HF-TENANT r3 ▸ … ◂` comment:
| file:line (after fix) | action | check | refusal |
|---|---|---|---|
| `payroll-actions.ts:171` | requestAdjustmentAction | `typeof systemId !== "string"` | `{ status: "error", message: "ไม่พบพนักงาน" }` |
| `actions.ts:137` | saveEmployeeProfileAction | systemId or employeeId not string | same |
| `actions.ts:187` | setPinAction | systemId or employeeId not string | same |
| `actions.ts:209` | kioskClockAction | `typeof systemId !== "string"` | same |
| `actions.ts:292` | bulkDecideLeaveAction | `typeof systemId !== "string"` | `{ status: "error", message: "ไม่พบระบบ" }` |
`hr-target.ts` untouched (blob `d033fd77…`); oracle not edited. UI callers unchanged in effect: all five are `useActionState` wrappers that bind string ids (round-2 caller check), so legit users never hit the new line; the refusal is a state object of each action's type.

Results (hf_tenant via iso.sh + qc-hf.sh + with-gate-lock.sh): `--static` T7 ✅ · full oracle `QC_FORCE=1` **21/21**, exit 0, Z1 residue 0 · qc-hr 9/9 · qc-hr-attendance 31/31 · qc-hr-leave-booking 14/14 · qc-hr-roster 24/24 · qc-hr-payadjust 27/27 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hf-hr-privacy 193/194 (L-5 only, pre-existing) · fitness 53/53 · fitness-pos 8/8 · typecheck (iso.sh, ISO_MEM=14000M, heap 12288, MemAvailable 25.4 GB) exit 0.
