# H3.9 — reports + employee register · design companion (matrix · sources · register field map)

Companion of `ledger/hr-briefs/hr-brief-H3.9.md` (DRAFT). The brief wins on contract wording. The column catalog (keys, class, sum, th/en headers) is **data**: `scripts/fixtures/hr-h3.9-vectors.json` → `catalog` — the builder copies it into `REPORT_CATALOG`; the oracle pins it (S2.2). Texts: `scripts/fixtures/hr-h3.9-texts.json`.

## 1. Viewer classes and gates (one decision point: `reportAccessOf(viewer)` in `hr/reports.ts`)
Gates reuse existing rules; nothing new is invented.
| gate | rule (existing function) |
|---|---|
| G.time, G.ot | `canReadRoster(v)` (roster-board.ts: settings key `hr.employee.create` via evaluate, or MANAGER) **or** `canViewPayroll(v)` (rbac.ts) |
| G.leave | the gate of `leave.ts#teamLeaveBalances` (OWNER · MANAGER · `hr.leave.read` · `hr.leave.decide`) — the report **calls** teamLeaveBalances, so its gate applies by construction |
| G.money (payroll-month · payroll-year · tax-month · tax-year · wages · register) | `canViewPayroll(v)` |
| money columns (class `$`) in time/ot/leave | `canViewPayroll(v)` |
| full national ID (class `I`) | register **export** only, and only OWNER or (`canViewPayroll` ∧ `hrScopeOf(v).unitIds === "*"`) |
| rows | `hrScopeOf(v)` → `scopedEmployeeIds` (home branch + open borrowing, H1.1 rule); unassigned employees only for all-branch viewers |

### 1.1 Matrix (report × viewer → ✓ allowed with all columns · ✓− allowed without `$` columns · — refused `NO`)
Viewers = the oracle's 10: owner · payAll (STAFF `*` + `hr.payroll.read`) · payBranch (STAFF [u1] + `hr.payroll.read`) · mgr (MANAGER [u1]) · mgrAll (MANAGER `*`) · leaveReader (STAFF [u1] + `hr.leave.read`) · hrAdmin (STAFF [u1] + `hr.employee.create`) · self (linked STAFF, no key) · member · other tenant.

| report | owner | payAll | payBranch | mgr | mgrAll | leaveReader | hrAdmin | self | member | other |
|---|---|---|---|---|---|---|---|---|---|---|
| time | ✓ | ✓ | ✓ u1 | ✓− u1 | ✓− | — | ✓− u1 | — | — | — |
| leave | ✓ | — (Q4) | — | ✓ u1 | ✓ | ✓ u1 | — | — | — | — |
| ot | ✓ | ✓ | ✓ u1 | ✓− u1 | ✓− | — | ✓− u1 | — | — | — |
| payroll-month / -year | ✓ | ✓ | ✓ u1 | — | — | — | — | — | — | — |
| tax-month / -year | ✓ ID masked | ✓ masked | ✓ u1 masked | — | — | — | — | — | — | — |
| wages (s.114) | ✓ | ✓ | ✓ u1 | — | — | — | — | — | — | — |
| register | ✓ export ID **full** | ✓ export full | ✓ u1 export **masked** | — | — | — | — | — | — | — |
Page and export follow the same gate. On every **page** the ID is masked (`•••` + last 4 digits; fewer than 4 digits ⇒ ""). Bank fields, house-registration address, SSO number, PIN, GPS/photo/device, attachments, leave/OT/correction reasons, notes, offboarding note/reason, phone/e-mail, linked user — **never** in any report, any viewer (S1.6 static + S4.6 DB).

### 1.2 Totals = visible rows only
Every total is the sum of the rows the viewer received (never a run total). A branch-limited payroll viewer sees `payroll-month 2031-10` net 14,795.05 (e1 only), not the run's 32,275.05 (lesson from H3.4).

