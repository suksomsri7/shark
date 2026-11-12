# H2.6 builder notes — time corrections (wip/hr-h2.6)

Base 2596bac87 (brief+oracle on 39ea9782c = session/hr incl. H2.5/H2.7/H2.8/H4.4/H4.1). Lane DB wo-hr-qc-l2 (qc-hr.sh). Control base for the oracle: `QC_H26_BASE=39ea9782c0f5397ed5c4822da204ae84e7d6cf2d` (the oracle default e209390e7 predates the H4.1 merge, so S1.8 would count H4.1 hunks in index.ts/outbox-consumers.ts).

## Migration (Q1)
`20270101000000_hr_time_correction` — enum HrCorrectionAction · HrAttendance voidedAt/voidedByCorrectionId/correctionId · HrTimeCorrection action (default ADD)/day · partial uniques pending_target_key + pending_add_key. Pre-check on lane DB: `SELECT count(*) FROM "HrTimeCorrection"` = 0. Applied with `migrate deploy` (lane DB only). Post-diff: only pre-existing unrelated drift (DormUtilityRate). Runbook: migrate first, then code. Note: H1.2's `HrTimeCorrection_attendanceId_pending_key` duplicates pending_target_key (harmless, left). Correction rows never set rosterEntryId, so H1.2's (employeeId, rosterEntryId, kind) index never fires.

## Lock order (R8)
`hr:payroll:run:<sys>:<YYYY-MM>` for every month of {session day, bkk day of originalAt, bkk day of proposedAt} asc → `hr-corr:<id>` (decide/effect/cancel; none at filing) → `hr:clock:<emp>` → `hr:judge:<dayId>` asc → `hr:roster:<sys>:<emp>:<day>` asc. Stored-day recompute only for days in the locked months (day ±1).
No cycle: H2.5 recompute = payroll → judge → clock → roster; it holds the same payroll key before judge(d), and we only take judge(d) for d in a payroll month we hold. Finaliser = clock → roster; alerts = clock; clock-in = clock; leave = hr-leave → hr-leave-emp → roster; offboarding = hr:emp → clock → hr-leave → hr-swap → roster; payroll create/recompute/approve/markPaid = payroll key then rows (no clock/judge/roster). Cancel = hr-corr only. Every path takes roster last and clock before judge/roster.

## Readers of HrAttendance checked (voidedAt: null)
clock.ts sessionOf ×2 (clock · nextClockKind · myClockState · kiosk · mobile · correctedPunchColumnsInTx) · judge.ts loadData (04A board · 04B/self month · finaliser · alerts · needsRecompute · recomputeAttendanceDay · recomputeStoredDaysInTx) · service.ts listAttendance · monthlyMinutes · monthlyAttendance (ui.tsx · payroll-ui.tsx · pos-seam via index) · pos-seam-read.ts attendanceBetween · attendanceMarks ×2 (pos-seam workedMinutesBetween/onShiftToday) · correction.ts liveAround/correctablePunches/target lookup. No other `hrAttendance.find*/count` and no raw SELECT of "HrAttendance" in src (oracle S1.3 scan + grep); AI tools/exports/payroll.ts call the service functions above only. Writers (not readers): clock() create · purgeClockPrivacy (purges voided rows too — intended) · roster.ts rosterEntryId relink (frozen).

