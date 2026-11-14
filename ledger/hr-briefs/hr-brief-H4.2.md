# H4.2 — labour cost % (ค่าแรงต่อยอดขาย) + staffing demand (screens 01 · 03)

> **DRAFT r0 — Q defaults (end) in force unless ruled.** Lane C · privacy (salary inference) + cross-module ⇒ reviewer + hunter (privacy). **No migration.** Base `session/hr` 93a0b76ee. Branch `wip/hr-h4.2`. Oracle `scripts/qc-hr-h4.2.mts` (+ `qc-hr-lib.mts`). Plan: master plan §4 `H4.2` + §7.1 row "labor %". Design: DESIGN §E8, §5 POS row, §6 rows 01/03. Mockups: `design-hr/01-team-overview.body.html` (labour card + month line) · `03-roster.body.html` (column heads "จัด/ต้องการ", footer, panel "ความต้องการคนรายชั่วโมง").

## 1. Facts (at base)
F1 No POS sales facade: `pos/index.ts` has none. `pos/reports.ts reportHourly` (:1264) = 24 rows summed over the range, `pos.report.view` per unit (`scopeOf` :394), POS day cutoff, net = `grandTotalSatang` (VAT-incl., service charge in, tip/deposit/VOIDED out, REFUND negative in its hour); its forecast (d−7k, k=1..4) counts unfinished weeks as 0 ⇒ unusable for next week.
F2 `pos→hr` edge exists (`fitness.mts:331`, lazy); `hr→pos` not. Two-way lazy edges have precedent (crm↔kanban :377).
F3 `HrSalaryProfile` = current rate only (MONTHLY/DAILY/HOURLY, `ssoEligible`). Engine day formulas `payroll-run-rules.ts:355-372`; N = `getNormalMinutesPerDay` (`work-entries.ts:104`); law readers `law.ts`.
F4 `HrRosterEntry` (BKK start date, start/end/break, `crossesMidnight`, day `unitId`, `published`); `roster.ts:181 unitOfDay`. Actuals: `HrPayrollItem.gross/ssoEmployer`, `HrWorkDay.workMin/unitId` (periodKey `YYYY-MM`).
F5 Reuse: H3.9 `reports.ts gateOf` (DB membership) · `canViewPayroll` · `hrScopeOf` · `canReadRoster` · `settings-lock.ts` (HR-SET-1).

## 2. Scope
In: POS seam · pure rules · day/week/month labour + demand · card on 01, demand row/footer/panel on 03 · settings `hrLabor`. Out: AI/Daily Brief (H4.3 consumes `laborDay`) · REST (H4.8) · CSV · OT/commission in estimates · rate history · non-POS sales (booking service bills already reach POS via SVC B.10).

## 3. Sales seam (owner = **POS**)
R1 Marked hunks `// HR H4.2 ▸ … ◂`: `pos/reports.ts` `salesByHour(ctx:{tenantId,unitId}, actor: RegisterActor, {from,to}, client?)` → `{ok:true, connected:false}` | `{ok:true, connected:true, cutoffMin, today, days:[{date, hours:[{hour, netSalesSatang, billCount}]}]}` (sparse; `hour` = `reportHourly` key, ≥24 after midnight; `today` = `bkkBusinessDate(now,cutoff)`) | `ReportRefusal`. Same doc rules + `REPORT_PERMISSION` at the unit as `reportHourly`; range ≤ 45 days; POS = the unit's active POS (rule of `service-bill.ts posOfUnit`). `pos/index.ts`: `export const salesFacts = { salesByHour }`. No POS behaviour change.
R2 `fitness.mts` hunk `"hr→pos"`; only `hr/labor.ts` imports `@/lib/modules/pos`, via `await import`. HR never reads `PosSale`.