## 2. Sources (read stored figures; never recompute pay/tax/SSO)
| report | period | source (owner of the table) | rule |
|---|---|---|---|
| time | `YYYY-MM` | `HrAttendanceDay` (judge snapshot, H2.5 — **not** the punch table `HrAttendance`) + `HrTimeCorrection` APPROVED by `day` | slots = rows not DAY_OFF/NO_SCHEDULE · workedDays = distinct dates ON_TIME/LATE/EARLY_OUT · late/early = count(>0) + Σ min · absentDays = distinct ABSENT dates · absentMin = Σ ABSENT ⌊span × (1 − leaveFraction)⌋, span = end − start (+1440 overnight) · leaveDays = Σ leaveFraction · workedMin/measuredOtMin/missingOut = Σ |
| leave | `YYYY` leave year | `leave.ts#teamLeaveBalances` (call it; one row per employee × policy item, strings as returned) | active employees only (teamLeaveBalances rule) |
| ot | `YYYY-MM` by `date` | `HrOtRequest` | counts PENDING/APPROVED/REJECTED (CANCELLED ignored) · approvedMin Σ APPROVED · class minutes/฿ from `segmentsJson` of APPROVED ∧ settledAt ≠ null ∧ revokedAt = null ∧ settleCode = null · amount = Σ stored `amountSatang` of those |
| payroll-month | `YYYY-MM` = periodKey | `HrPayrollItem` columns of APPROVED/PAID runs | REVERSED and DRAFT excluded |
| payroll-year | `YYYY` | same, periodKey `YYYY-*` | runs = count |
| tax-month / tax-year | Bangkok month/year of `payDate` | item columns + income 40(1) | income = v2 (engineVersion ≥ 2) `snapshot.whtIncomeSatang` · v1 `snapshot.baseSalarySatang + addSatang` · non-integer/negative ⇒ 0 — **the exact rule H3.4 uses for prior YTD** (`origin/wip/hr-h3.4` payroll.ts ≈:2491) · year = Σ of stored months (same set `ytdPriorV2` sums); `ytdJson` is **not** read (projection, and an S6.1 ratchet token) |
| wages (s.114) | `YYYY-MM` = periodKey | items + time rules for the same month | v1: rate = wage = snapshot.baseSalarySatang, ot = Σ snapshot.adjustments kind OT, holidayWork 0 · v2: rate = Σ BASE lines (none ⇒ ""), wage = Σ lines in `WAGE_CODES_V2` (BASE PRORATION DAY_WAGE HOUR_WAGE HOLIDAY_PAY UNPAID_LEAVE UNPAID_CAP LATE_RULE ABSENT_RULE), ot = Σ OT lines, holidayWork = Σ HOLIDAY_WORK lines · payDate = Bangkok day |
| register | `YYYY-MM-DD` as-of | `HrEmployee` + `HrSalaryProfile` (current) + new `HrEmployeeRegister` | all employees incl. ended (s.115) · age = full years at as-of (birthday counted when MM-DD reached; 29 Feb ⇒ 1 Mar in common years) |
Sort everywhere: code (null/"" last) → name → employeeId (JS code-unit compare). Bounded: one `groupBy`/aggregate or one bounded `findMany` per source; ≤ 12 queries per report at 300 employees (S6); hard cap `REPORT_LIMITS.employees = 2000` ⇒ `LIMIT` refusal.

## 3. Employee register (LPA) — field map
Law source: `shark-thai-law/references/domain-labour-payroll.md` §จ (s.112–115 read from the consolidated text of นิติธรรมาลัย = **[V2]**). Duty: employers with ≥ 10 employees; Thai language; within 15 days of start and of each change; keep ≥ 2 years after each employee's end of employment (s.115). SHARK warns, never blocks (SKILL §2).
| s.113 item [V2] | SHARK field | status |
|---|---|---|
| (1) first name + surname | `HrEmployee.name` (one field) | present — not split (debt D-1) |
| (2) sex | `HrEmployee.gender` | present |
| (3) nationality | — | **missing → `HrEmployeeRegister.nationality`** (migration) |
| (4) date of birth or age | `HrEmployee.birthDate` (+ age at as-of) | present |
| (5) current address | `addressLine subdistrict district province postcode` (joined by one space) | present (`houseRegAddress` is **not** the current address and is never shown) |
| (6) start date | `HrEmployee.startDate` | present |
| (7) position or duty | `position` (+ " / " + `department`) | present |
| (8) wage rate + other agreed benefits | rate: `HrSalaryProfile` payType → base/daily/hourly (current) · benefits: — | rate present (current value only — debt D-2) · **benefits missing → `HrEmployeeRegister.otherBenefits`** |
| (9) end of employment | `HrEmployee.endDate` | present |
| extra (controller ruling 2) | `nationalId` | masked / full per §1 — not an s.113 item |
s.114 wage-payment record [V2]: (1) working days and hours → `wages.workedDays/workedMin` · (3) rate and amount of wage, OT, holiday work, holiday OT → `wages.rate/wage/ot/holidayWork`; holiday OT ฿ split lives in the OT report (class OT_HOLIDAY). Whether the two together satisfy s.114 = **[U]** → neutral note `s114Note`.