## Decisions
- POS evidence: no POS facade lists shifts per user on this base ⇒ new seam `src/lib/hr-pos-evidence.ts` (prisma read with explicit tenantId — tenantDb needs a POS systemId the caller doesn't know). Read before the request tx (snapshot; no second connection under the locks). deviceLogout = null (D1).
- Owner-auto skips the ≤5 pending limit (no PENDING row is created) and inserts the row APPROVED directly (so a pending request on the same target doesn't block it — oracle S6.1).
- Notifications exclude the acting decider (filer+employee otherwise).
- Visible UI: 04A row "แก้เวลา" (on behalf) · 04B "ขอแก้เวลา" (self + selected employee) · `?view=corrections` cards; target punches via `correctablePunches` (id/kind/time only).

## ORACLE-EDIT
- S4.5 `next`: base already stores a DAY_OFF row on D+1 (week uses the roster) — check now asserts it is untouched (DAY/DAY_OFF/W0/no OUT/v1).
- S4.7: pinned the orphan's slot/status = DAY/NO_SCHEDULE (controller request).

## Debts for H3
D1 device logout · D2 DRAFT run built before a correction is not rebuilt · D5 neighbour-day rows in an unlocked month stay stale · D7 any new reader must filter voidedAt · days without a stored row are left to the finaliser.

## Runs (head before notes commit e27b19cd0) — full lines in hr-H2.6-green.txt
qc-hr-h2.6 forced 49/49 ×2 + unforced 49/49 (residue none) · seed-hr-qc 32/32 ×2 (identical counts) · h2.4 66/66 · h2.5 77/79 · h2.1 90/90 · h2.2 60/60 · h1.2 73/73 · h1.3 63/63 · h0.1 66/67 (S4.3 known, not mine) · h0.3 37/37 · h0.5 67/71 (S6.2/4/5/7 QC4-only) · qc-payroll 19/19 · qc-hf-hr-privacy exit 0 · fitness 53/53 + fitness-hr 9/9 with/without env · typecheck 0 errors.
qc-hr-h2.5 reds: S9.5 known (not mine); **S9.7 caused by this WO** — its inventoryParity takes every row of page /hr/attendance and requires wo=H2.5/oracle=qc-hr-h2.5 and an hr-att-* testid in attendance-ui/page; H2.6's required rows (hr-corr-* in correction-ui.tsx, hr-att-view-corr with wo H2.6) can never satisfy it. Needs a controller ORACLE-EDIT on qc-hr-h2.5 S9.7 (filter rows by wo H2.5); not edited here.

## r2 (controller fix round — reviewer M1 + hunter notes)
- Merged session/hr `6e57e0d00` (clean).
- Paid/period by **session-owning day**: lock set = months of originalAt, proposedAt and each − 960 min (`lockMonthsOf`, ascending). Under `hr:clock`, `ownerDaysOf` recomputes the owner days (H2.5: session = IN's Bangkok day) before AND after the change on live data. Owner day outside the lock set ⇒ PERIOD (refresh text) · owner-day month APPROVED/PAID ⇒ paid · a proposed time merely inside a paid month is not a reason. Stored rows recomputed for owner days ± 1 only in held, unpaid months; neighbour days outside that are dry-run (`recomputeStoredDaysInTx({dryRun})`, no locks, no writes) and refuse (PAID/PERIOD) if any stored row would change. All apply refusals now throw out of the tx (rollback — nothing written) and a second tx marks CANCELLED + notifies. Lock order unchanged (payroll asc → hr-corr → hr:clock → hr:judge asc → hr:roster asc); dry-run takes no locks, so no new edge.
- Evidence: openedAt only if this user opened · closedAt only if this user closed (or the system force-closed a shift they opened) · stored with unitId; DTO drops unitId and keeps only shifts in the viewer's branch scope (the employee sees all their own).
- `listCorrections`: branch filter in the query (employees whose home unit or any borrowing is in scope); per-day unit check kept.
- Q4 ruling: owner self-filing applies at once, `selfApplied` on the row (+ owner_auto audit + DTO + "แก้โดยเจ้าของเอง" chip). Other roles never decide their own.
- Migration `20270101000001_hr_time_correction_idx`: drops the duplicate `HrTimeCorrection_pending_target_key` (H1.2 `attendanceId_pending_key` stays) · adds `selfApplied`. No index on voidedByCorrectionId/correctionId — nothing queries by them.
- ORACLE-EDITs (authorised): qc-hr-h2.6 S1.2/S3.4/S7.3/S4.5/S7.1 + new S11.1 S11.2 S7.5 S7.6 S6.2 (RED 45/54 on the r1 code — `hr-H2.6-r2-red.txt`) · qc-hr-h2.5 S9.7 judged on wo=H2.5 rows.

## More debts
- D2: payroll reads no attendance until H3 — H3.1/H3.4 must refuse or rebuild a DRAFT run whose inputs changed.
- Split-shift day with two missing OUTs needs two sequential requests (R10 unique key employee+day+kind).
- The decide/request services trust the actor/tenant pair handed in by the action layer (actions build ctx from the session).
- r2 runs: h2.6 54/54 forced ×2 + unforced (residue none) · seed 32/32 ×2 · h2.5 79/79 · h2.4 66/66 · h0.1 67/67 · h1.2 73/73 · h1.3 63/63 · h4.1 47/47 · h4.4 82/83 · qc-payroll 19/19 · hf-hr-privacy exit 0 · fitness 53/53 + fitness-hr 9/9 both modes · typecheck 0.
- **qc-hr-h4.4 S1.1 red (not edited — other WO's oracle):** it asserts `20261231000000_hr_lifecycle` is the last `_hr_` migration; any later HR migration (H2.6's 20270101000000/…01) breaks it. Already true in r1. Needs a controller ORACLE-EDIT (e.g. "no _hr_ migration between it and the next WO's").

## r3 (VIS-1 merge + reviewer follow-ups)
- Merged session/hr `9b423ec6a` (VIS-1): day table keeps VIS-1's scroll frame/sticky column; the row "แก้เวลา" sits in the actions cell inside the frame. Month: header "ขอแก้เวลา" + per-day entry in VIS-1's day list (390), none in calendar cells. Visual 2.6 + `corr-self-daylist`.
- Neighbour dry-run now compares the stored row's recomputed result before vs after this correction; only a change caused by this correction refuses (a row already stale from a roster edit/leave/holiday no longer blocks). PERIOD has its own text (`CORRECTION_TEXT.period`). Oracle S11.3 + S2.1 period (RED 53/55 first: `hr-H2.6-r3-red.txt`).
- Runs: h2.6 55/55 forced ×2 + unforced (residue none) · seed 33/33 ×2 identical · h2.5 79/79 · h2.4 68/68 · h4.4 86/86 · h4.1 47/47 · h1.2 73/73 · h2.2 60/60 · hf-hr-privacy exit 0 · fitness 53/53 + fitness-hr 9/9 both modes · typecheck 0.
