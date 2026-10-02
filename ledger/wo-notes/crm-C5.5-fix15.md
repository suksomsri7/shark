# crm-C5.5-fix15 — run5 triage it6 product findings: P-it6-2 (MED) · P-it6-1 (LOW–MED) · O-it6-d · O-it6-a (=RVR-5) · O-it6-b · RVR-6

Tree `/root/projects/shark-crm-c54d` branch `wip/crm-cf20` from bd435157 (= session/crm tip, fix1–fix14 merged) · QC3 (QC2 only for the
QC2-pinned c2.2 / c5.3) · never QC1 / :3215 · 2026-10-02 (UTC, log end times: unit RED 19:46, unit GREEN 19:47, DB RED 19:51, DB GREEN 19:53, regression
started 19:55). No schema change, no migration, no docs regenerated (docs `--check` only).
Probes: `scripts/pending/cf20/probe-cf20-drain.mts` (unit, no DB, fake clock) · `scripts/pending/cf20/probe-cf20.mts` (QC3, own tenant
`qc-cf20-*`, outbox guard, CLEAN 0 rows). Logs next to them: `red-*.log` (bd435157 source) / `g-*.log` (fix). RED for probe-cf20 = the fix's
`after-drain.ts` saved, the bd435157 version checked out, probe run, fix copied back (`git diff --stat` checked after the copy-back); the other
four items were not yet edited at that time (their src was bd435157). Regression: `scripts/pending/cf20/run-regress.sh` → `.qc-shots/cf20/r1/`.

## RED → GREEN
| probe | on bd435157 | on the fix |
|---|---|---|
| probe-cf20-drain (unit) | controls 11/11 · **findings 0/6 (RED)** | controls 11/11 · **findings 6/6 GREEN** |
| probe-cf20 (QC3) | controls 7/7 · **findings 0/12 (RED)** | controls 7/7 · **findings 12/12 GREEN** |

(probe-cf20: after the controller's scope notes (RVR-5 audit, honest text, RVR-6, webhook role) the probe gained M.4/B.3/D.1 and the RED was
re-run with ALL ten touched src files checked out from bd435157 (diff saved, re-applied, md5 of every file verified) — `red-probe-cf20.log`
20:24 = 0/12; GREEN 20:27 = 12/12. An earlier RED attempt aborted block A on a fixture error (CrmEmailMessage.trackTokenHash is required). probe-cf20-drain: U8 was labelled "control" in a first RED run and re-labelled FINDING — see U8 below
— and the RED re-run; the log kept is the second one.)

## 1 · P-it6-2 (MED) — writes followed by a wake were not drained (28 s … 350 s)

### Root cause — proven vs inferred
**Proven (in-process, real code):**
- P1 Next 16.2.11 runs an `after()` callback only when the REGISTERING request's response emits `'close'`
  (`AfterContext.runCallbacksOnClose` ← `onClose: cb => res.on('close', cb)` in `build/templates/app-page.js`). probe-cf20-drain N0.1 drives
  Next's real `AfterContext`: nothing runs before close, it runs on close.
- P2 A callback registered on a scope whose response ALREADY emitted 'close' never runs (N0.2, real Next class): the listener is attached
  after the only 'close'. This happens to any `after()` made from code that still carries an earlier request's async context (a promise chain
  or timer created inside that request) once that request has finished.
- P3 bd435157 `after-drain.ts`: once a registered task does not start, every wake in the instance during the next 15 s registers NOTHING and
  is drained by nobody — probe-cf20-drain U2c: wakes at +1 … +14 s registered 0 tasks, the first new registration came at +15 s; U2a (other
  request's task never starts → my write waits) and U2b (my own task never starts → nothing else ever wakes) RED.
- P4 Reproduced through the real action path on QC3 (probe-cf20 Q2/Q3, `createContactAction` with a real session, outbox guard, control row
  C0.1 green): when the action's `after()` task does not start, `crm.contact.created` + `crm.contact.assigned` stay PENDING (attempts 0,
  never claimed) for the whole 5 s window (Q2); the run5 owner pattern — create #1's task does not start, create #2 (ordinary request) 1 s
  later — leaves #2's rows PENDING too (Q3). Same shape as dbg16/dbg17 (availableAt untouched, drained only by a later wake).
