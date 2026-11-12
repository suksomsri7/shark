# H2.5 — Attendance judgement from the roster · team day board (04A) · month calendar (04B) · not-in / absent alerts

> **DRAFT — defaults (§9) in force unless the controller overrules.** Lane 1 · **Mig** (`20261230000000_hr_judgement` + `…000001_hr_judgement_leave`) · hunter required (money-adjacent snapshot · privacy · race). Base `session/hr` 2e23c8164 (H2.1–H2.4, H3.3). Branch `wip/hr-h2.5` · lane DB `scripts/qc-hr.sh` · oracle `scripts/qc-hr-h2.5.mts` · notes `wo-notes/hr-H2.5.md`.
> Read: DESIGN §E3 · REVIEW #9 #12 · HQ10 HQ11 · mockup 04 · H2.4 debts.

## 1. Facts (2e23c8164)
F1 `HrAttendance.judgement/dueMin/lateMin` = per-IN snapshot of `clock()`; never rewritten. Enum `HrAttendanceJudgement` has ABSENT/EARLY_OUT (unused).
F2 No per-day judgement; `monthlyAttendance` (FROZEN) stays.
F3 `clock.ts sessionOf`: verified link · else same-day adopt (start−360 ≤ IN < end) · else calendar day. `workedMinutesWithBreaks` unused.
F4 Slot `AppSystem.settings.hrClock` (earlyInMin 120 / closeGraceMin 240; `saveClockPolicy`, lock `hr:clockpolicy:<sys>`, spreads base). Late grace = `HrShift.graceMin` (15) / `HrWorkSchedule.graceMin`.
F5 Leave: **H2.7 in review elsewhere** (expect days/hours writers, `hr.leave.decided`) — H2.5 reads only APPROVED, from ≤ D ≤ to, `halfDay`. `HrHoliday` via settings (no H2.8 preset).
F6 `/hr/attendance` = requireTenant, everyone's counts. Minute jobs: `platform/minute-jobs` (`chat/sla-job.ts`).

