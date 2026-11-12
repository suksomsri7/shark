# WO H4.1 — leave/absence → booking windows · real `hr.staffWindows()` (X-HR.1) · duty reassignment hint

> Lane 3 · tree `/root/projects/shark-hr-l3` · branch `wip/hr-h4.1` cut from `session/hr` 6c614c04c (brief/oracle commit 374807090) · 2026-11-12 · DB `wo-hr-qc-l3` via `scripts/qc-hr.sh`
> Brief `ledger/hr-briefs/hr-brief-H4.1.md` — controller: all Q1–Q14 defaults accepted · oracle `scripts/qc-hr-h4.1.mts` (42 checks) · red `hr-H4.1-red.txt` · green `hr-H4.1-green.txt`

## 0. Checkpoint
- done: code + UI + oracle green 42/42 · battery + fitness + typecheck (results §4)
- next: controller regression / reviewer / hunter

## 1. Files
| file | what |
|---|---|
| `src/lib/modules/hr/availability-rules.ts` (new) | pure `dayWindows` (R2–R5) · `mergeWindows` · `prevDayOf`/`isValidDay` (integer calendar maths — no `Date`) |
| `src/lib/modules/hr/availability.ts` (new) | `staffWindows` (R6–R8) · `leaveDutyHints` (R9/R11) · `leaveDutyNotify` (R10) · `DUTY_HINT_TEXT` · types `StaffWindowsInput/Row` (field lists byte-identical to SVC B.1) |
| `src/lib/modules/hr/index.ts` | SVC B.1 stub → `export type {…}` + `export { staffWindows, leaveDutyNotify, leaveDutyHints } from "./availability"` (marker HR H4.1) |
| `src/lib/outbox-consumers.ts` (hot) | one marked hunk: `hr.leave.decided` → `leaveDutyNotify` for status APPROVED only (1 line removed) |
| `src/lib/modules/hr/ui.tsx` | impact section on `/hr/leave` (pending + APPROVED not yet ended, ≤60 leaves) — `hr-leave-impact` · `hr-leave-impact-candidate-*` |
| `src/messages/{th,en}/common.json` (hot) | `hr.leaveImpact.{title,uncovered,covered,candidate,noCandidate}` |
| `scripts/hr-ui-inventory.json` | 2 rows (wo H4.1 · oracle qc-hr-h4.1) |
| `scripts/qc-hr-h4.1.mts` | ORACLE-EDIT S1.7 (§3) |
No migration · no seed change · no new event/label · `booking/**` untouched.

## 2. Decisions (inside the brief's defaults)
- D-1 **Give-away swap keeps the giver roster-managed** (S3.13 literal E13 → row `[]`): R6 also counts an employee who is the requester of an APPROVED `HrShiftSwapRequest` whose `fromEntry` (published) is dated in the ISO week. Without it E13 has no entry left in the week ⇒ no row ⇒ booking would fall back to unit hours all day (over-booking risk). Brief R6 text does not mention this — controller to confirm.
- D-2 "approved full-day leave" in `others`/`weekMin` = any APPROVED leave that is not AM/PM half-day (hours leave counts as full, consistent with Q5). Candidates exclude any approved leave covering the day (incl. half-day).
- D-3 Candidate unit when the entry has `unitId null` = the leaver's unit-of-day.
- D-4 Advisory lock via `tx.$queryRaw\`SELECT pg_advisory_xact_lock(hashtextextended(…))\`` inside `tenantDb(ctx).$transaction` (house pattern roster.ts/leave.ts; S1.3 forbids `$executeRaw`). The dedupe audit is written with `tx.auditLog.createMany` in the same tx (core `writeAudit` uses a second connection and could not be the idempotency key under the lock). Audit `after = {leaveId, uncovered, recipients: <count>}`.
- D-5 Recipients = accepted memberships passing the R11 viewer rule, minus the leaver's linked user; zero uncovered ⇒ no audit, no notification (a later re-delivery re-evaluates — still once at most).
- D-6 Shift name is not in the item contract (R9 keys fixed) ⇒ the impact line shows "กะ <date> (<time>)".

## 3. ORACLE-EDIT (S1.7, `scripts/qc-hr-h4.1.mts`)
1. `testidsOf(src, "hr-leave-impact")` can never return the bare id `hr-leave-impact` (helper regex needs ≥1 char after the prefix) ⇒ scan with prefix `hr-leave-` and keep `hr-leave-impact*`.
2. `inventoryParity(...).meta` requires every `/hr/leave` row to be wo H4.1 — the six H2.7 rows on the same page make it false forever ⇒ wo/oracle checked on `hr-leave-impact*` rows only (rows > 0 kept).
Nothing else changed; all other checks untouched.

## 4. Runs (lane DB wo-hr-qc-l3)
- qc-hr-h4.1 forced 42/42 ×3 (last = after the type-only fix, saved as hr-H4.1-green.txt) · unforced 42/42 · RESIDUE none each
- seed-hr-qc 30/30 ×2 · counts identical (md5 of JSON_SUMMARY.counts equal)
- qc-hr-leave-booking 14/14 · qc-booking-hours-hr 13/13 · qc-hr-h2.1 90/90 · qc-hr-h2.3 79/79 · qc-hr-h2.7 89/89 · qc-hf-hr-privacy 194/194 · qc-hr-roster 24/24
- fitness 53/53 env + no env · fitness-hr 9/9 env + no env
- typecheck (heap 12288, .next/types removed): first run 1 error (Db type vs extended tx) → fixed with a Pick of the 3 delegates (type-only) → 0 errors
- picker (# LEAN) also lists h0.x/h1.x/h2.2/h2.4/h3.3, attendance, payroll, approval, crm, ai, calendar, cpa suites — not run by builder (controller run)

## 5. Debts
- **X-HR.1b (SVC)** — booking `staffOnLeave` (`employeesUnavailable`, C-2) still closes the whole day for half-day/hourly leave even when the window came from `HR_SHIFT` (Q2 — no `booking/**` edit).
- Q4 break position · Q5 hourly leave start time · Q8 booking appointments in hint · Q9 "approve + assign" · hotel/housekeeping duties after RUN HOTEL · Q3 edited-after-publish rows.
- `qc-svc-b.1` must run on an SVC DB before release (F5).
- Visual 1440/1024/390 = CONTROLLER-RUN.
