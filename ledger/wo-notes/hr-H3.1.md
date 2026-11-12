# WO H3.1 — work entries (roster + attendance + leave + holidays → HrWorkDay/HrWorkEntry per employee-day)

> Tree `/root/projects/shark-hr` · branch `wip/hr-h3.1` cut from session/hr 87d976773 (oracle 655abf661) · lane DB wo-hr-qc-l1 (`scripts/qc-hr.sh`) · builder notes.

## 0. Checkpoint
- done: schema+migration (applied to lane DB) · pure rules · judge.ts reader hunk · work-entries.ts · payroll hunks · actions · UI · messages · inventory · visual spec 3.1 · ORACLE-EDITs · typecheck 0.
- results: §6 — all green.

## 1. Files
| area | file | note |
|---|---|---|
| schema | `prisma/schema/payroll.prisma` · `hr.prisma` (back-relation `workDays`) · `prisma/migrations/20270103000000_hr_work_days/migration.sql` | 2 enums, HrWorkDay, HrWorkEntry.workDayId FK CASCADE, CHECK minutes 0–1440 + leaveDays 0–1 |
| pure | `hr/work-entries-rules.ts` | `buildWorkDays` · `breakDeduction` (Q3 in ONE function) · `WORK_RULES_DEFAULT` · `WE_BLOCKING` · digest |
| reader | `hr/judge.ts` (one marked `HR H3.1` pure-addition hunk at EOF) | `workEntryDaysInTx` — stored rows + roster breakMin + stale/orphan via the same `isStale`/`hasOrphan` + live unstored `{final}` + raw OT |
| service | `hr/work-entries.ts` | build snapshot · state · approve check · bind · readers · `normalMinutesPerDay` setting |
| payroll | `hr/payroll.ts` (import + ApproveFailCode + check/bind in `claimApproveExpected` + refusal in `approveRun`, all marked) · `payroll-actions.ts` (1 line) | v2 gate + freeze |
| actions/UI | `hr/work-entries-actions.ts` · `hr/work-entries-ui.tsx` · pages payroll/attendance/settings (marked) | 06 panel · 04B summary/day rows · settings card |
| misc | `core/scope.ts` (`HrWorkDay: sys()`) · `scripts/hr-qc-env.mts` (row + delete order) · `hr/index.ts` re-export · messages `hr.we` th=en · `scripts/hr-ui-inventory.json` 10 rows · `scripts/visual-hr.mts` spec "3.1" | |

## 2. Lock order (no cycle)
- build (per page tx): `hr:payroll:run:<sys>:<period>` FIRST → reads → writes HrWorkDay/HrWorkEntry of that period (no other lock).
- attendance recompute: period lock → `hr:judge:<row>` → `hr:clock:<emp>` → `hr:roster:…` (never touches HrWorkDay).
- payroll approve: period lock → run row FOR UPDATE → work-entries check (reads) → claim UPDATE → bind (HrWorkDay/HrWorkEntry UPDATE). markPaid / create / recompute / delete / reverse: period lock first.
- leave approve/revoke (`hr-leave:*`, `hr-leave-emp:*`), offboarding (`hr:emp:*`, `hr:clock:*`): never take the period lock.
- Every holder of the period lock takes it first; build takes nothing after it ⇒ no wait cycle. Only build and approve-bind write HrWorkDay, both under the period lock.

## 3. Raw OT minutes (controller A4)
`HrAttendanceDay.otMin` is floored to `otStepMin`. The reader hunk re-runs the SAME judgement (`slotsOf`) with `otStepMin: 1` (floor to the minute only) and uses that OT for a stored row only when the row is not stale (then floorStep(raw) = stored by construction). A stale row keeps its stored `otMin` and the day is blocked by `STALE`. Worked/late/early are already minute-floored in the row. No change to H2.5 code outside the marked reader hunk.

