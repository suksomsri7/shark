# H4.2 oracle — labour cost % vs sales + staffing demand

Files: `scripts/qc-hr-h4.2.mts` (58 KB: statics, DB, privacy, races) + `scripts/qc-hr-h4.2-lib.mts` (14 KB: pure vectors S2.x). 49 checks (45 RED-by-design, 4 GREEN controls).
Run output: `hr-H4.2-red.txt`. Stop note `hr-H4.2-oracle-stop.md` is history: its open question is closed by ruling Q4b below.

## 0. Controller ruling Q4 / Q4b (13 Nov), superseding the brief's Q4 wording
- The engine rule is `payroll-run-rules.ts:325/:333`: proration `min(base, halfUp(base × d / 30))` for a partial month. A full calendar month pays exactly base (`:9`, `:369` and `:376` also use ÷30).
- **Full month employed** ⇒ day = ⌊base/D⌋ + (dayOfMonth ≤ base mod D ? 1 : 0), where D = calendar days. The days sum to base, so the brief's S2/S3/S4 numbers stand.
- **Employer SSO** ⇒ pro-rata ÷ calendar days, as the brief writes it (D5).
- **Ruling Q4b — partial month (joins or leaves mid-month).**
  - The month's amount is the engine's E = min(base, halfUp(base × d / 30)), where d = calendar days employed in the month.
  - E is spread over those d days with the full-month convention: day k (1-based among employed days) = ⌊E/d⌋ + (k ≤ E mod d ? 1 : 0).
  - Days outside employment get 0, and the days sum to E.
  - A start on the 1st or an end on the last day counts as a full-month bound (engine: no PRORATION line).
- Unpaid leave is not modelled in the estimate (brief D6 unchanged).

## 1. Contract fixed by the oracle (brief names functions, not arguments)
- **`labor-rules.ts`:**
  - `monthlyShare({baseSatang, day, startDate?, endDate?})`
  - `dayWage({payType, baseSatang, dailySatang, hourlySatang, day, paidMin, normalMin, startDate?, endDate?})`: MONTHLY ⇒ monthlyShare.
  - `holidayPremium({payType, rateSatang, paidMin, normalMin, kind:"PUBLIC"|"SHOP", holidayWorkPaidBp|null})`: SHOP gives 0 unless MONTHLY; null bp gives 0.
  - `ssoEstimate({wageSatang, daysInMonth, rateBp, maxBaseSatang})`
  - `largestRemainder(total, weights[])`: ties go to the lower index. Callers order units by id asc and hours by hour asc.
  - `hourSlots({day, startMin, endMin, crossesMidnight, cutoffMin}) → [{date, hour, minutes}]`: time order, keys exactly as in `reportHourly`.
  - `forecastHour({day, today, valueOf(date)})`
  - `pctTenths(cost, sales)`
  - `needed({forecastSatang, splhSatang, minStaff})`: splh null gives null.
  - `scheduledAt([{employeeId, hour, minutes}], hour)`: Σ minutes per employee ≥ 30.
- **`labor.ts`:**
  - `laborDay(ctx, v, {unitId?, day}, {now?, locale?})`
  - **`laborWeek(ctx, v, {unitId?, week}, opts)` and `laborMonth(ctx, v, {unitId?, periodKey}, opts)` also take opts `{now}`.** Without it the week forecast would depend on the real date (house rule).
  - `week` = Monday `YYYY-MM-DD`.
  - Month fields are read at top level or under `money`.
  - `getLaborSettings` returns the values at top level, or under `settings` / `hrLabor`.
- **Facade:** `salesFacts.salesByHour({tenantId, unitId}, actor, {from, to})`.

## 2. Fixture + hand-derived goldens
- **Units:**
  - U1 and U2 on POS A (cutoff 0).
  - U3 has no POS.
  - U4 on POS B (cutoff 240).
