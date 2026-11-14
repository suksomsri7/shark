# CAL review A — independent review of CAL1.1 / CAL1.2 / CAL1.4 (server)

Reviewer: independent (read-only) · 14 Nov 2026 · tree `/root/projects/shark-sec-ui` @ `wip/sec-calendar` (34488e88f)
Commits reviewed: CAL1.1 368697f46 · CAL1.2 f6ac84c40 · CAL1.4 c878734e0
Oracle run: `qc-cal-1.4` 30/30 pass (QC DB). Repro for #1 is a pure tsx call of `next-fire.ts` (no DB).

Summary: 1 BLOCKER · 5 MAJOR · 8 MINOR. No M3 hole found in `items.ts` (every read/write is `userId: actor.userId` + `tenantId`, 404 for other rows, version-guarded). Migration is additive-only (new types/tables/indexes on empty tables): safe on a large prod DB. The only generic reader that walks all tenant models is `pdpa.exportTenantData`/`purgeTenantRows`; export excludes CalItem/CalPref, purge deletes them. `booking/privacy.ts` (dmmf scan) does not match any CalItem column. No other tenant-wide reader (backup/AI/audit/search) touches the calendar tables.

---

## BLOCKER

### B1. Anything more than ~70 days ahead never fires, and one-off reminders more than 70 days ahead are rejected as "past time"
- **Where:** `src/lib/modules/calendar/next-fire.ts:126-131` (`firstAfter`) with `occurrences` at `:83-123`
- **Cause:** `firstAfter(item, after)` only scans the window `[after+1, after+70d]`. `occurrences()` drops anything before `first` (= startAt), so when `startAt > now + 70d` the window is empty. `nextFire` then returns `null`.
- **What happens (checked with tsx, now = 2026-11-14T03:00Z, startAt = now+100d):**
  - `validateWhen(REMINDER, NONE)` returns **400 `past_time` "เวลานี้ผ่านไปแล้ว"**. The user cannot create "remind me on 20 Feb to renew the licence", even though the contract allows up to 2 years ahead (`AHEAD_MAX_MS`). At 69 days it passes.
  - `nextFire(DAILY/WEEKLY/MONTHLY, startAt +100d)` returns `null`. `createItem` saves `nextFireAt = null`. Nothing recomputes it later, so **the item never fires, with no error shown**.
  - An EVENT more than 70 days ahead has `schedule()` returning `nextFireAt: null`, so **the event reminder never fires**.
- **Fix:** in `firstAfter`, start the scan at `max(after + 1, dayStart(startAt))` and end it at that point + 70d. Add QC cases at startAt = now+71d, +1y and +2y for NONE, DAILY, WEEKLY, MONTHLY and EVENT.

## MAJOR

### M1. `updateItem` treats every PATCH from the app as a time change: editing a fired reminder fails, and editing inside the lead window fires the same occurrence twice
- **Where:** `src/lib/modules/calendar/items.ts:218` (`timeChanged = TIME_KEYS.some(k => patch[k] !== undefined)`), `:220`, `:231-235`. The client is `apps/mobile/src/components/calendar/AddCalSheet.tsx:153-168`, which always sends kind/startAt/repeat/leadMinutes/repeatDays.
- **Scenario A:** a one-off reminder for 09:00 fires and is waiting for its nag. At 09:10 the user fixes a typo in the title. The PATCH contains `startAt` (unchanged), so `check(merged, now)` returns **400 past_time**. The comment at `:219` says title-only edits must not hit past_time, but that only holds when the client omits the time keys, and the real client never does. Effectively a fired reminder cannot be edited at all.
- **Scenario B (duplicate push):** a NONE reminder at 09:00 with lead 15 fires at 08:45, so `firedOccAt = 09:00` and `nagAt = 09:15`. At 08:50 the user edits the note. `firedOccAt` and `nagAt` are reset, then `schedule()` gives `nextFire` o=09:00 > now, so `nextFireAt = now` and the **same occurrence fires again**, followed by another nag at 09:20. A repeating item has the same problem inside its lead window.
- **Fix:** decide `timeChanged` by comparing values (`+startAt`, `+endAt`, allDay, repeat, sorted repeatDays, leadMinutes, kind) with the stored row. If only lead or title changed and the occurrence is unchanged, keep `firedOccAt`.

### M2. A hung Expo request can stop `calendar.fire` for up to 15 minutes
- **Where:** `src/lib/core/push.ts:26-33` (`expoPost`: `fetch` with no timeout or signal), `src/lib/modules/calendar/fire.ts:105`, `jobs.ts:176-179` (`ctrl.signal` is not passed down), `src/lib/platform/minute-jobs.ts:982-1012` (on cut-off the job lease is kept until the job settles), `scripts/crm-cron.mts:125-138` (`process.exit` after waiting at most 75 s).
- **Scenario:** Expo accepts the TCP connection but stalls. Undici's default header/body timeouts are 300 s. The dispatcher cuts the job off at 5 s and keeps the `minute-job:lease:calendar.fire` lease. crm-cron waits 75 s and then calls `process.exit`. The lease is left until it expires after `MINUTE_JOB_LEASE_MS` = 15 min, so **no personal reminder fires for 15 minutes**. The outbox route is the same: Next kills the request at `maxDuration` 60.
  - Second effect: the exit can land after the row commit but before the send, so that reminder is lost (see m1).