## 2. Rules
R1 **Pure `hr/judge-rules.ts`** (no DB, no bare `new Date()`; imports: types, `./time-rules`, `./clock-rules`): `ATTENDANCE_POLICY_DEFAULT {notInAlertMin 10, absentAfterMin null, earlyOutGraceMin 0, flagEarlyOut true, otStepMin 15, alertsOn true, alertEmployee false}` · `attendancePolicyOf(raw)` (bad key ⇒ default, never throws) · `attributeSessions(entries [{id,employeeId,date,startMin,endMin,crossesMidnight}], events [{id,kind,at,rosterEntryId}], {employeeId, earlyInMin, closeGraceMin})` → `{byEntry {[id]: eventId[]}, rest eventId[]}` (R3) · `JUDGE_ENGINE_VERSION 1` ·
`judgeEntry({day, shift {startMin,endMin,crossesMidnight,graceMin}|null, dayOff?, events [{kind,at}], leave {halfDay null|AM|PM}|null, policy, closeGraceMin, now})` → exactly `{status, phase, final, lateMin, earlyOutMin, workedMin, breakMin, otMin, missingOut, alertAt, absentAt}`:
- window = `shiftWindow`; half day: M = start + floor((end−start)/2); AM ⇒ due start M; PM ⇒ due end M.
- final ⇔ now ≥ end + closeGraceMin (no shift: bkkMidnight(day+1) + closeGraceMin).
- after = floor((firstIN − dueStart)/1 min); LATE ⇔ after > graceMin; lateMin = after if LATE else 0.
- early = floor((dueEnd − lastOUT)/1 min); flagged ⇔ flagEarlyOut ∧ early > earlyOutGraceMin; earlyOutMin = early if flagged else 0.
- otMin = floor(max(0, lastOUT − dueEnd)/1 min / step)·step (HQ10, measured only; approval = H2.9).
- workedMin = `workedMinutesWithBreaks`; not final ∧ open ⇒ open segment counts to now. breakMin = Σ BREAK_START→(BREAK_END|OUT|now).
- precedence: full-day leave ⇒ LEAVE (late/early/ot 0, worked kept) · no IN ∧ now ≥ absentAt ⇒ ABSENT · no IN ⇒ PENDING (live only) · IN ⇒ LATE › EARLY_OUT › ON_TIME (late+early ⇒ LATE, earlyOutMin kept). Final IN without OUT ⇒ IN's status, missingOut, worked/early/ot 0.
- absentAt = min(start + absentAfterMin, end) (null ⇒ end) · alertAt = start + notInAlertMin (shift null ⇒ both null).
- shift null: dayOff ⇒ DAY_OFF (worked ⇒ otMin = floorStep(worked)) · else NO_SCHEDULE.
- phase: FINAL · UPCOMING (no IN, now < start) · NOT_IN (no IN, now ≥ start) · OPEN · ON_BREAK · CLOSED.
R2 **Slots** (`hr/judge.ts`): one per published entry of the employee dated D (overnight = start day). No entry ⇒ one `DAY` slot: roster in use (≥1 published entry in D's Mon–Sun week) ⇒ DAY_OFF · else `HrWorkSchedule` row (D ≥ its createdAt day) ⇒ judged vs it · else events on D ⇒ NO_SCHEDULE · else none. Outside startDate/endDate ⇒ none. Holiday + no entry ⇒ DAY_OFF + holidayId.
R3 **Attribution** (closes D-H24-adopt/r2d/m1): session = IN + rows to next OUT/IN. Belongs to E iff (a) IN.rosterEntryId = E.id ∧ E is this employee's ∧ E.start − earlyInMin ≤ IN ≤ E.end + closeGraceMin (raw id never trusted), else (b) E.start − 360 ≤ IN < E.end ∧ E starts on IN's Bangkok day (nearest start, `pickRosterEntry` tie-break). Rows after E.end + closeGraceMin are not E's (split shifts). Unattributed ⇒ DAY slot of IN's day (calendar rule for unrostered — Q3).
R4 **Snapshot.** `HrAttendanceDay` (§3) written **only** by (a) the finaliser for final slots (`ON CONFLICT DO NOTHING` on (employeeId, date, slotKey); locks `hr:clock:<emp>` then `hr:roster:<sys>:<emp>:<date>` in the tx before reading) and (b) recompute. Clock, roster, swap, leave, schedule, shift, holiday, settings writes never touch it. Readers: row ⇒ `stored:true`; none ⇒ live. `stale:true` ⇔ live ≠ stored on any of status/lateMin/earlyOutMin/otMin/workedMin/missingOut — shown, never auto-fixed. F1 untouched.
R5 **Recompute** `recomputeAttendanceDay(ctx, viewer, {dayId, reason}, {now?})`: OWNER, or `canManageHrSettings` viewer whose scope covers row.unitId (else rNotFound bytes); own linked row only for OWNER (rOwn); reason 3–200 (rReason); HR run of the month APPROVED/PAID ⇒ rPaid. Under `hr:judge:<dayId>` + R4 locks: re-run R1–R3, change only that row's judgement columns + version+1 + recomputedAt/ById/Reason + judgedAt; same result ⇒ `{ok, changed:false}`, no write. Audit `hr.attendance.day_recomputed {dayId, employeeId, date, before, after}`. No event; no other table.
R6 **Jobs** `runAttendanceJobs({now, tenantId?, deadline?})` → `{finalized, late, absent}`: D−7…D; per HR system ≤ 200 slots + ≤ 100 alerts, total ≤ 2 000/500, systems by id, stop at deadline. Nothing due ⇒ 0 writes. `tenantId` = oracle isolation.
R7 **Alerts.** NOT_IN: published entry ∧ alertsOn ∧ no attributed IN ∧ no APPROVED full/AM leave ∧ alertAt ≤ now < end ⇒ `HrAttendanceAlert(NOT_IN)` + **`hr.attendance.late`**. ABSENT: same with absentAt ≤ now < end + closeGraceMin ⇒ kind ABSENT + **`hr.attendance.absent`**. Insert `ON CONFLICT DO NOTHING`, emit in the same tx only if inserted (once; later IN does not re-arm). Payload exactly `{alertId, employeeId, rosterEntryId, systemId}`, key `<type>#<alertId>`. Consumer (one marked block): `notifyAttendanceAlert` locks the alert, `notifiedAt` set ⇒ no-op, else AppNotification per recipient + notifiedAt in one tx; then `withAutomation`. Recipients: OWNER + MANAGER/`hr.employee.create` members whose scope covers the entry unit (null unit ⇒ all-branch only), minus the employee's own user; + that user for NOT_IN when alertEmployee. `firedAt` = run's now. One label each in `automation/labels.ts`.
R8 **Cron**: ONE marked hunk `// HR H2.5 ▸ … ◂` in `cron/hourly/route.ts`: `runAttendanceJobs({ now: new Date(), deadline: new Date(Date.now() + 20_000) })`, try/catch → logOps WARN, no response field. Q2: minute job `hr.attendance` /5 min in `hr/attendance-job.ts`, imported by `scripts/crm-cron.mts`.
R9 **Board** `loadAttendanceBoard(ctx, viewer, {day?, unit?}, {now?})` → DTO|null; readers = `canReadRoster`. Rows = employees in scope on D with a slot; `unit` outside scope ignored; `units` = in-scope only. Leave type only if `leaveRowScopeOf(viewer).all`, else "ลา"; reason never. No geo/distance/note/reason/pin/salary keys.
DTO `{day, prevDay, nextDay, todayKey, unitSel, units[{id,name}], canClockFor, alerts[{employeeId,name,shiftName,startMin,kind,firedAt}], totals{workedMin,counts}, rows[{employeeId,name,initial,position,borrowed,slots[slot]}]}` · slot `{slotKey, dayId, shift{name,startMin,endMin,crossesMidnight}|null, inAt, outAt, method, breaks[{from,to}], status, phase, final, stored, stale, lateMin, earlyOutMin, workedMin, otMin, missingOut, leave{label,pending}|null}`.
R10 **Calendar** `loadAttendanceMonth(ctx, viewer, {employeeId, month}, {now?})` → `{month, employee{id,name,position}, days[{day,slots}], summary{…12 keys, defined in the oracle header}}`|null; same readers/scope. No money (Q8).
R11 **Self** `myAttendanceMonth(actor {tenantId,userId}, {month}, {now?})` via `employeeOfUser` only; own leave type; unlinked ⇒ `{ok:false, reason: CLOCK_TEXT.mNoEmp}`. Page: non-reader linked ⇒ own calendar; else 404.
R12 **Settings** key `AppSystem.settings.hrAttendance`: `getAttendancePolicy` / `saveAttendancePolicy(ctx, viewer, input)` in `clock-settings.ts` — gate, all-branch rule, lock, spread as `saveClockPolicy`; audit `hr.settings.attendance-policy.update`; card `hr-settings-attendance-policy`. Ranges: notInAlertMin 0–240 · absentAfterMin null|30–720 · earlyOutGraceMin 0–60 · otStepMin ∈ {1,5,10,15,30} · 3 booleans.
R13 actions/pages/UI never pass `now`.

## 3. Schema
000000: enum `HrAttendanceAlertKind {NOT_IN, ABSENT}` · `HrAttendanceDay {id, tenantId, systemId, employeeId→HrEmployee Cascade, date Date, slotKey (entry id|"DAY"), rosterEntryId? unitId? (plain strings), startMin? endMin? crossesMidnight? graceMin?, status HrAttendanceJudgement, lateMin earlyOutMin workedMin breakMin otMin (Int 0), missingOut false, leaveId? leaveHalf HrHalfDay? holidayId? inAttendanceId? outAttendanceId?, engineVersion 1, version 1, judgedAt, recomputedAt? recomputedById? recomputeReason?, createdAt, updatedAt}` unique (employeeId, date, slotKey), idx (systemId, date), (tenantId) · `HrAttendanceAlert {id, tenantId, systemId, employeeId→Cascade, rosterEntryId, date, kind, firedAt, notifiedAt?}` unique (employeeId, rosterEntryId, kind), idx (systemId, firedAt), (tenantId). 000001: `ALTER TYPE "HrAttendanceJudgement" ADD VALUE 'LEAVE'`. `core/scope.ts` both `sys()`. H3.1 reads `HrAttendanceDay`.

## 4. Fixed texts (byte-exact)
| key | text | seen by |
|---|---|---|
| rNoPerm | คุณไม่มีสิทธิ์คิดผลการลงเวลาใหม่ | no key |
| rNotFound | ไม่พบผลการลงเวลาของวันนี้ — กรุณารีเฟรช | recomputer (also other branch/tenant) |
| rOwn | คิดผลการลงเวลาของตัวเองไม่ได้ — ให้เจ้าของร้านหรือผู้จัดการคนอื่นทำ | manager, own row |
| rReason | ใส่เหตุผลที่คิดผลใหม่ (3–200 ตัวอักษร) | recomputer |
| rPaid | เดือนนี้อนุมัติเงินเดือนแล้ว — คิดผลการลงเวลาย้อนหลังไม่ได้ | recomputer |
| sAlert | เวลาเตือนต้องอยู่ระหว่าง 0 ถึง 240 นาทีหลังเริ่มกะ | settings editor |
| sAbsent | เวลาที่นับว่าไม่มาต้องอยู่ระหว่าง 30 ถึง 720 นาทีหลังเริ่มกะ | settings editor |
| sEarly | เวลาผ่อนผันออกก่อนต้องอยู่ระหว่าง 0 ถึง 60 นาที | settings editor |
| sOtStep | หน่วยปัด OT ต้องเป็น 1, 5, 10, 15 หรือ 30 นาที | settings editor |
| nLate | ยังไม่ลงเวลาเข้างาน / `{name} ยังไม่ลงเวลาเข้า{shift} (เริ่ม {hh:mm}) — เลยเวลาเริ่ม {n} นาที` | managers in scope, owner |
| nLateSelf | คุณยังไม่ได้ลงเวลาเข้างาน / `{shift} เริ่ม {hh:mm} — ถ้ามาถึงแล้ว ลงเวลาที่เครื่องหน้าร้านหรือมือถือ` | the employee (alertEmployee) |
| nAbs | ไม่พบการลงเวลาเข้างาน / `{name} ไม่มีการลงเวลาเข้า{shift} วันที่ {d} ({hh:mm}–{hh:mm}) และไม่มีใบลาที่อนุมัติ` | managers in scope, owner |
| stale | ข้อมูลเปลี่ยนหลังบันทึกผล | board/calendar readers |
Reused: `CLOCK_TEXT.mNoEmp` · `SETTINGS_TEXT.noPermission/shopWide`. `{d}` = Thai date (BE). Status/view labels under `hr.attendance.*` th+en (list: oracle S9.6).

## 5. Files
New: `hr/judge-rules.ts` · `hr/judge.ts` · `hr/attendance-ui.tsx` · `hr/attendance-actions.ts` ("use server": `recomputeAttendanceDayAction`, `saveAttendancePolicyAction`) · `hr/attendance-job.ts` · 2 migrations. Edited: `hr.prisma` · `core/scope.ts` · `clock-settings.ts` · settings page · `hr/attendance/page.tsx` · `ui.tsx` (section replaced; `monthlyAttendance` untouched) · `outbox-consumers.ts` · `automation/labels.ts` · `cron/hourly/route.ts` · `scripts/crm-cron.mts` · messages th/en · `hr-ui-inventory.json` · `visual-hr.mts` · `seed-hr-qc.mts` + `hr-qc-env.mts` (Q9). **Untouched:** clock.ts clock-rules.ts time-rules.ts roster.ts swap.ts service.ts payroll*.ts pin.ts privacy*.ts pos-seam.ts rules.ts layout.tsx/`hrTabs` (no new tab: `?view=day|month`).

## 6. Oracle groups (ids `H2.5-<g>.<n>`, counts + vector table in `wo-notes/hr-H2.5-oracle.md`)
S1 pure (literal vectors · policy parser · purity) · S2 slots/attribution · S3 snapshot/finaliser · S4 recompute · S5 alerts/events/consumer/labels · S6 board/calendar/self matrix · S7 settings · S8 races (holders on `hr:clock:<emp>`, roster key; cron ∥ cron ×5) · S9 statics · S10 migration · Z1 residue. 2031 rows raw, `opts.now`.

## 7. Controller screenshot run (before control · HQC seed with Q9 · 1440/1024/390)
`?view=day&day=<today−1>` (owner, manager, manager-branch) · `?view=day` today (phases, banner) · `?view=month&employee=<namfon>` (owner, manager-branch) · staff → own calendar · member/payroll/kiosk 404 · settings card. Testids `hr-att-{page,view-day,view-month,day-prev,day-next,banner,row-<emp>,slot-<key>,status-<key>,stale-<key>,clock-for,cal,cal-day-<day>,summary,recompute-<dayId>,recompute-reason,recompute-submit}` + `hr-settings-attendance-policy` + inventory rows (wo H2.5) · tokens · ≥44 px.

## 8. Open questions (default in force)
Q1 Late + early out [LATE, earlyOutMin kept]. Q2 Alert cadence (hourly = up to 60 min late) [add the 5-min minute job]. Q3 Unrostered overnight (H2.4-D1) [calendar rule stays]. Q4 Half-day leave, other half not worked [ABSENT + leaveHalf; tell H2.7]. Q5 Full-day leave but clocked [LEAVE, worked kept, no OT]. Q6 Arrives after absent alert [alert stays, status LATE]. Q7 Recompute [OWNER + roster writers in scope, not own row, not after APPROVED/PAID]. Q8 Money on calendar [H3.x]. Q9 Seed [YES: published roster for the 7 seeded days + finaliser at seed ⇒ `hr-expected.json` `attendanceDays`; FULL controller run]. Q10 Mockup 07:12 = late 12 [shift graceMin rules]. Q11 Self calendar [on `/hr/attendance`; H2.10 reuses]. Q12 Alert the employee [setting, off].

## 9. Runbook
**Migrate first, then deploy.** No backfill (first cron finalises D−7…D). Rollback: old code ignores both tables.
