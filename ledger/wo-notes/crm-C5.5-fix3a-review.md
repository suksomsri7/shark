# C5.5-fix3a — independent review (restart)

Reviewed `git diff 42acc952 265915ea` (6865b8ae + 265915ea) on `wip/crm-cf3`, worktree `/root/projects/shark-crm-cd2`. QC2 only.
The first reviewer died mid-run. I kept its probe (`review/rv3-jno.mts`), re-ran it, and checked its notes against the code. I did not reuse its conclusions without checking them.
Finished 2026-10-01 15:17 UTC.

## What I ran (all on QC2, each through `scripts/iso.sh` + the gate lock)

| run | result |
|---|---|
| builder probe `scripts/pending/cf3/probe-cf3.mts` (re-run) | **27/27** (log `/tmp/cf3-rv4/probe-cf3.log`) |
| first reviewer's `review/rv3-jno.mts` (re-run) | **7/7**. RV3-A REPRODUCED again: healer P2002, cashier 1602 in 105 ms |
| my probe `review/rv4-review.mts` | **7/7** (`review/rv4-review.log`) |
| `pnpm typecheck` | exit 0 |
| `pnpm exec tsx scripts/fitness.mts` | **33/33** (CRITICAL 0 · MAJOR 0 · MINOR 0) |
| `gen-account-api-docs.mts --check` | exit 0 (199 ops) |

I did not re-run the builder's regression list. I read `/tmp/cf3-logs/regress/SUMMARY`, `RED.log` (13/27 on the old src) and `GREEN1.log`.

## Per claim

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| R2-1 | Refuse webhook requests that name only foreign or unknown events (account page and platform page) | ✅ fixed | `connections-actions.ts:186-198` trims each event and refuses when the request names ≥ 1 event and none is an account event. `webhooks/actions.ts:29-33,70,119` refuses when it names ≥ 1 non-blank event and none is known. An empty request, or one with only blanks, still means "all events", as the page says, and the central guard checks it. A mixed list is filtered as before. The member and CRM pages use strict checks (`memberWebhookEventsCheck` and `crmWebhookEventsCheck` refuse empty and unknown events), so they never had this hole. Probe R21-* green. |
| R2-2 | An empty guard registry now fails closed | ✅ fixed (LOW F4) | `service.ts:422`. Writes to a CRM-event or all-events endpoint throw when the registry is empty after the root import. If the root import itself throws, the writer throws too, so that case is also closed. I checked every writer call in `src/` (15) and each passes an author. No `webhookEndpoint.create/update` exists outside the service. Toggle-off, other events and author-less calls pass as before. Probe R22-* green. |
| R2-3 | A refused toggle-on returns the Thai reason | ✅ fixed | The platform action returns `{ok:false, reason}` through `safeReason`. The new client button shows the reason. The account action catches the error and skips the audit write on refusal. A permission failure (`assertCan`) still throws to the error page; that was already the behaviour and is outside R2-3. probe-fix1 WB (pinned to QC3) still holds: I read `probe-fix1.mts:528-583`, and its toggle checks look only at `active`. |
| IMP | `import.run` and `reports.email` 429 are flagged `nothingWritten` | ✅ true | `accountRateGuard` is the first awaited call in both handlers (`import.ts:98`, `:154`). Its only write is the `ChatRateBucket` counter. The dispatcher writes the audit row only after success (`dispatch.ts:219-220`). `nothingWritten` is the same WeakSet that `withIdempotency` reads (`idempotency.ts:299`), because the account `respond.ts` re-exports it unchanged. A same-key retry goes through the limiter again, so the flag cannot get around the limit. Probe IMP-* green. |
| H2b-2 | Advisory-locked, forward-only slow path | ⚠️ partly fixed (MED F1) | Two healers on the same book are now serialised. Both probes confirm this (JNO-new-forced-window, RV3-B). A walker on the lock-free "≤ 1000" path can still pass the floor between the healer's read and its `setval`, and then the sequence moves back. Reproduced with an injected delay, at the boundary and away from it. Details and a tested fix are in F1. |
| H2b-2 | Migration safety | ✅ | One `CREATE OR REPLACE`. Same signature, return type and `search_path`; owner and ACL are kept (RV3-D: same as the sibling functions). It ran twice inside `BEGIN…ROLLBACK` without error (RV4-D). The server is PG 18.6 (`server_version_num` 180006), and `hashtextextended` needs PG ≥ 11. Two slow-path allocations in one open transaction re-enter the lock without waiting on themselves: one lock row, `objsubid` 1, which is the single-bigint key space. The only advisory user of the `account_jno:` text prefix is this function, so a collision would need a 64-bit hash collision, and that would only serialise calls. The free-number fast path holds 0 locks (RV3-C: 11 ms while a healer holds the lock). |
| H2b-3 | At-risk CLOSE_OVERDUE uses the Thai day key | ✅ fixed | `ai-bridges.ts:216` uses `dayKey(expectedCloseAt) < thaiToday(now)`, the same helpers the board uses (`deals.ts:336`, `deals/page.tsx:370`, `DealBoard.tsx:44`). RV4-A checks the exact Thai midnight: at 23:59:59.999 the deal is not overdue; at 00:00:00.000 the next day it is. This includes the positive control the builder's probe lacked (today's deal becomes overdue at 00:00 Thai the next day). Every case matches the board. No other CRM "overdue" comparison against an instant exists (grep). |

