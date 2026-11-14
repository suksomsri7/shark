# H5.2 — privacy bug hunt (cross-ticket) · 14 Nov 2026

Base: `session/hr` 60659e7c0 → branch `wip/hr-h5.2-privacy` (no product change). Lane DB `ep-orange-dust-aotwbyc7` (qc-hr.sh), `migrate status` = up to date (226, nothing to deploy).
Probes (kept): `scratchpad/h52p/p1-sweep.mts` (fixture + sweep + inference + stale + write-side + audit), `scratchpad/h52p/p2-stale-ai.mts` (pending AI proposal).
Raw output: `scratchpad/h52p/out-p1.json`, `run2.log`, `run-p2.log`. Runs: p1 ×2 (first aborted on a NUL byte in my own test string, cleaned up), p2 ×1.
Tenants: only `qc-h52p-*`; every run ended `RESIDUE none` and `tenants(qc-h52p-*)=0` (generic sweep of every tenantId table + users/sessions). No law rows were inserted (no day-level money test needed, see §2).
Outbound network: 0. The net guard logged 1 blocked `fetch` with an empty host from `downloadPayslipPdf` (react-pdf loading the local Sarabun font file path, `payslip-pdf.tsx:18-22`); not a network request, the PDF still rendered.

## Fixture
Shop A: 3 branches U1/U2/U3 + other shop B. 12 employees: U1 e1 (monthly, linked to `emp`), e2 (hourly), e3, eOwn (linked to OWNER); U2 e4, e5 (hourly), e6 (hourly, **borrowed into U1** from D-3, open), eLeft (ENDED, linked to `exEmp`); U3 e7, e8; eNoUnit; shop B eB.
Sentinels (353 strings): national id (valid checksum), SSO no, house-reg address, bank account no/name, doc URL, phone, e-mail, address, birth date, emergency name/phone, employee note, PIN hash, roster note, punch note, GPS lat, photo key, device id, leave reason ("MEDICAL-HIV"), OT reason, correction reason, review-note body, salary/hourly rate, payslip gross/net (PAID v1 run, per-person amounts, baht + satang forms).
Viewers: OWNER · payAll (STAFF `*` + hr.payroll.read) · payU1 (STAFF [U1] + hr.payroll.read) · hrAdmin (STAFF `*` + hr.employee.create) · mgrU1 (MANAGER [U1], no pay) · rosterOnly (hr.roster.read) · emp · exEmp (employee ENDED, membership still accepted) · kiosk (STAFF [U1] + hr.attendance.clock) · other-tenant OWNER · API key `hr-read` · API key `hr-payroll-read` · AI actor (aiMemberActor from DB Membership) for each human.
Not covered: LINE display name (needs a real ChatContact/LINE link — only the fixed notice table and HrNotice rows were checked).

## 1. Surface matrix (summary)
1,996 calls · 142 surfaces · 22 viewer identities · targets own-branch / other-branch / borrowed / other-tenant / unknown id.
| kind | surfaces | data | refused | leak rows |
|---|---|---|---|---|
| service readers (ctx, viewer, …) incl. 9 reports × page/CSV/XLSX, payslip PDF, bank/filing previews, labour, inbox, daily-brief hook | 86 | 450 | 1,120 | 22 real (all = findings F1–F3) + 26 spoofed-context (F5) |
| self readers (`/app/me/hr`) | 25 | 90 | 157 | 0 |
| AI tools `hr_*` (T1–T4, T6) | 9 | 29 | 71 | 0 |
| REST `/api/v1/hr` (both keys, all 13 GET ops incl. 9 reports) | 22 | 47 | 29 | 0 |
Refusal byte parity (forbidden vs unknown id, same viewer, requestId stripped): **0 mismatches**. Other-tenant ids: never returned data to a shop-A viewer.
API: serializers dropped every PII/reason sentinel (leaves, roster, attendance, employee); pay key saw slip money only (allowed). AI: no sentinel, no forbidden key, names stripped of bidi/control.
Daily-brief hook (`hrTodayLine`): counts only, no names, null for non-roster readers.
Harness-only (excluded): raw `listEmployees` rows contain every column, but every page maps them to `{id,name,…}` before render (ui.tsx:141/297/809, payroll-ui.tsx:243) — not a surface.

## 2. Findings

