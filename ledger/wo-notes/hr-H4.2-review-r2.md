# H4.2 delta review r2: 96c5d4a33 → 440540cc8 (oracle ce0b4af53, code 1df2e4a36)

Read-only review by commit object. The H3.8 merge hunks are ignored. L = `hr/labor.ts` at 440540cc8.

## Verdict: MERGE WITH NOTES
B1 and M1 are closed. I found no path left for a branch-limited viewer to infer an outsider's pay. M2 is closed for estimate months; one residual case remains (m1). R4 coverage is adequate.

## 1. R1/R2 privacy, [U2]-limited payroll viewer

**How outsiders are removed.** `sees(home)` (L:121-123) is true only when the employee's current home `HrEmployee.unitId` is in scope. A null home is false for limited viewers. The check runs before any money arithmetic:
- estimate: L:367-370
- actual: L:642-645

An outsider therefore never enters wage, SSO, cost, hours, shifts, unallocated, pct, `noProfile` or `lawMissing`. Splits are computed per employee, so outsiders cannot shift other people's largest-remainder results. Every aggregate is a plain sum of visible people, so nothing is withheld that an aggregate could reveal.

**Every attack I re-tried fails:**
- day minus hours or shifts
- week minus days
- month estimate minus days, or month actual minus estimate after payroll is finalized
- the same day before and after an outsider's shift is added: only `excludedHeadcount`, `paidMinutes` and `scheduled` change, and they are not money
- hour cost before and after the outsider's shift starts
- %, chart scale, sort order (hours by key, shifts by the start time of visible entries only)
- `truncated` (depends on row counts and id order, never on pay)
- forecast, sales, and the demand / needed / sales-per-staff-hour rows (sales and headcounts only)
- the roster client payload `{week, day, dayLabel}`: this is the reader output unchanged (roster/page.tsx), so it is the viewer's own permitted figures

**`excludedHeadcount` never depends on pay.**
- Estimate: it comes from population dates plus entry or home-day units only (L:363-368).
- Actual: it comes from membership in the run's item list plus workMin location (L:636-644). Having an item says nothing about the amount.

**The home set equals the payslip privacy set.** `payslip.ts:133 homeInScope` uses the current `emp.unitId`, null is visible to all-branch viewers only, and borrowing is not counted. Labour uses the same rule:
- Leavers keep their unitId and are handled the same way.
- An employee who changes home mid-month follows the current home in both modules. Moving into U2 shows old U2 days; moving out hides them. Payslips do the same, so they are consistent.

**Oracle checks for R1/R2:**
- S5.7 doubles J's daily rate, G's hourly rate and E's run item. It then compares the canonical bytes of 9 limited-viewer outputs (day U2 ×4, day with no unit, week ×2, month Jan actual and Feb estimate), with OWNER outputs changing as the positive control. This is a strong check.
- S5.8 doubles every rate for a manager without the payroll key, with an owner control plus a restore check (c1 === c3).
- S5.2 goldens re-derived:
  - K+L = 2×36,750 = 73,500 · pct 73,500/1,050,000 = 70 · owner 110,250 → 105
  - hour 10 = 2×4,594 = 9,188 (36,750 over 8 hours: 6 hours at 4,594, 2 hours at 4,593)
  - week 73,500 · month actual 0 with excluded 1 · Feb 0 with excluded 1 (J entry at 02-10)
  - All ✔.

**NOTE.** S5.7 varies pay rates only; it does not vary outsider schedules. That is correct, because headcount and minutes are allowed to change. No gap.

## 2. R3 month to date
- Open month = no finalized run and `periodKey` is the Bangkok month of `now` (L:607, 613). Days counted = 1 … yesterday (L:614), for both cost and sales. Day 1: no days, pct null, UI shows a dash plus "ยังไม่มีข้อมูลครบวัน" (labor-ui `noDay`).
- Past and future months are unchanged: `days = all`.
- S4.14 goldens re-derived for U5, Q 3,000,000 from 04-01 (counts as a full month):
  - 100,000 + SSO 2,917 = 102,917 per day.
  - Mid-month: 15 days → 1,543,755 / 15,000,000 → 103 ✔
  - Past month: 30 × 102,917 = 3,087,510 / 16,000,000 → 193 ✔
  - Day 1 → null ✔