## 4. Definitions (integer satang · `halfUp` on BigInt)
D1 Calendar: HR day = BKK date. Sales keys = POS business date + hour key (`cutoffMin`). Entry of date d covers [d+start, d+end(+1440 if crossing)); each minute maps to `bkkBusinessDate(t,cutoff)` + hour key. Employee-day cost stays on HR date d.
D2 Population: profile exists, `startDate ≤ d` (null ok), `active` or `endDate ≥ d`. No profile ⇒ 0 + `flags.noProfile`.
D3 Paid minutes m = span − break (≥0). Entries: published only on 01; all (drafts too) on 03.
D4 Day wage: MONTHLY share = ⌊base/D⌋ + (dayOfMonth ≤ base mod D ? 1 : 0), D = days in month, every calendar day. DAILY = halfUp(daily×min(N,Σm)/N). HOURLY = halfUp(hourly×Σm/60). Holiday row on d (unit null or = entry unit): PUBLIC ⇒ + halfUp(rate×m×holidayWorkPaidBp/den) for all pay types (DAILY/HOURLY keep the ordinary wage ⇒ 2×); SHOP ⇒ premium for MONTHLY only. `den` as engine :369. No OT law ⇒ premium 0 + `flags.lawMissing`.
D5 Employer SSO (eligible + ACTIVE SSO row): halfUp(min(wage×D, maxBase)×rateBp/(10000×D)); no row ⇒ 0 + flag.
D6 Not estimated: OT, commission, bonus, allowance, unpaid leave, deductions (note `hr.labor.estimateNote`).
D7 Unit split of an employee-day: by paid minutes per entry unit (entry.unitId ?? unitOfDay), largest remainder (tie → unit id asc); no entry ⇒ `unitOfDay`; null ⇒ `unassigned` (all-branch viewers only).
D8 Hour split: unit-day cost over entry span minutes per hour key, largest remainder (tie → earlier hour); MONTHLY day without entries ⇒ `unallocated`. Σ hours + unallocated = day.
D9 Month actual: live run APPROVED/PAID (v2 finalized — H3.9 predicate) ⇒ item gross + ssoEmployer, split by Σ `HrWorkDay.workMin` per unit (no days ⇒ home), by `periodKey` never payDate. No run ⇒ Σ D4+D5, `basis:"ESTIMATE"`.
D10 Sales = facade net (VAT-incl.). Past day = actual; today = whole-day forecast + `soFarSatang`; future = forecast.
D11 Forecast (HR): f(d,h) = halfUp(Σ_{k∈K} a(d−7k,h)/|K|), K = 4 smallest k≥1 with d−7k < today; no sales = 0.
D12 pct tenths = sales>0 ? halfUp(cost×1000/sales) : null. Target default 280.
D13 scheduled(h) = employees overlapping hour h ≥ 30 min; needed(h) = f≤0 ? 0 : max(minStaff, ⌈f/splh⌉); peak = max f (earliest); column head `scheduled/needed` at peak; `splh` unset ⇒ no demand.

## 5. Interfaces
R3 Pure `hr/labor-rules.ts` (no db/clock/random): `monthlyShare dayWage holidayPremium ssoEstimate largestRemainder hourSlots forecastHour pctTenths needed scheduledAt LABOR_TEXT LABOR_TEXT_EN laborTextFor LABOR_DEFAULTS{targetTenths:280,splhSatang:null,minStaff:1}`.
R4 `hr/labor.ts`: `laborDay(ctx,v,{unitId?,day},opts{now?,locale?})` → `{ok, day, unitId, basis, sales:"OK"|"NO_POS"|"NO_PERMISSION", money:null|{costSatang,wageSatang,ssoSatang,salesSatang,soFarSatang,pctTenths,targetTenths,hours[{hour,label,costSatang,salesSatang,forecastSatang}],shifts[{shiftId,label,costSatang,salesSatang,pctTenths}],unallocatedSatang,suppressed}, demand:null|{hours[{hour,label,scheduled,needed}],peak}, flags}` · `laborWeek(ctx,v,{unitId?,week})` → days `{day,scheduledAtPeak,neededAtPeak}` + footer `{paidMinutes,costSatang,forecastSalesSatang,pctTenths}` · `laborMonth(ctx,v,{unitId?,periodKey})` → `{basis,costSatang,salesSatang,pctTenths,prev}` · `getLaborSettings` · `setLaborSettings(ctx,v,{targetTenths 50–600, splhSatang null|10_000–100_000_000, minStaff 0–20})`. Shift sales = hour keys overlapping the shift window ≥ 30 min (note: shift % do not add up).
R5 No `unitId` = all units in scope (> 20 ⇒ `UNIT_REQUIRED`); facade per unit.
R6 Settings: `lockHrSettings` + `writeHrSettingsKeys({hrLabor})`; gate `canManageHrSettings` on DB membership; audit `hr.labor.settings {keys}`. Reads unaudited. No events.

## 6. Permission + privacy (DB Membership, `gateOf` pattern)
P1 Money (฿, %, month) = OWNER or `hr.payroll.read`, scope `hrScopeOf`; unitAccess `[]` = all branches.
P2 Small-group: non-OWNER, branch-limited payroll viewer — a money cell with a contributor whose **home unit** is outside scope and < 3 distinct contributors ⇒ `null`, `suppressed++`, note `hr.labor.smallGroup`. Home-branch 1-person totals are not suppressed (already visible pay).
P3 Demand = `canReadRoster`. Sales/forecast/needed only when the facade, called with the viewer's own actor, returns ok (`pos.report.view`); else `NO_PERMISSION` (cost + scheduled only).
P4 No per-person money (no employeeId/name beside ฿); none of `HR_FORBIDDEN_DTO_KEYS`.
P5 Everyone else ⇒ UI absent; service `{ok:false, code:"NO", reason}` identical bytes.