## Findings

### F1 · MED · REPRODUCED (injected delay) · the slow path still moves the sequence back when a lock-free walker overtakes it
- **Where.** `prisma/migrations/20261104000002_account_journal_no_alloc_lock/migration.sql`:
  - `:26-27` the ≤ 1000 walk, which takes no lock;
  - `:30-38` the locked slow path;
  - header `:6-8` says "moved only forward".
- **Scenario.** The healer H holds the lock and reads `nv` with `f - nv ≥ 1000`. Before H's `setval`, a cashier lands within 1000 of the floor, walks lock-free past it, and gets `f+1`. H's `setval(f)` then moves the sequence back. H gets `f+1` again and fails with P2002 when the cashier commits.
- **RV3-A (boundary).** H reads a gap of exactly 1000, so it takes the `setval` branch because `:35` uses `< 1000`. The walker's outer test (`:26`) uses `<= 1000`. One concurrent cashier is enough.
- **RV4-B (non-boundary, new).** H reads a gap of 1001. Cashier X lands at gap 1001 and waits on the lock. Cashier Y lands at gap 1000 and walks. Result: H fails with P2002, Y gets 1602 in 89 ms, and X gets 1603 after the lock. So fixing the off-by-one alone does not close it.
- **RV4-C (counterfactual, all three callers on the hardened copy).** Same interleaving with the advisory lock taken before the `f - n <= 1000` split, and the floor and sequence re-read under it. Result: 1604 / 1605 / 1606, 0 failures. The free-number fast path stays lock-free; only "taken number" calls queue, and those only happen while healing.
- **Reach.** Only while healing after a restore or import that left more than 1000 foreign numbers above the sequence. The healer must be descheduled between two adjacent plpgsql statements for as long as a walker's floor query plus up to 1000 `nextval`s. Effect: one money transaction fails and can be retried; no duplicate is stored.
- **Why MED.** This is the same backwards-`setval` class the card set out to close. The fix is three lines and proven. The migration is not on production yet.
- **Fix (preferred).** Take the lock before the split, as in RV4-C. The migration is applied on QC2 only. Either edit 000002 and re-apply it on QC2, accepting that QC2's stored checksum differs (the controller decides), or add `20261104000003` with the hardened body.
- **Minimum if the code is not changed.** Correct the header text (`:6-8`) and the runbook "Residual" bullet (F2).

