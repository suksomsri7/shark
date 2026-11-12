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

## r2 fix round (12 Nov · reviewer + hunt)
1 override < floor: settlement pays max(override, legal) per OT_WORKDAY segment; every profile save re-checks the stored override — **refuse** (rateRecheck), never auto-clear; base 0 cannot hold one (rateNoBase).
2 paid minutes = request ∩ worked intervals after shift end (breaks/gaps excluded, judge `otStepMin` not applied) — `otPayDaysInTx` returns `worked` + `leaveFull`; rounded only by `otRoundMin`. Closes D-H29-judge-step.
3 cancelAdjustment / bound-DRAFT delete / moveStrandedAdjustment refuse OT_REQUEST rows (otRow).
4 cron: re-settles first, then re-appeared zero settlements, then open requests by `updatedAt` asc; every wait writes settleCode (bumps updatedAt) ⇒ round-robin.
5 law multipliers = max(row, default) (otLawOf + otAmount).
6 NO_ATTENDANCE zero (dayId null, code null) re-settles when a day row for date/date−1 appears.
7 basisJson = {otRoundMin, profile} frozen at first settlement (step even when 0 paid).
8a full-day APPROVED leave: filing + approval refused (leaveDay); leave after approval ⇒ settled 0, settleCode LEAVE (stored; the list DTO keys are fixed by S7.1 ⇒ reason not shown in UI — debt **D-H29-reason-ui**). 8b no rate ⇒ noRate at filing. 8c work date after endDate ⇒ settled 0, settleCode ENDED (D4 closed). 8d reversal of a PAID run after a revoke pays again then the DEDUCTION claws back (net 0) — accepted behaviour.
9 salary form is a plain server form (void action, no state channel) ⇒ rateBelowLaw/rateRecheck still throw — debt **D-H29-rate-inline**.
10 cancel: oracle fixes "someone else ⇒ cancelNo"; unknown id stays notFound — left as is.

## Accountant list (additions)
- Normal hours fixed at 8 underpays a 7-hour shop (D-H29-normal-hours).
- Public holiday on a daily worker's weekly day off: 1× or 2×?
- Hourly staff on public holidays at 1× assumes H3.2 pays the holiday pay.
- Late arrival + staying late is still paid 1.5× OT after shift end.
- v1 manual OT (payAdjust hours) can double-pay the same hours (D6).
- A revoke DEDUCTION for an ENDED employee strands (no later run includes them).
- Daily/hourly OT rows are unpaid until H3.4 (runs refuse non-monthly).

## r3 (12 Nov)
1 Zero settlements (no attendance) are re-picked only when a day row relevant to the request exists: a row on the work date, or a date−1 row whose IN–OUT overlaps the requested window (same relevance as `measure`); re-settling then fills attendanceDayId, so it never loops. Oracle S10.10: 3 zeros (worked only the day before) untouched over 3 runs; the ready request settles 8 750 on run 1 at maxTx 3.
2 Pay uses `slot.events` from judge `loadData` only; r3 also moved the hunk's IN/OUT times (outAt/outMissing) onto `loadData` events (no own punch query), so H2.6's void filter in `loadData` reaches pay automatically. Remaining own read: the r3.1 relevance pre-check in `settleOtRequests` reads IN/OUT times by id — selection only, never pay; once H2.6 lands a voided punch can at worst cause one extra re-settle (debt D-H29-void-precheck: add the void filter there).
3 Accountant: a re-settle after a salary change pays the difference at the rate frozen at first settlement (legal clamp against the frozen profile, not the new salary).

## r4 (12 Nov, on bdfd02247 with H2.6)
D-H29-void-precheck closed: `ot.ts` no longer reads the punch table. The zero re-pick pre-check asks judge.ts `otDaySpans` (marked H2.9 reader beside `otPayDaysInTx`), which takes IN/OUT times of stored day rows from `loadData` (voided punches filtered by H2.6). Relevance unchanged from r3 (work-date row, or date−1 row overlapping the request) ⇒ S10.10 behaviour kept.