## 7. UI (390 first · ≥44 px · tokens · th+en · inventory · visual-hr `"4.2"`)
01 card `hr-labor-card` in `HrTeamOverviewSection`: `hr-labor-pct` (+target) · `-cost` · `-forecast` · `-sofar` · `-hours` · `hr-labor-shift-<n>` · `-month` · `-note` (estimate / small group / no POS / no permission). 03: `hr-roster-demand-<day>` (amber when short) · `hr-roster-labor-foot` · `hr-roster-demand-panel`. Settings: `hr-labor-settings`, `hr-labor-save`, `?msg=` allowlist. No new route ⇒ no nav change.

## 8. Files
New: `hr/labor-rules.ts` `hr/labor.ts` `hr/labor-actions.ts` (settings save) `hr/labor-ui.tsx` + oracle + notes. Hunks: `pos/reports.ts` (R1) · `pos/index.ts` · `scripts/fitness.mts` · `hr/overview-ui.tsx` · `hr/roster-ui.tsx` · roster + settings `page.tsx` · messages th/en · `hr-ui-inventory.json` · `visual-hr.mts`.
**Frozen:** other `pos/**` · `payroll*` · `law.ts` · `work-entries*` · `roster.ts` `roster-rules.ts` `roster-board*` · `reports*` · `privacy*` · `scope.ts` · `settings-lock.ts` · `inbox*` · `account/**` `approval/**` `core/**` `prisma/**` · `qc-hr-lib.mts` · other oracles · `package.json`.

## 9. Acceptance (RED at base; SKIP while `labor-rules.ts` absent)
S1 static: `salesFacts.salesByHour` exported; R1 the only `pos/**` diff · only `hr/labor.ts` imports pos, lazily; no `posSale` in `hr/**`; edge listed · rules pure · settings via helper · frozen list · testids/inventory/th+en.
S2 vectors: monthly Σ = base for D 28/29/30/31 (1,000,000/31 ⇒ days 1–2 = 32,259, rest 32,258) · DAILY 40,000 m=420 ⇒ 35,000 · HOURLY 6,000 m=480 ⇒ 48,000 · PUBLIC DAILY m=480 ⇒ 80,000 · SHOP DAILY ⇒ 40,000 · MONTHLY 3,000,000 PUBLIC m=480 ⇒ +100,000 · forecast skips d−7k ≥ today · pct null at 0 · needed/minStaff · tie rules · DAY_WAGE/HOUR_WAGE/HOLIDAY_WORK equal to the engine on 6 vectors.
**S3 worked example.** Unit U, Sat 2027-01-16 (D=31, no holiday), SSO rateBp 500 maxBase 1,750,000, N=480, cutoff 0, `now` 2027-01-17 10:00.
A MONTHLY 1,550,000, 07–15 br 60 ⇒ 50,000 + SSO 2,500 · B DAILY 40,000, 11–20 br 60 ⇒ 40,000 + 2,000 · C HOURLY 6,000, 15–23 ⇒ 48,000 + 2,400 · D MONTHLY 3,100,000, off ⇒ 100,000 + halfUp(1,750,000×500/310,000 = 2,822.58) = 2,823.
Day cost **247,723** (wage 238,000 + SSO 9,723); sales 1,000,000 ⇒ pct **248** (24.8%). Hours: A 07–10 = 6,563, 11–14 = 6,562; B 11–16 = 4,667, 17–19 = 4,666; C 6,300 ⇒ hour 12 = **11,229**, hour 15 = **10,967**; Σ hours 144,900 + unallocated 102,823. Sales seeded with a VOIDED bill, a deposit and a refund −50,000: facade day = 1,000,000 = POS `reportDailySales`.
Demand: 12:00 on 01-09/01-02/12-26/12-19 = 380,000/420,000/410,000/390,000 ⇒ f 400,000; splh 150,000 ⇒ needed 3; scheduled 2 ⇒ short 1. Forecast of 01-23 at now 01-16 10:00 uses the same 4 dates.
S4 month: run 2027-01 APPROVED, E gross 2,000,000 + ssoEmployer 87,500, workMin U1 6,000 / U2 3,000 ⇒ U1 1,391,667, U2 695,833 · REVERSED ignored · no run ⇒ ESTIMATE = Σ days.
S5 matrix × {day, week, month, settings}: owner · payroll all-branch · payroll [U2] (U1 ⇒ NO; borrowed-in 1 contributor suppressed, 3 shown) · manager no payroll (no ฿/% keys) · manager without `pos.report.view` · staff with HR key · plain member · employee self · other tenant (identical NO). unitAccess `[]` = all; refusals never echo unit ids.
S6 X8: unit without POS ⇒ `NO_POS`, cost shown, pct null. S7 X7: 20:00–02:00 entry at cutoff 0 and 240; Jan 31→Feb 1; 2028-02-29 (D=29). S8 settings bounds; 10 lanes × 3 `setLaborSettings` ∥ clock-settings writer ⇒ both keys survive; tx client only. X12 no env · Z1 no residue (`qc-hr-h42-<stamp>`).