**MINOR m1 — current month with a finalized run (L:613).** `open` is false once a run exists, so the card compares the full month's ACTUAL cost with sales so far.
- Thai shops often approve pay on the 25th–28th, so this window is common.
- Example: run approved 25 Nov, card read on 28 Nov. Cost covers 30 days, sales cover 27 days, so the % is overstated by about 11% relative, until month end.
- Fix options:
  - While `periodKey` is the current month, use the completed-day estimate even when a run exists.
  - Or label the figure "เทียบยอดขายถึงวันที่ …".
- Controller's call. The oracle does not cover this case.

**MINOR m2 — month `partial` not shown on the card.** The card note uses only the day's `m.partial` (labor-ui notes). If today has no outsiders but the month (or `prev`) has, the month figure is partial with no label. Show `month.partial || month.prev.partial` too. The roster footer already shows `lf.partial` ✔.

**NOTE.**
- Day 1 returns `costSatang: 0`, not null, through the API (L:671). The UI shows a dash; H4.3/H4.8 consumers should get null.
- `throughDay` is rendered as ISO "2027-04-15" in `monthToDate`, not as a Thai date via the helper (§C.11/12).
- "Completed days" uses the Bangkok calendar (cutoff 0). With a POS cutoff of 240, yesterday's business day is still open between 00:00 and 04:00, so a few late bills can be missing. Negligible.

## 3. R4 truncation
- `capped()` reads cap+1 rows and the excess sets `hit`. Covered: employees, profiles, roster entries, holidays (L:273-287), runs, items, workdays (L:608-632).
- `truncated` reaches `money`, `flags`, the week footer, month and `prev`.
- The UI shows an alert on the 01 card and on the roster footer (also for non-money viewers via `week.flags`).
- S4.15 uses the `__takeCap` seam with a plain run as control. ✔

Not flagged:
- Nested `units: take 200` (L:273). With more than 200 borrowing rows, `unitOfDay` can misplace a day and no flag is set. Rare. NOTE.
- `hrShift` and the actual-month `hrEmployee` reads are bounded by id lists. OK.

NOTE: `__takeCap` is a public field of `LaborOpts`. Pages don't pass it; H4.8 REST must not forward caller options as they are.

## 4. Oracle changes (ce0b4af53) — legitimate, none weakening
- S1.5 now checks each import statement: it allows only `import { tenantDb } from "@/lib/core/db"` and rejects any alias. This closes the r1 NOTE. Residual: an `export … from core/db` would not be matched. Negligible.
- S5.2 was rewritten to ruling R1. The old threshold assertions were correctly removed. The `noJ` checks are kept for the J-alone day, the no-unit view and the Feb estimate.
- The S4.14, S4.15, S5.7 and S5.8 additions assert what their ids claim (goldens re-derived above).
- The static part moved into `-lib` unchanged except S1.5. The fixture adds U5/Q, the J 02-10 entry, and sales on U2 01-13 and U5 April.

## 5. New in the fix round
- `eachLimited` (L:150-155): 4 workers over a shared index. Safe in single-threaded JS. ✔
- `laborMonth` now computes current then previous month sequentially, adding latency to the hub. NOTE.
- Message key `smallGroup` was reused with a new meaning ("ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง {n} คน" / "Excludes {n} staff…"), with th/en parity. The name is now misleading but the oracle's msgParity pins it. Rename later in the same change as the oracle. NOTE.
- `truncated` appears both in `money` and in `flags` on the day result. Harmless duplication.

## Before merge: none required. Track m1 (ruling) and m2 (a one-line UI fix) as follow-ups or fix now.