- P5 Ruled out: clock skew between the app and the DB (availableAt = DB `now()` vs the drain's app-clock `roundStart`): measured
  DB − app ≈ 15–19 ms with a 9–19 ms round trip (probe-cf20 C0.2) — noise, while the pattern is tens to hundreds of seconds.
- P6 A wake that arrives while a drain is RUNNING, after its candidate read, was NOT lost on bd435157 (U3 control green on both): the flag
  is cleared when the task starts, so the late wake registers its own task, and `drainOutbox` chains the second drain in-process. Not a cause.

**Inferred, not verified:** WHY the create action's own `after()` task did not start on the QC server. No server-side instrumentation was
available to this lane (no server log after 16:18 UTC; :3215/QC1 belong to the button runner). Candidates consistent with P1/P2: (a) the
action's response (it re-renders `/contacts/new` because the action calls `revalidatePath`) stays open long after the client got the result
and navigated (`router.push`), so the task starts late and in the meantime the 15 s blackout swallows the next wakes; (b) the request is torn
down before its after-phase while the instance survives; (c) a registration made from a stale async context (P2). The fix does not depend on
which one it was. **Evidence for next time:** the fix logs `[after-drain] fallback drain: an after() task did not start within 3000 ms …`
(throttled 1/min) — the next QC server run will show in its log whether and how often this happens.

### Design (src/lib/core/after-drain.ts — header rewritten in English with the invariants)
Smallest change that is provably correct for both properties asked for; the registration-side coalescing the C5.4-D probes pin is kept.
- Registration layer (request side): a wake while a registration is pending (registered, not started, younger than FALLBACK_MS = 3 s) only
  records itself (`lastWake`) — no second `after()` (S3 / R2N6 / R2N8c unchanged). Every registration arms an unref'd fallback timer. The
  registration starts exactly once: by its `after()` task, or by the timer 3 s later (cleared when the task starts). Starting frees the slot.
  The 15 s stale window is gone (the same 3 s constant is the coalescing window).
- Drain layer (instance side): starting a registration asks for a drain that covers its last wake — the running drain if it started after
  that wake, else the single queued re-run (starts when the running one ends), else a new one. ≤ 1 running + ≤ 1 queued per instance.
- Never throws: the whole body is guarded; `run` is called inside try (a synchronous throw is caught too).
Invariants (header I1–I6): I1 no lost write (U2a/U2b/U3/U8, Q2/Q3) · I2 bounded: one `after()` per request, ≤ 2 drains in flight per
instance (U4a: 50 requests during a running drain → 2 drains; before: 50) · I3 N9 kept: the task returns the covering drain's promise (U1, U8)
· I4 out of request = immediate, not awaited (U6, U7) · I5 never fails the request (U5) · I6 normal requests leave no timer behind (U1.2).
Caller rule unchanged: wake after commit; all `run`s equivalent (both callers drain the whole instance outbox via `drainAll`).

Behaviour changes to know about:
- A request whose wake coalesced into another request's pending registration still has no `after()` of its own (as before — pinned by R2N6);
  if that other task never starts, the write is drained by the fallback timer ≤ 3 s later instead of "first wake ≥ 15 s later". On a platform
  that freezes the instance right after the response, the timer runs when the instance next thaws (residual, see prod note).
- When an `after()` task is merely slow (> 3 s, e.g. a long-streaming response) the drain starts from the timer, earlier; the late task then
  returns that drain's promise (covered by waitUntil from that moment).
- Out of a request (scripts, cron, tests) wakes that arrive during a running drain now share ONE queued re-run instead of one chained drain
  each (U6.2: 3 wakes → 2 drains). Every row is still drained.
- Probes that capture `after()` tasks and never run them (cf18-r2, cf18-review(-r2), c54d-r2/r3, cf14-g2, cf17-g3, cf9-g1) now see a drain
  ~3 s after such a registration (the fallback). See the regression table for their results.

### Callers (all PROD-EXPOSED; none changed)
`scheduleDrain()` (outbox-consumers.ts → `scheduleCoalescedDrain(() => drainAll())`): booking `lib/actions/booking.ts:156` · POS
`modules/pos/service.ts:310,382` · chat `modules/chat/service.ts:770,1708,1981,2132,2239` · forms `modules/forms/service.ts:278` · kanban
`notify.ts:209`, `reminders.ts:131,215`, `comments.ts:165`, `checklists.ts:242` · branding `branding/service.ts:317`.
`wakeOutbox()` (crm/outbox-wake.ts → `scheduleCoalescedDrain(drainNow)`): `revalidateAndWake` (99 call sites in 26 CRM action files) ·
public routes `/t/o`, `/t/c`, `/u/[token]/one-click`, `/u/[token]/no-track` · `/b/[slug]/actions.ts` ×4 · settings/teams action · e-mail
inbound + Resend webhook routes · mobile proposals/plans confirm + `mobile/crm-routes.ts:70` · `ai/actions.ts:161,197` · CRM REST
`api/dispatch.ts:63` · chat CRM panel `crm-panel-actions.ts:127,162` · `crm/tracking.ts:960` · `crm/portal.ts:550`.
Direct `drainAll()` (cron outbox/hourly/daily, `outbox-wake.drainNow`) does not go through this module — unchanged.
Why none regresses: the call signature and "never throws / returns void" contract are unchanged; every caller already wakes after commit (C5.4-D
r3 audit, still true for the sites added by fix13); within a request the number of `after()` registrations is unchanged (one); the number of
drains can only go down (drain layer) or up by at most one per registration whose task did not start in 3 s (fallback). Non-CRM suites run
in-process (chat, forms, booking, POS, kanban) — see the regression table.

### Prod note
`after-drain.ts` is on prod today (bd435157 lineage; C5.4-D r3). The P-it6-2 symptom therefore can exist on prod for every module: after a
registered `after()` task fails to start, chat/POS/booking/forms/kanban/CRM writes in that instance are drained only by a wake ≥ 15 s later or
the hourly cron. After this card: worst case ≈ 3 s + drain time on a live instance. Watch after deploy: function duration, DB connections and
the rate of `[after-drain] fallback drain` warnings (a high rate = `after()` tasks routinely start > 3 s late on the platform → ask before
tuning FALLBACK_MS).

## 2 · P-it6-1 (LOW–MED) — attach block offered to viewers the service refuses
- `crm/emails.ts`: one predicate `unmatchedGateProblem(ctx, actor)`; `assertUnmatchedGate` throws its message (both messages unchanged);
  exported `canUseUnmatchedInbox(ctx, actor)` = the same predicate as a boolean.
- `emails/[threadKey]/page.tsx`: `canAttach: !contactId && (await canUseUnmatchedInbox(ctx, actor))`.
  Ruling B (hide, not disable): with `canAttach` false the whole block (search input, ค้นหา, ผูกกับ … picks) is not rendered (`EmailThread.tsx`
  `{data.canAttach && …}`) — no disabled controls added.
- Which threads showed it to a refused viewer: a thread whose rows have no contact but a company the viewer sees (company-visible ⇒
  `getThread` shows it; `attachToContact` needs the unmatched gate). Fully unmatched rows were already hidden from such viewers by `getThread`.
- Probe A: service refuses the unit-scoped manager (A.1 control) · page: manager `canAttach` true → **false** (A.2) · owner still true (A.3) ·
  owner attach works (A.5).
- Mobile / REST: no attach equivalent exists (no op in `crm/api/ops/emails.ts`, nothing in `mobile/crm-routes.ts`). Search endpoint
  (`searchCrmEmailContactsAction` → `activities.searchTargets` → `contactWhere(actor)`, 8 contacts max): returns only contacts the viewer may
  read — A.4: every hit was openable by that manager (`getContact360`); no leak beyond the viewer's own contact visibility.
- The inbox page still decides its "ยังไม่จับคู่" tab by calling `listThreads({unmatched:true})` (same gate inside) — not changed.
- Runner: the it6 runner copy expects `crm-email-attach-contact-q/-go/-pick` hidden for manager — with this fix that is what the page does.

## 3 · O-it6-d — CrmFilesBlock threw ActivitiesError NOT_FOUND inside the RSC
Trigger (proven, probe F.2 RED → GREEN): the custom-record page `/crm/objects/[key]/[recordId]` renders an ARCHIVED record (banner "รายการนี้
ถูกเก็บถาวรแล้ว"), but `files.listFiles` → `assertEntity` RECORD requires `archivedAt: null` ⇒ NOT_FOUND thrown in the block. Matches run5
chunk 9 (objects: the archive flows), 4 log lines, no page ≥ 500 (caught RSC error). Contacts/companies/deals: their 360 pages 404 before the
block for a parent the service would not accept (not reproduced; same catch covers a parent removed between the page read and the block).
Fix (`components/crm/files/CrmFilesBlock.tsx`): NOT_FOUND from `listFiles` (matched by error name + code — components may not import
activities-shared, fitness F2.3) renders a card "ไฟล์แนบ — ไฟล์แนบของรายการนี้เปิดดูไม่ได้แล้ว (รายการถูกเก็บถาวรหรือถูกลบไปแล้ว)"
(`data-testid="crm-files-unavailable"`); any other error still throws. Not changed: whether files of an archived record should stay
listable read-only (owner question Q3).

## 4 · O-it6-a = P-it6-3 / RVR-5 (LOW, required by controller ruling A) — bulk move counted no-op moves as moved
`deals.ts bulkMove`: `moveCore` already returns `changed`; `ok` now counts changed deals only, new `unchanged` (`BulkResult.unchanged?`, set
only by bulkMove). Audit: a PURE no-op (ok 0 · failed 0) writes no `crm.deal.bulk_move` row; otherwise the row carries `ok`, `unchanged`,
`failed` (moveCore writes no per-deal row/history/event for a no-op — unchanged). `bulkMoveAction` returns `unchanged`. DealTable text:
nothing moved → "ไม่มีดีลที่ต้องย้าย — อยู่ในขั้นนี้อยู่แล้ว N ดีล"; mixed → "ย้ายขั้นสำเร็จ X ดีล · อยู่ในขั้นนี้อยู่แล้ว N ดีล" (+ failures as
before). Callers: only `bulkMoveAction` — no REST op, AI tool or mobile route calls `bulkMove` (grep). Probe M.1–M.4 RED → GREEN.

## 5 · O-it6-b (LOW, a11y) — role="alert" (one attribute each, the app's pattern `role={msg.ok ? "status" : "alert"}`)
`CrmScoringManager.tsx` `crm-score-msg` (had no role) · `EmailThread.tsx` `crm-email-thread-msg` (was always `status`) · `CrmApiSettings.tsx`
`crm-api-hook-msg` (was always `status`). Probe B.1–B.3.

## 6 · RVR-6 (LOW UX, controller ruling D) — webhook delete said "บันทึกแล้ว"
Checked: `CrmApiSettings.tsx hookAction` showed "บันทึกแล้ว" for toggle AND delete. Now `hookAction(…, okText)`; delete passes
"ลบปลายทางแล้ว" (toggle keeps "บันทึกแล้ว"). No confirmation dialog added (ruling: would add registry controls) — owner/UX question Q5.
Probe D.1.

## Regression (`scripts/pending/cf20/run-regress.sh`, iso + gate lock, one at a time · r1 19:55–20:22 · r2 20:24–20:31 after the RVR edits)
| run | DB | result |
|---|---|---|
| typecheck (5120 MB) | — | r1 exit 0 · **r2 exit 0** (final src) |
| fitness with QC3 env / without DATABASE_URL·DIRECT_URL | QC3 / none | r2 42/42 · 42/42 |
| gen-crm-api-docs --check | — | r2 exit 0 (123 op) |
| probe-cf20-drain · probe-cf20 | none · QC3 | 11/11 + 6/6 · r2 7/7 + 12/12 |
| probe-c54d-r2 (pins S3 "ONE after() per action", N9a/b) | QC3 | 13/13 |
| probe-c54d-r3 (pins R2N6, R2N8c) | QC3 | 19/19 |
| probe-cf18-outbox (fix13 wakes, real paths, control row) | QC3 | controls 3/3 · findings 7/7 GREEN |
| probe-cf18 · probe-cf18-r2 | QC3 | 20/20 + 17/17 · 8/8 + 12/12 |
| probe-cf18-review · -review-r2 (R5 wakes, R5.6) | QC3 | controls 16/16 (findings 0/5 RED = already fixed by fix13) · 11/11 |
| probe-cf14-g2 · probe-cf17-g3 · probe-cf9-g1 (capture after() and never run it) | QC3 | 34/34 · 28/28 · 47/47 |
| qc-crm-c2.5 · c2.6 · c1.4 · c1.5 (bulkMove; r2 on final src) · c3.4 · c3.9 | QC3 | 105/105 · 87/87 · 110/110 · 103/103 · 53/53 · 49/49 |
| qc-ai-automation | QC3 | 4/4 |
| qc-crm-c2.2 · qc-crm-c5.3 --only=L1,L3 | QC2 | 73/73 · 19/19 |
| non-CRM, scheduleDrain in-process: qc-chat-notify-v2 (fake prisma, no DB) · qc-forms-notify · qc-kanban-k1.7 | none · QC3 · QC3 | 30/30 · 9/9 · 21/21 |
| qc-booking-deposit · qc-pos-account | QC3 | **15/18 · 5/15 RED — identical on bd435157** (`.qc-shots/cf20/base/`): QC3 lacks the SQL functions `account_jno_ensure_system` / `account_alloc_journal_no` (42883) ⇒ no journal entries; environmental, not this card |
No pinned C5.4-D property changed (S3, N9a/b, R2N6, R2N8c green) ⇒ no STOP. Logs: `.qc-shots/cf20/{r1,r2,base}/` (gitignored).

## Owner / controller questions
1. P-it6-2 root cause on the real server is not proven — OK to rely on the fallback + its warning line, and to look at the warning count after
   the next QC server run / prod deploy?
2. FALLBACK_MS = 3 s (also the cross-request coalescing window). Shorter = less delay when a task never starts, more early drains when a
   response streams long. Keep 3 s?
3. Files of an ARCHIVED custom record: show "not available" (this card) or list them read-only (service change)?
4. Should the inbox page's unmatched-tab decision switch to `canUseUnmatchedInbox` too (today: try `listThreads` and hide on any error)?
5. (RVR-6) Deleting a CRM webhook endpoint is still one click with no confirmation — add a confirm step (new registry controls) or keep?

## Not verified
- The P-it6-2 mechanism on the real Next server (no instrumentation, no server log; :3215 not ours). The in-process Next scope is a stub
  around the real ALS; N0 uses Next's real AfterContext but a fake response emitter.
- Vercel behaviour of the fallback timer when the instance is frozen right after the response (timer fires on thaw).
- Button-runner rows for /contacts/new, /emails/[threadKey], /deals bulk move, /settings/scoring, /objects record page — not re-run (QC1).
- Visual check of the new files card and the bulk-move message (no screenshots).

## Round 2 (controller rulings on review 5b91979b — `crm-C5.5-fix15-review.md`, MERGEABLE; reviewer files not edited)
RED = all four touched src files checked out from 5b91979b (diff saved, re-applied, md5 verified) — `red-r2-probe-cf20-drain.log`
(findings 6/9: R2-1a, R2-1c, R2-5 RED) · `red-r2-probe-cf20.log` (findings 12/14: M.5, M.6 RED). GREEN in the table below.
1. **RV15-1 (MED)** `after-drain.ts`: when the fallback timer fires it calls `after(p)` with the drain promise (Next's promise form →
   straight to `waitUntil`, no 'close' wait; the timer runs in the registering request's async context), in try/catch — no usable scope ⇒
   the drain still runs unawaited (today's behaviour). Unit probe (real timers, injected after): R2-1a promise form called once, only after
   3 s, with a promise that settles after the drain · R2-1b exactly-once start unchanged (the late task returns a promise, 1 drain) ·
   R2-1c after(promise) throws ⇒ drain runs once.
   Still not verified: whether Vercel honours `waitUntil` registered from a scope whose response already closed (reviewer's open point).
2. **RV15-5 (LOW)**: the timer is armed only `if (!reg.started)` — when Next runs the callback synchronously (after-queue already running)
   no stray timer. Probe R2-5 (0 timers armed, 1 drain) · R2-5b. Header I6 rewritten to be exact.
3. **RV15-3 (LOW)**: header line — a fallback drain on a slow response runs inside the still-open request; consumers must not call
   request-scoped APIs (revalidatePath / cookies / headers); none does today.
4. **RV15-6 (LOW copy)**: `DealTable.tsx` exports `bulkResultText(what, r)` (used by the table; reassign/tag text unchanged):
   moved > 0 → "ย้ายขั้นสำเร็จ X ดีล · อยู่ในขั้นนี้อยู่แล้ว N ดีล · ย้ายไม่ได้ M ดีล (เหตุผล)" (registry prefix "ย้ายขั้นสำเร็จ [1-9]" kept) ·
   moved 0, unchanged > 0, failed 0 → "ไม่มีดีลที่ต้องย้าย — อยู่ในขั้นนี้อยู่แล้ว N ดีล" ·
   moved 0, failed > 0 → "ยังไม่ได้ย้ายดีลใด — ย้ายไม่ได้ M ดีล (เหตุผล) · อยู่ในขั้นนี้อยู่แล้ว N ดีล".
   (เหตุผล) = the service's own message when every failed deal failed for the same reason (`bulkMoveAction` now returns `reason`), else
   "(ดูเหตุผลที่หน้าดีลนั้น)". Probe M.5 (all cases from the component's function) · M.6 (action returns the reason).
5. **RV15-7 (INFO)**: kept throwing on a DB error (no silent fail-closed): the only caller is the thread page, whose other reads throw the
   same way; hiding the block on a DB error would mask an outage. Comment fixed. Bulk-move no-op wake and the files-card note left as
   documented by the reviewer.
6. **RV15-2 — NOT fixed (ruling)**: a drain whose `run` never settles (hung DB) blocks every later drain of the instance — in bd435157
   (`drainChain`) and fix15 (`drainChain` + `st.running`) alike. **Recommended follow-up card:** wall-clock cap per drain in `drainOutbox`
   (race the chain link against N × TIME_BUDGET, release `st.running` when it fires). **Owner question 6:** schedule that card before the
   prod deploy of fix15, or after?
Also from the review (info, no change): RV15-4 less backlog work per burst (≤ 2 drains once wakes stop) — add `outboxHealth` stale count to
the prod watch list.

### Round 2 regression (`run-regress.sh` → `.qc-shots/cf20/r3/`)
21:07–21:18 UTC, final src, one job at a time (iso + gate lock), QC3:
| run | result |
|---|---|
| typecheck (5120 MB) | exit 0 |
| fitness QC3 env / without env | 42/42 · 42/42 |
| gen-crm-api-docs --check | exit 0 |
| probe-cf20-drain (unit) | RED (5b91979b) findings 6/9 → **GREEN controls 13/13 · findings 9/9** (`g-r2-probe-cf20-drain.log`) |
| probe-cf20 (QC3) | RED (5b91979b) findings 12/14 → **GREEN controls 7/7 · findings 14/14** (`g-r2-probe-cf20.log`) |
| review probes (unedited) probe-cf20-rv-drain · probe-cf20-rv | 22/22 · 13/13 (K17 "stray fallback timer" now reports **no**) |
| probe-c54d-r2 · probe-c54d-r3 (S3, N9, R2N6, R2N8c) | 13/13 · 19/19 |
| probe-cf18-outbox | controls 3/3 · findings 7/7 |
| qc-crm-c1.5 (deals) · c2.5 | 103/103 · 105/105 |
| qc-kanban-k1.7 | 21/21 |
No reds. Owner questions now 1–6 (6 = RV15-2 drain-timeout card timing).

## Controller merge gate record (2026-10-02 21:56 UTC)

Patch `scripts/pending/c55merge/fix15.patch` (c54d `bd435157..bb7a5a5f`, rounds 1–2 + round-1 review, minus the ledger RESUME/register) applied to the main tree after fix14 with `patch -p1 --fuzz=3`; all 27 files identical to the tip. The reviewer's round-2 re-check files (c54d `e8d87d1b`, MERGEABLE) were copied in after the gate. Merged as `07ce81c2`. Gate `scripts/pending/run-main-fix15.sh` (unit `crm-main-fix15`, log `.qc-shots/crm/main-fix15.log`): **31/33 steps exit 0**; both reds explained and re-run green by hand:

- `probe-cf19` exit 2 "QC2 only" — the controller put a QC2-pinned probe under QC3 in the gate script. Re-run on QC2: **56/56**.
- `probe-cf20-rv-drain` K9 (two module instances share one state) red, deterministic ×3 while the patch was uncommitted: the probe builds its second module instance from `git show HEAD:src/lib/core/after-drain.ts`; in the main tree HEAD was still the OLD module, so "copy B" was the old code and could not share the new state. After the commit (HEAD = new module) the same probe (reviewer's round-2 version, 27 checks) exits 0 with **K9 green**.
- Green in the gate: typecheck, docs ×4, fitness (no env + QC3), probe-cf20-drain, probe-cf20, probe-cf20-rv, c54d-r2, c54d-r3, cf18-outbox / cf18 / cf18-r2 / cf18-review, c2.5, c2.6, c1.4, c1.5, c3.4, c3.9, ai-automation, cf14-g2, cf17-g3, cf9-g1, chat-notify-v2, forms-notify, kanban-k1.7, QC2 c2.2, QC2 c5.3 L1,L3.
