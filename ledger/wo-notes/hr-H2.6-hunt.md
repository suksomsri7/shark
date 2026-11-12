# H2.6 hunt — wip/hr-h2.6 @ cb2e04400 · lane DB wo-hr-qc-l2 (qc-hr.sh)

**Verdict: no CRITICAL or MAJOR failures. 3 MINOR or design notes.** I ran 3 probes (acct, gate, race) on their own tenants, 34 checks in total. Fixed now 2032-03-20 12:00 BKK (the race probe used 2032-04-03 12:00).

## Worked-minutes accounting (each row: stored row = board = month summary = monthlyMinutes = recount of non-voided punches, before and after)
- a: add missing OUT 17:05 → ON_TIME, missingOut cleared, W0→490, v2. PASS
- b: IN 09:20→08:50 → LATE L20 W460 → ON_TIME L0 W490. PASS
- c: IN 08:55→09:30 → ON_TIME W485 → LATE L30 W450. PASS
- d: OUT 17:00→19:00 → W485 → W605, OT 0→120. PASS
- e: void the wrong OUT 10:00 → EARLY_OUT W65 → W0, missingOut. PASS
- f: add IN+OUT pair on an ABSENT day → ON_TIME W480, v3. PASS
- g: night shift, IN 03-12 23:50 → 03-13 00:10 → stays on the 03-12 shift, LATE L110→L130, W370→350. D+1 DAY_OFF row untouched. PASS
- h: split shift, add the 2nd OUT → slot 2 W0→250, slot 1 untouched (v1), total 495. PASS
- i: half-day leave (AM) + missing OUT → W0→240. PASS
- j: holiday, unrostered, OUT moved → DAY_OFF W/OT 120→300. PASS
- Orphaned stored row: not re-probed; oracle S4.7 covers it.

## Stale data at apply and races
- Pending ADD OUT 17:00, then owner-auto ADD OUT 18:00, then approve → ORDER, CANCELLED. PASS
- Two approvers in parallel, ADD OUT 17:00 ∥ ADD BREAK_START 17:10 (×3) → one APPROVED, the other ORDER; never OUT>BREAK_START. PASS
- Approve ∥ cancel (×4) → exactly one wins, rows consistent (cancel won all 4). PASS
- Double approve → second gets stale. Replaying `applyCorrectionDecision` with a fake request id → applied:false. 1 event, 2 live rows. PASS
- One pending per punch: sequential → dupPending. Parallel (key, key2, owner) → owner-auto applied, key got targetNf, key2 PENDING; approving key2 later → TARGET. PASS
- Kiosk punch during apply: not re-probed; oracle S9.3 covers it.

## Payroll
- Correction pending, run set APPROVED, then approve → paid text, CANCELLED, punches 2→2, stored row unchanged (v1). PASS
- Race, approval first: I held `hr:clock`, so decide held the period lock while the payroll approval waited behind it. Payroll then saw the correction APPROVED (serialised). PASS. The other order (payroll first) is covered by oracle S9.1.
- DRAFT run built before the correction: the correction applies; run totals unchanged (gross 0, net 0); `approveRun` → ok. `payroll.ts` reads no attendance at all, so the corrected time does not reach pay until H3 (debt D2). OBSERVE
- **MINOR (over-refusal):** with April PAID and March open, adding OUT 04-01 06:00 to a March night session is refused as paid, even though the session belongs to March. The only accepted path is ADD OUT 03-31 23:59, which records wrong minutes. Repro: run 2032-04 PAID; IN 03-31 22:00; owner `requestCorrection` ADD OUT 04-01 06:00 → paid. Cause: `monthsOf` includes the Bangkok month of `proposedAt`. March PAID with April open is refused, as it should be.

## Limits
- 6th pending → tooMany. Owner-filed twice more while 5 are pending → APPROVED both times (Q4). PASS
- 35-day window, filing at 04-05 00:00 BKK: 03-01 ok, 02-29 tooOld. At 04-04 23:59:59: 02-29 ok. PASS
- Future time: 12:01 → future text. 12:00 → ok. 12:00:59 floors to 12:00. PASS
- 16 h cap: 961 min → tooLong. 960 → APPROVED, board W960. PASS

## Permissions
- Filing for someone else refused for: staff without key, manager of another branch, key holder of another branch, other tenant. PASS
- Deciding refused for: MANAGER role in branch (noPerm), manager of another branch, key holder of another branch (other-branch text), payroll-only viewer, other tenant through its own ctx. Status stays PENDING. PASS
  - The service trusts the actor object it is given: an other-tenant OWNER actor passed with this tenant's ctx was accepted. This cannot happen through the server actions, which build the ctx from the session (`ctxOf`).
- Own decisions refused (SELF_DECIDE_REFUSED): filer deciding own filing, key holder deciding own correction, key holder filing on behalf of own record then deciding. PASS
- A second key holder can decide. PASS
- **MINOR (design):** an OWNER linked to an employee record files for self → applied at once, `decidedById` = self. This follows Q4 (owner-filed applies at once), but conflicts with "never own request". Controller to confirm.
- ENDED employee: self → mInactive. On behalf up to end date → PENDING. After end date → outOfEmployment. Other tenant's punch id → targetNf. Cancel by a stranger or other tenant → notOwn. PASS

## Readers after voiding the last IN
nextClockKind OUT→IN, myClockState CLOSED/IN, listAttendance 0, attendanceBetween 0, attendanceMarks all null, monthlyMinutes 0, correctablePunches 0, board none, kiosk clock() → IN. monthlyAttendance agrees on another employee. PASS

## Privacy
- correctionDetail → detailNo for staff in and out of branch, payroll-only, MANAGER and key holder of another branch, other tenant. Lists empty or refused. myCorrections of a stranger → 0. PASS
- Evidence: a colleague's own shift is excluded. Keys are only shiftNo, openedAt, closedAt, forced. PASS
- **MINOR:** a shift opened by a colleague and closed by the employee is included (R11 allows "opened or closed by"). Only its number and times are shown, no colleague identity.

## Other MINOR
Split shift with both OUTs missing: the 2nd ADD OUT on the same day is refused (dupPending) until the 1st is decided. This is what the R10 unique key (employee, day, kind) does by design.

## Not tested
Approval chains and POS evidence beyond the shifts above (covered by oracle S5.x and S7.3). Hourly leave and full-day leave. The HTTP/UI layer. Real POS logout (D1). Corrections more than 7 days back on days that have no stored row (left to the finaliser by design).

## Hygiene
Every probe printed `RESIDUE none`. All `scripts/zz-hunt-h26-*.mts` deleted. The seeded tenant was not touched, so seed-hr-qc was not re-run. No product, oracle or seed file was edited.
