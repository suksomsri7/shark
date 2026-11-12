# H2.9 hunt — wip/hr-h2.9 @ ed827c8d0 · lane DB wo-hr-qc-l3 · 12 Nov 2026

3 probes (own tenants `qc-hr-zzh29*`, July 2031, real H2.5 finalisation, real `createPayrollRun`/`approveRun`/`markPaid`/`reverseRun`). Totals: pure 85/85 PASS · DB 54 PASS / 12 FAIL. 2 of the FAILs were harness artefacts (a forged ctx, see below), so the real result is 7 distinct defects. Every expected value is a hand-worked literal (half-up once; monthly ÷144e6).

## FAIL (real)
1. **CRITICAL — #18 override drops below the legal floor after a raise.** Set ฿14,000 + override 8,750 (floor, accepted; 8,749 refused ✓). Then `setSalaryProfile` base ฿20,000 with no OT field ⇒ saved, override **8,750 kept**. New floor = 2,000,000×15,000/2,400,000 = **12,500**. Workday OT 60 min settles **8,750**, want ≥ **12,500**. Changing payType has the same hole. Fix: re-check `otLegalRateFloor` on every profile save (refuse or clear the override), and/or clamp to the floor in `otAmount`/measure.
2. **MAJOR — a break or gap after shift end is paid as OT.** Shift ends 20:00. (a) OUT 20:00 · IN 21:00 · OUT 22:00; (b) BREAK 20:00–21:00 · OUT 22:00. Request 20:00–22:00 ⇒ paid **120 min / 17,500**, want **60 / 8,750**. Cause: judge `otMin` = lastOut − shift end, and `otPaidMinutes` overlaps [shift end, lastOut]; neither subtracts breaks or gaps. (c) Day off: IN 09:00 · BREAK 12–13 · OUT 19:00, request 09:00–13:00 ⇒ paid **240 / 23,333**, want **180 / 17,500**.
3. **MAJOR — OT_REQUEST rows can be deleted through `cancelAdjustment`** (gate `hr.payadjust.approve`, no sourceType guard). (a) Settled 8,750 row deleted ⇒ the request still shows 8,750, Σ rows 0, and re-settle never repairs it, so **nothing is paid**. (b) The revoke DEDUCTION (20,000, 2031-10) deleted ⇒ the revoked OT stays paid (Σ 20,000, want 0). `cancelBoundDraftAdjustment` and `moveStrandedAdjustment` have the same gap.
4. **MAJOR (scale) — cron starvation.** `open` takes the oldest `maxTx` APPROVED-unsettled requests, and waiting ones still count as scanned. With 3 NO_RATE requests (D1) and 1 ready request (D2) at maxTx 3, two runs each gave `scanned 3, waiting 3` and the ready request was **never settled**. With the cron's 100, any 100 permanently waiting requests in a system (commission-only staff, STALE days, LAW) block all OT pay and every re-settle (`changed` comes after `open`) for up to 93 days.
5. **MINOR (known D-H29-judge-step) — measured OT is floored by attendance `otStepMin` 15.** OUT 21:20, request 20:00–21:20, otRoundMin 1 ⇒ paid **75 / 10,938**, want **80 / 11,667** (−729 satang). The same happens when the request is longer than the work (20:00–22:00). otRoundMin 15 ⇒ 75/10,938 ✓ · 30 ⇒ 60/8,750 ✓.

## PASS
- **Amounts:** pure matrix of 11 profiles × {1,59,60,61,105,480,960} min (M 15,000/14,000/12,345 · D 400 · H 43.33 · workday / holiday shift ×3 / day off / public holiday). Override 8,750 × 61 = 8,896 · 100,000 × 61 = 101,667 · ignored on holiday and day off.
- **Minutes:** measured > requested 60 · request partly in the shift 60 · request past OUT 20/2,917 · never worked 0, no row.
- **Day class:** branch holiday (u2, shop open) 17,500 ×3 vs u1 workday 8,750.
- **Recompute with no run:** 60→90→30→0→60 gives Σ 8,750 → 13,125 → 4,375 → 0 → 8,750. Old rows REJECTED, never negative.
- **Day off with no clock:** settled 0, then late events + recompute re-settle to 240/23,333.
- **Idempotency:** approve ×2 + settle ×3 + decide in parallel ⇒ 1 row.
- **Payroll runs:**
  - July DRAFT ⇒ OT lands in 2031-08 and the draft stays at add 0.
  - The Aug run binds 50,000 once.
  - Race decide-vs-`createPayrollRun`(Sep), with the judge lock held: both waited, row bound to Sep once, add 10,000.
  - Revoke after PAID ⇒ DEDUCTION 20,000 in 2031-10, Σ 0; revoking twice ⇒ `decided`.
  - Recompute after PAID ⇒ +5,000 in 2031-10.
  - `reverseRun`(PAID) unbinds every row; the re-run binds 50,000 once.
  - Replaying settle ×3 adds no rows.
  - No unbound row in an APPROVED/PAID period.
- **Requests:** window edges (+24 h exact ok / +1 min late · +31 d ok / +32 d tooFar) · Bangkok-midnight 23:30–00:30 = 60 min · overlap, adjacent and duplicate · re-file after cancel · ENDED self / on endDate / after.
- **Permissions:** self, owner-own, fourEyes, other branch, other tenant (real session ctx), and the payroll viewer are all refused; owner approving own on-behalf filing is allowed.
- **Privacy:** manager list has no satang; payroll viewer and own employee see amounts; plain staff ⇒ listNo. Audit, outbox and notification payloads carry no amounts.

## Observations (not FAIL by the brief, for the controller)
- Full-day APPROVED leave + worked to 21:00 + approved OT ⇒ paid 0 (judge sets otMin 0 on LEAVE).
- Commission-only (base 0): request and approval accepted, parked NO_RATE forever (brief A7 says refused); feeds #4.
- Revoke after PAID, then `reverseRun` + re-run: the revoked 20,000 is paid again in the Aug re-run and clawed back by the Oct DEDUCTION. Net 0, but the employee is paid and then charged.
- A filer-manager may REJECT their own on-behalf filing (four-eyes applies to APPROVED only).
- The profile is frozen at first settlement, not at the work date (by brief).

## Not tested
- ACTIVE OT law row (`HrLawTable` is platform-wide; not touched).
- Overnight work split across two day-off dates (each request gets its own first 8 h at holiday-work rate; legal reading ambiguous).
- Negative-net blocking of the next run by a DEDUCTION.
- Payroll for DAILY/HOURLY (runs refuse any non-monthly profile, H1.1).
- UI.

## Harness note
PERM-6/9 first failed because I passed tenant A's ctx with tenant B's owner. Real actions take the tenant from the session; re-run with the session ctx ⇒ notFound ×3, untouched.

Residue: none (RESIDUE-CHECK none, all 3 probes). Probe scripts deleted. Seeded tenant untouched (no re-seed needed).
