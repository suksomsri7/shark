# REVIEW — HR V2 design vs. code as-built (SURVEY-V2 · HR lane · read-only)

> 1 Oct 2026 · worktree `/root/projects/shark-pos-b` · base `28803482` (session/pos) · surveyor: Opus 5.5
> Method: read code only (grep/sed/cat); every fact = `file:line`. **C** = CONFIRMED (traced in code) · **P** = PLAUSIBLE (inferred / external law, not provable from code).
> Scope: `src/lib/modules/hr/**` (14 files, 3,901 lines — matches DESIGN §1), `prisma/schema/{hr,payroll}.prisma`, pages `src/app/app/sys/[id]/hr/*` + `src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]`, AI tools/proposals, approval effects, outbox consumers, booking/CRM/staff/account touch-points. Mockups read: 02, 06, 07, 08 (text of `.body.html`; no PNG opened).

Sections: 1 names · 2 data model + writers · 3 money/quantity integrity · 4 tenancy/authz · 5 integration · 6 conflicts + rulings · 7 oracles · 8 live defects.

---

## 1. Name corrections (DESIGN-HR-V2 → code today)
Legend: **E** exists as named · **A** exists under another name · **N** new (fine) · **X** contradicts code. All rows **C** unless marked.

### 1.1 Models / enums / fields
| name in design | where | status | code reality |
|---|---|---|---|
| `HrEmployee` "35 ฟิลด์ (+partyId · linkedUserId · pinCode)" | §3 | E | `hr.prisma:66-120` (37 scalars) |
| `HrEmployeeDoc` `HrAttendance`(IN/OUT · judgement) `HrLeave`(4 ชนิด) `HrWorkSchedule` | §3 | E | `hr.prisma:124,140,157,179`; judgement enum `ON_TIME/LATE/DAY_OFF/NO_SCHEDULE` `:25-30` (no ABSENT/EARLY_OUT/OT) |
| `HrSalaryProfile` `HrPayAdjustment`(6 kind) `HrPayrollRun`(DRAFT/APPROVED/PAID/REVERSED) `HrPayrollItem` | §3 | E | `payroll.prisma:55,28,72,96`; kinds `:12-19` |
| `HrPayrollRun` **+ `journalEntryId`** (listed as additive) | §7 | **X** | already exists `payroll.prisma:86`, written at approve `payroll.ts:431` |
| `HrPayrollItem` + "breakdown json" | §7 | A | `snapshotJson` `payroll.prisma:111` (base/add/deduct/adjustments[]/deductions/computedAt `payroll.ts:268-277`) |
| `HrPayrollRun` `bankFileUrl/filingFiles` | §7 | N | – |
| `HrLeaveType` **as a model** ("ประเภทลาตั้งได้") | §7 | **X** | name taken by the enum `HrLeaveType{SICK,PERSONAL,VACATION,OTHER}` `hr.prisma:10-15` used by `HrLeave.type` `:163` — new model needs another name (e.g. `HrLeavePolicy`) or an enum→FK migration |
| `HrLeave` + halfDay/hours/attachment | §7 | N | `HrLeave` has only type/from/to/status/reason/decidedById `hr.prisma:157-173` |
| `HrEmployee` + `employmentStatus` / `probationEndAt` / `contractEndAt` / `unitId` | §7 | A/N | `employmentType HrEmploymentType{FULL_TIME,PART_TIME,CONTRACT,DAILY,PROBATION}` `hr.prisma:47-53,87` mixes "type" and "status"; `active Boolean` `:75` + `endDate` `:89` = status; probation/contract end + `unitId` N |
| `HrBranch` "(หรือใช้ BusinessUnit)" | §7 | N | **no HR model has `unitId`**; all HR+payroll models are `sys()` scoped `src/lib/core/scope.ts:121-125,178-181` |
| `HrShift` `HrRosterEntry` `HrShiftSwapRequest` `HrLeaveBalance` `HrHoliday` `HrTimeCorrection` `HrOtRequest` `HrWorkEntry` `HrLawTable` `HrReviewNote` `HrOnboardingTask` | §7 | N | none in `prisma/schema/**` |
| `HrAttendance` + lat/lng/photo/device/source | §7 | N | `hr.prisma:140-155` |
| `HrWorkSchedule` = "แม่แบบ" | §7 | E (semantics) | one row per `(employeeId, weekday)` `@@unique` `hr.prisma:194`; `endMin > startMin` enforced `service.ts:582` ⇒ **no overnight** |
| PIN "PosStaffPin (hash)" / `HrEmployee.pinCode` | C-8 | **X** | `pinCode String?` plain text `hr.prisma:73`; written raw `service.ts:45,336`; compared with `!==` `service.ts:364` |
| Membership role STAFF "หน้า ของฉัน" | §1 #2 | E (role) / N (page) | `Role{OWNER,MANAGER,STAFF}` `core.prisma:120-124`; employee↔user link `linkedUserId` written by `staff/service.ts:412-415` (grant access); no "my" page |
| SSO config "ตารางกฎหมายมีวันที่มีผล" | §1 #5 | N | constants in code `payroll-rules.ts:22-24,36-45,65-69`; `SsoConfig` param exists `:12-16` but **no caller passes it** (`payroll.ts:248`) |

### 1.2 Functions / services
| name in design | status | code reality |
|---|---|---|
| "40 ฟังก์ชัน" service list §3 | E | `service.ts` (employee :30-284 · clock :291 · setPin :323 · nextClockKind :341 · clockWithPin :360 · kioskRoster :371 · requestLeave :389 · decideLeave :442 · bulkDecideLeave :457 · isAvailable :478 · employeesOnLeave :490 · employeesUnavailable :505 · getSchedule :567 · setSchedule :577 · clockInDetail :625 · monthlyAttendance :668 · employeeOfUser :732 · isOnLeave :766); `payroll.ts` (setSalaryProfile :36 · otRateFor :89 · requestAdjustment :111 · decideAdjustment :157 · cancelAdjustment :205 · createPayrollRun :287 · approveRun :395 · reverseRun :449 · markPaid :498 · payslipData :535 + CRM block :557-770) |
| `monthlyMinutes`, `service.isAvailable` | E (dead) | no caller outside `service.ts` (grep) |
| facade `@/lib/modules/hr` | E | `hr/index.ts:190-215` — exports only adjustment/commission/user helpers; **`employeesUnavailable`, `clockWithPin`, schedule readers not exported** (booking imports `hr/service` directly `booking/service.ts:7`) |
| `hr.onShiftToday`, `hr.recordCommission`, `staff.verifyPin` (C-8) | N | – |
| "สลิปดูได้ถ้าผูก user" | **X** | slip page has no user binding and no permission check at all `src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/page.tsx:14-25` (§8 D3) |
| "หักสาย/ขาด ❌ ตัดสินสายได้แต่ไม่ต่อเงิน" | E (as stated) | intentional: `payroll-ui.tsx:82-83` comment; `monthlyAttendance` is display only |
| "ลงบัญชีเงินเดือน ❌ (เส้นเงินฝั่งจ่ายมี แต่ยังไม่ต่อ)" §1 table / §2 "ลงบัญชีอัตโนมัติ ❌" | **X** | **already posts**: `approveRun` → `postPayrollJV` `payroll.ts:419` → `gl.ts:1781-1817` (Dr 6000 gross + employer SSO / Cr 1010 net, 2100 SSO, 2130 WHT); reversal `reverseEntry` `payroll.ts:478` |
| decision #4 "AccountDocument EXPENSE/JV ผ่าน facade" | A | JV via `postManualJV` book `PAYMENTS` `gl.ts:1800-1805`; no AccountDocument |
| decision #6 approval core for leave | E (leave only) | `requestLeave` → `approval.resolvePolicy/submitForApproval` `service.ts:428-436`; effect `approval-effects.ts:158-163` |
| OT "1.5/2/3" | A (1.5 only) | `otHourlyRateSatang(... multiplier=1.5)` `payroll-rules.ts:100-109`; OT is a manual `HrPayAdjustment` kind |