### F1 — MAJOR · Branch-limited payroll viewer sees a BORROWED employee's national id, SSO no, house-reg address, bank account, ID-card doc URL
Cause: `src/lib/modules/hr/privacy.ts:57` gates the profile with `employeeInScope` (home unit **or open borrowing**), then `:92-101` adds the sensitive block for any payroll viewer. H3.8 Q2 (`hr-brief-H3.8.md:20,48`) and H4.2 R1 (`labor.ts:4`) rule "borrowings do not widen pay — `employeeInScope` would leak it"; the slip path was fixed (`payslip.ts homeInScope`), the profile path was not.
Repro: payU1 = STAFF unitAccess [U1] + hr.payroll.read; e6 home U2 with an open `HrEmployeeUnit` into U1 → `loadEmployeeProfileForViewer(ctx, payU1, e6)` (= page `/hr/employees/[e6]`) → `nationalId`, `ssoNumber`, `houseRegAddress`, `bankAccountNo`, `bankAccountName`, `docs[].url`, `payType`.
Leaked sentinels: e6.nationalId, e6.ssoNumber, e6.houseReg, e6.bankAccountNo, e6.bankAccountName, e6.docUrl. Same check on `slipForViewer`/`laborDay` = refused/excluded (control).
Latent twin: `privacy.ts:132` (payroll branch of `loadPayslipForViewer`) uses the same `employeeInScope` → returns e6's slip (gross/net). The slip page routes payroll viewers to `slipForViewer` first, so it is unreachable today, but the export still exists.

### F2 — MAJOR · H3.9 reports + exports (page, CSV, XLSX) give a branch-limited payroll viewer the pay of borrowed employees — for any past period
Cause: `src/lib/modules/hr/reports.ts:172` filters rows with `unitWhere(scope)` (home **or borrowing open today**), documented at `reports.ts:3`. Contradicts H3.8 Q2 / H4.2 R1 (home unit only). Because "today" decides, borrowing someone for one day exposes their **whole history**: e6 borrowed since D-3 (Nov) shows in the **October** payroll-month, payroll-year, tax-month, tax-year, wages and register reports.
Repro: `loadReport(ctx, payU1, {report:"payroll-month", period:"2026-10"})` (also `exportReport` CSV/XLSX, 6 money reports × 3 surfaces = 18 leak rows).
Leaked: e6.slipGross, e6.slipNet (payroll-month/-year, wages), e6.slipGross (tax-month/-year), e6.hourlyRate (register). Same viewer on `slipForViewer(e6)` = NO.

### F3 — MAJOR · Payroll page: borrowed employee's salary + whole-run totals ⇒ exact pay of everyone outside the viewer's branch (cross-ticket inference)
Cause: `src/lib/modules/hr/payroll-ui.tsx:93-105` — employees = `listEmployees(ctx,200,hrScopeOf)` (includes borrowed e6 ⇒ salary form shows e6's rate and e6's run item via `shownItems`), and `:350-362` prints every run's **system-wide** `totalNetSatang`, `totalGrossSatang`, `totalSsoEmployeeSatang`, `totalWhtSatang` and `items.length` to the branch-limited viewer (accepted in H1.1 R12.3 before H3.8/H4.2 introduced home-only pay + the "no pay of people you may not see" rule; H4.2 even dropped count-based suppression).
Numbers (PAID run 2026-10, payU1): total gross 40,620,295 sat − visible in-scope items 20,237,926 = **20,382,369** = exact sum of the 5 hidden employees (verified against DB). `items.length`=10 vs 5 visible ⇒ 5 hidden people. With one other-branch employee (typical 2-branch shop) this is that person's exact gross, SSO and withholding tax (tax total − visible tax). Repeating per period gives the monthly series; a reversed/zeroed run shows as a total change (existence of a payroll event).
Leaked: e6.hourlyRate (17,671 sat/h) and e6.slipGross/Net directly; e4/e5/e7/e8/eLeft gross by subtraction.

### F4 — MINOR · Lower role can block every money export with a renamed employee; refusal echoes the raw name (bidi/control/markup) to the exporter
Cause: `reports.ts:700-701` `exportProblem` → `fail(ENCODING|FORMULA, … .replace("{names}", names.join(", ")))`. An `hr.employee.create` holder (no pay rights) renames one employee to `ab‮cd⁦ef\u0007…` → OWNER's payroll-month/-year, tax-month/-year, wages, register, leave exports (CSV and XLSX) all return `ENCODING` until fixed (time/ot unaffected). The refusal string carries the bidi/control chars unescaped into the UI. Nothing leaks across roles; it is a denial-of-export + display-spoof vector. Formula-prefixed names (`=HYPERLINK`, `+cmd`, `-2+3`, `@SUM`, tab) are refused, not written (good); XLSX had no `<f>` cells.
Also accepted unfiltered: a plain employee's leave reason with `=HYPERLINK(…)` + U+202E + BEL via `service.requestLeave` (reasons are not exported/AI'd, so no sink found).

