# H2.9 builder notes — OT requests → settlement → HrPayAdjustment(OT_REQUEST) · writer #18 (wip/hr-h2.9, lane l3)

## Done
- Mig `20270102000000_hr_ot_settlement` (13 cols + 5 CHECKs + index systemId,status,date) — applied to wo-hr-qc-l3 only (`migrate deploy` via qc-hr.sh; only pending folder was this one).
- `hr/ot-rules.ts` pure (no imports): OT_LAW_DEFAULT · otLawOf · otPaidMinutes · otAmount (BigInt, one half-up per segment) · otWindow · otLegalRateFloor (ceil) · otPolicyOf {afterHours, maxAheadDays, otRoundMin} · OT_TEXT.
- `hr/ot.ts`: requestOt · cancelOtRequest · decideOtRequest · revokeOtRequest · settleOtRequests · otRequestList · myOtRequests · getOtPolicy/saveOtPolicy · notifyOtDecided.
- Marked hunks: payroll.ts (import · #18 input/otRateData/data · writeOtAdjustmentInTx at EOF) · judge.ts (one EOF export `otPayDaysInTx`, 0 removed) · payroll-actions.ts (otHourlyRateBaht → satang from string) · payroll-ui.tsx (renders ui.tsx#HrSalaryOtRateField — the salary form lives here, not in ui.tsx) · ui.tsx (HrOtSection + HrSalaryOtRateField) · index.ts · outbox-consumers.ts (1 marker) · automation/labels.ts (1 label, no webhook label) · cron/hourly · leave + settings pages · messages hr.ot (th=en) · inventory (10 rows wo H2.9) · visual-hr SPECS "2.9".

## Rulings applied
- Lock order: `hr:payroll:run:<sys>:<month(date−1)>`, `…:<month(date)>` (ascending) → target period(s) (monotone up, re-checked under lock) → `hr:ot:<id>` → `hr:judge:<dayId>` (sorted). requestOt = `hr:ot-emp:<sys>:<emp>` only; cancel = `hr:ot:<id>` only.
- Q6 base: no "normal hours per day" setting exists in HR settings/clock-settings/work schedule (H2.4/H2.5 have none) ⇒ 8 h; divisors clamped `min(days,30)`, `min(hours,8)` so a law row can only raise the rate. Debt **D-H29-normal-hours**.
- Q7: paid = floorStep(min(request ∩ [from, OUT], otMin), otRoundMin) · otRoundMin ∈ {1,15,30}, default 1. ORACLE-EDIT listed in `hr-H2.9-oracle.md`.
- Q13: revoke after a run = DEDUCTION delta in next open period, sourceRef `<id>:<gen+1>`; unbound rows → REJECTED; bound rows never touched; replay = no row.
- Q11: list DTO for managers has no amount/segments (departs from mockup 05's ฿ line).

## Open / debts
- D-H29-normal-hours (above).
- D-H29-judge-step: measured `otMin` is still floored by the H2.5 attendance setting `otStepMin` (default 15, judge-rules frozen) ⇒ with otRoundMin 1 the cap can still drop up to 14 min unless the shop sets attendance step 1. Needs a ruling (default attendance step 1, or settle from raw OUT−shift end).
- Brief D1–D6 unchanged.