### 1.3 Events / permissions / AI
| name | status | code reality |
|---|---|---|
| `hr.leave.approved` "(มีโครง)" | **X** | not emitted anywhere; only `hr.leave.submitted` `service.ts:413-425` (consumer `outbox-consumers.ts:834`) and `hr.payroll.paid` `payroll.ts:506-512` (consumer `outbox-consumers.ts:1201`) |
| `hr.roster.published` `hr.shift.swap_*` `hr.attendance.late/absent` `hr.ot.approved` `hr.payroll.approved` `hr.employee.*` | N | – (each new event needs consumer + AUTOMATION_EVENTS + WEBHOOK_EVENTS — `service.ts:405-407`) |
| `hr.payroll.reversed` (implied by "กลับรายการเมื่อ reverse (มี)") | N | reverseRun emits nothing `payroll.ts:449-489` ⇒ CRM commissions stay PAID after reversal (§3.4) |
| HR permission keys | E (13) | `permissions.ts:494-506`: `hr.employee.create` `hr.attendance.clock` `hr.leave.request/read/decide` `hr.payadjust.request/approve/reject` `hr.payroll.read/create/approve/pay/reverse` |
| "ผู้จัดการเห็นเฉพาะสาขา/ทีม" | N/**X** | `assertCan` for HR never passes `unitId` (`actions.ts:27-36`, `payroll-actions.ts:24-33`) ⇒ MANAGER = whole HR system (`rbac.ts:35-37`); but MANAGER **cannot** see payroll/PII without `hr.payroll.read` (`rbac.ts:47-51`) — mockup 06 shows "พี่เก่ง · ผู้จัดการ" approving payroll |
| `hr.payroll.reverse` key | E (unused) | reverse action checks `hr.payroll.approve` `payroll-actions.ts:99` |
| `hr.payadjust.reject` key | E (unused) | reject uses `hr.payadjust.approve` `payroll-actions.ts:196` |
| AI `hr_decide_leave` | E | tool `ai/tools.ts:447-474`, proposal `ai/proposals.ts:549-556` |
| AI `hr_create_employee`, `pending_leaves` (read) | E (not in design) | `tools.ts:695-723`, `tools.ts:151-171`; proposals `:651-665` |
| `hr_who_is_on_today` `hr_late_report` `hr_labor_percent` `hr_leave_balance` `hr_draft_roster` `hr_flag_pattern` | N | – |

### 1.4 Files / routes / scripts / UI
| name | status | reality |
|---|---|---|
| "UI 5 หน้า (employees · employee detail · attendance · leave · kiosk · payroll)" | A | 6 sub-pages `src/app/app/sys/[id]/hr/{employees,employees/[employeeId],attendance,leave,kiosk,payroll}/page.tsx` + hub `src/app/app/sys/[id]/page.tsx:17` + slip page under **`/sys/[id]/payroll/...`** (outside `/hr/`) |
| `ui.tsx` 559 · `payroll-ui.tsx` 362 | E | exact |
| REST `/api/v1/hr` (H3.7) | N | `src/app/api/v1/` has no `hr` (account ai appointments chat crm customers inventory kanban me member queue reservations sales shop teams tickets) |
| crons for HR (probation/contract alerts, absent alert) | N | no HR cron route |
| oracle list "6 ชุด" | A | 8 HR suites: + `qc-payroll.mts`, `qc-payroll-reverse.mts` (§7) |
| `docs/modules/18-hr.md` · `docs/sds/modules/hr.md` · `future-payroll-tax.md` | E | `hr.md` is stale (says "ไม่มี outbox · ยังไม่เข้าเส้นเงิน" — both false today) |

---

## 2. As-built data model + writers/readers

### 2.1 Models, scope, keys (C — schema read)
| model | scope (kernel) | uniqueness | FKs real / loose | notes |
|---|---|---|---|---|
| `HrEmployee` `hr.prisma:66-120` | tenant+**system** `scope.ts:121` | **none** (no unique on `code`, `pinCode`, `linkedUserId`, `nationalId`) | loose: `linkedUserId`, `partyId` | soft delete = `active=false` `service.ts:275-284`; `endDate` independent of `active` |
| `HrEmployeeDoc` `:124-138` | system | – | real → employee (Cascade) | `url` http(s) or `data:image/` `service.ts:253` |
| `HrAttendance` `:140-155` | system | none (double IN possible) | real → employee (Cascade) | `judgement/dueMin/lateMin` snapshot on IN only `service.ts:296-310` |
| `HrLeave` `:157-173` | system | none (overlaps allowed) | real → employee (Cascade) | `fromDate/toDate @db.Date`; `decidedById` holds userId **or** `"approval-engine"` `approval-effects.ts:161` **or** null (AI) `proposals.ts:554` |
| `HrWorkSchedule` `:179-196` | system | `@@unique([employeeId, weekday])` | real → employee | `createdAt` = "schedule start" guard `service.ts:704` |
| `HrSalaryProfile` `payroll.prisma:55-70` | system `scope.ts:178` | `@@unique([systemId, employeeId])` | **loose** `employeeId` | MONTHLY only; `otHourlyRateSatang` **has no writer** in `src/` (only read `payroll.ts:95`) |
| `HrPayAdjustment` `:28-53` | system | partial unique `crmCommissionId WHERE NOT NULL` (migration `20261102000000_crm_v2_c`) | **loose** `employeeId`, `runId`, `crmCommissionId` | `periodKey String "YYYY-MM"` |
| `HrPayrollRun` `:72-94` | system | `@@unique([systemId, periodKey])` ⇒ **one run per HR system per month, all branches** | loose `journalEntryId` | totals denormalised |
| `HrPayrollItem` `:96-115` | system | `@@unique([runId, employeeId])` | real → run (Cascade); loose `employeeId` | never updated after create |
Kernel: `tenantDb({tenantId, systemId})` ANDs `tenantId`+`systemId` into every where/create (`core/db.ts:63-78,88-150`) ⇒ cross-system ids inside one tenant are filtered **C**. FKs to `HrEmployee` do not enforce same `systemId` (a `clock`/`requestLeave` with an employee id of another HR system of the same tenant creates a row in this system pointing at that employee — no existence check in `clock` `service.ts:291-314` / `requestLeave` `:389-401`) **C**.

### 2.2 Writers of money / quantity / credential fields
| field | writer · file:line | entry points |
|---|---|---|
| `HrSalaryProfile.baseSalarySatang/ssoEligible/taxId/personalDeductionJson` | `setSalaryProfile` `payroll.ts:36-73` (find→update/create, no tx) | `setSalaryProfileAction` `payroll-actions.ts:38-59` (form baht→satang `:53`) |
| `HrPayAdjustment` create (manual) | `requestAdjustment` `payroll.ts:111-151` | `requestAdjustmentAction` `payroll-actions.ts:158-191` |
| `HrPayAdjustment` create (CRM) | `requestCommissionAdjustment` `payroll.ts:557-590` (`createManyAndReturn skipDuplicates`) | CRM commissions → payroll (`crm/commissions.ts:959` area) via facade `hr/index.ts:190-196` |
| `HrPayAdjustment.status/decidedById/periodKey` | `decideAdjustment` `payroll.ts:181-184` | `decideAdjustmentAction` `payroll-actions.ts:193-217` |
| `HrPayAdjustment` delete | `cancelAdjustment` `payroll.ts:205-211` · `withdrawCommissionAdjustment` `:680-706` | `cancelAdjustmentAction` `payroll-actions.ts:219-227` · CRM |
| `HrPayAdjustment.periodKey` move | `moveCommissionAdjustmentPeriod` `payroll.ts:713-728` | CRM sweeper |
| `HrPayAdjustment.runId` | `createPayrollRun` `payroll.ts:383-389` | `createPayrollRunAction` `payroll-actions.ts:62-73` |
| `HrPayrollRun` + items (all totals) | `createPayrollRun` `payroll.ts:351-381` | same |
| `HrPayrollRun.status` | approve `:398` / revert-to-DRAFT `:438` / REVERSED `:463` / revert `:483` / PAID `:500` | approve/reverse/markPaid actions `payroll-actions.ts:76,97,118` |
| `HrPayrollRun.journalEntryId` | `approveRun` `payroll.ts:431` | approve action |
| `HrEmployee.pinCode` | `createEmployee` `service.ts:45` · `setPin` `:336` | `createEmployeeAction` `actions.ts:44-58` · `setPinAction` `:205-213` |
| `HrAttendance` (IN/OUT) | `clock` `service.ts:291-314` | `clockAction` `actions.ts:61-71` (any employee, no PIN) · `kioskClockAction` → `clockWithPin` `actions.ts:225-254`, `service.ts:360-368` |
| `HrLeave.status` | `decideLeave` `service.ts:442-452` (no status guard) · `approval-effects.ts:158-163` (guard PENDING) | `decideLeaveAction` `actions.ts:279-289` · `bulkDecideLeaveAction` `:298-316` · AI proposal `proposals.ts:549-556` · approval engine |
| `HrEmployee` sensitive PII | `saveEmployeeProfile` `service.ts:163-239` | `saveEmployeeProfileAction` `actions.ts:123-172` (sensitive keys only if `canViewPayroll` `:157-166`) |
| `HrEmployee.linkedUserId` | `grantStaffAccess` `staff/service.ts:412-415` · `scripts/member-backfill-hr-users.mts` | settings → staff access |

### 2.3 Readers that matter
| reader | file:line | consumer |
|---|---|---|
| `employeesUnavailable` (leave APPROVED ∪ inactive) | `service.ts:505-514` | booking slots `booking/service.ts:97-118` (date = `YYYY-MM-DDT00:00Z` — correct) |
| `isOnLeave` (Thai day via `thaiDateKey`) | `service.ts:766-780` | CRM assignment `crm/assignment.ts` |
| `employeeOfUser` / `payrollEmployeeOfUser` / `activeLinkedUserIds` | `service.ts:732-753` · `payroll.ts:596-614,731-744` | CRM |
| `monthlyAttendance` | `service.ts:668-723` | attendance page `ui.tsx:112`, payroll page `payroll-ui.tsx:89-95` (display only) |
| `payslipData` | `payroll.ts:535-545` | slip page (unguarded — §8 D3) |
| `pendingLeaves` | `service.ts:525-532` | leave page, AI `pending_leaves` `tools.ts:157-170` |
| raw `prisma.hrLeave` (tenant-wide, all HR systems) | `ai/tools.ts:1984-1989` | AI calendar tool |

---

## 3. Money / quantity integrity as-built

### 3.1 Payroll computation (`computeItem` `payroll.ts:222-279` + `payroll-rules.ts`)
| rule | code | verdict |
|---|---|---|
| gross = base + add − deduct, floored at 0 | `payableGrossSatang` `payroll-rules.ts:148-154`, `payroll.ts:246` | C. **excess deduction silently forgiven** (ADVANCE 5,000 vs salary 1,000 → 4,000 never carried; adjustment is bound to the run `:383-389` so it can't be re-used) |
| SSO on **base salary only**, every month, no proration | `payroll.ts:247-249` (`ssoContribution(base)`) | C. ignores OT/commission/bonus, unpaid-absence, mid-month start/end; minimum base 1,650 still charged when gross floored to 0 |
| net = gross − SSO − WHT, **no floor** | `payroll.ts:256` | C. gross 0 + ssoEligible ⇒ **net = −8,300 satang** (base 1,000 → SSO base clamped to 1,650 → 83 THB). Oracle RN-10 only tests `ssoEligible:false` (`qc-hr-payadjust.mts:136-143`) — §8 D6 |
| SSO rate/cap 5% · 1,650–15,000 hard-coded ("เพดานปี 2567") | `payroll-rules.ts:22-24`, doc `future-payroll-tax.md:40` | C code / **P law**: SSO wage ceiling was announced to rise to 17,500 THB from 1 Jan 2026 (max 875 THB) — needs accountant confirmation; mockup 08 still shows 15,000 "มีผล 1 ม.ค. 2569" |
| SSO rounding: `Math.round(base×bp/10000/100)×100` (half-up to whole baht) | `payroll-rules.ts:28-29` | C |
| WHT (ภ.ง.ด.1) = annualise **base × 12**, 50% expense cap 100k, personal 60k, spouse 60k, child 30k, SSO ≤ 9k, ÷12 `Math.round` | `payroll-rules.ts:73-92`, `payroll.ts:254-255` | C. excludes OT/commission/bonus (40(1) income) ⇒ under-withholding; no YTD/true-up; ignores start month; mockup 08 says "ปรับทุกเดือนตามเงินได้จริง" — contradicts code |
| OT rate = base ÷30 ÷8 ×1.5, `Math.round`; amount = `Math.round(hours×rate)` | `payroll-rules.ts:100-115` | C. `otHourlyRateSatang` override column has **no writer** (`payroll.ts:95` reads it) |
| baht → satang from forms | `Math.round(baht*100)` `payroll-actions.ts:53,182` | C (float; fine at 2dp) |
| inactive / ended employees | profiles selected with **no `active`/`endDate` filter** `payroll.ts:301-304` | **C — every employee who ever had a profile gets a full salary row each new run** (§8 D1) |
| run uniqueness / concurrency | advisory xact lock + `@@unique(systemId, periodKey)` `payroll.ts:297-299`; adjustments `FOR UPDATE` + guarded bind `:312-316,383-389` | C, good |
| DRAFT recompute / delete | **no delete or recompute function anywhere in `src/`** (grep `hrPayrollRun.delete` → scripts only) | C. wrong DRAFT blocks the month forever (reverseRun even says "ลบร่างได้เลย" `payroll.ts:459`) — §8 D2 |
| manual adjustment into a period that already has a run | `requestAdjustment` has no closed-period check `payroll.ts:123-150`; `decideAdjustment` moves only CRM rows `:174-180` | **C — APPROVED but never paid/deducted** (§8 D5). CRM path is guarded (`:581-582`) |
| 4-eyes | adjustments: non-owner can't approve own `:167-169`; runs: **no creator/approver split** (no `createdById` on run) | C |

### 3.2 Posting to accounting (`approveRun` `payroll.ts:395-445`, `postPayrollJV` `gl.ts:1781-1817`)
| aspect | code | verdict |
|---|---|---|
| which account system | `db.appSystem.findFirst({ where:{type:"ACCOUNT"} })` **no orderBy, no link check** `payroll.ts:408`; reverse re-resolves `:474` | C. tenant with 2 books: posting/reversal may hit different books (same class as `inventory/service.ts:390-397`) |
| JV shape | Dr 6000 gross · Dr 6000 employer SSO / Cr **1010 bank** net · Cr 2100 SSO (both) · Cr 2130 WHT `gl.ts:1806-1811` | C. **cash credited at approve**, `markPaid` posts nothing `payroll.ts:498-516`; no accrued-salary liability; ADVANCE/DEDUCTION reduce 6000 expense instead of crediting an advance receivable |
| atomicity | claim DRAFT→APPROVED `:398` → JV in its own tx `:419` → `journalEntryId` update `:431` (separate) → on throw revert to DRAFT only if `journalEntryId` null `:438-441` | C. if `:431` fails after JV commit ⇒ orphan JV + re-approve posts twice (P, low likelihood) |
| negative lines | net < 0 per D6 flows into total `netSatang` `payroll.ts:338-349` | P: `postManualJV` validation of negative credits not traced |
| reversal | `reverseRun` claims REVERSED then `reverseEntry` `:463-478`; no outbox event; adjustments keep `runId`; period stays occupied | C. CRM commissions stay PAID (`onPayrollPaid` only forward `crm/commissions.ts:1338`) |

### 3.3 Attendance / leave counters
| item | code | verdict |
|---|---|---|
| clock IN/OUT kind | `nextClockKind` = last event **since 00:00 Bangkok today** `service.ts:341-350` | C. overnight shift: OUT after midnight is recorded as IN (and judged vs. that weekday's schedule) |
| double tap | read-then-insert, no unique `service.ts:365-366` | C (two INs) |
| late judgement | snapshot on IN, `minOfDay > start+grace`, `lateMin` from start `service.ts:625-636` | C, +07:00 via `bkkParts` `:605-612` (correct) |
| absent/leave/workdays | computed on read, Thai month bounds `service.ts:676-711`; PENDING leave counts as absent | C |
| `monthlyMinutes` | **UTC** month bounds `service.ts:544-545` | C, but dead code |
| `rules.isAvailable` | compares `toISOString().slice(0,10)` `rules.ts:3-10` ⇒ correct only for UTC-midnight inputs; current callers comply (`booking/service.ts:108`, `service.ts:705`) | C |
| leave validation | no `from ≤ to`, no overlap, no employee existence, no balance `service.ts:389-401`, action `actions.ts:257-276` | C |
| leave decision | `decideLeave` = `update` with **no status guard** `service.ts:442-452` (APPROVED↔REJECTED flips, decides CANCELLED, bypasses a pending approval request) | C |
| leave balances / quotas / holidays | none | C (design N) |

### 3.4 Events / idempotency
| event | emit | atomic? | key | consumer |
|---|---|---|---|---|
| `hr.leave.submitted` | `service.ts:413-425` `emitOutboxOutsideTx` | no (accepted in comment `:409-412`) | `hr.leave.submitted#<leaveId>` | kanban bridge + automation `outbox-consumers.ts:834` |
| `hr.payroll.paid` | `payroll.ts:506-512` in tx with status flip | yes | `hr.payroll.paid#<runId>` | CRM commission PAID + automation `outbox-consumers.ts:1201` |
| leave decided / payroll approved / reversed / attendance | – | – | – | none |

---

## 4. Tenancy / authorization as-built
Common pattern: `requireTenant()` → tenantId from session; **`systemId` from the form / bound arg (client)**; `assertCan({module:"hr", action})` **without `unitId`/`systemId`** (`actions.ts:27-36`, `payroll-actions.ts:24-33`) ⇒ OWNER/MANAGER always pass (`rbac.ts:32-41`); payroll + PII additionally need OWNER or `hr.payroll.read` (`rbac.ts:47-51`). Tenant isolation holds via `tenantDb` (§2.1). A forged `systemId` of another tenant reads nothing; a forged non-HR `systemId` of the same tenant lets `createEmployee/clock/requestLeave` write orphan rows (no type check in actions) — P, harmless.

### 4.1 Server actions
| action | permission | trusts client id | gap |
|---|---|---|---|
| `createEmployeeAction` `actions.ts:44` | `hr.employee.create` | systemId | sets `pinCode` in plain text `:55` |
| `clockAction` `actions.ts:61` | `hr.attendance.clock` | **employeeId (any)** | **no PIN** — same key as kiosk ⇒ kiosk PIN is bypassable by whoever holds the kiosk session (§8 D7) |
| `kioskClockAction` `actions.ts:225` | `hr.attendance.clock` | employeeId | PIN compare plain `service.ts:364`; limiter in-memory per instance, keyed per employee `actions.ts:232` |
| `setPinAction` `actions.ts:205` | `hr.employee.create` | employeeId | duplicate check **returns the other holder's name** `service.ts:330-334` ⇒ PIN oracle (§8 D8); no rate limit |
| `update/remove/restoreEmployeeAction`, `setWorkScheduleAction`, `saveEmployeeProfileAction` | `hr.employee.create` | employeeId | sensitive fields gated by `canViewPayroll` `actions.ts:157-166` (good) |
| `add/removeEmployeeDocAction` | `hr.employee.create` + `canViewPayroll` `actions.ts:177,193` | docId | – |
| `requestLeaveAction` `actions.ts:257` | `hr.leave.request` | **employeeId (any)** | STAFF can file leave for anyone; no self-binding |
| `decideLeaveAction` / `bulkDecideLeaveAction` `actions.ts:279,298` | `hr.leave.decide` | leaveId(s) | no 4-eyes (can approve own leave), no status guard, bypasses approval chain |
| payroll actions `payroll-actions.ts:38-135` | `hr.payroll.{create,approve,pay}` + `canViewPayroll` | runId/employeeId | reverse uses `approve` key `:99` (`hr.payroll.reverse` unused) |
| `requestAdjustmentAction` `payroll-actions.ts:158` | `hr.payadjust.request` only (no PII gate — by design `:138-141`) | employeeId, systemId bound | – |
| `decide/cancelAdjustmentAction` `payroll-actions.ts:193,219` | `hr.payadjust.approve` + `canViewPayroll` | id | reject uses approve key |

### 4.2 Pages (server components)
| page | guard | data shipped | verdict |
|---|---|---|---|
| `/hr/employees/[employeeId]` `page.tsx:33-64` | **requireTenant only** | full `HrEmployee` row + `docs[]` passed to `"use client"` `EmployeeProfileForm` (`page.tsx:64`; `EmployeeProfileForm.tsx:1`) ⇒ RSC payload carries `nationalId`, `ssoNumber`, `bankAccountNo`, `houseRegAddress`, **`pinCode`**, doc URLs even when `canSeeSensitive=false` | **§8 D4 (HIGH, PDPA)** |
| `/payroll/[runId]/slip/[employeeId]` `page.tsx:14-25` | **requireTenant only** (+ system type HR) | gross/SSO/WHT/net/adjustment notes of any employee | **§8 D3** |
| `/hr/leave` → `HrLeaveSection` `ui.tsx:218-226` | requireTenant only | every employee's leave type + **reason** (sick leave = health data) | §8 D9 — calendar gates the same data behind `hr.leave.read` (`calendar/service.ts:127-131`) |
| `/hr/attendance` `ui.tsx:98-113` | requireTenant only | everyone's late/absent counts | LOW |
| `/hr/employees` `ui.tsx:312-330` | requireTenant only | names/phones/positions; PIN as `hasPin` only `ui.tsx:416` | OK-ish |
| `/hr/kiosk` `ui.tsx:481-490` | requireTenant | `hasPin` only `service.ts:371-378` | OK |
| `/hr/payroll` `payroll-ui.tsx:55-71` | `canViewPayroll` in component | – | OK |

### 4.3 AI / other entry points
| entry | gate | note |
|---|---|---|
| `pending_leaves` read tool `ai/tools.ts:151-171` | AI chat gate only (`ai.chat.send`, `ai/actions.ts:16-25`) — no `hr.leave.read` | returns `เหตุผล` (reason); **omits `leaveId`** although `hr_decide_leave` tells the model to get it there `tools.ts:452` |
| calendar AI tool `ai/tools.ts:1984-1989` | same | raw `prisma.hrLeave` tenant-wide, leave type exposed |
| `hr_decide_leave` proposal `proposals.ts:549-556` | `hr.leave.decide` on confirm (`proposals.ts:144`) | first HR system only (`resolveSystem`); `decidedById` null; no status guard |
| `hr_create_employee` `proposals.ts:651-665` | `hr.employee.create` | – |
| REST `/api/v1/ai/tools/[name]` `route.ts:24-41` | API-key scopes | exposes the same HR tools to API keys whose scope allows them (P — scope map not traced) |
| approval effect `approval-effects.ts:158-163` | engine | guard `status:"PENDING"`; `requestedById` = **employee id** passed as user id `service.ts:435` ⇒ requester can never cancel (`approval/actions.ts:203`) and "my requests" (`approval/service.ts:371-376`) never lists it |

---

## 5. Integration points
| system | exists today (C) | design assumes | gap / note |
|---|---|---|---|
| **POS** (shift, PIN, commission, labor %) | **nothing**: no file in `src/lib/modules/pos|restaurant|hotel` references HR or `pinCode` (grep) | C-8 `staff.verifyPin({tenantId, unitId, pin})` with "HrEmployee.pinCode เดิม (sync HR→POS)"; `hr.onShiftToday`; `hr.recordCommission` via `pos.sale.paid` | PIN is plain, not unique (dup check only among `active`, only per HR system `service.ts:330-334`), not unit-scoped (no `unitId` on HrEmployee) ⇒ cannot serve a PIN-only lookup per unit; commission path must reuse `requestAdjustment` (kind COMMISSION) with its own idempotent key — today only `crmCommissionId` has a partial unique |
| **Booking** (C-2) | `staffOnLeave` → `employeesUnavailable` per active HR system `booking/service.ts:97-118`; `BookingStaff.employeeId` soft link `booking.prisma:46` | "กะ → เวลาเปิดจองของช่าง"; "ค่าคอมฯ บริการ ✅" (§5 table) | schedule/shift not used by booking; **no booking commission exists** (grep `commission` in booking/pos → none) — design row "ค่าคอมฯ บริการ ✅" is wrong |
| **Accounting** | JV at approve `payroll.ts:419` → `gl.ts:1781`; reversal `reverseEntry` `:478`; audit via `account.writeAudit` `payroll-actions.ts:84-91` | JV "เงินเดือนค้างจ่าย/ค่าใช้จ่าย/เจ้าหนี้ ปสส./ภาษี" + bank reconciliation | book = first ACCOUNT system, unordered `payroll.ts:408,474`; cash at approve (no accrual); WHT/SSO payable codes 2100/2130 fixed in `gl.ts:1788` |
| **CRM** | commission → `HrPayAdjustment` (partial unique) `payroll.ts:557-590`; `hr.payroll.paid` → commissions PAID `crm/commissions.ts:1338`; stranded sweeper `payroll.ts:751-770`; `isOnLeave` for lead assignment `service.ts:766` | "✅" | reverse of a PAID run does not un-pay commissions (no event) |
| **Approval core** | `HrLeave` only (`approval/actions.ts:18-21`, `service.ts:428-436`, effect `approval-effects.ts:158-163`) | leave · OT · shift swap · time correction · pay adjust · payroll run | `decideLeave` bypasses a pending request; requester id is an employee id (§4.3); `HrPayAdjustment`/`HrPayrollRun` have their own decide paths (4-eyes in service) — moving them to approval core changes who can approve |
| **Kanban** | `hr.leave.submitted` → card "หาคนแทน" `kanban-bridges.ts:397` | onboarding/offboarding cards | – |
| **Calendar** | leave gated by `hr.leave.read` `calendar/service.ts:127-131` | – | the HR leave page itself is not gated (§8 D9) |
| **Staff access / users** | `grantStaffAccess` links `linkedUserId` + creates STAFF membership `staff/service.ts:345-415` | "ของฉัน" page for STAFF | link exists; no self-service surface; one user may be linked in several HR systems (no unique) — `employeeOfUser` picks oldest system `service.ts:732-753` |
| **Party / Member** | `party.safeFindOrCreate` from name/phone/email only `service.ts:33-37,188-202` | – | OK (no PII to Party) |
| **Inventory** | none | "เบิกของ/ค่าเสียหาย → หัก" | N |
| **Chat / meeting / LINE** | none | notify shift/slip/approval via LINE | N |

---

## 6. Design ↔ code conflicts that change a WO's scope (ordered by impact) + recommended rulings
| # | conflict | evidence | WOs hit | recommended ruling |
|---|---|---|---|---|
| 1 | **Live PII / payroll exposure** must be closed before V2 adds more PII (GPS, photos, slips in app) | §8 D3 D4 D9; pages guarded by `requireTenant` only | all H1, H2.7 | Insert **HF-HR-0** (before H1.1): gate every HR page (`hr.*` read keys), pass a whitelisted DTO to client components (never the Prisma row), slip page = `canViewPayroll` OR `employee.linkedUserId === user`, leave page behind `hr.leave.read`. Add oracle "RSC payload has no nationalId/pinCode" |
| 2 | **HR has no branch axis** — every HR/payroll model is system-scoped, no `unitId`; run is `@@unique([systemId, periodKey])`; `assertCan` never gets `unitId`. Mockups 02/06 show per-branch registers, a branch manager approving a branch payroll | `scope.ts:121-125,178-181`, `payroll.prisma:92`, `actions.ts:27-36` | H1.11, H2.4, H2.5, H2.8, every screen | Add nullable `HrEmployee.unitId` (home branch) + `HrEmployeeUnit` (borrowed) — additive. Keep **one payroll run per HR system per month** (one employer filing: ภ.ง.ด.1/สปส.1-10 are per employer, not per branch); branch = filter/preview + manager approval step, not a separate run. Branch-scoped reads via `assertCan({unitId})`; MANAGER still needs `hr.payroll.read` for money (PDPA) — mockup 06 must show the manager only with that key |
| 3 | **PIN is plain text, non-unique, per HR system, enumerable, bypassable** — while C-8 wants it to be the single authority PIN for POS (open shift, approve void) | `hr.prisma:73`, `service.ts:330-336,364`, `actions.ts:61-71,232` | POS P3.5 (ex-H3.1), H1.5, H1.10 | Decide **before POS P3.5**: HR owns the PIN; store `pinHash` = HMAC-SHA256(tenant secret, pin) so uniqueness can be enforced (`@@unique([tenantId, pinHash])` partial on active) and PIN-only lookup works; drop the "used by <name>" message; DB-backed attempt counter; POS reads through facade `hr.verifyPin({tenantId, unitId, pin})`. Do **not** build `PosStaffPin` in parallel. Migration: hash existing pins once (backfill), keep `pinCode` NULL afterwards |
| 4 | **Payroll engine = monthly base salary only**; V2 needs hourly/daily wages (mockup 06: part-time ฿65/ชม × 72 ชม), work entries, OT 1.5/2/3, late/absent deductions, proration for start/end | `payroll.prisma:60` (MONTHLY v1), `payroll.ts:222-279`, `payroll-rules.ts:100-109`; FREEZE note `payroll-rules.ts:2` | H2.1, H2.2, H2.4 | Keep `payroll-rules.ts` functions byte-identical (oracle `qc-payroll.mts` freezes them); add new pure functions + `HrSalaryProfile.payType{MONTHLY,DAILY,HOURLY}` + `HrPayrollRun.engineVersion` snapshot; old runs never recomputed. H2.1 is a new engine, not an extension — re-estimate |
| 5 | **Inactive / ended employees are paid every month**; no proration | `payroll.ts:301-304` (no active/endDate filter) | H2.4 + hotfix | Fix in HF-HR-0 (filter `active` + `endDate`/`startDate` window); proration rule (days in period) needs owner/accountant ruling → H2.4 |
| 6 | **DRAFT run cannot be deleted/recomputed; a REVERSED run blocks the month forever**; adjustments bound to the reversed run are lost; mockup 06 has "ดึงข้อมูลใหม่" | no delete in `src/` (grep), `payroll.prisma:92`, `payroll.ts:383-389,449-489` | H2.4, H2.6 | Add `recomputeDraft` (unbind+rebind adjustments in one tx) and `deleteDraft`; on reverse, unbind adjustments (`runId=null`) and emit `hr.payroll.reversed` (CRM consumer un-pays commissions); make the period unique **only for non-REVERSED runs** (partial unique — migration, non-concurrent index is fine at this size) |
| 7 | **Accounting is already wired** (design says ❌/new): JV at approve, `journalEntryId` exists, but it credits **bank** at approve and picks the first ACCOUNT book | `payroll.ts:408-431`, `gl.ts:1781-1817` | H2.6 | Re-scope H2.6 from "create" to "change": approve → accrual JV (Dr 6000 / Cr salaries payable + 2100 + 2130); markPaid → Dr payable / Cr bank (the bank-file step); ADVANCE deductions credit an advances-receivable account; book = explicit HR→ACCOUNT link setting (same fix class as inventory `service.ts:390-397`); existing APPROVED/PAID runs keep the one-step JV (no backfill) |
| 8 | **WHT/SSO base excludes OT/commission/bonus; WHT annualises base×12 without YTD**; constants hard-coded; mockup 08 promises "ปรับทุกเดือนตามเงินได้จริง"; 2026 SSO ceiling may already be 17,500 (P) | `payroll.ts:242-255`, `payroll-rules.ts:22-24,36-92`, mockup 08 | H2.3, H2.4, H2.9 | Owner + accountant ruling **before H2.3**: (a) SSO wage definition (which kinds count), (b) WHT method (cumulative YTD recommended — needs `HrPayrollItem` YTD fields), (c) current SSO cap. Law table with `effectiveFrom`; payroll snapshot stores the law-row id used |
| 9 | **Late/absent → deduction is deliberately refused today** ("ต้องให้คนตัดสิน" — legal) but H2.2 makes it automatic | `payroll-ui.tsx:82-83` | H2.2 | Opt-in per shop rule (default OFF), produces **PENDING `HrPayAdjustment` DEDUCTION rows** (existing 4-eyes path) instead of silently entering gross |
| 10 | `HrLeaveType` **model name collides** with the existing enum; leave has no days/half-day/balance; no overlap/from≤to validation | `hr.prisma:10-15,157-173`, `service.ts:389-401` | H1.7, H1.8 | New model `HrLeavePolicy` (category = existing enum for legal mapping); `HrLeave.days Decimal(4,1)` computed at request (excludes holidays/days off); balance = ledger rows `HrLeaveBalanceTxn` (grant/use/carry/expire) rather than a mutable counter; validation + overlap check in H1.7 |
| 11 | **Leave decision path**: `decideLeave` has no status guard and bypasses a pending approval request; approval request carries the **employee id** as `requestedById`; AI decides with `decidedById=null` | `service.ts:435,442-452`, `approval-effects.ts:158-163`, `proposals.ts:554` | H1.4, H1.7, H1.9 (all requests via approval core) | One decide function: `PENDING`-guarded `updateMany`; if an approval request exists, manual decide goes through `approval.decide`; `requestedById = linkedUserId ?? actorUserId`; emit `hr.leave.decided` (new, 3 registrations) |
| 12 | **Overnight shifts impossible**: schedule requires `end > start`; clock kind resets at Bangkok midnight | `service.ts:341-350,582` | H1.2, H1.5, H1.6 | `HrShift.crossesMidnight`; attendance gets `rosterEntryId`; next kind = open entry of that roster entry, not calendar day |
| 13 | **Manual adjustments into a closed period are accepted and approved but never paid** (CRM path is guarded) | `payroll.ts:123-150,174-180` vs `:581-582` | H1.9 (OT requests), H2.4 | Same `PERIOD_CLOSED` check as CRM path; OT requests target "next open period" automatically |
| 14 | **No self-service surface / no "my" permissions**; design E7 assumes STAFF sees own shift/leave/slip | slip page `payroll/.../page.tsx:14-25`; `employeeOfUser` `service.ts:732` | H1.10, H2.7 | "My" routes resolve employee via `employeeOfUser(tenantId, userId)` (exists) and never accept an `employeeId` param; implicit self-permissions (no new keys needed) |
| 15 | Events "hr.leave.approved (มีโครง)" do not exist; 10+ new events each need consumer + `AUTOMATION_EVENTS` + `WEBHOOK_EVENTS` (else queue stalls — `service.ts:405-407`) | §1.3 | H1.*, H2.*, H3.4-6 | Budget the registry work per WO; `src/lib/outbox-consumers.ts` is a lane-shared hot file — append-only blocks |
| 16 | Kiosk = a logged-in session with `hr.attendance.clock`, which also allows PIN-less `clockAction` for anyone | `actions.ts:61-71,225-236` | H1.5 | Split keys: `hr.attendance.clock` (kiosk/self) vs `hr.attendance.clock_for` (on behalf, manager); mobile clock binds to `employeeOfUser` |
| 17 | Booking commission "✅" and shift→booking hours do not exist | §5 | H3.2, H3.3 | Treat as N in H3 estimates |
| 18 | `otHourlyRateSatang` override has no writer; `hr.payroll.reverse` / `hr.payadjust.reject` keys unused | `payroll.ts:95`, `payroll-actions.ts:99,196` | H1.9, H2.4 | Wire them in the WO that touches the screen; no new keys |

---

## 7. Existing oracles / regression suites (all `scripts/`, run with the QC env loader) and gaps
| suite | lines | covers (from header, C) |
|---|---|---|
| `qc-hr.mts` | 44 | rules `isAvailable`/`workedMinutes` + employee/clock/leave basics |
| `qc-hr-attendance.mts` | 231 | judgement snapshot, OUT not judged, "no accusation without data" 3 layers, approved leave ≠ absent, cross-tenant |
| `qc-hr-roster.mts` | 197 | HR register = single source for booking staff, soft delete, rename propagation |
| `qc-hr-leave-booking.mts` | 167 | C-2: approved leave closes booking slots (incl. public API), pending doesn't, unlinked staff untouched |
| `qc-hr-payadjust.mts` | 183 | OT formula, PENDING has no effect, 4-eyes, gross = base+add−deduct, no double count, deduct > base → 0 (**`ssoEligible:false` only**), cross-tenant |
| `qc-payroll.mts` | 105 | FREEZE of `ssoContribution`/`annualTaxSatang`/`monthlyWhtSatang` constants + run/approve/JV |
| `qc-payroll-reverse.mts` | 129 | reverse guard, idempotent JV reversal |
| `qc-booking-hours-hr.mts` | 95 | unit hours + linkable employees |
| cross-suite HR checks | – | `qc-crm-c3.3.mts` (commission ↔ payroll, 227 refs), `qc-crm-c0.3.mts` (facade), `qc-approval-wiring.mts` (HrLeave policy), `qc-bulk-ops.mts` (`bulkDecideLeave`), `qc-audit-trail.mts` (payroll audit labels), `qc-calendar.mts` (`hr.leave.read` gate), `qc-kanban-k3.3.mts` (`hr.leave.submitted`), `qc-ai-proposals.mts`/`qc-ai-tools.mts` (`hr_decide_leave`) — counts P |
| `member-backfill-hr-users.mts` | 80 | backfill, not an oracle |

**Gaps (no oracle today, C by grep of the suites above):**
1. Page-level authz + RSC payload content (D3, D4, D9) — no HR page is exercised by any suite.
2. `ssoEligible:true` with gross floored to 0 → negative net (D6).
3. Inactive / ended employee excluded from a new run (D1).
4. Manual adjustment into a period that already has a run (D5).
5. DRAFT recompute/delete; re-run after REVERSED; adjustments after reversal (D2).
6. Book selection with 2 ACCOUNT systems; JV atomicity on approve.
7. `decideLeave` status flips / bypass of pending approval (D10); `requestedById` semantics.
8. Overnight clock-out; double-tap IN.
9. PIN storage form, PIN oracle message, kiosk-vs-`clockAction` bypass (D7, D8).
10. `hr.payroll.paid` after reverse (CRM commissions stay PAID).
11. No `visual-hr` / `seed-hr-qc` / `hr-qc-env` tooling (POS has `pos-qc-env.mts`, `seed-pos-qc.mts`, `visual-pos.mts`) — H1.1 builds them.

---

## 8. Live defects found on the way (security / money) — not fixed
| id | sev | file:line | scenario | status |
|---|---|---|---|---|
| D1 | **HIGH money** | `payroll.ts:301-304` | Employee removed (`active=false`) or with `endDate` in the past still has an `HrSalaryProfile` ⇒ every new `createPayrollRun` gives them a full salary row, adds it to `totalNetSatang`, and the approve JV books it. No proration for mid-month start/end either. | C |
| D2 | **HIGH money/ops** | no delete/recompute in `src/`; `payroll.prisma:92`; `payroll.ts:383-389,449-489` | (a) A DRAFT built before a salary change / late approval cannot be rebuilt or deleted ⇒ the month is stuck with wrong numbers (UI and `reverseRun` note `:459` say "ลบร่างได้เลย" — no such function). (b) After REVERSED the `(systemId, periodKey)` unique blocks a corrected run for that month; its adjustments stay bound to the reversed run ⇒ OT/commission/advance of that month are never paid/recovered; CRM commissions stay PAID (no reverse event). | C |
| D3 | **HIGH PDPA** | `src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/page.tsx:14-25` | Any authenticated member of the tenant (STAFF with zero HR keys) who has a `runId` + `employeeId` opens any colleague's payslip (base, adjustments + notes, SSO, WHT, net). Employee ids are listed on the unguarded `/hr/employees` page; run ids travel in `hr.payroll.paid` payloads (webhooks/automation). | C (guard missing) / P (runId discovery) |
| D4 | **HIGH PDPA + credential** | `src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx:33-64`, `service.ts:143-148`, `EmployeeProfileForm.tsx:1` | Page has no `assertCan`; it passes the whole `HrEmployee` row (+`docs[]`) to a client component, so the RSC payload contains `nationalId`, `ssoNumber`, `houseRegAddress`, `bankName/AccountNo/AccountName`, **`pinCode`** and document URLs (ID-card scans) for **every** viewer, even when `canSeeSensitive=false` hides the inputs. Any STAFF can harvest all employees' national IDs, bank accounts and kiosk PINs. | C |
| D5 | MED money | `payroll.ts:123-150` vs `:174-180`, `:581-582` | OT/bonus/deduction requested for a month whose run already exists is accepted and can be APPROVED, but `createPayrollRun` for that month never runs again ⇒ the item is never paid/deducted and is not reported as stranded (sweeper covers CRM rows only `:751-770`). | C |
| D6 | MED money | `payroll.ts:246-256`, `payroll-rules.ts:148-154` | Deductions ≥ base with `ssoEligible=true`: gross floored to 0, but SSO (min base 1,650 → 83 THB) and WHT still subtracted ⇒ `netSatang` negative (e.g. −8,300), totals and bank credit reduced; the excess deduction above base is silently forgiven (ADVANCE not carried forward). Oracle RN-10 uses `ssoEligible:false` and misses it. | C |
| D7 | MED security | `actions.ts:61-71` vs `:225-236`; `service.ts:364`; `hr.prisma:73` | Kiosk tablet runs a logged-in session with `hr.attendance.clock`; the same key lets anyone call `clockAction` for any `employeeId` with no PIN (buddy punching). PINs are stored and compared in plain text; limiter is in-memory per instance (`core/rate-limit`) so 4-digit PINs are weakly protected on multi-instance hosting. | C / P (instances) |
| D8 | MED security | `service.ts:330-334`, `actions.ts:205-213` | `setPin` rejects a duplicate with "PIN นี้ <ชื่อ> ใช้อยู่" ⇒ a user with `hr.employee.create` can enumerate (≤10,000 tries, no rate limit) which PIN belongs to whom. Becomes a privilege issue once the same PIN authorises POS actions (C-8). | C |
| D9 | MED PDPA | `ui.tsx:218-226`; `ai/tools.ts:151-171,1984-1989` | `/hr/leave` shows every employee's leave type and free-text reason (sick leave = health data) to any member — the calendar deliberately hides the same data without `hr.leave.read` (`calendar/service.ts:127-131`). AI `pending_leaves` returns reasons to any user with AI chat. | C |
| D10 | MED integrity | `service.ts:442-452,435`; `approval-effects.ts:158-163`; `proposals.ts:554` | `decideLeave` updates regardless of status: an APPROVED leave can be flipped to REJECTED (booking slots reopen silently), CANCELLED can be approved, a leave under an approval policy can be decided manually while its approval request stays PENDING forever; approver can approve own leave. Approval request stores the **employee id** as `requestedById` ⇒ requester can't cancel / never sees it in "my requests". | C |
| D11 | LOW-MED money | `payroll.ts:408,419-441,474`; `gl.ts:1809` | Book = first `ACCOUNT` system without order; reversal re-resolves (may differ). Bank (1010) credited at approve although money leaves at "mark paid". JV commit and `journalEntryId` write are separate statements ⇒ a failure in between leaves an orphan JV and the run back in DRAFT (re-approve double-posts). | C / P (failure window) |
| D12 | LOW | `payroll-actions.ts:68`, `payroll.ts:287-292` | `createPayrollRunAction` regex `^\d{4}-\d{2}$` accepts `2026-13`/`2026-00`; `createPayrollRun` doesn't re-validate ⇒ bogus period rows (unique slot consumed). | C |
| D13 | LOW | `service.ts:341-350,365-366` | Double tap → two INs (no unique/lock); an OUT after Bangkok midnight is recorded as IN of the next day and judged LATE/ON_TIME against that day. | C |
| D14 | LOW | `ai/tools.ts:157-170` vs `:452` | `pending_leaves` omits `leaveId`, yet `hr_decide_leave` instructs the model to take it from there ⇒ AI leave approval cannot work except by luck. | C |
| D15 | verify (law) | `payroll-rules.ts:22-24` | SSO ceiling hard-coded 15,000 THB ("ปี 2567"); if the 17,500 ceiling took effect 1 Jan 2026, every employee earning > 15,000 has been under-deducted up to 125 THB/month (+ same employer share) since January. | P — accountant to confirm |
