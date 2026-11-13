# HR-SET-1 — independent review (read-only)

Tree /root/projects/shark-hr-b · wip/hr-set-1 @ 7c4cbd63d · base 13c9eae57 · reviewer 13 Nov
Scope read: hr-SET-1.md · `git diff 13c9eae57 7c4cbd63d -- src` · qc-hr-set-1.mts · the ORACLE-EDIT hunks in h3.2 / h3.4-lib / h3.6 / h3.9 ·
whole-src grep for AppSystem writers · `wip/hr-h3.7` (lane 3) diff vs base · session/hr b357957e7.
Nothing was run (no typecheck, build or DB suite).

## Verdict: MERGE WITH NOTES
The fix is correct and complete for hr/** at this base. Every HR settings writer now takes the same lock order and does a key-level write on a value it re-read under the row lock.
The oracle's S2 checks are deterministic: they detect blocking with `pg_blocking_pids`, not sleeps. They fail on the real bug and pass on the fix.
Two things need a controller ruling: the merge order with H3.7 (F1) and which S1.10 version to keep (F2).

## 1. Completeness: every AppSystem.settings writer in src/
Grep: `appSystem.(update|updateMany|upsert)`, raw `UPDATE "AppSystem"`, `jsonb_set`, `$executeRawUnsafe`, and HR key names (hrOt/hrReports/hrLifecycle/hrPayroll/hrWork/hrClock/hrAttendance*) outside hr/**.
| writer | status |
|---|---|
| hr/ot.ts saveOtPolicy :178/:183 | helper (+hr:otpolicy) · key-level |
| hr/lifecycle.ts saveLifecyclePolicy :272/:276 | helper (+hr:lifepolicy) · key-level |
| hr/clock-settings.ts saveClockPolicy :248/:253 · saveAttendancePolicy :321/:334 | helper · key-level |
| hr/judge.ts saveCursor :700/:702 | helper · key-level (null/"" ⇒ delete, as before) |
| hr/work-entries.ts setNormalMinutesPerDay :115/:119 | helper · key-level |
| hr/payroll.ts setPayrollEngine :2294/:2310 | helper · key-level |
| hr/attendance-pay.ts saveAttendancePayPolicy :138/:144 | helper (+policyLockKey X) · key-level (2 keys) |
| hr/reports.ts setReportSettings :727/:731 | helper · key-level |
| hr/settings-lock.ts :35 | the single raw writer (read-modify-write under the row lock) |
| other hr/** | none (only findFirst/findMany reads) |
Outside hr/**, none of these can reach an HR row in production flows:
- Whole-object stale writers, all without row locks: point/service.ts:555 setPointExtras, member/privacy.ts:1705, member/notifications.ts:188, member/reports.ts:791/:849, kanban/integrations.ts:269.
  None has `type` in its own WHERE, but each caller gates on type: point/points-actions.ts:51, member/privacy-actions.ts:50, notifications-actions.ts:51 and reports-actions.ts:29 all require `type:"MEMBER"`; the member API key is bound to MEMBER (api/config.ts:15); kanban loads with `type:"KANBAN"` (:248); member/reports.ts:849 is the cron over `type:"MEMBER"` rows.
  Defence-in-depth hole only (one helper lacks the type filter): NOTE N1.
- pos/payment-settings.ts:171/:248 locks `type='POS'` FOR UPDATE. Raw jsonb_set writers in crm/* and pos/* all have `"type"='CRM'|'POS'` in WHERE.
  pos/chat-link.ts:87 and member/reviews.ts:164 lack a type filter but are single-key jsonb_set statements, so even on a wrong id they cannot write back stale HR keys.
- actions/systems.ts:128 only sets `active:false` (a column, not settings). system/service.ts:37/:94 only create new rows. No AI tool or seed path in src/ writes HR keys.
- **Not in this branch, but coming:** `wip/hr-h3.7` adds a new HR writer, `h37WritePaySetting` (payroll.ts ~3512 on that branch).
  It uses the old pattern: hr:clockpolicy → findFirst without the row lock → whole-object `updateMany`. See F1.

## 2. Lock helper correctness
- **Order:** advisory hr:clockpolicy → caller keys in order → `SELECT … FOR UPDATE` on (id, tenantId, type HR) → re-read. Every writer is the first statement of its own top-level `$transaction`, so none holds another lock before the helper.
  Advisory xact locks are re-entrant in one backend, so callers that already hold hr:clockpolicy would not deadlock (none do any more: S1.4 static).
  Nobody holds hr:otpolicy, hr:lifepolicy or hr:attpay:policy(X) and then waits for hr:clockpolicy.
  Sync takes attpay:policy(S) holding only period locks. It never waits on clockpolicy or the row, and no HR/payroll table has an FK to AppSystem (checked prisma/schema), so it takes no KEY SHARE on the row. I found no cycle.
- **Same connection:** `tenantDb()` is `prisma.$extends`, and `$transaction(async t => …)` passes the interactive-tx client. The helper only uses that `tx`, so no lock is taken on another connection.
- **Read-after-lock:** each patch is built from `lockHrSettings`' read, which runs after both locks. `writeHrSettingsKeys` re-reads under the row lock again, so other keys are always the latest committed values.
  The write is a JS read-modify-write, not a DB-side jsonb merge. It is still atomic because every writer of an HR row holds that row lock.
- **NULL / non-object settings:** `objOf` → `{}` plus the patch keys. A non-object value (array/scalar) is replaced, the same as on base.
- **Long holds:** the judge holds the row only inside saveCursor's own short tx; page transactions take no settings lock. setPayrollEngine holds the row during one HrPayrollRun probe and loadLawSet (reads only, short).
  The attendance-pay saver holds hr:clockpolicy while it waits for a long sync's S lock. That was already true on base, but now OT and lifecycle saves also queue behind it (N3).

## 3. Behaviour changes
None found in validation, refusal texts, return values, audit rows or events (all 8 entry points keep `count===1` semantics; S4.1–S4.3 pin them).
Small differences:
- judge saveCursor and lifecycle now also filter `type:"HR"` (judge did not before). This only matters for impossible non-HR ids.
- OT and lifecycle saves now serialise with the other HR settings writers (intended).
- `FOR UPDATE` (not NO KEY) now also blocks FK KEY SHARE on the HR row during a save, e.g. an AppSystemUnit insert from linkUnitAction. Brief wait, no cycle (N2).

## 4. Oracle
- **S2.x A/B/C** (`round()`): the raw tx holds the lock and reads the stale value. The writer must show up in `pg_blocking_pids(raw pid)` and still be pending 400 ms later; then the raw tx writes stale + marker.
  - A fails on base for OT/lifecycle: they did not take clockpolicy, so nothing blocks.
  - B fails on base for every writer that read without the row lock: updateMany blocks, then re-applies its pre-lock object, so the marker is lost.
  - The fix passes both, because it blocks before reading. The 400 ms only proves the writer is still blocked; it does not decide the result.
  - S2.8 (reports) is a correct GREEN control.
  - The oracle requires this exact lock scheme: a lock-free single-statement jsonb_set would pass B but fail A. That is acceptable, because the ticket defines one lock order.
- **S3.x** (×10 concurrent): on base these are probabilistic (3/10 for S3.1). Their real job is no-deadlock/no-TIMEOUT on the fix; the deterministic S2 checks carry the RED proof. Fine.
- **Statics:** S1.2 scanner, S1.3 per-fn, S1.4 "locks only in helper", S1.5 marked hunks. Reasonable. Gap: they do not check that `writeHrSettingsKeys` is called after `lockHrSettings` (m2).
- **ORACLE-EDITs 1–4:**
  - #1 (h3.2): HR H3.2-marked hunks are still rejected; unmarked hunks still fail.
  - #2 (h3.6): accepts HR-SET hunks only via `laterMarked`, which requires IN_BASE.
  - #3 (h3.4-lib): only when payroll-run-rules.ts is in the base; it needs a marked *added* line per hunk and excludes H3.4. Strict.
  - #4 (h3.9 S1.5): only for .ts/.mts/.tsx when IN_BASE; an added-line marker is needed per hunk. Unlike #1/#3 it does not exclude its own ticket ("HR H3.9" passes) (m3).
  - None makes a check permanently n/a; unmarked hunks still fail everywhere.
- **ORACLE-EDIT #5 (h3.9 S1.10) vs controller b357957e7:**
  - They edit the same `ck("S1.10", …)` line, so the merge will **conflict textually**.
  - The controller's version makes all three sub-checks `IN_BASE || …`, i.e. S1.10 becomes permanently n/a once H3.9 is in the base.
  - The builder's version is **stricter**: in the base it still requires every hunk in coreScope/env/hrSchema/visual to carry a ticket marker; only the hub/json presence checks become n/a.
  - Weakness of the builder's version: `anyMarked` looks at added+removed lines, so a hunk that only deletes or rewrites a marked line passes (m4).

## Findings
- **F1 MAJOR (merge coordination, not a defect of this branch):** wip/hr-h3.7 `h37WritePaySetting` is a new whole-object settings writer that does not use the helper.
  It is serialised with HR writers through hr:clockpolicy, so there is no lost update against today's writers, but it will turn qc-hr-set-1 S1.2/S1.3-style/S1.4 RED once both are merged.
  Interleaving if someone adds a row-lock-only writer later: H3.7 reads hrPayroll without the row lock, that writer commits key X, then H3.7 writes `{...stale}` and X is lost.
  Ruling needed: whichever of H3.7 and SET-1 merges second must route `h37WritePaySetting` through `lockHrSettings` + `writeHrSettingsKeys({hrPayroll: …})`, and qc-hr-set-1 must be in the H3.7 merge gate.
- **F2 MINOR (ruling):** the ORACLE-EDIT #5 / b357957e7 conflict. Recommend keeping the builder's stricter version and tightening `anyMarked` to `h.added` only (m4).
- **m2 MINOR:** `writeHrSettingsKeys` can be called without `lockHrSettings`, which skips hr:clockpolicy.
  If a future caller writes first and then calls lockHrSettings: it holds the row and waits for clockpolicy, while another writer holds clockpolicy and waits for the row ⇒ deadlock.
  Suggestion: S1.3 should check the order (lock index < write index), or the writer should take clockpolicy itself.
- **m3 MINOR:** h3.9 S1.5 `laterOnly` accepts hunks marked "HR H3.9" / "ORACLE-EDIT … H3.9" after merge, unlike #1 (h3.2) and #3 (h3.4), which exclude their own ticket.
- **m4 MINOR:** h3.9 S1.10 `anyMarked` uses added∪removed lines, so removing a marked line counts as marked (h3.2 S1.8 has the same pre-existing pattern).
- **N1 NOTE:** non-HR whole-object writers (point/service.ts:555, member/privacy.ts:1705, member/notifications.ts:188/findUnique by id only, member/reports.ts:791) have no `type` in their own WHERE.
  They are safe today only because every caller gates on MEMBER. A follow-up hardening ticket outside HR would be worthwhile.
- **N2 NOTE:** `FOR UPDATE` instead of `FOR NO KEY UPDATE` blocks FK KEY SHARE (AppSystemUnit link) during a save. Harmless; it matches what reports.ts already did.
- **N3 NOTE:** a long attendance-pay sync holding attpay:policy(S) makes the saver hold hr:clockpolicy while it waits.
  Every HR settings save and judge saveCursor (maxWait 15 s / timeout 30 s) queue behind it and may time out. That was already true on base for clock/reports/work/engine/judge; OT and lifecycle are new to that queue.
- **N4 NOTE:** work-entries.ts:73 `const lock` is now unused (lint warning only). The second FOR UPDATE + findFirst in writeHrSettingsKeys is redundant but harmless.
