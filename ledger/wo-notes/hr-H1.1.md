# WO H1.1 — Org axis + lifecycle + pay type (HrEmployee.unitId · HrEmployeeUnit · employmentStatus · probation/contract dates · HrSalaryProfile.payType · hrScopeOf branch filter · assertCan with unitId · backfill)

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h1.1` @25bc6c84 (= session/hr 323a01e5 + H1.1 oracle 9b785b73 + ORACLE-EDIT S8.4 25bc6c84) · 22 Oct 2026 · controller: Fable · builder: this lane
> Contract: brief `ledger/hr-briefs/hr-brief-H1.1.md` R1–R11 + "Controller rulings on oracle flags" 1–13 · `hr-brief-COMMON.md`
> Oracle: `scripts/qc-hr-h1.1.mts` (70 checks · not edited by the builder) · green run `ledger/wo-notes/hr-H1.1-green.txt`
> DB: QC4 only — `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<file>.mts`
> Base check: `git merge-base --is-ancestor afcb9bc3 HEAD` → ok (session/hr ancestry)

## 0. Checkpoint
- done: step 0 (generate · oracle forced on the untouched base = `BASE-EXPECTATION 70/70 as registered` · 14/70) · migration on QC4 · R1–R10 · seed ×2 · oracle forced ×2 + unforced ×1 = 70/70 · regressions · fitness both modes · typecheck ×1
- next (controller): rule D-1…D-5 (§9) · CONTROLLER-RUN screenshots `visual-hr.mts 1.1 --user owner|manager-branch|staff` · reviewer + hunter
- last command: `qc-hr-h1.1` unforced → `===== qc-hr-h1.1 ===== passed 70/70` · `RESIDUE none (tenants=3 users=9)`

## 1. Files touched
| file | what | R | hot? |
|---|---|---|---|
| `prisma/schema/hr.prisma` | HrEmployee `unitId String?` · `employmentStatus HrEmploymentStatus?` · `probationEndAt`/`contractEndAt DateTime? @db.Date` · `units HrEmployeeUnit[]` · 2 `@@index` · enum `HrEmploymentStatus` · model `HrEmployeeUnit` (FK → HrEmployee Cascade · no FK to BusinessUnit) · `employmentType` deprecated comment | R1 | Mig |
| `prisma/schema/payroll.prisma` | enum `HrPayType` · `payType @default(MONTHLY)` · `dailyRateSatang`/`hourlyRateSatang Int?` | R1 | Mig |
| `prisma/migrations/20261204000000_hr_org_axis/migration.sql` | §2 | R1 | — |
| `src/lib/core/scope.ts` | `HrEmployeeUnit: sys()` (ruling 13) | R1 | core |
| `src/lib/modules/hr/scope.ts` (new) | `hrScopeOf` · `unitWhere` (pure, HrEmployee: home ∈ list OR borrowing covering today) · `scopedLeaveWhere` (borrowing covers `fromDate`) · `scopedAttendanceWhere` (borrowing covers the Bangkok day of `at`) · `scopedEmployeeIds` · `unitTargetOf` (write target) · `homeUnitTarget` (create/move) · `employeeInScope` · `leaveTargetOf` · `employeeIdOf{Doc,Adjustment}` · `unitNamesOf` · `unitsForScope` · fixed texts · `HrBranchError` | R3 | — |
| `src/lib/modules/hr/service.ts` | `listEmployees/listRemovedEmployees(ctx,take,scope?)` · `listLeaves/pendingLeaves(ctx,take,scope?)` (scope = H0.7 row scope and/or `{unitIds}`; own rows bypass branch) · `listAttendance(ctx,take,scope?)` · `kioskRoster(ctx,scope?)` · `leaveListScopeOf` · `leaveBranchRefusal` · `createWithoutUnitRefusal` · createEmployee `unitId` + status ACTIVE · profile input `unitId/employmentStatus/probationEndAt/contractEndAt` · `setEmployeeActive` lifecycle (R7) · `addEmployeeBorrowing`/`endEmployeeBorrowing` (Q3 service only) | R4 R7 | — |
| `src/lib/modules/hr/privacy.ts` · `privacy-shared.ts` | profile loader: branch filter (`employeeInScope`) on top of D3/D4 · DTO `unitId/unitName/employmentStatus/probationEndAt/contractEndAt` · `payType` only for `canViewPayroll` · `borrowings` next to (not in) the profile DTO · payslip: branch filter for payroll viewers (own slip path unchanged) · `leaveItemsForViewer` = row + branch scope · form → input new fields · `EMPLOYEE_PAYROLL_FIELDS = ["payType"]` · `EmployeeBorrowingDto` · `profileFormId` | R4 R7 | — |
| `src/lib/modules/hr/payroll.ts` | `setSalaryProfile` payType/rates (validated, `PayrollInputError`; omitted = unchanged) · `listAdjustments(ctx,periodKey,take,scope?)` (now async) · `buildRunRows`: one extra query refuses DAILY/HOURLY in-run profiles (`PAY_TYPE_NOT_SUPPORTED_TH`) — `allProfiles` select untouched · `recomputeDraftRun` maps that refusal to `{ok:false}` · computeItem / markPaid / CRM block untouched | R6 | — |
| `src/lib/modules/hr/pin.ts` | `verifyPin` honours `unitId`: home = unit OR open borrowing today OR home null (ruling 6) ⇒ ok · else `failed()` (wrong text, bucket kept) | R9 | — |
| `src/lib/modules/hr/index.ts` | comment line only (unitId now effective) | R9 | — |
| `src/lib/modules/hr/actions.ts` | `assertHrCan(auth, action, unitId?)` forwards `unitId` · every call either passes the target unit (`hrTarget` = DB row: home unit; dated rows = borrowed unit on the date) or is the marked tenant-level key pre-check (`// ทุกสาขา: …`) · create: `hrHomeTarget(form unitId)` · profile: home check + move check (ruling 4) · decide/bulk: leave's employee @ fromDate · requestLeave on behalf @ fromDate · clock/kiosk @ today (kiosk after the H0.3 gates) · docs: owner of the doc from DB · `branchText` helper | R5 | — |
| `src/lib/modules/hr/payroll-actions.ts` | same helper shape · salary profile + adjustment request/decide/cancel/move = target unit · run actions = `ทุกสาขา` (HQ20 · ruling 8) | R5 R6 | — |
| `src/lib/ai/tools.ts` | `pending_leaves` uses `leaveListScopeOf` (row + branch) | R4 | yes (marked) |
| `src/lib/ai/proposals.ts` | `hr_decide_leave` → `leaveBranchRefusal` · `hr_create_employee` → branch-scoped actors refused (no unit in payload) | R5 | yes (marked) |
| `src/lib/modules/hr/ui.tsx` | register: branch chips (`?unit=`), unit column, status badge, "ยังไม่ระบุสาขาประจำ" prompt, create-form unit select · attendance/leave/kiosk/hub readers scoped | R8 | — |
| `src/lib/modules/hr/EmployeeProfileForm.tsx` · `src/app/app/sys/[id]/hr/employees/page.tsx` · `…/[employeeId]/page.tsx` | status + probation/contract fields in the form · unit select rendered on the page with `form={profileFormId(id)}` (keeps HF-HR-0 S-2's exact `<EmployeeProfileForm …/>` tag) · `?unit=` passed to the register | R8 | — |
| `scripts/hr-ui-inventory.json` | +8 rows (`hr-register-branch-filter` · `-branch-chip-*` · `-unit-prompt` · `-unit-*` · `-status-*` · `-create-unit` · `hr-profile-unit` · `hr-profile-employment-status`) | R8 | — |
| `scripts/visual-hr.mts` | `SPECS["1.1"]` = register-branches (owner, staff) · register-branch-manager (manager-branch) · profile-unit (owner, manager-branch) — CONTROLLER-RUN | R8 | — |
| `scripts/hr-backfill-units.mts` (new) | R2 + ruling 12 | R2 | — |
| `scripts/seed-hr-qc.mts` · `scripts/hr-qc-env.mts` | home units · jay → huahin open borrowing (service) · statuses · user `manager-branch` (MANAGER, unitAccess [huahin]) · checks U1–U3 · `hrEmployeeUnit` in HR_TABLES/DELETE_ORDER · expected.json `org` block | R10 | — |

## 2. Migration / seed / backfill
- QC4 `_prisma_migrations` (≥ 202612): hr_pin_hash · hr_payroll_run_live_unique · hr_link_unique_requester + 22 POS folders (2026120x–1219 `pos_*`, not on this branch — expected, untouched). Pre-check: new columns 0 · enums 0 · `HrEmployeeUnit` 0.
- `migrate diff` (base schema → branch schema) = 10 statements, read; + 1 raw partial unique ⇒ **11 statements**: 2× CREATE TYPE · ALTER TABLE HrEmployee (4 ADD COLUMN, all NULL) · ALTER TABLE HrSalaryProfile (`payType` NOT NULL DEFAULT 'MONTHLY' + 2 INTEGER NULL) · CREATE TABLE HrEmployeeUnit · 4 CREATE INDEX · FK HrEmployeeUnit.employeeId → HrEmployee ON DELETE CASCADE · `CREATE UNIQUE INDEX "HrEmployeeUnit_employeeId_unitId_open_key" … WHERE "toDate" IS NULL`. Header carries the pre-check SQL. No DROP/RENAME/ALTER COLUMN, no FK to BusinessUnit.
- Applied: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` → "Applying migration `20261204000000_hr_org_axis`" exit 0 · then `prisma generate` (own node_modules).
- Seed ×2: `===== seed-hr-qc ===== ผ่าน 26/26` both · counts md5 identical. **Diff for the controller (counts):** Membership 7→8 · User(qc emails) 7→8 · new `HrEmployeeUnit: 1`; every other table unchanged. `hr-expected.json` gains `org: {<key>: {unit, borrowedTo?, status}}` and `users["manager-branch"]` (file not committed).
- Backfill on QC4 `qc-hr-v2` (2 units): dry-run and `--apply` both `{"tenant":"qc-hr-v2","units":2,"assigned":0,"skipped":14,"statusSet":0,"unassigned":0}` (seed already sets units/statuses). Oracle S2/X6 cover 1-unit / 2-unit tenants, replay = 0.

## 3. Refusal texts (fixed Thai, no names/ids)
| where | text |
|---|---|
| out-of-branch (save/edit/remove/restore/pin/clock/kiosk/decide/schedule/docs/salary/adjustments · create/move into another unit) | พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ |
| unassigned target, branch-scoped actor | พนักงานคนนี้ยังไม่ระบุสาขาประจำ — ผู้ดูแลทุกสาขาเป็นผู้จัดการ |
| create/move without a unit, branch-scoped actor (also AI create) | เลือกสาขาประจำของพนักงานก่อน — คุณจัดการได้เฉพาะสาขาของคุณ |
| unit id not a BusinessUnit of the tenant | ไม่พบสาขานี้ในร้าน — กรุณาเลือกสาขาใหม่ |
| run with DAILY/HOURLY | ยังไม่รองรับค่าจ้างรายวัน/รายชั่วโมงในรอบจ่าย — รอ H3.4 |
| setSalaryProfile | รูปแบบค่าจ้างไม่ถูกต้อง — เลือกรายเดือน รายวัน หรือรายชั่วโมง · ค่าจ้างรายวันต้องเป็นจำนวนเต็มสตางค์ที่มากกว่า 0 · ค่าจ้างรายชั่วโมงต้องเป็นจำนวนเต็มสตางค์ที่มากกว่า 0 |
| profile dates | วันครบทดลองงานไม่ถูกต้อง · วันสิ้นสุดสัญญาไม่ถูกต้อง |
| borrowing service | ไม่พบสาขานี้ในร้าน… · สาขานี้เป็นสาขาประจำของพนักงานอยู่แล้ว · วันที่ยืมตัวไม่ถูกต้อง · พนักงานคนนี้ยืมตัวไปสาขานี้อยู่แล้ว — ปิดรายการเดิมก่อน |
| AI decide/create without the confirmer's membership | ต้องรู้สิทธิ์ของผู้กดยืนยันก่อนจึงจะตัดสินใบลาได้ / …เพิ่มพนักงานได้ |
| verifyPin unit mismatch | PIN ไม่ถูกต้อง (same bytes, counted) |

## 5. Regression (after = branch head; base numbers = registered/known green)
| suite | after |
|---|---|
| `qc-hr-h1.1` forced ×2 · unforced ×1 | exit 0 · 70/70 · 70/70 · 70/70 · residue none |
| `qc-hf-hr-privacy` | exit 1 · **184/194** — P-2 Pr-2 Pr-3 Pr-8 Pr-9 Pr-11 L-1 V-2 (D-1) · Pr-10 (D-2) · V-4 (D-3). Positive control ([] ⇒ all-branch, temp, reverted): 192/194 (Pr-10, V-4 only) |
| `qc-hr-h0.7` | exit 1 · **70/74** — S1.8 S9.3 S9.5 S9.8 (D-1). Positive control: 74/74 |
| `qc-hr-h0.3` | exit 1 · **31/37** — S1.3 S1.6 S2.3 S3.1 S3.3 S4.4 (D-1). Positive control: 37/37 |
| `qc-hr-h0.1` | exit 1 · 66/67 — S4.2 payroll.prisma SCHEMA_SHA freeze (D-4) |
| `qc-hr-h0.2` · `qc-hr-h0.5` · `qc-hr-h0.6` (QC_H06_BASE=d350c26c…) | exit 0 · 58/58 · 71/71 · 55/55 |
| `qc-crm-c3.3` · `qc-approval-wiring` · `qc-hr-attendance` · `qc-hr` | exit 0 · 90/90 · 7/7 · 31/31 · 9/9 |
| `seed-hr-qc` ×2 | 26/26 ×2 · counts identical |
| `pnpm fitness` with env / `env -u DATABASE_URL -u DIRECT_URL` | 42/42 · 42/42 |
| `scripts/fitness-hr.mts` with env / without | 7/7 · 7/7 |
| typecheck (1 run, gate open: MemAvailable 10101 MB, no build/tsc unit) | exit 2 — only `scripts/qc-hr-h1.1.mts(355,71): TS1501` (oracle regex `s` flag, D-5) · product code clean · tsbuildinfo 16:40 → 17:41 |
- not run this lane (brief §4 list, controller to schedule): qc-crm-c0.3 · qc-payroll · qc-hr-payadjust · qc-hr-roster · qc-hr-leave-booking · qc-payroll-reverse · qc-booking-hours-hr · qc-ai-tools · qc-ai-proposals (AI hunks touched) · visual-hr (CONTROLLER-RUN).

## 7. Screenshots (CONTROLLER-RUN) — `visual-hr.mts 1.1 --dry --user manager-branch` = 2 pages × 3 viewports = 6 shots; owner 6; staff 3.

## 8. Round 2 (after controller rulings · ORACLE-EDITs 1e55819d)
- All five disputes were accepted. The ORACLE-EDITs (D-1…D-5) were committed by the controller (1e55819d) and the builder did not edit any oracle.
- **D-1 ruling (brief amendment, binding):** `unitAccess` `[]` or malformed means ยังไม่กำหนดสาขา, which is tenant-wide (`*`) for the HR scope. That is today's behaviour, so nobody loses access at deploy. A branch restriction applies only when `unitAccess` is a non-empty list without `*`. Null-unit employees stay visible only to all-branch viewers (OWNER · `*` · `[]`). Built as one marked hunk in `hrScopeOf` (`src/lib/modules/hr/scope.ts`) in commit 8fd7ccb0. The positive-control hack left no trace; it was reverted earlier and git is clean.
- Round-2 results (head 8fd7ccb0). Oracle forced ×2 and unforced ×1: 70/70 each, residue none. Regressions:
  - privacy 194/194 · h0.7 74/74 · h0.3 37/37 · h0.1 67/67
  - crm-c0.3 88/88 · payroll 19/19 · payadjust 27/27 · roster 24/24 · leave-booking 14/14 · payroll-reverse 14/14 · booking-hours-hr 13/13 · ai-tools 18/18 · ai-proposals 16/16
  - fitness 42/42 and fitness-hr 7/7 in both modes
  - Typecheck exit 2. The single error is in the oracle, from the controller's Pr-10 edit: `scripts/qc-hf-hr-privacy.mts(260,125) TS2551`, because the `shared` cast at L60–63 lacks `EMPLOYEE_PAYROLL_FIELDS?: readonly string[]`. That needs an ORACLE-EDIT. Product code has 0 errors.
- The §5 results and D-1 text below are round 1, kept for history. Round-2 results are in the final report and in `hr-H1.1-green.txt`.

## 9. Disputes / ORACLE-EDIT requests / decisions
- **D-1 (BLOCKER-level for prod, ruling 3 vs regressions).** STAFF/MANAGER `unitAccess []` ⇒ 0 scoped rows. `[]` is the repo default for every invited STAFF (`src/lib/staff/service.ts:434`), and the regression fixtures use it: privacy (hrMgr/hrStaff/wild = STAFF []), h0.7 (STAFF []), h0.3 (STAFF [] with hr.employee.create / kiosk). Built exactly per ruling ⇒ those checks go red; positive control proves no other cause. **In prod every STAFF HR user with [] loses all HR rows/edits on deploy** (owner/`*` unaffected). Options: (a) keep ruling 3 → ORACLE-EDIT the fixtures to `["*"]` (privacy L163–187/1068 · h0.7 L420/L434 · h0.3 L370) + a prod step before/at deploy: owners (or a one-off script) set `unitAccess ["*"]` (or real units) for STAFF memberships holding hr.* keys; (b) re-rule `[]` = tenant-wide for HR (legacy) → ORACLE-EDIT qc-hr-h1.1 S3.2 (`mgrNone`/`malformed` ⇒ "*") — then all three suites are green.
- **D-2 Pr-10 (privacy).** `payType` is a new key for payroll viewers (R7 · S7.4/S7.5) but outside `EMPLOYEE_PROFILE_FIELDS ∪ EMPLOYEE_SENSITIVE_FIELDS` (S7.8 forbids both). Exported `EMPLOYEE_PAYROLL_FIELDS = ["payType"]` — ORACLE-EDIT Pr-10: whitelist += `shared.EMPLOYEE_PAYROLL_FIELDS`.
- **D-3 V-4 (privacy).** MANAGER `[unit-elsewhere]` on a null-unit employee ⇒ profile null (ruling 3: null units only for all-branch). The check's own title says "HR ไม่มีแกนสาขา — บันทึกเป็นข้อค้นพบ" ⇒ ORACLE-EDIT V-4: expect `null`.
- **D-4 h0.1 S4.2.** `SCHEMA_SHA` freezes `prisma/schema/payroll.prisma`; R1 must edit it. Re-take: `2b36269c76742aa3ebdf52297e6c1b0e3e0767d3a3061bd8de86ba2c30dee188` (same procedure as after H0.6).
- **D-5 typecheck.** `qc-hr-h1.1.mts:355` `/assertCan\([^;]*unitId/s` → drop `s` (`[^;]` already spans newlines; same fix as H0.7 c5f06fb3).
- Decisions (controller to confirm): run-level payroll actions stay system-wide (ruling 8) — a branch-scoped payroll viewer with hr.payroll.create/approve can still create/approve/reverse/pay a whole-system run and sees system totals (hunter note) · own rows (linked employee) bypass the branch filter (self-service) · payslip branch filter = employee-level today, not the run period · `employmentStatus` from the form is data only (does not toggle `active`) · new employees get ACTIVE · HrHub counters now use the same scopes as the lists · HR UI has no `src/messages/{th,en}.json` hr keys (only `th/common.json` exists) ⇒ literals in ui.tsx like the rest of the module · verifyPin legacy plain-PIN path upgrades the hash before the unit check (no leak; same reply) · kiosk branch check after the H0.3 gates, setPin branch check before the hr-setpin gate.
- Debts: normalising malformed `unitAccess` (a non-array or junk entries, treated as tenant-wide here) belongs in a core WO, since `staff/service.ts` and rbac own it · borrowing UI (H2.x) · payType in the salary form (H3.4) · en strings · no outbox events added (X9 N-A).

## 10. Prod runbook
1. Deploy with migration `20261204000000_hr_org_axis` (`migrate deploy`; pre-check SQL in the file header; after: `SELECT count(*) FROM "HrSalaryProfile" WHERE "payType" <> 'MONTHLY'` = 0).
2. Backfill: `HR_BACKFILL_PROD=1 HR_BACKFILL_ENV_FILE=<prod env> pnpm exec tsx scripts/hr-backfill-units.mts --all` (dry-run, read counts) → same with `--apply` → re-run `--apply` = 0/0 (idempotent).
3. (D-1 ruled) No membership change is needed at deploy, because `[]` keeps tenant-wide HR access. **Owners restrict a branch manager by setting `unitAccess` explicitly** (a non-empty list of units, without `*`) in staff settings. From then on, that manager sees and manages only those units plus employees borrowed into them.
4. Owners of multi-unit tenants assign home units (register prompt "ยังไม่ระบุสาขาประจำ N คน" → profile → สาขาประจำ); until then those employees are visible only to OWNER/`*` and verifyPin treats them tenant-wide (ruling 6).

## 11. QC4 restored / temp data
- Oracle residue none ×3 · seed re-run ×2 (qc-hr-v2 rebuilt) · temp precheck script deleted · positive-control edits of `hr/scope.ts` reverted (git clean) · nothing of this lane running.