### F2 · LOW · the production runbook addendum is wrong or incomplete
- `ledger/wo-notes/crm-C5.4-N.md:557` "Residual … would need > 1000 such calls … not reachable in practice" is wrong: one walking cashier is enough (F1).
- `:555` names only the cross-book deadlock and misses F3.
- It does not mention the POS lane's later `20261120*` folders. If they are deployed first, `migrate deploy` applies this earlier-named pending folder afterwards. The first reviewer checked this on QC2 with a diverged history and from engine strings; I did not test a real out-of-order apply.
- It does not say plainly that production has neither 000001 nor 000002 yet.

### F3 · LOW · REPRODUCED (mechanism) · "step 6 never waits" no longer holds
- **Where.** `src/lib/modules/account/service.ts:16` says "no lock, never waits", and the no-cycle proof in N §2 relies on it.
- **RV4-E.**
  - Transaction 1 holds a row lock, then allocates on the slow path, so it waits on the healer's advisory lock.
  - The healer holds the advisory lock, then wants that row.
  - Postgres reports **40P01** and one transaction fails.
- **App reach.** Not established. I traced the phase-2 counters (`issueDocNo` held across `postDocument`) against the step-7 counters (TAX_INVOICE, PURCHASE_TAX_INVOICE, WHT_CERT, WTI) and did not find a concrete pair on the same book. It can only happen during healing, and Postgres always detects it.
- **Fix.** Comment and doc only, unless F1's hardening is chosen. Hardening does not remove this class of wait.

### F4 · LOW · fail-closed depends on the registry being empty, not on the CRM guard being present
- **Where.** `src/lib/webhooks/service.ts:422`.
- **Problem.** If the root later registers a second module's guard and the CRM registration is lost, the registry is not empty. CRM and all-events endpoints then pass unguarded again. Same family as the first reviewer's RV3-4: the prefix copy at `:414` is kept in sync only by a pending probe.
- **Suggestion (later card).** Fail closed when guarded events are requested and no guard owns those prefixes. For example, guards register the prefixes they own, or the platform owns the constant and CRM imports it.

### F5 · INFO
- `ai-bridges.ts:218` `PIPELINE_LATE_MONTH` still compares instants (`expectedCloseAt <= now + 7 d`), so it flips at 07:00 Thai. Same class as H2b-3, outside its scope; register it as debt.
- The migration header `:6` says "nextval steps when the remaining gap is ≤ 1000", but the code at `:35` uses `< 1000`.
- `scripts/pending/c54n/check-jno-fns-r2.mts` now reports 9/10 by design. It compares against the 000001 file; repoint it at 000001 + 000002 if it is reused as a gate.
- The worktree has uncommitted `scripts/crm-expected.json` and `scripts/member-expected.json`, which are not part of the card, plus the gitignored skill `endpoints.md` the builder created. Do not commit them by accident.

## Not verified
- I did not run a real out-of-order `migrate deploy` (it needs a throwaway database).
- No QC1/QC3 runs, no `next build`, no browser render of `/app/settings/webhooks`. I checked `WebhookToggleButton` and `ToggleEndpointResult` by typecheck and by the same pattern in sibling files, not by a build.
- I did not trace an app-level flow for F3. Production roles (a separate migrate role owning the 000001 functions) were not inspected; `OR REPLACE` needs the function owner.
- I did not re-run the builder's regression suites (I read their logs) or the RED run.

## Probe hygiene
- Each run created one tenant `qc-cf3-rv4-*`, 1600 foreign journal rows, three function copies `rv4_alloc_*` and the system's sequences. All were swept: RV4-CLEAN shows 0 copies, 0 sequences, tenant rows 0.
- The deployed `account_alloc_journal_no` is still byte-equal to the 000002 file.

VERDICT: NOT MERGEABLE (F1 MED: move the advisory lock before the ≤ 1000 split, or at minimum correct the "forward-only" header and runbook; F2 runbook corrections; F3 lock-order header text)
