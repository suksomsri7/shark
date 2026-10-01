# C5.5-fix3a — six small fixes (fix1 review round 2 + hunt 2b) · builder note

Branch `wip/crm-cf3` (from `origin/session/crm` df289f81, contains 42acc952) · worktree `/root/projects/shark-crm-cd2` · **QC2 only**.
Probe `scripts/pending/cf3/probe-cf3.mts` (+ `_fx.mts` = c55 fixture pinned to QC2, + `noroot-child.mts`) · regression runner
`scripts/pending/cf3/run-cf3-regress.sh` · logs `/tmp/cf3-logs/` (RED.log · GREEN1.log · migrate-deploy.log · regress/*.log + SUMMARY).

**Probe: RED 13/27 on the untouched src (and the old function on QC2) → GREEN 27/27** (twice: GREEN1.log and regress/probe-cf3.log).
The RED run used the original src files (my edits set aside and restored byte-for-byte). The new migration file was present but not yet
applied, so `JNO-new-forced-window` was already green at RED time: it builds its own copy from the file.

## Per item

### 1 · R2-1: a webhook request that names only foreign or unknown events became an all-events endpoint. Verified, fixed.
- **Verified.** RED: on the account connections page, `["crm.deal.won"]` and `["member.created"]` were stored as `[]` (= every event of the
  shop). The same hole existed on the platform page `/app/settings/webhooks`: create and update-events with `["bogus.event"]` were stored as `[]`.
- **Root cause.** Both pages filter the submitted list to known events (account: `account.*` only). An empty result is read as "all events".
- **Fix.**
  - `src/lib/modules/account/connections-actions.ts:186-198`: the form named ≥ 1 event and none is an account event ⇒ `{ok:false}` "หน้านี้เลือกได้เฉพาะเหตุการณ์ของระบบบัญชี…".
  - `src/lib/webhooks/actions.ts:29-33`: `unknownOnlyProblem`, used by create (`:70`) and update-events (`:119`). It refuses "ไม่รู้จักเหตุการณ์ที่เลือก…".
  - Unchanged: an empty submission is still "all events", which is what both pages say. Mixed lists are still filtered as before.
- **Account REST doors checked, no hole.** Unknown events get 422 on POST and PATCH (`api/ops/webhooks.ts`). Known foreign events are stored
  exactly as named, never widened, and the central CRM guard decides on them. An explicit `[]` is documented as "every event" and is guarded.
  Probe `R21-account-rest-no-hole` is green before and after.
- **Probe ids:**
  - `R21-account-refuse` ❌→✅
  - `R21-platform-refuse` ❌→✅
  - controls `R21-account-control`, `R21-platform-control`, `R21-account-rest-no-hole` ✅→✅

### 2 · R2-2: the guard registry failed open when empty. Verified, fixed (fail closed).
- **Verified.** RED: with the composition root replaced by an empty module, toggle-on of an all-events endpoint succeeded, and so did set
  `[]`, set `crm.*`, `custom.record.*`, `team.*` and create `[]`.
- **What "no guard registered" means.**
  - `runEventGuards` loads `@/lib/webhook-guards` itself on every call that carries `by`. That covers every entry path: route handlers,
    server actions, REST dispatch, AI-proposal execution, and scripts that pass `by`. The registry is therefore never empty in normal runtime.
  - Author-less script calls (`by === undefined`) skip the guard exactly as before.
  - So an empty registry after the import means the root is broken. Fail-closed applies to every tenant, but only in that broken state.
- **Fix.** `src/lib/webhooks/service.ts:407-425`.
  - New `WEBHOOK_GUARDED_EVENT_PREFIXES = ["crm.","custom.record.","team."]`, a copy of `CRM_EVENT_PREFIXES`. The platform still imports
    no CRM code (RV-8).
  - New `webhookEventsNeedGuard(events)`: true for `[]` or any CRM prefix.
  - Registry empty + guarded events ⇒ throw `WebhookGuardError(WEBHOOK_GUARDS_MISSING)` (Thai, 403 on REST). Other events (member/account…) pass.
- **Proof without the root.** `noroot-child.mts` imports only the service:
  - (a) The root was not loaded before the call and was loaded after it, and the CRM guard refused a MANAGER on a v2 shop.
  - (b) A seeded empty root ⇒ all six guarded writes refused. Toggle-off, `member.created` and the author-less call still pass.
- **Probe ids:**
  - `R22-empty-registry-fails-closed` ❌→✅
  - `R22-empty-registry-others-pass` ❌→✅ (on old code the all-events endpoint got switched on)
  - `R22-prefixes-in-sync` ❌→✅ (drift detector for the copied prefix list)
  - `R22-root-loaded-by-service` ✅→✅
  - `R22-static-all-doors-pass-author` ✅ (15 src calls, all with author)

### 3 · R2-3: a refused toggle-on threw out of the server action. Verified, fixed.
- **Verified.** RED: platform `toggleEndpointAction` and account `updateWebhookAction` op=on both THREW `WebhookGuardError`, so the user got the error page.
- **Fix.**
  - `src/lib/webhooks/actions.ts:83-101`: the action returns `ToggleEndpointResult` (`{ok:true}` | `{ok:false, reason}` via `safeReason`), like
    the member, CRM and account toggles. New client button `src/components/webhook-toggle-button.tsx` (`useActionState`) shows the Thai reason
    under the button.
  - `src/app/app/settings/webhooks/page.tsx:75-76` uses the new button.
  - `connections-actions.ts:219-224`: try/catch ⇒ `{ok:false, reason}`. `ConnectionsPanel` already shows `reason`.
- **Probe ids:**
  - `R23-refused-returns-reason` ❌→✅
  - `R23-control-no-v2` ❌→✅ (old platform action returned `undefined`)
  - `R23-page-uses-result` ❌→✅

### 4 · Account `import.run` 429 is now flagged `nothingWritten`. Verified pre-write, fixed.
- **Verified pre-write.**
  - `accountRateGuard("import", systemId)` is the first statement of the handler.
  - Its only write is the `ChatRateBucket` counter, a single `INSERT … ON CONFLICT` that is not shop data. Its window resets by time, not by the number of refused calls.
  - RED: 429, then the same key after the hour ⇒ `429 Idempotent-Replayed: true`, nothing imported.
- **Fix.**
  - `src/lib/modules/account/api/ops/import.ts:34-41`: `rateLimited()` throws `nothingWritten(new ApiError(429…))`.
  - The same helper serves `reports.email`. Its `accountRateGuard("emailReport")` is also its first statement (after building a plain ctx object), so it is pre-write too.
  - `nothingWritten` is re-exported from `account/api/respond.ts`.
- **Docs.** The conventions text in `scripts/gen-account-api-docs.mts` now says the per-book limits of `import.run` and `reports.email` are not
  stored either. `docs/api/ACCOUNT-API.md` was regenerated, and `--check` exits 0.
- **Probe ids:**
  - `IMP-429-released` ❌→✅ (0 idempotency rows after the 429, contacts unchanged)
  - `IMP-same-key-retry-runs` ❌→✅ (200, not replayed, 1 contact created)
  - `IMP-guard-is-first-statement` ✅

### 5 · H2b-2: the allocator's slow path read the sequence and then called setval without a lock. Verified (reproduced), fixed by migration.
- **Verified.** I created an instrumented copy of the OLD body with a 400 ms `pg_sleep` between `SELECT last_value` and `setval`, then ran
  2 cashiers 150 ms apart. Each cashier is a transaction that allocates, inserts its row, holds 900 ms and commits.
  - Result: one cashier got 1602 and the other failed with **P2002**. The second setval moved the sequence back from 1602 to 1601.
  - Probe id: `JNO-old-race-reproduced`. It is a positive control and stays green by design.
- **Migration** `prisma/migrations/20261104000002_account_journal_no_alloc_lock/migration.sql`.
  - `CREATE OR REPLACE` of `account_alloc_journal_no` only. Same signature, same `SET search_path = pg_catalog, public`.
  - No table, sequence or row is touched, and nothing is rewritten. It is idempotent.
  - Fast path and the ≤ 1000 path are unchanged and lock-free.
  - Slow path:
    - takes `pg_advisory_xact_lock(hashtextextended('account_jno:' || seq_name, 0))`, keyed per (system, book);
    - re-reads the floor and `last_value/is_called` under the lock;
    - next value > floor ⇒ nothing to do;
    - remaining gap < 1000 ⇒ forward-only `nextval` steps;
    - otherwise `setval(floor)`, which is strictly forward because next value ≤ floor.
- **How the slow path is forced.** `setval(seq, 1)` under a dense committed foreign block 2..1601 of `RV-yyyy-mm-` numbers. That is the
  restore/import shape, a gap > 1000.
- **Probe ids:**
  - `JNO-new-forced-window` ✅: a copy of the NEW file with the same 400 ms window, 2 and 8 cashiers ⇒ 0 failures, 0 duplicates, none inside the block, none above the sequence.
  - `JNO-deployed-is-new` ❌→✅: QC2 prosrc is byte-equal to the file and `proconfig` is pinned.
  - `JNO-deployed-parallel` ✅→✅: 16 parallel × 6 rounds in the slow path ⇒ 96/96 distinct, 0 P2002. The old function was also green here without an injected delay, as reviewer R3-H1 found.
  - `JNO-fast-path-lock-free` ❌→✅: a free number holds 0 advisory locks, the slow path holds 1.
- **QC2.** `migrate deploy` applied it, and status is "up to date" (150 migrations). The probe drops its instrumented functions and sequences
  (`CLEAN-db-objects` ✅). QC2 is left in the migrated state.
- **Production notes** were appended to `ledger/wo-notes/crm-C5.4-N.md` ("Runbook addendum (C5.5-fix3a…)"). They cover order, locks,
  behaviour change, cross-book deadlock (40P01, detected), the residual (> 1000 lock-free nextvals in one statement gap), smoke SQL and rollback.
- **Note for the controller.** A POS lane branch carries `20261120000000_*`. This migration's timestamp is earlier. `migrate deploy` applies
  pending folders regardless, but if POS reaches main first, this folder is applied "out of order" (Prisma deploy accepts that).

### 6 · H2b-3: at-risk "เลยวันคาดว่าจะปิด" was set from 07:00 Thai on the due day. Verified, fixed.
- **Verified.** RED: a deal closing 2026-10-01 was CLOSE_OVERDUE at 07:01, 10:00 and 23:59 Thai, while the board says not overdue.
  REST `GET /deals/at-risk` (tool `crm_deals_at_risk`) at 20:3x Thai also flagged today's deal.
- **Fix.** `src/lib/modules/crm/ai-bridges.ts:39,208,213-216` uses the board's own helpers from `deals-shared.ts`:
  `dayKey(expectedCloseAt) < thaiToday(now)`. No new helper. `dayKey` is imported as `dealDayKey` because a local `dayKey` variable exists further down the file.
  - The home table, the AI tool and the task proposals all read `atRiskDeals`, and the reason is computed in one place (`AR-one-source`).
- **Probe ids:**
  - `AR-fixed-clock` ❌→✅: 00:30, 07:01, 10:00 and 23:59 Thai. Today's deal is never overdue, yesterday's always is, and both equal the board rule.
  - `AR-rest-real-clock` ❌→✅
  - `AR-one-source` ✅

## Regression (QC2, `CRM_V2_SWITCH=all`, gate lock, one at a time) — `/tmp/cf3-logs/regress/SUMMARY`
| suite | result |
|---|---|
| probe-cf3 | 27/27 |
| qc-webhook | 15/15 |
| qc-webhook-ui | 11/11 |
| qc-account-api-webhooks | 22/22 |
| qc-account-api-core | 64/64 |
| qc-crm-c0.2 | 27/27 |
| qc-crm-c1.10 | 66/66 (H skipped: `QC_BASE` pointed at a closed port so :3215 was not touched) |
| qc-crm-c5.3 --only=L1,L3 | 19/19 |
| N probe-m1 | 10/10 |
| N qc-numbering (oracle) | 12/12 |
| N review/r2-money | 11/11 |
| N review/r3-m1-adversarial | 7/7 (H1 16×50 green on the new function) |
| N check-jno-fns-r2 | 9/10 F: `account_alloc_journal_no` prosrc DIFFERENT from the 000001 file. **Expected** (replaced by 000002); everything else equal, no extra function |
| qc-acc-v2-payments | 162/0 |
| qc-acc-v2-wht-cheque | 47/69: all 22 reds are "= เฉลย seed" comparisons (T1.4…T8.3, got 0). The acc-v2 seed lives on QC1 (gate: QC1 69/69); every independent-SQL check is green ⇒ environmental, seed-pinned, not hacked |
| docs --check crm / account | exit 0 / exit 0 |
| docs --check member / kanban | exit 1: only the gitignored `.claude/skills/shark-{member,kanban}-api/references/endpoints.md` is missing (0 bytes). `MEMBER-API.md` / `KANBAN-API.md` themselves match (no doc error printed); these generators were not touched |
| typecheck | exit 0 |
| fitness, QC2 env / no DB env | 33/33 · 33/33 |

Not run, because they are pinned to QC3 (their fixture `scripts/pending/c55/_fx.mts` exits on non-QC3): `probe-fix1.mts` and `probe-idem.mts`.
- The probe-fix1 WB checks are covered on QC2 by probe-cf3 R21/R22/R23, including the same WB-static scan.
- Known effect on probe-fix1 WB when it next runs on QC3:
  - `c1` now gets `{ok:false}` on v1 too (WB only asserts it on v2).
  - The toggles now return instead of throwing, which still satisfies its `active=false/true` assertions.

## Side effect to know
Running `gen-account-api-docs.mts` (write mode) created the gitignored `.claude/skills/shark-account-api/references/endpoints.md` in this
worktree. My attempt to remove it was refused by the permission system, so it is still there. It can change `qc-account-api-docs` F2.x results in this
worktree, and it is why member/kanban `--check` now look for their skill files (the `.claude/skills` folder exists).

## ORACLE-EDIT requests
None. No existing oracle was edited. Note: the builder check `scripts/pending/c54n/check-jno-fns-r2.mts` (not an oracle) compares QC2 against
the 000001 file only. If the controller wants it green, point its file list at 000001 + 000002, with the later file winning.

## Not done / open
- QC1 and QC3 do not have migration 000002. Production: owner step (runbook addendum).
- The platform's copy of the CRM prefixes is held in sync by the probe only. A permanent fitness check would need F15 (out of scope).
- R2-4 (stored endpoints without an author), R2-5, R2-6 (KANBAN/MEMBER doc text): out of scope. Installed `~/.claude/skills` were not touched.
- The other unflagged 409/503 replays named in review item 3 (b)/(c): not in this card.
