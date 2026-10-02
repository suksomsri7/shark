# crm-C5.5-fix15 — independent review

Tree `/root/projects/shark-crm-c54d` · branch `wip/crm-cf20` · builder tip 56b0a278 (one commit on bd435157) · reviewed 2026-10-02 20:30–21:05 UTC.
QC3 by default · never QC1 / :3215 · every heavy job via `iso.sh` + `with-gate-lock.sh`, one at a time. No src or builder files edited.
Reviewer probes: `scripts/pending/cf20/review/probe-cf20-rv-drain.mts` (unit, no DB: fake clock, Next's real `AfterContext` in K17, and the
bd435157 module loaded from git for old-vs-new numbers) and `scripts/pending/cf20/review/probe-cf20-rv.mts` (QC3: the real
`createContactAction` under Next's REAL `AfterContext`, own tenant `qc-cf20rv-*`, outbox guard, CLEAN). Their logs are committed next to them.

## VERDICT: MERGEABLE

No BLOCKER or HIGH findings. Nothing must be fixed before merge. The after-drain change is strictly better than bd435157 in every interleaving I
could build. Where it is not better, it is equal: a hung drain (RV15-2) and backlog throughput (RV15-4). The open items are follow-ups and
owner questions.

## after-drain.ts — what I checked and how

| attack | result | evidence |
|---|---|---|
| "started after the wake" ordering | It uses a shared monotonic sequence number (`++st.seq` for both wakes and drain starts), not the clock, so same-millisecond ties are safe. A wake after the running drain's read, in the same ms, gets a later drain both out of request and in request. In request, B's task does not resolve with A's held drain. | K1.1, K1.2 |
| wake after a drain started but before it read | Treated conservatively as "started before", so one queued re-run covers it. | K2 |
| `run()` rejects / throws synchronously | The task never rejects, nothing is left stuck, and the next wake drains. | K4, builder U5 |
| `run()` never settles (hung DB) | **No escape in either version.** bd435157: 61 after() tasks, 61 `run()` calls, 1 drain actually read, 61/61 promises unresolved. fix15: 61 tasks, 1 `run()` call, 1 read, 61/61 unresolved. The real `drainOutbox` serialises through its module-level `drainChain`, so the old 15 s flag was never an escape for a stuck *running* drain. It only covered a task that never started. → RV15-2 | K3 |
| task never starts (P2, Next's REAL AfterContext; the response closed before the action registered) | `after()` does not throw, and Next never runs the task. Rows were DONE in 3.3 s via the fallback, and one warning line was logged. | R2, R5.1 |
| slow response (close at +6 s) | Rows were DONE at 3.3 s (before close). The late task adds no drain and its promise settles. | R3 |
| exactly-once start (task at 2.9 / 3.0 / 3.5 s vs timer at 3.0 s) | 1 drain each time, and the task's promise settles after that drain. | K6 |
| timer leak, 600 wakes / 60 s | normal close: 600 timers created, max 1 live, 0 left. Slow close or never: 20 created, max 1 live, 0 left. → bounded | K5 |
| sustained load, 1 write+wake / 100 ms for 60 s | close 50 ms / drain 30 ms: old 600 drains = new 600. Drain 300 ms: old 600 chained `run()`s (only 267 executed by +80 s, so every request's waitUntil sits behind the chain); new 201. Close 500 ms: 120 = 120. Never starts: old 0 drains and 600 rows lost until a later wake or cron; new 20 drains, all rows drained. So fix15 never registers more `after()` tasks or runs more drains than bd435157. | K7 |
| attacker amplification (public `/t/o`, `/u` after fix13 wake only on real writes) | At most one drain per registration in both versions. The fallback adds none per registration (it replaces the task's start). In the worst pattern (tasks never start), registrations go from 1 per 15 s to 1 per 3 s per instance. That is ≤ 20 empty-queue drains per minute, each ≈ 1 `findMany` (`drainUntilQuiet` stops on `picked === 0`). Not exploitable. | K7 + code |
| N9 | Normal path: the task returns a promise that is pending while the drain runs (K13.1, and R1 with the real AfterContext: waitUntil 1/1 settled after DONE). Slow path: the late task returns the fallback drain's promise (K13.2). Never path: nothing awaits it → RV15-1. | K13, R1 |
| two module instances (duplicated bundles) | They share one state (a byte copy loaded as a second instance: one queued re-run, every row drained). | K9 |
| old state shape after hot reload (number in PENDING_KEY) | Ignored correctly: one task, drained. | K10 |
| wall clock jumps back 1 h | Harmless: the monotonic timer still drains in ≤ 3.5 s. On bd435157 the same jump would swallow every wake for an hour (by reasoning). | K11 |
| warning throttle | 1 line in the first minute (12 fallbacks), then a 2nd line after 60 s. In-process with the real action: 2 fallbacks in < 1 min → 1 line. | K12, R5.2 |
| out of request (scripts · cron process · tests) | Drain requested synchronously, **no timer created**, wakes during it share one queued re-run. Old: 4 wakes → 4 chained drains; new → 2. Every row is drained. An unref'd timer does not hold a script open (end→exit 2 ms). | K14, K0 |
| re-entrant wakes from inside a drain (consumer → chat `sendReply` → `scheduleDrain`) | They terminate (3 `run()` calls for 3 nested wakes), and every row is drained. | K16 |
| registration while Next's after-queue is already running (nested after) | Next runs the callback **synchronously inside `after()`**, so the drain starts before `reg.timer` is armed. A stray timer then lives 3 s, returns early, and causes no drain and no warning. → RV15-5 | K17 |
| 8 concurrent real create requests | 16/16 rows DONE in ≈ 1 s with 5 candidate reads in total. | R4 |
| callers | `scheduleCoalescedDrain` has exactly 2 importers: `outbox-consumers.ts scheduleDrain` and `crm/outbox-wake.ts wakeOutbox`. No src reads the state keys, and nothing relied on the 15 s window. Only probes touch PENDING_KEY (they reset it; still fine). | grep |
| wake reached before a redirect? | `createContactAction` (contacts-actions.ts:83) calls `revalidateAndWake` before `return`, with no `redirect()`. In every file that both wakes and redirects, only `portal.ts` does both, and there the redirect (l.428) is in a different function from the wake (l.550). So the registration happens, and on a live process the fallback fires whatever stops Next from starting the task. | code |

**Is the fix sufficient without knowing the root cause?** Yes, for a persistent process such as the QC `next start` server, and for any
platform that keeps the instance running. The run5 symptom needs the wake to be called; I verified that it is (above). It also needs
`after()` not to throw: if it threw, both versions would drain immediately, and run5 would not have seen PENDING rows. Given both, the timer
fires 3 s later regardless of why Next did not run the task (R2 proves this with Next's real class). The only residual is a platform that
freezes or kills the instance before the timer fires (RV15-1).

Side observation (not verified on the server): Next calls `waitUntil(runCallbacksOnClosePromise)` on the FIRST `after()` of a scope (R2
info). In the P2 case that promise never settles. If the platform accepts it, the invocation is held alive until its max duration, which would
keep the fallback timer alive too, but at a cost. This is pre-existing and independent of fix15.

## Findings

### RV15-1 · MED · follow-up / owner question — the fallback drain is not handed to waitUntil
- In the never-start path, nothing awaits the drain the timer starts (K13 info).
- In Vercel/Fluid terms: a frozen instance resumes it at the next thaw. A killed instance leaves the rows it already claimed leased for
  `LEASE_MS` = 6 min (core/outbox.ts:20), after which another drain or the hourly cron takes them.
- bd435157 in the same situation drained nothing at all for ≥ 15 s (or up to an hour), so this is not a regression. It is a gap in the new
  safety net.
- Cheap mitigation: inside the timer callback, call `after(reg.started)` in a try/catch. The callback runs in the registering request's
  async context, and Next's promise form of `after()` goes straight to `waitUntil` without waiting for 'close' (after-context.js `after()`
  thenable branch).
- Not needed for merge: on the QC server (persistent process) the timer always fires.

### RV15-2 · LOW (pre-existing) · follow-up — no drain timeout: a hung drain stops every drain of the instance
- K3 shows both versions behave the same: one `run()` that never settles keeps `drainChain` (bd435157 and fix15) and `st.running` (fix15)
  occupied. Every later `after()` promise in that instance stays pending until the platform kills the invocation.
- The old 15 s window never covered this case.
- Suggest a follow-up card: a wall-clock cap per drain in `drainOutbox`, e.g. race the chain link against N × TIME_BUDGET, and release
  `st.running` when it fires.
- Also INFO: `drainChain` is per module instance while after-drain's state is global. If bundles were really duplicated, one hung drain
  would now also block the other copy's wakes. K9 shows the state is shared; I have no evidence that Next duplicates this module.

### RV15-3 · LOW · follow-up — a fallback drain on a slow response runs inside the still-open request
- When a response streams for more than 3 s, the timer starts the drain inside the registering request's async context. The request's
  work-unit phase is then still `action` or `render`, not `after`.
- Consumers that call request-scoped APIs behave differently there:
  - `revalidatePath` throws during render.
  - `after()` registers on the still-open request, which is fine.
- I found no consumer path that calls `revalidatePath`, `cookies` or `headers`: `revalidatePath` appears only in `*actions.ts` files.
- The drain's DB work also overlaps the request's own queries (pg pool default 10, `core/db.ts` PrismaPg).
- No action needed now. Worth one line in the header so a future consumer author knows.

### RV15-4 · LOW / INFO · behaviour change to know — less backlog work per burst
- Old: N registrations in a burst gave N chained `drainUntilQuiet` runs, each up to 500 rows / 20 s.
- New: a wake joins a running drain that started after it, or one queued re-run. Once wakes stop, at most 2 drains remain.
- With a backlog above about 1,000 PENDING rows (big import, consumer outage), the rest now waits for the next wake or the hourly cron instead
  of the remaining chained drains.
- This is the intended trade-off of R2-N6/S3, and the old chain also held every request's waitUntil (K7: 600 queued 300 ms drains). It is not
  a correctness issue: I1 promises a drain that *starts* after the wake, not one that reaches the row.
- Worth adding to the prod watch list (stale count from `outboxHealth`).

### RV15-5 · LOW · follow-up (one-liner) — stray timer when Next runs the after() callback synchronously
- `scheduleCoalescedDrain` arms `reg.timer` after `after()` returns.
- When the scope's after-queue is already running (a wake from inside an after() task), Next's p-queue runs the callback synchronously. The
  drain has then already started, so the timer that follows is never cleared. It fires 3 s later, returns early (`reg.started`), and causes
  no drain and no warning (K17).
- Harmless, but header invariant I6 ("a normal request leaves nothing behind") is not exactly true.
- Fix: `if (!reg.started) { reg.timer = setTimeout(…) }`.

### RV15-6 · LOW · follow-up (copy) — bulk-move text contradicts itself when nothing moved but some failed
- DealTable: when `done === 0 && same && failed > 0` the text is "ไม่มีดีลที่ต้องย้าย — อยู่ในขั้นนี้อยู่แล้ว N ดีล · ไม่สำเร็จ M ดีล". The failed
  deals did need moving.
- This case is reachable: my M.3 used a batch of [already there + deal the staff member cannot see], which gave ok 0 · unchanged 1 · failed 1.
- Suggest using the "ไม่มีดีลที่ต้องย้าย" wording only when `failed === 0`, and otherwise the normal "ย้ายขั้นสำเร็จ 0 ดีล · อยู่ในขั้นนี้อยู่แล้ว
  N ดีล · ไม่สำเร็จ M ดีล".
- The `ok:false` colour and `role` stay correct.

### RV15-7 · INFO — smaller notes
- `canUseUnmatchedInbox`'s doc says it does not throw, but `resolveVisibility` can throw on a DB error, and the thread page then fails
  instead of hiding the block. This is the same as any other read on that page.
- `bulkMoveAction` still calls `touch()` (`revalidateAndWake`) on a pure no-op: one harmless empty drain.
- `CrmFilesBlock` now renders "เปิดดูไม่ได้แล้ว (เก็บถาวรหรือถูกลบ)" for any NOT_FOUND from `listFiles`, including a parent the viewer
  cannot see. That is not reachable from the pages: the record and 360 pages call `notFound()` first (record page l.36–48). Before, the
  same case raised the RSC error; it is no more revealing now. FORBIDDEN (no read key) still throws as before.

## Items 2–5 (checked)
- **P-it6-1**: G matrix. Viewers: OWNER, MANAGER `*`, MANAGER unit-scoped, STAFF `*` with `crm.*`. Threads: matched, unmatched with a company,
  unmatched without a company.
  - The page's `canAttach` was consistent with the service in all 12 cells. The service result came from a non-mutating `attachToContact`
    with a non-existent contact: NOT_FOUND = gate passed, FORBIDDEN = refused.
  - The block is never shown to a refused viewer (mgrunit × unmatched-co: hidden, FORBIDDEN).
  - It is never hidden from an allowed one (owner and mgrall × both unmatched kinds: shown, NOT_FOUND = would proceed to the contact check).
  - Matched threads never show it.
  - Pages the viewer cannot open return 404 before the block (staff in every cell; mgrunit × unmatched-noco).
  - Refactor: the gate decisions and both messages are unchanged.
- **RVR-5 / O-it6-a**: mixed batch by STAFF [moves · already in target · deal the staff member cannot see] gave ok 1 · unchanged 1 · failed 1.
  - One audit row carries ok / unchanged / failed.
  - The unchanged deal has no stage-history row, no outbox event and no activity (moveCore returns `changed:false` before any write and
    every post-tx effect is gated on `out.changed`), so no automation is triggered.
  - [unchanged + refused] still writes an audit row: a failure is not a pure no-op.
  - Builder M.4 covers the pure no-op (0 rows).
  - The only caller of `bulkMove` is `bulkMoveAction`. `BulkResult.unchanged` is optional, and the other bulk results and texts are
    unchanged.
- **O-it6-d**: matched by `name === "ActivitiesError" && code === "NOT_FOUND"`. Other errors still throw. Builder F.1/F.2 are green.
- **RVR-6 / O-it6-b**: the delete passes "ลบปลายทางแล้ว" and the toggle keeps "บันทึกแล้ว". `role={ok ? "status" : "alert"}` is on the three
  messages (source read + builder B/D).

## Allowed surface
The src diff touches:
- `core/after-drain.ts`
- `CrmFilesBlock.tsx`
- the e-mail thread page (+ the `canUseUnmatchedInbox` export in `emails.ts`)
- `deals.ts` `bulkMove`/`BulkResult`, `deals-actions.ts bulkMoveAction`, and the `DealTable` text
- `CrmApiSettings` (delete text + role), `EmailThread` (role), `CrmScoringManager` (role)

That is exactly the allowed surface. **No new interactive control is added.**
- The only new testid is the static `crm-files-unavailable` card.
- `crm-email-attach-contact-q/-go/-pick` only become hidden for refused viewers, which is the it6 runner copy's expectation.

So **no second full button-inventory pass is needed**. A targeted re-run of the five touched pages is enough (/contacts/new, /emails/[threadKey],
/deals bulk move, /settings/scoring, /settings/api webhooks, object record page), and it is already on the it6 partial re-run list.

## PROD-RISK (after-drain.ts — every module's outbox)
**What changes in prod:**
- Drains per instance go down under bursts (≤ 1 running + 1 queued). waitUntil no longer queues behind a chain of whole-queue drains, so
  function duration should drop or stay the same.
- A registration whose task has not started 3 s after registering is drained from a timer. A slow streaming response gets its drain
  earlier; a task that never starts gets drained instead of waiting for a later wake or the hourly cron.

**Watch after deploy (first 24 h):**
- The rate of `[after-drain] fallback drain` warnings: ≤ 1/min/instance by design.
  - Occasional: expected.
  - On most instances most minutes: `after()` tasks routinely start more than 3 s late. Tune FALLBACK_MS or investigate; this is not a
    rollback by itself.
- Vercel function duration p95/p99 and DB connection count / pool timeouts: should not rise.
- `outboxHealth` (daily cron: stale = PENDING > 15 min) and the age of the oldest PENDING row should fall versus the pre-deploy baseline.

**Rollback trigger:** any of:
- PENDING rows older than ~5 min during business hours that are not in backoff (attempts 0), or `outboxHealth.stale > 0` on two runs where it
  was 0 before;
- function duration p95 more than 2× baseline, or a rise in DB pool or connection errors;
- any error stack from `after-drain.ts`.

Rollback = restore `src/lib/core/after-drain.ts` from bd435157. It is one file, with no schema change and no data change.

## Builder's owner questions — reviewer opinion
1. Yes: rely on the fallback plus its warning. It does not depend on the cause (R2 with Next's real class). Do read the warning count from the
   next QC-server log (it is the root-cause evidence). Consider RV15-1 (`after(promise)` in the timer) before or soon after the prod deploy.
2. Keep 3 s. Shorter only adds early drains on long responses; longer re-opens the blackout. K7 shows the cost even when every task fails to
   start: 20 empty drains per minute per instance.
3. Showing "not available" is acceptable now. A read-only list would be better UX, since the archived record page is still browsable with a
   banner. This is a service change; owner's call.
4. Yes, switch the inbox page's unmatched-tab decision to `canUseUnmatchedInbox`. Today any error from `listThreads` (a DB blip) silently
   hides the tab. Small follow-up.
5. Add a confirm step for deleting a webhook endpoint. It is destructive and breaks an external integration silently. It adds registry
   controls, so put it in a UX batch.

## Runs (all mine, this review · logs `.qc-shots/cf20-review/{r1,r2,r3}/` gitignored · reviewer-probe logs committed)
| run | DB | result |
|---|---|---|
| typecheck (5120 MB) | — | exit 0 |
| fitness with QC3 env / without DATABASE_URL·DIRECT_URL | QC3 / none | 42/42 · 42/42 |
| **probe-cf20-rv-drain (reviewer, unit)** | none | **22/22** |
| **probe-cf20-rv (reviewer, real AfterContext + real action)** | QC3 | **13/13** incl. CLEAN (the first two runs failed on reviewer fixture mistakes: STATE reset between R2/R3, deals without a contact, a manager who could see the "hidden" deal. They were fixed in the probe and the product was not changed.) |
| probe-cf20-drain · probe-cf20 (builder) | none · QC3 | 11/11 + 6/6 · 7/7 + 12/12 |
| probe-c54d-r2 · probe-c54d-r3 (C5.4-D pins S3, N9a/b, R2N6, R2N8c) | QC3 | 13/13 · 19/19 |
| probe-cf18-outbox · probe-cf18 · probe-cf18-review | QC3 | 3/3 + 7/7 · 20/20 + 17/17 · controls 16/16 (findings 0/5 = fixed) |
| qc-crm-c2.5 · c1.4 · c1.5 · c3.4 | QC3 | 105/105 · 110/110 · 103/103 · 53/53 |
| qc-kanban-k1.7 · qc-forms-notify (non-CRM, scheduleDrain in-process) | QC3 | 21/21 · 9/9 |

## Not verified
- Behaviour on the real `next start` server and on Vercel. I used Next's real `AfterContext` with a fake response emitter, because :3215 and
  QC1 belong to the button runner. The real root cause of P-it6-2 is therefore still unproven.
- Vercel freeze/thaw of the fallback timer (RV15-1), and whether Vercel honours `waitUntil` of a scope that already closed.
- QC2-pinned suites (c2.2, c5.3) were not re-run by me; builder r2 reports them green. qc-booking-deposit and qc-pos-account were also not
  re-run (builder: identical RED on bd435157 for environmental reasons).
- No visual check of the files card or of the bulk-move message, and no button-runner rows.
