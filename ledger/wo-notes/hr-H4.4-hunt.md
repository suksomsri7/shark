# H4.4 hunt — bug hunter report (wip/hr-h4.4 @ 68e22fe32 · lane DB l2 via qc-hr.sh)

Two probes, real runs on l2, own tenants `qc-hr-zzh44a-*` / `qc-hr-zzh44b-*`. Seeded tenant not touched, so no re-seed was needed. **3 FAIL · 31 PASS.**

## FAIL
**F1 (MAJOR) — a STAFF HR clerk's offboard leaves the ex-employee's app access in place.** Repro: viewer STAFF `{hr.employee.create:true}` on [u1] offboards a linked STAFF employee with `revokeAccess:true`. Result: `ok:true, pinRevoked:true, accessRevoked:false`. The membership is still accepted (`acceptedAt` set), `linkedUserId` is kept, the PushDevice is still bound to the tenant, `employeeOfUser` returns the ENDED row, `myReviewNotes` still serves notes, and the `app_access` task stays open. Wanted: revoke in the same tx, or refuse. Cause: `revokeAccessInTx` needs `settings.staff.write`, but the offboard gate only needs `hr.employee.create`. This is not covered by D8 (target is STAFF). At minimum unlink the row and unbind push under the offboard authority, or refuse when revoke was asked for and cannot be done.

**F2 (MAJOR) — POS `clockSelf` racing offboard writes an IN punch for an ENDED employee (2/2 runs).** Repro: hold `hr:clock:<e>` → start `offboardEmployee` (it queues on the lock) → start `seam.clockSelf({kind:"IN"})` (it passes the `active` check and queues) → release. Offboard commits ENDED, PIN null, unlinked. Then clockSelf returns `IN ok` and the attendance row lands. The timing confirms clockSelf resolved after offboard. Cause: `pos-seam.ts clockSelf` checks `emp.active` before taking the lock, then calls `clock()` without `requireActive`. Probe D2 confirms that `clock()` without `requireActive` writes for an ENDED row. Fix: pass `requireActive:true` from clockSelf. pos-seam.ts is a frozen file (S15.1), so this needs a controller ruling.

**F3 (MAJOR) — `requestLeave` racing offboard leaves a PENDING future leave on an ENDED employee.** Repro: park the leave insert (holder `LOCK TABLE "HrLeave" IN EXCLUSIVE MODE`; reads are still allowed). `requestLeave(from 2026-12-20)` passes its `active` check and waits. Offboard commits with `cancelled.leaves=0`. Release → the leave is PENDING and the employee is ENDED. Cause: in service.ts, `requestLeave` checks `active` outside its tx and takes no `hr:emp` lock. Fix: lock and re-check inside the tx. service.ts is frozen too.

## PASS
- Gates: self refused · manager → other branch, plain STAFF, payroll-only and other-tenant owner all get the same `noAccess` bytes · second offboard gets the `ended` text and writes nothing · 6 parallel offboards ⇒ 1 ok, 5 ended, 1 event, 1 audit, 6 tasks.
- Manager → owner's row: allowed. The owner's PIN is revoked, but the owner's membership and link stay and the result says `accessRevoked:false` (D8). Manager → MANAGER target: same, membership and push stay (D8).
- Atomicity: a temporary trigger that raises on the task insert, on the PushDevice unbind, or on the outbox insert (last write) ⇒ the offboard is refused and every row is unchanged (status, PIN, link, membership, push, leaves, approval, roster, swap, tasks, event, audit).
- Exact rows (end date 06-10): leaves from 06-11 (PENDING) and 07-01 (APPROVED) are CANCELLED and the approval request is CANCELLED. The 06-10..06-12 leave is untouched and counted as spanning 1. The leave ending 06-10 is untouched, and the REJECTED leave is untouched. Roster 06-10 is kept; 06-11 and 06-30 are deleted. The swap from the end-day entry is CANCELLED.
- Doors after an owner offboard: verifyPin, verifyPinOfEmployee, kioskClock, clockWithPin (name+PIN), `clock(requireActive)`, mobileClock, clockSelf and leave-on-behalf are all refused. No attendance row is written, membership is revoked, push is unbound, the link is null.
- decideLeave(APPROVED) racing offboard ×5 ⇒ the leave ends CANCELLED every time.
- Re-hire: restoring keeps PIN, link and membership off; nothing comes back silently. If `autoRevokePin=false` is set, the old PIN works again after restore. This follows the policy, but the owner should know.
- End dates: BKK 00:30 (UTC the day before) accepts today and refuses tomorrow; BKK 23:59 refuses tomorrow; far future, an invalid day, and a date before the start date are all refused.
- Sweep: at BKK 23:59 there is no alert; at 00:00 (UTC still the day before) there is 1. Running it 3× more ⇒ still 1. Running it 3× in parallel ⇒ 1 each (5+0+0).
- Notes: no edit or delete export. 4000 chars ok, 4001 and a blank title refused. HTML/script text is stored and returned verbatim, and the UI has no `dangerouslySetInnerHTML`. Payroll-only, the employee, an other-branch manager and another tenant all get `null`. Self view hides NOTE. Acknowledging by raw id as a peer, as the employee on a hidden note, or from another tenant is refused. After offboard the ex-employee's self view has 0 items. My probe's N4 line said FAIL; that was my own miscount (it expected 2, only 1 note was visible), not a bug.
- Checklists: starting twice ⇒ 7/0/7. Ticking, starting or listing by payroll-only, the employee, an other-branch manager, or across tenants by raw task id is refused or `null`, and nothing gets ticked.

## Observations (no rule broken)
- Pending approvals that name the ex-employee as `approverUserId` stay PENDING with nobody reassigned (D3).
- Ticking a task after offboard is allowed. ONBOARDING can be started on an ENDED employee (0 created here). An OFFBOARDING checklist can be started on an ACTIVE employee, and the panel then shows OFFBOARDING_OPEN.
- "Linked in two HR systems" cannot happen: the partial unique `(tenantId, linkedUserId)` refuses it, so D7 is moot.

## Not tested
Server actions and UI (no server), mobile/API token sessions after revoke, swap request/respond by the ex-employee directly (blocked upstream by unlink and membership), kanban bridge replays, and probation/contract end dates before the start date at profile save (not an H4.4 path).

## Residue
Both runs: `RESIDUE none`, extra probe counters (notes, tasks, push devices, `zz_h44_*` triggers) 0. Probe scripts `scripts/zz-hunt-h44-*.mts` deleted; the only file left is this one.
