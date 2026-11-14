# H4.5 delta review r2 — fix round (e7023d07c → 1618fb24a)

Reviewer: independent, read-only (by commit object; working tree ignored). Merge hunks from H4.2 (62a1f457b) were skipped.
Verdict: **MERGE WITH NOTES**. Rulings A–J and L are implemented as ruled. No BLOCKER and no MAJOR remain. The 4 MINORs below can be follow-ups.

## Rulings verified
- **A: done.**
  - `HrLineLink.employee @relation(... onDelete: Restrict)` and back-relation `HrEmployee.lineLinks` (hr.prisma) are in place.
  - Partial index `HrNotice_digestOf_idx` was added (migration.sql:83). Prisma does not model partial indexes, the same as the 3 existing partial uniques.
  - F1.2 runs a real `prisma migrate diff` and is green for H4.5 tables. Its note says other tables differ: that is pre-existing drift from other tickets, so CI `pnpm drift` was already not clean for reasons outside H4.5.
- **B: done; only the caller's own name can be returned.**
  - The chain is `myLineStatusAction` ("use server", actor from `requireTenant`+`requireMembership`) → `myHrLineStatus` → HR `myLineContactId` → `resolveSelf(actor)` → `myValidActive`.
  - `myValidActive` takes the ACTIVE link of the caller's employee row, requires `issuedForUserId = me.userId` (otherwise the link ends with ACCOUNT), then runs `validActive` (employee active, `linkedUserId` equals the issuing user, membership accepted).
  - `contactOf` filters by `tenantId`, and the partial unique (tenantId, chatContactId) WHERE ACTIVE excludes any other employee's contact.
  - A forged `employeeId` on the actor is ignored (S8.4 forged check).
  - `myHrLineStatus` lives in the non-"use server" file, so it is not callable from the client. The contact id never reaches the page. HR `myLineStatus` DTO has no name.
- **D: done; the offboard window is closed at use time.**
  - Eager ending:
    - `grantStaffAccess` (staff/service.ts:507, `keepUserId` = new user) ends links in the same tx.
    - `revokeStaffAccess` (:685, by employee rows AND `issuedForUserId`) ends links in the same tx.
    - Offboard ends links via the event.
  - Between the offboard commit (lifecycle.ts:551-552 clears `linkedUserId` and `acceptedAt` in its tx) and the consumer, every use point re-checks through `lineLinkInvalidReason`:
    - send precheck (line-notify.ts:238);
    - `activeLinkOfContact` for `hr.menu`/`hr.unlink` (line-link.ts:161);
    - admin chip (`employeeLineStatus`);
    - `myLineStatus`.
  - A failed check ends the link (OFFBOARD/ACCOUNT), and the link never revives (F2.5).
  - The only residual window is a row already past precheck whose push is in flight (seconds).
  - Other paths, all covered by the use-time check only:
    - `deleteAccount` (account-deletion.ts:141, user deleted → `linkedUserId` null or membership gone);
    - PDPA tenant purge (pdpa.ts:127);
    - `restoreStaffAccess` (does not revive: good);
    - invite re-accept.
  - grep found no other writer of `HrEmployee.linkedUserId` in src (only staff/service.ts:502/676) and no bulk-import/merge path.
- **E: done.** Precheck skips with OFF when the kind's event switch is off (line-notify.ts:233-234), and retries go through the same precheck (F3.1).
- **F: done.**
  - Save in the same settings tx: OFF ⇒ PENDING/HELD/FAILED → SKIPPED(OFF); a kind switched off ⇒ that kind's rows; leaving DIGEST ⇒ the digest-HELD rows (line-notify.ts:423-428).
  - Digest window: HELD rows older than yesterday's digestAt ⇒ SKIPPED(STALE) before building (:330-334). F3.2/F3.3 cover this.
- **G: done.** A tenant whose status is not ACTIVE gets no push (precheck: SKIPPED/TENANT) and no postback answer (`onHrPostback` returns `{}`).
- **H: done, with mi-1 below.**
  - The claim batch is 20, and `nextAttemptAt` works as a per-claimer ticket (lease + random ms).
  - `renewLineClaim` runs before the cap reservation and the push. A lost ticket means no push and no touch.
  - `finishLineNotice` is ticket-guarded.
  - Digests are built only when budget is left, with a deadline between systems.
- **I: done. Retrying the whole handler is safe.** Details below.
- **J: done.**
  - `endActiveInTx` writes the fixed in-app note `changedTitle`/`changedBody` for RELINK/ADMIN/LINE/CONTACT_REUSED to the link's `issuedForUserId`, with no LINE name and no other person's name.
  - SELF/OFFBOARD/ACCOUNT/BLOCKED get no note (sensible).
- **L: done.** S3.7 now uses the real alphabet for the 10 wrong guesses. The same real code typed from a fresh contact (15b) then links, which proves the 11th attempt was refused by the guess limit and not by the code.

