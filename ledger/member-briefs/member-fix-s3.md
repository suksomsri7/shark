# S3 — notifications & journeys
Read `member-fix-COMMON.md` first, then the matching rows in `ledger/AUDIT-2026-09-16-MEMBER.md`.

## Files this batch OWNS
`src/lib/modules/member/notifications.ts` · `notifications-actions.ts` · `notifications-shared.ts` · `src/lib/member-journey-senders.ts` · `src/lib/modules/member/journeys.ts` · `journeys-shared.ts`
Read-only: `src/lib/outbox-consumers.ts` (owned by S2 — if `notifyMember` there must pass `refId: evt.id`, report the exact one-line change needed; do not edit), `privacy.ts`.

## Findings → acceptance criteria
- **H6** member notifications are deduplicated WITHOUT a migration: when `refId` is given, `send` takes `pg_advisory_xact_lock(hash(systemId,customerId,event,channel,refId))` and skips (returns the existing row) if a non-SKIPPED row with the same (systemId, customerId, event, channel, refId) exists. When the caller gives no refId, derive one from the triggering outbox event id if available in the input. `runDue` claims each row atomically before sending (`updateMany where id & status "QUEUED"` → `"SENDING"`, count===1) and recovers rows stuck in SENDING > 15 min back to QUEUED. Two overlapping `runDue` calls ⇒ each queued row sent exactly once; digest row created once.
- **H7** `runDue` re-checks consent per (customerId, channel) at send time with the same rules as `send` (`respectConsent` / `transactionalOverride`); withdrawn ⇒ row becomes `SKIPPED` with a Thai reason, nothing is sent.
- **L14** `nextDigestTime`: an event at exactly the digest hour but before the digest minute still goes into TODAY's digest (only push to tomorrow when today's run time has passed).
- **L11** no `export type` in `"use server"` file `notifications-actions.ts` — move types to `notifications-shared.ts` and fix imports (imports in files you do not own: report them; type-only re-exports are erased, so prefer leaving other files untouched by re-exporting from shared).
- **M7** journey WAIT rows: claiming must be a lease, not a terminal mark. Claim by pushing `scheduledAt` forward 15 min (conditional `updateMany` on the old `scheduledAt`), keep `finishedAt` null until `finishWait` really finishes; a crashed run is picked up again after the lease. Existing stuck rows (`status WAITING` + `finishedAt` set + no later step) are recovered by the same cron pass.
- **M8** triggers `member.merged` and `point.transferred`: `resolveCustomerId` understands `keepId` (merged → the kept member) and `fromCustomerId` (transfer → the sender; document the choice) so those journeys actually run; when a journey event has no resolvable member, write a visible SKIPPED `AutomationRun` with a Thai reason instead of returning silently.
