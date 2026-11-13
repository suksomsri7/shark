# H3.9 — HR reports + employee register (ทะเบียนลูกจ้าง) + CSV/XLSX exports with PDPA column rules

> **Controller rulings 13 Nov applied (Q1/Q2 changed, Q5 extended, others accepted).** Lane C · **PDPA + money read-only ⇒ reviewer + hunter (privacy lane).** **Mig** `20270109000000_hr_employee_register_fields` (1 new table, additive). Base `session/hr` 5d7bcf0c4 (H3.2 · H3.5 · H2.12). **Builder starts only after H3.4 is merged** (v2 snapshot fields). Branch `wip/hr-h3.9`. Oracle `scripts/qc-hr-h3.9.mts` + `scripts/fixtures/hr-h3.9-{vectors,texts}.json` · notes `wo-notes/hr-H3.9-oracle.md` (hand derivations) · full matrix/sources/register map `wo-notes/hr-H3.9-design.md` (part of this brief). Law: `shark-thai-law` domain-labour-payroll §จ (s.112–115 **[V2]**), common-pdpa; SKILL §2 (warn, never block).

## 1. Facts (5d7bcf0c4)
F1 Judge results = `HrAttendanceDay` (per slot; status ON_TIME/LATE/EARLY_OUT/ABSENT/LEAVE/DAY_OFF/NO_SCHEDULE, minutes, `leaveFraction`). The punch table `HrAttendance` is read only by clock.ts/judge.ts/service.ts/pos-seam-read.ts/correction.ts (qc-hr-h2.6 S1.3).
F2 `leave.ts#teamLeaveBalances(ctx, viewer, {year})` = team × policy balances (strings `fmtTenths`), gate OWNER · MANAGER · `hr.leave.read` · `hr.leave.decide`.
F3 OT: `HrOtRequest.segmentsJson` = `[{cls OT_WORKDAY|OT_HOLIDAY|HOLIDAY_WORK, minutes, multiplierBp, amountSatang}]`, `amountSatang`, `settledAt`, `revokedAt`, `settleCode`.
F4 Items: `gross add deduct ssoBase ssoEmployee ssoEmployer wht net` columns (v1 = v2). v1 snapshot `{baseSalarySatang, addSatang, adjustments[{kind,amountSatang}]}`; H3.4 v2 snapshot adds `{engineVersion 2, payType, lines[{code,amountSatang,…}], whtIncomeSatang, ssoWageSatang, flags, carry, receivable}` (`origin/wip/hr-h3.4` design §2). H3.4's prior-YTD income rule: v2 `whtIncomeSatang`, v1 `baseSalarySatang + addSatang` (payroll.ts ≈:2491).
F5 Reusable: `bank-files/generic.ts` (`csvBytes` BOM/CRLF/quoting, `formulaLike`, `cellWritable`), `bank-files/xlsx.ts#xlsxBytes`, `bank-files/download-route.ts#isRouterFetch` (204 rule). `canViewPayroll` = OWNER ∨ `hr.payroll.read`; `assertCan` lets MANAGER pass any `hr.*` key ⇒ read keys explicitly.
F6 Ratchets: qc-hr-h1.3 S6.1 counts `ytdJson|filingJson|bankFileKey|lawRowIds|sourceRef|HrWorkEntry|HrLawTable` per file under hr/**; qc-hr-h1.2 S6.4 forbids `lat|lng|accuracyM|photoKey|deviceId|attachmentKey`; F16.1 sensitive list; F16.3 page guard from hr/privacy or hr/scope. `HrEmployee`/`HrSalaryProfile` model blocks and the profile DTO key list are pinned by ≥ 5 older oracles.
F7 No employee field for nationality or "other agreed benefits" (s.113(3), (8)).

## 2. Scope (controller ruling 1) — 9 report ids
`time` (YYYY-MM) · `leave` (YYYY) · `ot` (YYYY-MM) · `payroll-month` (YYYY-MM) · `payroll-year` (YYYY) · `tax-month` (YYYY-MM, Bangkok pay month) · `tax-year` (YYYY) · `wages` = s.114 wage-payment record (YYYY-MM) · `register` = s.112–113 (as-of YYYY-MM-DD). Each = page + CSV + XLSX. Columns, classes (`P` plain · `$` money · `I` national ID), sum flags, th/en headers = fixture `catalog` (copy verbatim into `REPORT_CATALOG`).

## 3. Contract
R1 **Files.** New: `hr/reports-rules.ts` (pure) · `hr/reports.ts` (server) · `hr/reports-ui.tsx` (server; client parts get DTOs only) · `hr/reports-route.ts` (`reportExportGet`) · page `src/app/app/sys/[id]/hr/reports/page.tsx` · route `…/hr/reports/export/route.ts` · migration. Marked hunks (`HR H3.9 ▸ … ◂`): `prisma/schema/hr.prisma` (model appended) · `src/lib/core/scope.ts` (`HrEmployeeRegister: sys()`) · `scripts/hr-qc-env.mts` · `hr/ui.tsx` and/or `hr/overview-ui.tsx` (link) · employee page (register card) · `messages/{th,en}/common.json` (`hr.report.*`) · `scripts/hr-ui-inventory.json` (`wo:"H3.9"`, `oracle:"qc-hr-h3.9"`) · `scripts/visual-hr.mts` (`"3.9"`).
R2 **Pure** `reports-rules.ts`: imports only `./bank-files/{generic,xlsx,encode}` (+ type-only); no db/clock/random. Exports `REPORT_IDS REPORT_CATALOG REPORT_LIMITS {employees:2000} REPORT_TEXT REPORT_TEXT_EN reportTextFor(locale) WAGE_CODES_V2 maskCitizenId bahtText tenthsText addressOf ageOn absentMinOf whtIncomeOf wagePartsOf columnsFor(report,{money,fullId},"page"|"export") periodOk(report,period) reportTable({report,keys,rows,totals,locale}) reportBytes(table,"CSV"|"XLSX") exportProblem(bodyRows,names)`. Vectors: fixture `pure` (S2.4–S2.10).
R3 **Rules per report** = design §2 (sources, period kinds, per-column definitions, sort code→name→id, v1/v2 income and wage rules, runs APPROVED/PAID only; **v2 runs only when finalized** = `journalEntryId` set or `stepsJson.finalized = true` (ruling Q5, H3.4 `runFinalizedInTx`; S7.3 behind the H3.4 presence guard)). Read stored figures; **never** call a pay/tax/SSO calculator (S1.6 list) and never import `payroll-run-rules`/`payroll-rules*`/`payroll` from reports-rules/reports.
R4 **Privacy** = design §1 matrix (single decision point `reportAccessOf(v)` → `{reports, money, fullId}`): gates time/ot = `canReadRoster ∨ canViewPayroll`; leave = teamLeaveBalances gate ∨ `canViewPayroll` (ruling Q1 — same balance code, payroll viewers scoped by their branches; reasons/attachments never); payroll/tax/wages/register = `canViewPayroll`; `$` columns only with `canViewPayroll`; rows by `hrScopeOf` (+`scopedEmployeeIds`), unassigned only for all-branch; **totals from visible rows only**; national ID masked (`•••`+last 4) **everywhere by default, register export included** (ruling Q2); full ID only in the register export of OWNER / all-branch payroll viewer **while the system setting `registerFullId` is ON**. Never: bank fields, `houseRegAddress`, `ssoNumber`, PIN, GPS/photo/device, attachments, reasons, notes, offboard data, phone/e-mail, `linkedUserId`, `snapshotJson`, `ytdJson`. Self (no keys) and plain members: `NO`.
R5 **Read ownership.** Judge rows via `HrAttendanceDay` (one aggregate/bounded read), never `HrAttendance`. No law table, no `HrWorkEntry`, no S6.1/S6.4 token (`nationalId` only inside reports.ts).
R6 **Texts** = `hr-h3.9-texts.json` byte-exact (`REPORT_TEXT`/`_EN`). [V2]/[U] notes are neutral ("อ้างจากฉบับรวมแก้ไข โปรดตรวจกับที่ปรึกษาแรงงาน").
R7 **Export** `exportReport(ctx, viewer, {report, period, unitId?, format "CSV"|"XLSX"}, opts?) → {ok:true, bytes, fileName "HR_<report>_<period>.csv|.xlsx", contentType "text/csv; charset=utf-8" | XLSX type, rowCount, columns} | {ok:false, code, reason}`. Bytes = `reportBytes(reportTable(…))` through the H3.5 writer (no second writer). Header = labels (register Thai always); totals row "รวม"/"Total" when `catalog.totals`. Guard on body rows: `ENCODING` then `FORMULA` (numeric/date cells exempt), texts with `{names}`. Generated on demand, **nothing stored**.
R8 **Route** `reportExportGet(req, ctx, viewer, opts?)` (route.ts only wires `requireTenant` + `hrViewerOf`): `rsc`/`next-router-prefetch` ⇒ 204 before any read · 200 `Content-Disposition: attachment; filename="…"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` · NO 404 · INPUT 400 · FORMULA/ENCODING/LIMIT 409 · refusal = fixed text, no bytes. Query `report period format(csv|xlsx) unit`.
R9 **Audit** each successful export: `writeAudit({action:"hr.report.export", targetType:"HrReport", targetId:<report>, actorId})`, `after` keys exactly `report period format rowCount columns unitId fullId` (column keys, no values; `fullId` = full IDs written). Page views and refusals are not audited.
R10 **Register fields.** Migration = design §3.1 (table `HrEmployeeRegister`, FK-less, unique `employeeId`, CHECK 1–60 / 1–500). `saveRegisterFields(ctx, viewer, {employeeId, nationality?, otherBenefits?})`: nationality = `canManageHrSettings` + employee in scope; otherBenefits also needs `canViewPayroll`; trimmed, "" ⇒ null, control chars or over length ⇒ `registerInput`; else `NO` (identical). Audit `hr.register.update` after `{employeeId, fields}` (names only). `loadRegisterFields` returns `{ok, nationality}` (+ `otherBenefits` for payroll viewers). Register warnings = counts per empty statutory field (`registerStatutory`); notes `registerDuty` (≥ 10 active) or `registerUnder10`, plus `registerRetention`, `registerMissing` when any warning.
R10b **Full-ID setting (ruling Q2)** in `AppSystem.settings.hrReports.registerFullId` (default false; merge only this key): `getReportSettings(ctx, v) → {ok, registerFullId, warning: T.fullIdWarning}` (OWNER · payroll viewers) · `setReportSettings(ctx, v, {registerFullId, acknowledge?})` OWNER only (else `settingOwner`); turning ON needs `acknowledge: true` (else `ackFullId`); audit `hr.report.setting` after `{registerFullId}`. UI on the reports page (owner): `hr-report-fullid-toggle|ack|warning|save`, warning text [U]-neutral.
R11 **Nav:** no new tab (hrTabs/layout labels = base). Entry = `hr-overview-reports-link` on the overview month card (mockup 01 "รายงาน") + hub card, shown only when `reportAccessOf(v).reports` ≠ [].
R12 **UI** (mockup 01 month view for `time`, existing HR table patterns for the rest): picker `hr-report-picker` (only allowed reports), `hr-report-period`, `hr-report-unit` (scope units), `hr-report-table`, `hr-report-row-<employeeId>`, `hr-report-totals`, `hr-report-export-csv`/`-xlsx` (links to the route), `hr-report-notes`, `hr-report-warnings`, `hr-report-empty`; register card `hr-register-card|nationality|benefits|save`. Money shown as ฿ with separators from DTO strings; th/en parity; tokens only; ≥ 44 px; visual spec "3.9" (owner · payroll · manager, 3 sizes) by controller.
R13 **Performance:** one aggregate or bounded read per source; ≤ 12 queries and ≤ 5 s per report at 300 employees × 31 days / 12 runs × 300 items (S6). Over `REPORT_LIMITS.employees` ⇒ `LIMIT`.

**DTO** `loadReport(ctx, viewer, {report, period, unitId?}, {locale?})` → `{ok:true, report, period, unitId, columns:[{key,label}], rows:[{employeeId, values:{<columnKey>: string}}], totals:{<sumKey>: string}|null, warnings:[{field,count}], notes:string[]}`; values = the export cell strings (ID masked). Refusals `{ok:false, code:"NO"|"INPUT"|"LIMIT", reason}`; unit outside scope / unknown ⇒ rows []. Context system must be an HR system of the tenant, else `NO`.

## 4. Privacy matrix (compact — full table design §1.1)
| | owner | payroll all | payroll branch | manager | leave key | hr-admin key | self · member · other |
|---|---|---|---|---|---|---|---|
| time · ot | all cols | all | branch | branch, no ฿ | — | branch, no ฿ | — |
| leave | ✓ | ✓ | branch | ✓ | ✓ | — | — |
| payroll · tax · wages | ✓ | ✓ | branch | — | — | — | — |
| register | ID masked; full in export only with setting ON | same as owner | branch, ID always masked | — | — | — | — |

## 5. Register fields (s.113 [V2])
Present: name (1) · gender (2) · birthDate/age (4) · current address (5) · startDate (6) · position/department (7) · wage rate from salary profile (8, current only) · endDate (9). **Missing → added by the migration:** nationality (3) · other agreed benefits (8). Thai headers (s.112) · ≥ 10 employees duty · 15-day update · 2-year retention (s.115) shown as neutral notes, never enforced.

## 6. Run list (builder)
Rebase on session/hr with H3.4 → migration (lane DB) → `prisma generate` → pure → service → route/page/UI → `qc-hr-h3.9` ×2 → regression `qc-hf-hr-privacy`, `qc-hr-h1.1`, `qc-hr-h1.2`, `qc-hr-h1.3`, `qc-hr-h2.5`, `qc-hr-h2.7`, `qc-hr-h2.9`, `qc-hr-h3.4`, `qc-hr-h3.5`, `qc-payroll`, `fitness-hr`, `nav-functions` → clean typecheck. Expected ORACLE-EDIT: none (new table chosen for that); report any pin that trips.

## 7. Frozen vs base
`payroll*.ts` · `payroll-ui.tsx` · `privacy*.ts` · `service.ts` · `hr/scope.ts` · `judge.ts` · `clock.ts` · `leave*.ts` · `ot*.ts` · `correction.ts` · `work-entries.ts` · `law.ts` · `nav.ts` · `bank-files/**` · `rbac.ts` · `outbox-consumers.ts` · `approval/**` · `account/**` · seed · fitness-hr · qc-hr-lib · older oracles (S1.5).

## 8. Out of scope / debts
Filings (H3.6) · payslips/certificates (H3.8) · labor % (H4.2) · self export (D-4) · rate history (D-2) · name split (D-1) · delete warning (D-3) · historical branch (D-6) · holiday-OT ฿ in wages (D-7) — design §6.

## 9. Open questions [default in force]
Q1 **Ruled:** payroll viewers see the leave report (all-branch: all · branch-limited: their branches).
Q2 **Ruled:** masked in every export by default; owner setting (default OFF, warning, acknowledge) turns on full IDs in the register export for OWNER / all-branch payroll only; audited `fullId`.
Q3 Branch-limited payroll viewer register export? [ID masked. Alt: full.]
Q4 Managers and the register? [Refused (wage rate is s.113(8)). Alt: register without `$`/ID columns for managers.]
Q5 **Ruled:** APPROVED + PAID; v2 only when finalized (presence-guarded S7.3).
Q6 Tax month/year? [Bangkok date of `payDate` (same as `ytdPriorV2`). Payroll reports use `periodKey`.]
Q7 Nav? [No tab; overview month-card link + hub card. Alt: tab "รายงาน" after "เงินเดือน" with one ORACLE-EDIT to qc-hr-h2.5 S9.5.]
Q8 Absent minutes? [Shift span × (1 − leaveFraction), floor; no break subtraction.]
Q9 OT "minutes by multiplier"? [By segment class (OT_WORKDAY 1.5× · HOLIDAY_WORK 1×/2× · OT_HOLIDAY 3×) from settled requests.]
Q10 Export audit only? [Yes — page views not audited; refusals not audited.]
Q11 Register rows? [All employees incl. ended (SHARK never deletes; s.115).]
Q12 Self-service time record? [Not here (D-4).]