## I — does a failing HR planner re-run the original consumer's work?
Yes. `bothMain(current, onHrEventForLine)` rethrows, so the outbox retries the whole handler. In addition, `withAutomation` already runs automation, journeys and webhooks on every attempt, even a failing one (outbox-consumers.ts:244-270, "M10"). Each piece that re-runs is idempotent:

| Event | What re-runs on retry | Why it is safe |
|---|---|---|
| roster.published, swap_requested, swap_approved | `current` is a no-op | nothing to repeat |
| leave.decided | `leaveDutyNotify` | deduped by audit under lock `hr-leave-hint:<id>` |
| ot.decided | `notifyOtDecided` | deduped by audit under lock |
| offboarded | `onOffboarded` kanban bridge | `sourceKey` dedupe, still inside `compose` (its own failures stay WARN) |
| payroll.paid | `crmFirst` bridge `onPayrollPaid` reruns first | X4: status guard + row lock + partial unique; it was already the retryable first step |
| all 7 | automation | v1 key = OutboxEvent.id under advisory lock (engine.ts:63-82) |
| all 7 | journeys / webhooks | eventKey / "once per event" (outbox-consumers.ts:268) |

On the HR side:
- The plan is one tx with `ON CONFLICT DO NOTHING`, so a retry after a rolled-back plan inserts exactly once (F3.6).
- A retry after a committed plan returns no ids. Its PENDING rows are picked up by the job after the 60 s grace.

Conclusion: **retrying the whole handler is acceptable; a separate HR-only retry is not needed.** Residual risk (mi-2): a planner that fails deterministically turns the event into retry-until-dead, which keeps re-running these idempotent steps and producing ERROR logs.

## Findings (MINOR / NOTE)
- **mi-1 Leases use the run's start time, not the wall clock.**
  - Both `claimLineNotices` and `renewLineClaim` compute `leaseOf(now)` from the run's `now`/`at`. That is set once at the start of `sendHrLineNotices` (hr-line.ts:199) or `runHrLineJobs` (`at`).
  - A consumer sending a 1000-employee roster inline runs 50 batches over several minutes. Later batches and renewals then get a lease already in the past, so the `hr.line` job can reclaim and push in parallel.
  - Delivery stays exactly once (same retry key ⇒ LINE 409 ⇒ ok, and finish is ticket-guarded), but this costs duplicate API calls and makes the lease meaningless for long runs.
  - Fix: base leases on `new Date()` (keep `now` for business rules). Optionally send only the first batch inline and leave the rest to the job, which also bounds outbox handler time (r1 mi-1 is still half-open).
- **mi-2 The planner can time out.** `planHrNotices` is one 30 s tx for up to 1000 roster recipients (2 statements each). Under load a timeout repeats on every retry, so the event goes dead and the in-app notices are lost. Fix: plan in chunks of about 200 per tx; `ON CONFLICT` makes chunking safe.
- **mi-3 The account-change path can race a link completion.** `endLineLinksForAccountInTx` takes no `hrline:<sys>:<emp>` lock, so it can race a concurrent `completeLineLink` (READ COMMITTED: revoke's ACTIVE update misses a row turning ACTIVE). The result is a stale ACTIVE link with `linkedUserId` cleared. The D2 use-time checks end it at the next use, so impact is nil apart from the audit timing. Optionally take the employee lock(s) first.
- **mi-4 Read paths write.** `validActive` ends links from read paths: the admin chip render, `myLineStatus` on page render, and the `hr.menu` postback. The writes are correct and audited (SYSTEM), but they happen on GET/RSC. Acceptable; documenting it is enough.
- **n-1** `onHrLinked`/`completeLineLink` do not check tenant ACTIVE, so linking is possible while the tenant is suspended. Nothing is sent or answered afterwards, and issuing a code needs a login.
- **n-2** staff/service.ts now imports the whole HR facade for one function. There is no cycle (hr imports no `@/lib/staff`), but load weight goes up. Fine under F2.

## Oracle edits — legitimate, not weakening
- **S1.2:** the pin is extended by exactly `employee`.
- **S3.3/S8.4:** the name is asserted through the glue. HR DTO keys lose `displayName`, and the forged-id equality is now checked on both readers (stricter than before).
- **S3.7:** a positive control was added, which strengthens it.
- **F1.1–F3.7:** they map 1:1 to rulings A–J and hunter F1–F4. They were RED on the pre-fix code (hr-H4.5-fix-red.txt) and are green now.
- **qc-hr-h4.2 S1.6 (qc-hr-h4.2-lib.mts:122-130):** the `laterOk` relaxation applies only when `IN_BASE`, i.e. H4.2 is merged. Without it, S1.6 would be permanently red for every later ticket. The `hr` frozen-file check stays strict.
  - Looseness, NOTE only: a hunk passes if ANY of its added lines carries any non-4.2 mark (an old "HR H0.6" would also pass), and new files under core/prisma pass unmarked.
  - Acceptable for a regression oracle. Tighten later to "every added line-run marked" if wanted.