## 10. Run list (builder)
pure → POS hunk → service → UI → `qc-hr-h4.2` ×3 (unforced + QC_FORCE ×2) → `qc-hr-h1.1` `qc-audit-trail` `qc-hr-h3.9` `qc-hr-set-1` `qc-hr-h2.2` `qc-hr-h3.1` `qc-hr-h3.4` `qc-hf-hr-privacy` `qc-hr-roster` `qc-pos-p1.17` `qc-pos-p2.12` `qc-nav-functions` · `fitness` + `fitness-hr` (±env) · picker suites → typecheck once (gate lock, iso.sh). Visual = CONTROLLER-RUN.

## 11. Debts
Rate history · OT/commission in day estimates · SSO min-base clamp · DAILY/HOURLY holiday pay when not rostered · per-person labour report · non-POS sales · AI line on 01 (H4.3).

## QUESTIONS FOR THE CONTROLLER [default · reason]
Q1 Who writes the seam? [H4.2 builder, marked hunks in POS-owned `pos/reports.ts` + `pos/index.ts`, POS lane told · POS RUN closed; reuses `loadSales`/`scopeOf`. Alt: POS lane first.]
Q2 Sales basis? [VAT-incl. net = POS reports · one number in both modules; most small shops VAT 0. Alt: ex-VAT.]
Q3 Sales permission? [Viewer's own `pos.report.view` · no cross-module escalation.]
Q4 Monthly per-day cost? [base/D every calendar day · sums exactly to the month.]
Q5 Estimate contents? [Wages + holiday premium + employer SSO, no OT/commission · only pre-payroll data; month actual has everything.]
Q6 Employer SSO in estimate? [Yes, pro-rata cap · mockup "รวม ปสส. ส่วนนายจ้าง".]
Q7 Month actual? [gross + ssoEmployer of live finalized run by periodKey · accrual; same items as H3.9.]
Q8 Multi-branch split? [Paid minutes per entry unit; month by workMin · cost follows the work.]
Q9 Branch-limited payroll viewers? [Suppress < 3 contributors when a borrowed-in employee is present · H3.8 Q2: borrowings do not widen pay.]
Q10 Non-payroll managers? [Headcounts only · % × sales reveals cost.]
Q11 Forecast? [HR's own, 4 latest same weekdays before today · POS forecast zeroes unfinished weeks.]
Q12 Demand productivity? [`hrLabor.splhSatang`, unset ⇒ hidden · no invented default.]
Q13 Draft entries? [Counted on 03, published only on 01 · planning vs real day.]
Q14 Migration? [None · settings key via HR-SET-1; figures computed on read.]

## CONTROLLER RULINGS (14 Nov) — drafter defaults ACCEPTED for Q1–Q14, with these changes
- Q4: the per-day cost of monthly staff must use the SAME day-rate rule as the payroll engine (H3.4 `payroll-run-rules.ts` proration divisor). Only if the engine has no such rule does the default (base ÷ calendar days of the month) apply. The oracle states which rule it found, with file:line.
- Q2: sales = the same net figure POS reports show; the screen label must say so ("ยอดขายสุทธิตามรายงาน POS") — debt D-H42-vat-exclusive (labour % on VAT-exclusive sales for VAT-registered shops) goes on the owner/accountant list.
- Q1: the POS seam hunks are marked `HR H4.2` and stay minimal (no change to existing POS report results; qc POS report suites picked by pick-suites must stay green). New fitness edge hr→pos: lazy import from `hr/labor.ts` only, asserted by fitness.
- Q9/Q10 are privacy rules: the oracle carries a viewer matrix (OWNER · payroll viewer all-branch · payroll viewer one branch · manager without payroll key · employee · other tenant) × every figure, gate from DB membership, refusals/hidden cells carry no data.

## CONTROLLER RULINGS 2 (after the oracle, d0dbd5928)
- Q4 final: full month = base ÷ calendar days of the month (month sum = base). Q4b: partial month = the engine's prorated amount `min(base, halfUp(base×d/30))` spread evenly over the employed days. (Supersedes the Q4 line above.)
- The oracle note `ledger/wo-notes/hr-H4.2-oracle.md` §1 (argument shapes incl. `{now}` on laborWeek/laborMonth) and §4 (readings: shift cost, SSO on holiday, live-run month, leaver `active=false` not filtered, no removed lines in pos/reports.ts) are ACCEPTED as the contract. Missing OT law: follow the existing `otLawOf` fallback (no new behaviour). Builder may not change oracle expectations; impossible contract ⇒ stop and ask.