- **Law rows:** SSO 500 bp, cap 1,750,000, plus TAX/DED from the `hr-h3.4-vectors.json` law and an OT row (holidayWorkPaidBp 10,000).
  - Global rows, ACTIVE from 2026-12-01, `sourceKey qc-hr-h42-<stamp>-*`, deleted in `finally`. Z1 checks they are gone.
  - The lane DB has no other ACTIVE law rows; the run prints a precondition line.
- N = 480 (default). Times are BKK.

| emp | pay | home | roster |
|---|---|---|---|
| A | MONTHLY 1,550,000 | U1 | 01-16 07–15 br60 (linked to the "self" user) |
| B | DAILY 40,000 | U1 | 01-16 11–20 br60 |
| C | HOURLY 6,000 | U1 | 01-16 15–23 |
| D | MONTHLY 3,100,000 | U1 | none |
| E | no profile | U1 | run 2027-01 APPROVED v2 finalized: gross 2,000,000 + ssoEr 87,500 · REVERSED run 5,000,000 · HrWorkDay U1 10×600, U2 5×600 |
| F | DAILY 40,000 | U1 | 01-15 09–17 br60 **draft** |
| G | HOURLY 6,003 | U1 | 01-26 08–12 @U1 + 13–17 @U2 |
| H2 | HOURLY 6,000 | U1 | 01-31 20–02 (crosses) |
| J | DAILY 40,000 | U1 | 01-12 10–18 br60 @U2 (alone), 01-13 @U2 |
| K, L | DAILY 40,000 | U2 | 01-13 (with J); K also 01-19 alone |
| M | MONTHLY 1,550,000 start 2027-03-11 | U3 | none |
| N | MONTHLY 1,000,000 end 2027-03-20, active=false | U3 | none |
| H | HOURLY 6,000 | U4 | 01-31 20–02 |
| P | DAILY 40,000 | U4 | 01-20 (PUBLIC holiday, unit null) and 01-21 (SHOP holiday U4) 10–18 no break |

**Sales on U1 2027-01-16:**
- Counted: 12:10 600,000 (tip 5,000), 18:30 450,000, and the refund at 19:05 −50,000.
- Excluded: 13:00 VOIDED 300,000 and the 14:00 POS_DEPOSIT 200,000.
- Net 1,000,000.

**History at 12:10:** 01-09 380,000 · 01-02 420,000 · 12-26 410,000 · 12-19 390,000.

**Boundaries:** U1 01-31 23:59 70,000 · U1 02-01 01:30 100,000 · U4 02-01 01:30 100,000 (business date 01-31, hour 25).

**Worked example (brief S3, re-derived, all match):**
- A 50,000 + 2,500 · B 40,000 + 2,000 · C 48,000 + 2,400 · D 100,000 + 2,823.
- Day cost 247,723; pct 248.
- Hours: A 52,500/8 ⇒ 6,563 ×4 (07–10) then 6,562. B 42,000/9 ⇒ 4,667 ×6 (11–16) then 4,666. C 6,300 per hour.
- Hour totals: hour 11 = hour 12 = 11,229 · hour 15 = 10,967 · hour 19 = 10,966.
- Σ hours 144,900 + unallocated 102,823.