### 3.1 Migration `20270109000000_hr_employee_register_fields` (one, additive)
```sql
CREATE TABLE "HrEmployeeRegister" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "systemId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
  "nationality" TEXT, "otherBenefits" TEXT, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrEmployeeRegister_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HrEmployeeRegister_nationality_len" CHECK ("nationality" IS NULL OR char_length("nationality") BETWEEN 1 AND 60),
  CONSTRAINT "HrEmployeeRegister_otherBenefits_len" CHECK ("otherBenefits" IS NULL OR char_length("otherBenefits") BETWEEN 1 AND 500));
CREATE UNIQUE INDEX "HrEmployeeRegister_employeeId_key" ON "HrEmployeeRegister"("employeeId");
CREATE INDEX "HrEmployeeRegister_systemId_idx" ON "HrEmployeeRegister"("systemId");
CREATE INDEX "HrEmployeeRegister_tenantId_idx" ON "HrEmployeeRegister"("tenantId");
```
Why a new table and not two columns on `HrEmployee`/`HrSalaryProfile`: the `HrEmployee` and `HrSalaryProfile` model blocks are pinned by older oracles (qc-hr-h3.5 S1.2 `empSame`, qc-hr-h0.5/h0.7/h1.1/h4.4 schema blocks) and the profile DTO key list by qc-hr-h1.2 S6.1 / qc-hf-hr-privacy / qc-hr-lib frozen privacy — two columns there would need ≥ 5 ORACLE-EDITs. No relation field (FK-less like `HrBankFile.runId`) so the HrEmployee block stays byte-identical; orphans after an employee delete are invisible (tenant + system + employee join) — debt D-3. PDPA: purpose = legal obligation (s.24(6), employer ≥ 10 [V2]; application = inference); nationality is not a s.26 category (race is) [V reading of s.26]; `otherBenefits` = wage information ⇒ payroll class. Writer `saveRegisterFields` (brief R10); the form lives in a register card on the employee page.

## 4. Nav decision
No new tab. Mockup 01's tab row shows "รายงาน", but `hrTabs` labels are pinned by qc-hr-h2.5 S9.5 (and order checks in h2.2/h2.11) and the plan only says "pages". Mockup 01's **month card** has a "รายงาน" link — that is where the entry goes: `hr-overview-reports-link` on the team overview month card + one hub card (shown only when `reportAccessOf(v).reports` is non-empty). Page `/app/sys/[id]/hr/reports?report=…&period=…&unit=…`. A tab can be added later with one marked ORACLE-EDIT (Q7).

## 5. Export
Formats CSV (UTF-8 BOM, `bank-files/generic.ts#csvBytes`) and XLSX (`bank-files/xlsx.ts#xlsxBytes`, sheet "Report"). Header = locale labels (register: Thai always, s.112). Totals row for reports with `totals: true`: first cell "รวม"/"Total". Cells: minutes integers · money baht 2 dp (`-` sign allowed) · leave days 1 dp · dates ISO CE · labels of gender/payType/status in Thai (register, wages). Guard `exportProblem(bodyRows, names)`: numeric/date cells exempt; any other cell not writable ⇒ `ENCODING` (first), formula-like (`bank-files/generic#formulaLike`) ⇒ `FORMULA`; list display names in row order — never neutralised. Generated on demand; **nothing stored** (no manifest — no requirement found: the audit row records who exported what). Audit `hr.report.export` per success.

## 6. Debts
D-1 name not split into first/last · D-2 register shows the current wage rate (no history of rate changes; s.113 "amend within 15 days" is the shop's job) · D-3 orphan register rows after a hard employee delete; warn on delete of an employee with endDate < 2 years (s.115) — H5.1 · D-4 self-service export of own time record (s.114(1)) — H3.8/H5 · D-5 daily/hourly v2 rate (NA-11) — wages rate "" until H3.4b · D-6 historical branch (rows filter by current home branch) · D-7 holiday-OT ฿ inside the wages record (needs OT-request ↔ run link; `sourceRef` is a ratchet token).
