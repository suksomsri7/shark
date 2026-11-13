# H4.2 — labour cost % (ค่าแรงต่อยอดขาย) + staffing demand row (screens 01 · 03)

> **DRAFT r0 — Q-list defaults (§11) in force unless the controller rules.** Lane C · **privacy (salary inference) + cross-module ⇒ reviewer + hunter (privacy).** **No migration.** Base `session/hr` 93a0b76ee (H3.7 · HR-SET-1). Branch `wip/hr-h4.2`. Oracle `scripts/qc-hr-h4.2.mts` (imports `qc-hr-lib.mts`). Plan row: master plan §4 H4 `H4.2` + §7.1 row "labor %" (`pos.salesByHour`). Design: DESIGN §E8 (01) · §6 rows 01/03 · §5 POS row. Mockups: `design-hr/01-team-overview.body.html` (card "ค่าแรงต่อยอดขาย (labor %) วันนี้" + month line) · `03-roster.body.html` (column heads "จัด/ต้องการ" · footer "รวม ชม. · ค่าแรงรวมสวัสดิการ · labor % คาด" · panel "ความต้องการคนรายชั่วโมง").

## 1. Facts (verified at base)
F1 POS has no sales facade: `pos/index.ts` exports sale/catalog/orders/chatLink/serviceBills only. The numbers exist in `pos/reports.ts` `reportHourly` (:1264, POS P2.12): 24 rows summed over the range, `pos.report.view` per unit (`scopeOf` :394), POS day cutoff `posDayCutoffMinutes`, net = `grandTotalSatang` (VAT-inclusive, service charge in, tip out, deposits out, VOIDED out, REFUND negative in the hour it was issued), forecast = mean of d−7k, k=1..4 (counts future weeks as 0 ⇒ unusable for next week's roster).
F2 Edges: `pos→hr` exists (`fitness.mts:331`, lazy import, `pos/hr-link.ts`); `hr→pos` does not. Two-way lazy edges have precedent (crm↔kanban, `fitness.mts:377`).
F3 Pay: `HrSalaryProfile` (current only, no rate history) `payType` MONTHLY/DAILY/HOURLY, `baseSalarySatang`/`dailyRateSatang`/`hourlyRateSatang`, `ssoEligible`. Engine day formulas `payroll-run-rules.ts:355-372` (DAY_WAGE = daily×min(N,m)/N · HOUR_WAGE = hourly×m/60 · HOLIDAY_WORK bp from OT law, half-up). N = `getNormalMinutesPerDay` (`work-entries.ts:104`). Law readers `law.ts` `loadLawSet`/`loadOtLawRows` (ACTIVE rows).
F4 Roster: `HrRosterEntry` (date = BKK start day, start/end/break min, `crossesMidnight`, `unitId` of the day, `published`); `roster.ts:181 unitOfDay` (borrowing else home). Actual run data: `HrPayrollItem.grossSatang/ssoEmployerSatang`, `HrWorkDay.workMin/unitId/periodKey` (monthly `periodKey` `YYYY-MM` only).
F5 Gates to reuse: H3.9 `reports.ts gateOf` (DB membership, role must match) · `canViewPayroll` · `hrScopeOf`/`isAllBranches` · `canReadRoster`. Settings writers must use `settings-lock.ts` (HR-SET-1, scanned by `qc-hr-set-1` S1.2).

## 2. Scope
In: (a) POS seam `salesFacts.salesByHour`; (b) pure labour rules; (c) service: day / week / month labour figures + demand; (d) card on hub 01, demand row + footer + hourly panel on roster 03; (e) settings `hrLabor` (target %, sales per staff-hour, min staff).
Out: AI tools/Daily Brief (H4.3 consumes `laborDay`) · REST (H4.8) · OT/commission/allowance in the *estimate* · rate history · hotel/dorm/booking sales outside POS (booking service bills already land in POS via SVC B.10 and count) · CSV export · "AI proposes a shift" line of mockup 01.

## 3. Sales seam (owner module = **POS**; HR only consumes)
R1 Marked hunks `// HR H4.2 ▸ … ◂` (POS-owned code, written by the H4.2 builder after the controller rules Q1): `pos/reports.ts` new `export async function salesByHour(ctx: {tenantId; unitId}, actor: RegisterActor, input: {from; to}, client?)` → `{ok:true, connected:false}` (unit has no active POS) | `{ok:true, connected:true, cutoffMin, today, days:[{date, hours:[{hour, netSalesSatang, billCount}]}]}` (sparse: only hours with docs; `hour` = POS `reportHourly` key, ≥24 after midnight; `today` = `bkkBusinessDate(now, cutoffMin)`) | `ReportRefusal`. Same doc rules and permission (`REPORT_PERMISSION` at the unit) as `reportHourly`; range ≤ 45 days (`VALIDATION`); POS system = the unit's active POS (same rule as `service-bill.ts posOfUnit`). `pos/index.ts`: `export const salesFacts = { salesByHour } as const` + types. No other POS file changes; no POS behaviour change.
R2 `scripts/fitness.mts` marked hunk: `"hr→pos"` with reason; only `hr/labor.ts` imports `@/lib/modules/pos` and only as `await import(...)` (oracle static check). HR never reads `PosSale`.

## 4. Definitions (exact arithmetic · all integer satang · `halfUp` = round half up on BigInt)
D1 **Calendar.** HR day = BKK date (`thaiDateKey`). Sales day/hour = POS business date + hour key from the facade (`cutoffMin`). Roster minutes are mapped to the same keys: an entry of date d covers absolute minutes [d+start, d+end(+1440 if crossesMidnight)); minute t belongs to business date `bkkBusinessDate(t, cutoffMin)` and its hour key. Cost of an employee-day stays on the HR date d; hour cells use the mapped keys.
D2 **Population.** Employees of the HR system with a salary profile, `active` or `endDate ≥ day`, and `startDate ≤ day` (null start = counted). No profile ⇒ cost 0, counted in `flags.noProfile`.
D3 **Paid minutes of an entry** m = span − breakMin (min 0). Entries: `published` only for days ≤ today; all entries (draft incl.) for the roster planning view (03) — the DTO says which.
D4 **Day wage (estimate)** for employee e on day d:
- MONTHLY: share(d) = ⌊base/D⌋ + (dayOfMonth ≤ base mod D ? 1 : 0), D = days in month — every calendar day, worked or not (Σ month = base).
- DAILY: Σ entries halfUp(daily × min(N, Σm) / N) (once per day on the summed minutes).
- HOURLY: halfUp(hourly × Σm / 60).
- Holiday (an `HrHoliday` row on d, unit null or = entry unit, OT law row on d): PUBLIC → + halfUp(rate × m × holidayWorkPaidBp / den) for every pay type, DAILY/HOURLY also keep the ordinary wage (⇒ 2×); SHOP → MONTHLY + the same premium, DAILY/HOURLY ordinary only. `den` as engine :369 (monthly 30×N×10000 · daily N×10000 · hourly 60×10000). OT law missing ⇒ premium 0 + `flags.lawMissing`.
D5 **Employer SSO (estimate)** if `ssoEligible` and an ACTIVE SSO row on d: sso(d) = halfUp(min(wage(d)×D, maxBase) × rateBp / (10000×D)). No row ⇒ 0 + `flags.lawMissing`. (No min-base clamp — estimate.)
D6 **Not in the estimate:** OT, commission, bonus, allowance, unpaid leave, absence deductions, employee SSO, WHT. UI says so (`hr.labor.estimateNote`).
D7 **Unit allocation of an employee-day:** entries' units (entry.unitId ?? unitOfDay) weighted by paid minutes, largest remainder (ties → unit id asc); no entry ⇒ `unitOfDay(e, d)`; null ⇒ bucket `unassigned` (all-branch viewers only).
D8 **Hour allocation:** an employee-day cost on a unit is spread over its entries' span minutes on that unit per hour key, largest remainder (ties → earlier hour); MONTHLY day without entries stays `unallocated` (day level only). Σ hours + unallocated = day cost.
D9 **Actual month** (period `YYYY-MM`): live run (status APPROVED/PAID; v2 only when finalized — H3.9 predicate) ⇒ per item cost = gross + ssoEmployer, allocated to units by Σ `HrWorkDay.workMin` per unit in the period (largest remainder; no work days ⇒ home unit). Accrual = `periodKey`, never payDate. No live run ⇒ month = Σ D4+D5 of all days, `basis:"ESTIMATE"`.
D10 **Sales.** `netSalesSatang` from the facade (VAT-inclusive, = POS reports). Past/closed day = actual; today = forecast for the whole day + `soFarSatang`; future = forecast.
D11 **Forecast (HR pure, not POS's):** f(d,h) = halfUp(Σ_{k∈K} a(d−7k,h) / |K|), K = the 4 smallest k ≥ 1 with d−7k < today; missing sales = 0. Facade window = [min date needed, today].
D12 **Labour %** in tenths: pct = sales > 0 ? halfUp(cost×1000 / sales) : null (shown "—"). Target `targetTenths` default 280.
D13 **Demand:** scheduled(h) = employees whose entries overlap hour h by ≥ 30 min; needed(h) = f(h) ≤ 0 ? 0 : max(minStaff, ⌈f(h) / splhSatang⌉); peak hour = max f (earliest on tie); roster column head = `scheduled/needed` at peak. `splhSatang` unset ⇒ no demand row.

## 5. Interfaces
R3 Pure `hr/labor-rules.ts` (no db/clock/random; value imports only `./law` pickers if needed): `monthlyShare · dayWage · holidayPremium · ssoEstimate · largestRemainder · hourSlots · forecastHour · pctTenths · needed · scheduledAt · LABOR_TEXT · LABOR_TEXT_EN · laborTextFor · LABOR_DEFAULTS {targetTenths:280, splhSatang:null, minStaff:1}`.
R4 Service `hr/labor.ts` (read-only except settings): `laborDay(ctx, viewer, {unitId?, day}, opts{now?, locale?})` → `{ok, day, unitId, basis, money: null | {costSatang, wageSatang, ssoSatang, salesSatang, soFarSatang, pctTenths, targetTenths, hours:[{hour,label,costSatang,salesSatang,forecastSatang}], shifts:[{shiftId,label,costSatang,salesSatang,pctTenths}], unallocatedSatang, suppressed}, demand: null | {hours:[{hour,label,scheduled,needed}], peak}, sales: "OK"|"NO_POS"|"NO_PERMISSION", flags}` · `laborWeek(ctx, viewer, {unitId?, week})` → per day `{day, scheduledAtPeak, neededAtPeak}` + footer `{paidMinutes, costSatang|null, forecastSalesSatang|null, pctTenths|null}` · `laborMonth(ctx, viewer, {unitId?, periodKey})` → `{basis, costSatang, salesSatang, pctTenths, prev:{periodKey,pctTenths}}` · `getLaborSettings` · `setLaborSettings(ctx, viewer, {targetTenths 50–600, splhSatang null|10_000–100_000_000, minStaff 0–20}, opts)`. Shift figures: shift sales = hour keys of the shift window overlapping ≥ 30 min (shift % do not add up — note text).
R5 `unitId` omitted = all units in the viewer's scope (≤ 20 units, else `code:"UNIT_REQUIRED"`); sales fetched per unit through the facade.
R6 Settings writer = `lockHrSettings` + `writeHrSettingsKeys(tx, ctx, {hrLabor})` only; gate `canManageHrSettings` from DB membership; audit `hr.labor.settings {keys}` (no values). Reads not audited (H3.9 rule). No outbox events.

## 6. Permission + privacy (gate from the DB Membership row, H3.9 `gateOf` pattern)
P1 **Money** (`money`, cost, %, ฿ per hour/shift, month) = OWNER or `hr.payroll.read` (`canViewPayroll`), employees limited by `hrScopeOf`; unitAccess `[]` = all branches.
P2 **Small-group rule** (salary inference): for a non-OWNER, non-all-branch payroll viewer, any money cell (day, hour, shift, month, unit) whose contributors include an employee whose **home unit** is outside the viewer's scope (borrowed in) and the cell has < 3 distinct contributors ⇒ cell `null`, `suppressed += 1`, note `hr.labor.smallGroup`. 1-person home-branch totals are not suppressed (that viewer already sees that pay). OWNER / all-branch: never suppressed.
P3 **Demand** (headcounts, needed, peak) = `canReadRoster`. Sales-derived values (sales, forecast, needed) only when the facade, called with the viewer's own actor, returns `ok` (needs `pos.report.view` at the unit) — otherwise `sales:"NO_PERMISSION"`, money keeps cost only, demand keeps `scheduled` only.
P4 No per-person money anywhere in H4.2 DTOs (no employeeId/name next to ฿). DTO keys fixed; none of `HR_FORBIDDEN_DTO_KEYS`.
P5 Anyone else (staff with an HR key, plain member, the employee themself, other tenant, wrong system) ⇒ card/panel absent; service returns `{ok:false, code:"NO", reason}` identical bytes.

## 7. UI (390 first · ≥ 44 px · tokens · th+en · inventory rows · visual-hr block `"4.2"`)
01 hub card `hr-labor-card` (inside `HrTeamOverviewSection`, after the board): gauge `hr-labor-pct` + target · `hr-labor-cost` · `hr-labor-forecast` · `hr-labor-sofar` · hourly bars `hr-labor-hours` (cost vs sales/forecast) · shift rows `hr-labor-shift-<n>` · month line `hr-labor-month` (+ prev) · notes `hr-labor-note` (estimate / small group / no POS / no permission). Empty: no POS ⇒ cost only + "ยังไม่ได้เชื่อม POS".
03 roster: column head `hr-roster-demand-<day>` ("5/6", amber when short) · footer `hr-roster-labor-foot` · panel `hr-roster-demand-panel` (bars scheduled/needed per hour + "ขาด N คน" line) for the selected day.
Settings section `hr-labor-settings` (+ `hr-labor-save`), `?msg=` codes from an allowlist. No new page/route ⇒ no nav change.

## 8. Files
New: `hr/labor-rules.ts` · `hr/labor.ts` · `hr/labor-actions.ts` ("use server", `requireTenant()`; settings save only) · `hr/labor-ui.tsx` · oracle · notes.
Marked hunks `HR H4.2 ▸ … ◂`: `pos/reports.ts` (R1 only) · `pos/index.ts` · `scripts/fitness.mts` (edge) · `hr/overview-ui.tsx` (card slot) · `hr/roster-ui.tsx` (head/footer/panel) · `app/app/sys/[id]/hr/roster/page.tsx` + `hr/settings/page.tsx` (load + pass DTOs) · messages th/en · `hr-ui-inventory.json` · `visual-hr.mts`.
**Frozen** (byte-identical): every other `pos/**` file · `payroll*.ts` · `payroll-rules*.ts` · `payroll-run-rules.ts` · `law.ts` · `work-entries*.ts` · `roster.ts` · `roster-rules.ts` · `roster-board*.ts` · `reports*.ts` (H3.9) · `privacy*.ts` · `scope.ts` · `settings-lock.ts` · `inbox*.ts` · `account/**` · `approval/**` · `core/**` · `prisma/**` · `qc-hr-lib.mts` · other oracles · `package.json`.

## 9. Acceptance checks (oracle `qc-hr-h4.2`; RED at base, SKIP while `hr/labor-rules.ts` absent)
S1 static: S1.1 `salesFacts.salesByHour` exported from `pos/index.ts`; R1 hunk is the only `pos/**` diff. S1.2 only `hr/labor.ts` imports `@/lib/modules/pos`, lazily; no `PosSale`/`posSale` in `hr/**`; `hr→pos` in ALLOWED_EDGES. S1.3 `labor-rules.ts` pure. S1.4 settings writer uses the helper (qc-hr-set-1 S1.2 green). S1.5 frozen list. S1.6 testids + inventory + th/en keys.
S2 pure vectors: monthly share Σ = base for D=28/29/30/31 (base 1,000,000/31 ⇒ days 1–2 = 32,259, others 32,258); DAILY 40,000 × 420/480 = 35,000; HOURLY 6,000 × 480/60 = 48,000; PUBLIC holiday DAILY m=480 paidBp 10000 ⇒ 80,000; SHOP holiday DAILY ⇒ 40,000; MONTHLY base 3,000,000 PUBLIC m=480 ⇒ +100,000; SSO D5; forecast skip-future rule; pct null at sales 0; needed/ceil/minStaff; largest-remainder ties. S2.x cross-check DAY_WAGE/HOUR_WAGE/HOLIDAY_WORK against the engine (`payroll-run-rules`) on 6 vectors.
**S3 worked example (DB).** Unit U, Sat 2027-01-16 (Jan, D=31, no holiday), SSO row rateBp 500 maxBase 1,750,000, N = 480, POS cutoff 0, `opts.now` = 2027-01-17 10:00 BKK (day is past ⇒ actual sales).
- A MONTHLY 1,550,000, entry 07:00–15:00 br 60 ⇒ wage 50,000 · SSO 1,550,000×500/310,000 = 2,500.
- B DAILY 40,000, 11:00–20:00 br 60 (m 480) ⇒ 40,000 · SSO 2,000.
- C HOURLY 6,000, 15:00–23:00 br 0 ⇒ 48,000 · SSO 2,400.
- D MONTHLY 3,100,000, no entry (home U) ⇒ 100,000 · SSO min(3,100,000, 1,750,000)×500/310,000 = 2,822.58 ⇒ 2,823.
- Day: wage 238,000 · SSO 9,723 · cost **247,723**; POS net sales 1,000,000 ⇒ pct = halfUp(247.723) = **248** (24.8%).
- Hours: A 52,500/8 ⇒ 07–10 = 6,563, 11–14 = 6,562; B 42,000/9 ⇒ 11–16 = 4,667, 17–19 = 4,666; C 50,400/8 = 6,300. Hour 12 = **11,229**; hour 15 = **10,967**; Σ hours 144,900 + unallocated 102,823 = 247,723.
- Facade sales seeded with one VOIDED bill, one deposit and one refund (−50,000 at 14:xx): day net = 1,000,000 and = POS `reportDailySales` for the day.
- Demand: Saturdays 01-09/01-02/12-26/12-19 at 12:00 = 380,000/420,000/410,000/390,000 ⇒ f = 400,000; `splh` 150,000 ⇒ needed 3; scheduled(12) = 2 (A, B) ⇒ short 1. Forecast for 2027-01-23 with now = 01-16 10:00 uses the same 4 dates (01-16 skipped).
S4 month: run 2027-01 APPROVED, employee E gross 2,000,000 + ssoEmployer 87,500, workMin U1 6,000 / U2 3,000 ⇒ U1 1,391,667 · U2 695,833; REVERSED run ignored; no run ⇒ `basis:"ESTIMATE"` = Σ days.
S5 viewer matrix × {day, week, month, settings}: owner (all) · payroll viewer all branches (all) · payroll viewer [U2] (U2 only, U1 → NO; borrowed-in 1 contributor ⇒ suppressed, ≥3 ⇒ shown) · manager without payroll (demand only, no ฿/% keys at all) · manager without `pos.report.view` (`NO_PERMISSION`, no sales/forecast/needed) · staff with HR key · plain member · employee self · other tenant (identical NO bytes). Member with unitAccess `[]` = all branches; explicit list never echoes unit ids in refusals.
S6 X8: unit without POS ⇒ `NO_POS`, cost shown, pct null; HR with no POS module at all works.
S7 X7: crossesMidnight entry 20:00–02:00 with cutoff 0 and cutoff 240 lands in the right business date/hour keys; month end (Jan 31 → Feb 1) and leap day 2028-02-29 (D=29).
S8 settings: validation bounds; race 10 lanes × 3 rounds `setLaborSettings` ∥ an existing writer (clock settings) ⇒ both keys survive; audit keys only; tx-client only.
X12 fitness without env · Z1 no residue (tenants `qc-hr-h42-<stamp>`).

## 10. Run list (builder)
pure → POS hunk → service → UI → `qc-hr-h4.2` ×3 (unforced + QC_FORCE=1 ×2) → `qc-hr-h1.1` · `qc-audit-trail` · `qc-hr-h3.9` · `qc-hr-set-1` · `qc-hr-h2.2` · `qc-hr-h3.1` · `qc-hr-h3.4` · `qc-hf-hr-privacy` · `qc-hr-roster` · `qc-pos-p1.17` · `qc-pos-p2.12` · `qc-nav-functions` · `pnpm fitness` + `fitness-hr` (with/without env) · picker suites (COMMON §E) → typecheck once (gate lock, `iso.sh`). Visual 1440/1024/390 = CONTROLLER-RUN.

## 11. Debts / out of scope
Rate history (estimates use the current profile — month actual corrects it) · OT/commission in day estimates · SSO min-base clamp · holiday pay for DAILY/HOURLY not rostered on a public holiday · per-person labour report · sales from hotel/dorm/shop not via POS · AI line on 01 (H4.3).

## QUESTIONS FOR THE CONTROLLER [default · reason]
Q1 Sales seam: who writes it? [H4.2 builder adds marked hunks to POS-owned `pos/reports.ts` + `pos/index.ts` (`salesFacts.salesByHour`), POS lane notified · POS RUN is closed; smallest seam reusing `loadSales`/`scopeOf`; owner stays POS. Alt: POS lane builds it first.]
Q2 Sales basis? [VAT-inclusive net (= POS reports' `netSalesSatang`) · one number across POS and HR; most small shops have VAT 0. Alt: ex-VAT (needs per-hour VAT in the facade).]
Q3 Sales permission? [Viewer's own `pos.report.view` at the unit (facade called with the viewer) · no cross-module privilege escalation; owner unaffected.]
Q4 Monthly staff per-day cost? [base/D every calendar day incl. days off · sums exactly to the month; labour % per day reflects fixed cost.]
Q5 Daily estimate scope? [Wages + holiday premium + employer SSO; no OT/commission · only data that exists before payroll; month actual includes everything.]
Q6 Employer SSO in the estimate? [Yes, D5 pro-rata cap · mockup says "รวม ปสส. ส่วนนายจ้าง".]
Q7 Month actual cost? [gross + ssoEmployer of the live APPROVED/PAID (finalized v2) run, by `periodKey` · accrual basis; same items H3.9 reports.]
Q8 Multi-branch split? [Paid minutes per unit of the day's entries; actual month by `HrWorkDay.workMin` · cost follows where the work happened.]
Q9 Salary inference for branch-limited payroll viewers? [Suppress cells with < 3 contributors when any contributor is borrowed in from outside scope · H3.8 Q2 (borrowings do not widen pay visibility); home-branch totals are already visible pay.]
Q10 Non-payroll managers? [Demand headcounts only, never ฿ or % · % × visible sales reveals cost.]
Q11 Forecast method? [HR's own: 4 latest same-weekdays strictly before today · POS forecast counts unfinished future weeks as 0; facade gives facts only.]
Q12 Demand needs a productivity setting? [`hrLabor.splhSatang` (sales per staff-hour), unset ⇒ demand row hidden · no invented default; owner sets it.]
Q13 Draft roster entries? [Counted in the roster planning view (03); published only on 01 · planning shows what the manager is building; 01 shows the real day.]
Q14 Migration? [None — settings key in `AppSystem.settings` via HR-SET-1 helper · nothing to persist; figures computed on read.]