**Other goldens:**
- **Shifts** (cost = Σ cost of that shift's entries; sales = hour keys overlapping the window ≥ 30 min): A 52,500 / 600,000 / 88 · B 42,000 / 1,000,000 / 42 · C 50,400 / 400,000 / 126.
- **Forecast:**
  - 01-23 at now 01-16 10:00: 01-16 is skipped ⇒ 400,000, pct 155,323 ⇒ 388.
  - 01-23 at now 01-17: (600 + 380 + 420 + 410)/4 + 450/4 − 50/4 = 552,500 (thousands).
  - Today at now 01-16 12:30: forecast 400,000, soFar 600,000, pct 619.
- **Demand (splh 150,000, minStaff 1):** hour 12 f = 400,000 ⇒ needed 3, scheduled 2 (A, B). Hour 8 f = 0 ⇒ needed 0, scheduled 1. Peak 12.
- **Week 2027-01-11** (drafts in): 7 × 155,323 + 42,000 + 50,400 + F 36,750 = 1,216,411. paidMinutes 420 + 480 + 480 + 420 = 1,800.
- **Published-only day 01-15:** 155,323.
- **G (01-26):** 48,024 + 2,401 = 50,425, split 240/240 ⇒ 25,213 to the lower unit id, 25,212 to the other.
- **Boundaries:**
  - U1 01-31 = 155,323 + H2 37,800 = 193,123, sales 70,000.
  - U1 02-01 (D = 28): A 55,358 + 2,768 + D 110,715 + 3,125 = 171,966, sales 100,000.
  - U4 01-31 = 37,800, hours 20–25 at 6,300, hour 25 sales 100,000. U4 02-01 = 0.
  - U1 2028-02-29 (D = 29): 53,448 + 2,672 + 106,896 + 3,017 = 166,033.
- **Holidays (P):** PUBLIC 40,000 + premium 40,000 + SSO 2,000 = 82,000 (SSO on the ordinary day wage only; the engine's default SSO components exclude HOLIDAY_WORK). SHOP 40,000 + 2,000 = 42,000.
- **Q4b on U3:**
  - M: E = 1,085,000 over 21 days ⇒ 51,667 for 03-11…03-24, then 51,666; SSO 2,583 per day.
  - N: E = 666,667 over 20 days ⇒ 33,334 for 03-01…03-07, then 33,333; SSO 1,667.
  - Days: 03-05 35,001 · 03-16 89,250 · 03-21 54,250 · 03-31 54,249.
  - March estimate 1,139,243 + 700,007 = 1,839,250.
- **Month:**
  - Jan U1 actual: 2,087,500 split 6,000 : 3,000 ⇒ U1 1,391,667 and U2 695,833. Sales 1,870,000 ⇒ pct 744.
  - Feb U1 ESTIMATE: 1,550,000 + 28 × 2,768 + 3,100,000 + 28 × 3,125 = 4,815,004; prev 1,391,667.
- **Privacy:**
  - J alone at U2 on 01-12 = 36,750: hours 4,594 ×6 and 4,593 ×2. These numbers must not appear for the [U2] viewer.
  - 01-13 (J + K + L) = 110,250 · 01-19 (K alone) = 36,750.
- **Positive control:** a scratch reference implementation of the rules, written for the oracle and deleted after use, made all of S2.x green. Recomputed with the same reference, every DB golden above matched.

## 3. Checks (ids · RED reason on base)
| id | what | base |
|---|---|---|
| S1.1 | 4 new files | RED: files absent |
| S1.2 | `salesByHour` + `salesFacts`; pos diff only in reports.ts/index.ts, marked, no removed line in reports.ts | RED: no export |
| S1.3 | `"hr→pos"` edge; only labor.ts imports pos, lazily, index only; no posSale in hr/** | RED: edge + importer absent |
| S1.4 | labor-rules purity | RED: file absent |
| S1.5 | settings through `lockHrSettings` / `writeHrSettingsKeys({hrLabor})`, canManageHrSettings, audit, DB membership gate, no raw prisma | RED: file absent |
| S1.6 | frozen files unchanged | **GREEN control**: the base has no H4.2 diff; this guards the build |
| S1.7 | every hunk in shared files marked `HR H4.2`; required hunks present (in base: any ticket mark) | RED: no hunks |
| S1.8 | testids, inventory, th/en `hr.labor` (+ POS sales label, Q2 ruling), visual "4.2", tokens, `?msg=` | RED: absent |
| S2.1–S2.11 | pure vectors (§2 + lib) | RED: labor-rules.ts missing ("missing" per check, no crash) |
| S3.1 | facade = reportHourly per hour + reportDailySales over 44 days, sparse, cutoff, today | RED: `salesFacts` absent |
| S3.2 | NO_POS ⇒ connected:false; PERMISSION_DENIED; 46 days ⇒ VALIDATION | RED: facade absent |
| S3.3 | existing POS reports on the fixture (net 1,000,000, hourly 12/18/19, forecast 400,000, 44-day 2,670,000) | **GREEN control**: proves the sales fixture and that POS output is unchanged (Q1 ruling) |
| S3.4 | facade cutoff 240 hour 25 | RED: facade absent |
| S4.1–S4.13 | figures in §2 + R5 (21 units ⇒ UNIT_REQUIRED) + P4 no per-person money | RED: labor.ts missing |
| S5.1–S5.6 | privacy matrix (below) | RED: labor.ts missing |
| S6.1–S6.5 | settings matrix, bounds, audit, deterministic lock race (A/B ×2), 10 lanes × 3 ∥ saveClockPolicy | RED: setLaborSettings missing |
| X1 | fitness + fitness-hr without env | **GREEN control** (X12) |
| Z1 | no residue (PosSale, HrWorkDay, HrLawTable keys included) | **GREEN**: house rule |

No check passed by accident. Missing modules and functions are caught per check, so every DB check requires an `ok:true` value or an exact `code:"NO"`.

**Privacy matrix (S5), viewers from DB membership:**

| viewer | day / week / month / settings |
|---|---|
| owner | all money |
| payroll MANAGER `["*"]` | all money; can save (MANAGER passes canManageHrSettings) |
| payroll MANAGER `[]` | = all branches for cost |
| payroll MANAGER `[U2]` | U1 ⇒ NO. Borrowed-in single contributor (J, home U1) ⇒ every money cell null, suppressed ≥ 1, none of J's numbers anywhere, also with no unitId. 3 contributors shown. Home 1-person day shown. Month U2 (only E, home U1) suppressed |
| MANAGER without payroll | money null; no `*Satang` / `*Tenths` key on day/week/month; demand 2/3; spoofed `hr.payroll.read` in the viewer object is ignored (DB gate) |
| STAFF payroll + hr.employee.create, no pos.report.view (stands in for "manager without pos.report.view"; a MANAGER always passes POS `evaluate`) | cost 247,723; sales `NO_PERMISSION`; pct, hour sales/forecast and needed null; scheduled 2; can save |
| HR-key staff (hr.leave.read) · plain member · employee self (linked to A) · other-tenant owner · role spoof · no userId · [U2] on U1 / unknown id / other-tenant unit | one identical Thai `{ok:false, code:"NO", reason}` on day/week/month (18 refusals compared with canon); no ids or 3+ digit numbers; settings refused, nothing written |

## 4. Ambiguities and how the oracle reads them (controller may rule)
1. Function arguments (§1) and laborWeek/laborMonth taking `{now}` are fixed by the oracle. Builder: ask for an ORACLE-EDIT if a different shape is preferred.
2. Shift cost = Σ allocated cost of the entries on that shift (incl. SSO); shift % do not add up (brief R4).
3. PUBLIC holiday SSO is on the ordinary day wage only; the premium is outside the SSO base (engine default wage components).
4. Brief D4 "no OT law ⇒ premium 0 + lawMissing" vs `ot-rules.ts otLawOf`, which returns OT_LAW_DEFAULT when there is no row. The DB fixture inserts an OT row, so either reading passes. The pure check only asserts that `holidayWorkPaidBp: null` gives 0.
5. D2 "active or endDate ≥ d": the leaver is `active=false` with endDate, so a builder filtering `active:true` fails S4.10 (intended).
6. Month with a live run counts only run items (D9 literal). Staff without items in that run add 0; the fixture keeps the run to E only.
7. The cutoff-0 overnight entry: the oracle asserts only that the cost stays on HR date 01-31 and the Feb 1 sales. Where hours 0–1 of the next business date are listed is left to the builder. The cutoff-240 case asserts hours 24/25.
8. "manager without pos.report.view" cannot be a MANAGER (POS `evaluate` gives MANAGER every pos action), so it is a STAFF with payroll + hr.employee.create.
9. S1.6 frozen list follows brief §8. `pos/reports.ts` must have zero removed lines (strict reading of "no POS behaviour change").
10. HrLawTable is global. The oracle inserts ACTIVE rows (sourceKey-scoped, removed in `finally`) because the lane DB has none. The pattern is from qc-hr-h3.4. It is safe only under the gate lock, which the run command holds.

## 5. Commands
- `bash scripts/iso.sh pnpm exec prisma generate` · lane `prisma migrate deploy` (no pending) · `seed-hr-qc` (34/34).
- Forced: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-h4.2.mts` ⇒ exit 1, 4/49, BASE-EXPECTATION 49/49, RESIDUE none.
- Unforced ⇒ SKIPPED, exit 0.
- Compile proof: `env NODE_OPTIONS=--max-old-space-size=12000 ISO_MEM=14000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsc --noEmit --skipLibCheck -p scratchpad/h42/tsconfig.json`
  - The temp tsconfig extended the root and included only the two oracle files + next-env.d.ts.
  - Result: exit 0, 0 errors. The temp tsconfig was deleted afterwards.

## Round 2 (review rulings R1–R5, 14 Nov) — `ORACLE-EDIT (H4.2 review · controller ruling)`
OWNER goldens are unchanged (247,723 · 281,594 · 1,391,667 …).

**Structure.** To stay under 60 KB, the statics moved into `qc-hr-h4.2-lib.mts`; the check logic is unchanged.
- Oracle: 58.0 KB.
- Lib: 24.2 KB.
- Checks: 53 (+4).

**New fixtures** (none of them touches an OWNER golden):
- **U5** (on POS A, linked to HR) with **Q**: MONTHLY 3,000,000, start 2027-04-01. On 2027-01-16 Q counts 0, so the all-units total stays 281,594.
- **U5 sales:** 1,000,000 at 12:00 every day 04-01..04-15, plus 04-16 09:00.
- **U2 sale:** 01-13 12:00 1,050,000.
- **J entry:** 2027-02-10 10–18 br60 @U2, so an outsider works in an ESTIMATE month.

### R1 (S5.2 changed). Visible pay set of payroll MANAGER [U2]
- The set is home unit U2 = {K, L}. J, E and G have home U1 and no HrEmployeeUnit borrowing rows, so H1.1 `unitWhere` (home or today's borrowing) and H3.8 Q2 (home only) give the same set on this fixture.
- Outsiders add 0 to every money figure. They are reported as `excludedHeadcount`, read from `money.` / `footer.` / top level.
- `partial` is read from `money.` / `footer.` / top level.

| figure | derivation | golden |
|---|---|---|
| day U2 01-12 | J only (outsider) | cost 0 · excl 1 · partial · pct null (sales 0) · none of 36750/35000/1750/4594/4593 anywhere |
| day (no unitId) 01-12 | scope = U2 only | cost 0 · excl 1 |
| day U2 01-13 | K + L = 2 × (35,000 + 1,750) | **73,500**. Hours 10–15: 2 × 4,594 = 9,188; hours 16–17: 2 × 4,593 = 9,186; Σ = 6 × 9,188 + 2 × 9,186 = 73,500 = cost. pct = 73,500 × 1000 / 1,050,000 = **70** · partial · excl 1 |
| owner U2 01-13 (control) | J + K + L | 110,250 · pct 110,250 × 1000 / 1,050,000 = **105** |
| day U2 01-19 | K (home) | 36,750 · excl 0 · not partial |
| week U2 01-11 footer | K + L on 01-13 (J's 01-12 and 01-13 excluded) | **73,500** · excl 1 |
| month U2 2027-01 (ACTUAL) | only item = E (outsider) | **0** · excl 1 · no 695833 / 2087500 |
| month U2 2027-02 (ESTIMATE) | only J on 02-10 | **0** · excl 1 |

### R2 (S5.7, S5.8 new). Byte invariance
**S5.7, payroll [U2]:**
- Mutation: J daily 40,000 → 80,000, G hourly 6,003 → 12,006, E's APPROVED item gross 2,000,000 → 4,000,000 and ssoEr 87,500 → 175,000. Restored afterwards.
- Readers: day U2 01-12/13/19/26 · day no-unit 01-12 · week U2 01-11/01-25 · month U2 Jan (actual) / Feb (estimate).
- Required: `canon()` byte-identical.
- Positive control: the same readers as OWNER must change.

**S5.8, MANAGER without the payroll key:**
- Mutation: every profile's pay ×2 (raw `UPDATE … * 2`, then `/ 2`) plus E's item ×2.
- Readers: day U1 01-16 · U2 01-13 · week U1/U2 · month U1 Jan/Feb.
- Required: identical.
- Control: OWNER U1 01-16 changes, and is restored afterwards.

**Client props.** Pages hand these reader DTOs to the client unchanged (01 card = server component; roster page passes the week/day DTOs). The oracle therefore compares the reader output, not a rendered payload. **The oracle does not render the RSC payload.**

### R3 (S4.14 new). Current-month % on completed days only
- Q: 30,000 ฿/month = 3,000,000 satang. April has D = 30.
- Daily cost: ⌊3,000,000 / 30⌋ = 100,000, plus SSO (D5) = halfUp(min(100,000 × 30, 1,750,000) × 500 / (10,000 × 30)) = halfUp(2,916.67) = 2,917 ⇒ **102,917 per day**.
- **Mid-month** (now 2027-04-16 10:00 BKK; completed days 1..15):
  - Cost = 15 × 102,917 = 1,543,755.
  - Sales = 15 × 1,000,000 = 15,000,000 (the 04-16 09:00 sale is today, so excluded).
  - pct = halfUp(1,543,755 × 1000 / 15,000,000) = halfUp(102.92) = **103** (10.3 %).
  - The whole-month cost ÷ sales-to-date basis the reviewer found gives 193 at this point (oracle output).
  - The reviewer's ≈10.3 % matches. Their "≈30,750 with SSO" used a monthly SSO cap of 750 ฿; brief D5 pro-rates per day, giving 875.10 ฿ for the month.
- **Day 1** (now 2027-04-01 10:00): no completed day ⇒ pct null. The label "ยังไม่มีข้อมูลครบวัน" must exist in th `hr.labor` or `LABOR_TEXT`.
- **Past month** (now 2027-05-10): cost 30 × 102,917 = 3,087,510; sales 16,000,000; pct = halfUp(192.97) = **193**. Unchanged by R3.

### R4 (S4.15 new). Truncation flag
- The code has no test seam. The oracle therefore fixes one using the H3.9 precedent (`reports.ts __takeCap`): `opts.__takeCap: 2` lowers every list cap.
- Required with the seam:
  - day U1 01-16, week U1 01-11 and month U1 2027-02 return `truncated: true` (top level, `flags.`, `money.` or `footer.`).
  - The same calls without the seam carry no `truncated`.
  - `labor-ui.tsx` references `truncated` (the warning).
- Chosen because a static "every `take:` sets the flag" check cannot be made reliable.

### R5 (S1.5 changed)
- Judged per import statement: every value import from `@/lib/core/db` must be exactly `{ tenantDb }` (no alias, no second name).
- No `@prisma/client` value import, no dynamic core/db import.

**Accepted (controller):**
- the `hr/ui.tsx` labour-card slot (builder D-1);
- 2 marked hunks in `scripts/fitness.mts` (edge + F2.1h).

### Run (forced, lane DB, head c9051a793 code)
- Result: exit 1, 49/53, RESIDUE none.
- RED: S4.14 (mid = 193, day1 = 193, label missing) · S4.15 (no truncated flag, no UI warning) · S5.2 (01-13 shows 110,250; week, month and excl missing) · S5.7 (limited outputs change when outsider pay doubles).
- S5.8 (new) is green on the current code: the manager already gets no money.
- S1.5 (changed) is green: labor.ts has exactly `import { tenantDb } from "@/lib/core/db"`.
- Targeted tsc over the two oracle files: exit 0.

### Open for the controller
- Pay set when an HrEmployeeUnit **borrowing row** exists: H1.1/H3.9 `unitWhere` includes today's borrowings; H3.8 Q2 says borrowings do not widen pay. R1 cites H1.x/H3.9. The fixture has no borrowing rows, so it does not decide this case.