### F5 — MINOR (defense in depth) · ~35 service readers trust the caller's ctx + viewer instead of the DB Membership
Readers that returned data for an other-tenant OWNER viewer passed with shop A's ctx, and for a viewer whose permissions were removed / membership deleted in the DB (stale object): `privacy.loadEmployeeProfileForViewer` / `loadPayslipForViewer` / `leaveItemsForViewer`, `inbox.listInbox` / `teamOverview*` / `inboxCounts` / `teamLeaveQuota`, `roster.listRoster` / `checkRules`, `rosterBoard.*`, `judge.loadAttendanceBoard` / `loadAttendanceMonth`, `leave.leaveDetail*` / `teamLeaveBalances`, `correction.*`, `ot.otRequestList`, `swap.listSwapsForManager`, `lifecycle.listReviewNotes` / `listChecklist` / `lifecycleDue`, `stock.listStockCharges`, `work-entries.workEntryDays/Preview`, `attendance-pay.attendanceDeductionPreview`, `svc.kioskRoster`, `avail.leaveDutyHints`, `clock-settings.listClockSites`, and the page composition `listSalaryProfiles` (no viewer at all).
Leaked in that model: every reason, review note, roster note, contact field and pay figure of shop A. DB-gated (refused correctly): reports, labour, payslip, salary certs, bank files, filings, opening YTD, register fields, line status, AI tools (hrAiViewer), REST (key/issuer re-read).
Not exploitable today: every caller builds ctx.tenantId + viewer from `requireTenant()` per request (and AI/REST re-read the DB). Risk = the next caller that caches a viewer or derives tenantId from a URL. Recommend the `gateOf`/`memberOf` pattern (reports.ts:115, payslip.ts memberOf) in privacy.ts + inbox.ts at least.

## 3. Stale authority (all OK except F5's model)
- Key revoked ⇒ 401; issuer demoted OWNER→MANAGER ⇒ 403 `forbidden` on every op incl. read-only ones; ended employee via pay key ⇒ 404 (profile, slip, attendance month).
- Pending AI proposal `hr_draft_roster` (p2): proposer moved U1→U2, then membership deleted, also with the **old** membership object passed ⇒ refused each time (`SCOPE`/`VIEWER` audit), proposal stays PENDING, 0 roster rows; unpermitted roster reader ⇒ "not found", PENDING kept. (Owner cannot confirm another user's proposal — house rule, not privacy.)
- Narrowed payroll viewer / removed member: DB-gated readers refused immediately; F5 readers did not (only reachable with a stale object).
- Ex-employee with live membership: `myToday` (no colleagues, clock refused), `mySwapTargets` refused, `myWeek`/`myShiftsAhead` empty, `mySlips` = own slips only (intended).
- LINE: leave decision planned 1 `HrNotice` (`line=NONE`, policy OFF), dedupeKey = ids only; no AppNotification text. Fixed notice table: kind + outcome word only, no 3+ digit numbers.

## 4. Write-side
See F4. AI T1/T4 outputs: no bidi/control chars, `untrusted` flag + notice present. 10k-char position: payslip PDF rendered (21.5 KB). API key name with markdown/bidi: stored, never echoed in REST bodies; audit `after.keyName` keeps it raw (data, not rendered as HTML).

## 5. Log / audit hygiene
92 audit rows from the fixture's actions (`hr.payslip.download`, `hr.report.export`, `hr.api.report.read`, `hr.api.payslip.read/.history`, `hr.ai.proposal.refused`), 1 outbox row, 0 AI proposals with PII: **no sentinel** (amount, national id, bank, reason, note) in any `before/after/payload/summary`. `hr.report.export` stores column keys + period + unitId only.

## Surfaces I could NOT call (and why)
- Server actions / RSC pages under `src/app/**/hr/**` directly (need Next request context / `requireTenant` cookies): covered through the service readers they call, page compositions reproduced (payroll page, employees page).
- PDF text of payslip / salary cert / 50 ทวิ: fonts embed as glyph ids, so sentinel search in PDF bytes is best-effort (file name only verified); salary/tax certificates were not issued in the fixture (lists empty).
- Bank-file / filing generation (writes files) — previews only; previews refused for non-gate viewers, owner preview not deep-checked for format.
- LINE send path + webhook replies (would need the fake LINE server of qc-hr-h4.5; bodies come from the fixed table checked above).
- `leave.myLeaveBalances` threw `TimeRuleError` for my `{}` input (harness arg, not a finding).
- Day-level labour money: no SSO law row in force for today ⇒ money null for everyone; the borrowed-exclusion rule was read in code (`labor.ts:4, :371`) and the month ACTUAL figure for payU1/U1 (16,470,341 sat) matched home-unit people only (e6 excluded) — no new law rows inserted.