## 4. Normal day (controller Q10)
`AppSystem.settings.hrWork.normalMinutesPerDay` (60–720, default 480), written owner-only under `hr:clockpolicy:<sys>` (same lock as the other HR settings writers that spread the JSON), card on HR settings page (`hr-we-normal*`). Part of every day's inputHash ⇒ a change makes unapproved periods OUTDATED. **Debt D-H29-normal-hours:** H2.9's OT base (÷30÷8) must adopt this setting in H3.4.

## 5. ORACLE-EDITs (all marked `ORACLE-EDIT` in the files)
1. `qc-hr-h3.1` base: `baseRef("QC_H31_BASE")` (merge-base HEAD origin/session/hr; env still overrides); migration ordering n/a once in base; hunks carrying another WO's `HR Hx.y` marker (and no `HR H3.1`) ignored in S1.5/S1.6.
2. `qc-hr-h3.1` S4.6: sourcesJson is jsonb ⇒ Postgres returns keys `id, slotKey, version` (length, then bytes) — compare key-sorted (genuine oracle bug; the check could never pass).
3. Fixture: `rules.normalDayMin: 480` made explicit on every vector; D3 (A4 raw OT): otMin 600 → 607 ⇒ oh = max(0, min(607, 607) − 480) = 127 (was 120); new D14 (N 420): day off worked 600 ot 600 ⇒ hw min(600, 420) = 420 · oh 600 − 420 = 180; new D15 (N 420): unscheduled full paid leave ⇒ basis N ⇒ floor(1.0 × 420) = 420; S2.5 text 13 → 15 vectors.
4. `qc-hr-h1.3` S6.1: `hr/work-entries.ts` + `work-entries-rules.ts` exempt for `HrWorkEntry`/`hrWorkEntry` tokens only.
5. `qc-hr-h0.1` S4.2: payroll.prisma sha pin re-taken 686b1910… → b4456ccd… (Mig WO edits payroll.prisma by brief R2; precedent H1.3 D-1).
6. `qc-hr-h2.5` S9.7 + `qc-hr-lib` `inventoryParity(…, ownRowsOnly)`: H3.1 rows (hr-we-summary · hr-we-day-*) live on /hr/attendance — h2.5 judges its own rows only (default of the helper unchanged).
7. `qc-hr-h4.4` S1.1: migration ordering n/a once H4.4 is in the base (later HR migration 20270103).

## 6. Runs (lane DB wo-hr-qc-l1)
qc-hr-h3.1 forced 52/52 ×3 + unforced 52/52 (residue none) · seed-hr-qc 33/33 ×2 identical counts · h1.2 73/73 · h1.3 63/63 · h0.1 67/67 · h0.2 58/58 · h0.6 55/55 · h2.5 79/79 · h2.7 89/89 · h3.3 51/51 · h4.4 86/86 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hf-hr-privacy 194/194 · fitness 53/53 + fitness-hr 9/9 with and without env · typecheck 0 errors (×2).

## 7. Debts / risks for H3.2/H3.4
- D1–D6 of the brief stand. D-H29-normal-hours (above).
- OT pay: work entries carry measured OT only; `sourcesJson.otPayment` and the OT kind rows' `note` = `MEASURED_ONLY_PAY_VIA_HR_PAY_ADJUSTMENT_H29`; H3.4 must never price otWorkdayMin/otHolidayMin.
- Hash covers the roster entries of the whole Mon–Sun week (a published entry turns empty days into DAY_OFF), not punches (D6).
- `buildWorkEntrySnapshot` stops after ~20 s and returns `next` (call again with `after`); H3.4 run creation must loop.
- REVERSED period rows keep the old `runId` until rebuilt (rebuild sets `runId` null on changed rows; approve re-binds all).

## 8. For the accountant (additions)
- A4 changed: minutes are raw, floored to the minute only (no OT step).
- A8 normal day is a shop setting (60–720 min, default 480) — drives HOLIDAY_PAID, day-off work cap and full-day leave without roster.
- A9 a day with a stale/orphan/missing-out/not-final/pending-leave row blocks v2 approval until fixed (never silently excluded).