- **Fix:** add `AbortSignal.timeout(~4s)` to `expoPost`, or accept a signal and pass `ctrl.signal` through `runCalendarFire` → `sendPushToUser`. Treat an abort as a transport error so the row is retried.

### M3. Throughput: about 10–20 rows per minute, 100 rows leased per run, and rows are served out of order under load
- **Where:** `fire.ts:19-20` (`LEASE_MS` 120 s, `CLAIM_MAX` 100), `:54` (claim), `:68-111` (sequential loop: per row `resolveLinks` makes several queries and dynamic imports, then `sendPushToUser` reads devices and makes one Expo HTTP call), `:70` (`break` on deadline without releasing the remaining leases).
- **Scenario:** 300 staff set "daily 08:00" (the morning brief at 08:00 adds load at the same time). Each run claims 100 rows and processes about 10–20 inside 5 s. The other ~80 stay leased (`leaseUntil` = now+120 s, and the check is strict `lt`, so they become eligible again only on the run 3 minutes later). Meanwhile the next run claims the *next* 100 rows by `nextFireAt`, so later reminders go out before earlier ones. The backlog grows to tens of minutes. The contract (§5.6) accepts "lease expires in 2 minutes" but not this scale.
- **Fix:** (a) on deadline `break`, release the leases of unprocessed rows (`updateMany where { leaseToken: token, id in remaining }`); (b) size the claim to the budget (e.g. 20), or (c) process with bounded concurrency (5–10) and batch Expo payloads across rows (100 per POST); (d) cache `systemsOf`/facade imports per run.

### M4. CRM link check has no module-permission gate, so on CRM v1 systems any staff member can link any contact or deal and read the full phone number
- **Where:** `src/lib/modules/calendar/links.ts:40-71`. Compare `src/lib/modules/crm/visibility.ts:405` (`if (!info.v2) return scope;` returns before `crmCan` at `:407`).
- **Scenario:** most shops are on `uiVersion: 1` (the default, `crm/settings` `CRM_SETTINGS_DEFAULTS.uiVersion = 1`). A STAFF member with **no CRM permission** creates an item with `link: {type: "CRM_CONTACT", id}`. `contactWhere` returns the whole system scope, so the link is accepted. `getItem` then returns `phone` (full number, `items.ts:317`), the label carries the contact name, and the push body carries the name and masked phone. Other callers of `contactWhere` (`ai/tools.ts:133`, `secretary/digest.ts:162`) sit behind the tool-access / CRM module gate. `links.ts` does not, unlike its own ACCOUNT branch at `:77`, which does check `membershipCan`.
  - The attacker needs a contact id (cuid), which can leak through deep links, chat or AI tool outputs. *Uncertain:* whether v1 CRM pages gate STAFF by role/permission; if v1 is meant to be "everyone sees everything", this drops to MINOR.
- **Fix:** before querying, require `membershipCan(who.membership, {module: "crm", action: "crm.contact.read" | "crm.deal.read"}, who.userId)`, or the same gate v1 pages use, for each system.

### M5. Suspending and then restoring a staff member silently kills all their reminders for that shop
- **Where:** `fire.ts:73-76` (no accepted membership: `nextFireAt = null` permanently), `src/lib/staff/service.ts:666` (`restoreStaffAccess` does not recompute calendar state). `suspendStaff` and web `revokeStaffAccessAction` both go through `revokeStaffAccess` and do not purge.
- **Scenario:** the owner suspends a staff member for a day (or by mistake). Every due item of theirs passes through the job, which writes `nextFireAt = null`. After the restore their recurring "daily 09:00" and future one-offs never fire again. Nothing tells them, and the app still shows the items as OPEN.
- **Fix:** in the no-member branch push `nextFireAt` out (e.g. recheck in 1 h, or `schedule(row, now)` limited to the next occurrence) instead of nulling it. Or recompute `nextFireAt` for (userId, tenantId) in `restoreStaffAccess`.

## MINOR

### m1. At-most-once: a crash or exit between commit and send loses the reminder
`fire.ts:90-105`. Commit-before-send is the contract's choice (§5.6.4), but the process exits with 75 s (M2), Next kills the outbox route at 60 s, and OOM is possible, so a fired row can end up committed with no push sent. Consider a tiny "sending" marker (e.g. keep `leaseToken` and set `lastFiredAt` before send, clear after) so a crashed row can be re-sent once. At minimum, document it as at-most-once.

### m2. HTTP-level Expo errors (429 / 4xx JSON) count as "sent" and are not retried
`push.ts:26-33` returns `[]` when `json.data` is missing, so every ticket goes to `failures`, giving `sent = 0` and `transportErrors = 0`. `fire.ts:106` then counts it as success. Rate-limit (`TOO_MANY_REQUESTS`) and server errors with a JSON body drop the reminder. Fix: have `expoPost` throw on `!res.ok`, or return a transport flag.

### m3. Lease not released when the version changed in the no-member and no-reason branches
`fire.ts:74` and `:81` update with `version: row.version`. If the user edited during the lease the update matches 0 rows and the lease is held for up to about 3 minutes, so a just-edited "in 2 min" reminder fires late. Fix: follow it with the same unconditional `{id, leaseToken}` release used at `:93`.

### m4. Web "revoke access" (the only removal on the web) leaves the ex-staff's CalItem/CalPref in the shop indefinitely
Contract §2.5/§2.6 says leaving the shop deletes them, but only the mobile `removeStaff` (`levels.ts:256-258`) purges. `staff/actions.ts:125` → `revokeStaffAccess` does not. The rows are invisible to the shop (export excludes them), so this is a retention/PDPA mismatch, not a leak. Decide whether revoke counts as leaving; if it does, purge, or add a retention sweep for rows with no membership older than N days.

### m5. Personal reminder text goes to devices whose session expired without logout
`push.ts sendPushToUser` sends to every `PushDevice` of the user with no tenant filter (R-CAL-12 by design). `PushDevice` is only removed on an explicit logout that sends `expoToken` (`mobile/auth.ts:49`) or when another account registers on the device. On a shared shop tablet where the session idled out, the next person sees the previous user's personal titles and notes (first line of `note` is the body, `push-msg.ts:174`) on the lock screen. This behaviour existed before, but the calendar is the first M4 "100 % personal" payload. Consider dropping devices whose last session for that user is revoked or expired, or omitting `note` from the body.

### m6. Snoozing a one-off reminder that has not fired yet does not postpone it, and adds an extra nag
`next-fire.ts:156-160` and `:197-220`. Example: a reminder for 15:00, snoozed at 10:00 "1h". The SNOOZE push goes out at 11:00 with nag at 11:30, then DUE still fires at 15:00 with another nag at 15:30. That is 4 pushes, and "nag once" is broken. *Uncertain about intent:* the contract only defines snooze after a fire. Either refuse a snooze when `firedOccAt ≠ occursAt` and the item is not overdue, or treat it as moving the fire to the snooze target (set `firedOccAt = occursAt`).

### m7. The sweep scans all DONE/CANCELLED rows every minute with no usable index
`fire.ts:149-163`. The `cancelledAt`/`doneAt < now−90d` predicates can only use the `status` prefix of `@@index([status, nextFireAt])`, so every closed row from the last 90 days is read every minute. Fine at launch, but it grows linearly. Fix: run the sweep hourly (e.g. only when `now.getUTCMinutes() === 7`), or add a partial index such as `(status, doneAt)` / `(status, cancelledAt)`.

### m8. `OPEN_LIMIT` check is count-then-create without a lock
`items.ts:168-172`. Parallel creates (double-tap, chat tool plus app) can exceed 500. Harmless soft cap; mention only.

---

### Checked and not defects
- M3 in `items.ts`: `own()` / `commit()` / `listItems` / `roomReminders` / `exportsKind` all filter `userId: actor.userId` and the actor's tenant (via `tenantDb`). `CalActor` comes from `gate(req, null)` (token + x-tenant-id only, `_cal.ts:13-18`). `cancel`/`done`/`snooze`/`reopen` are version-guarded (409 on race).
- Thai time: `bkkDayNo`/`dayStartMs` use a fixed +7 h with no DST; weekday mapping is correct (1970-01-01 was a Thursday); MONTHLY 29–31 clamps without drifting (QC F7-1 green).
- Concurrency between crm-cron and the outbox route: the job-level lease (`claimLease`, one SQL statement) already serialises `calendar.fire`. The row lease plus `leaseToken`+`version` commit is sound defence in depth; I found no double-send path apart from M1-B. Retry restore uses the pre-commit snapshot, so the attempts counter reaches 3 correctly.
- `push.ts` `categoryId` is additive (payload is byte-identical when absent). Old app builds ignore an unknown category on both iOS and Android, so it is backward compatible.
- Migration `20261228000300_calendar_a`: only CREATE TYPE/TABLE/INDEX on new empty tables plus one FK between new tables. No locks on existing tables. CalItem has no FK to User/Tenant, by design; deletion goes through `deleteUserTraces` / tenant purge / `removeStaff`.
- Indexes: the fire claim uses `(status, nextFireAt)`; the agenda and reminders tabs use `(userId, tenantId, status, occursAt)`; room cards use `(userId, roomId)`.
- `deleteUserTraces` runs inside `$transaction` and the CalLink → CalExternalEvent cascade works. Revoking the Google token is deferred to CAL1.8, as noted.
