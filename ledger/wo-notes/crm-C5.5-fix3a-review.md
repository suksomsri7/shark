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

---

## Round 2 — re-review of `git diff 288223d8 f6d7ad1a` (builder tip f6d7ad1a)
Finished 2026-10-01 15:52 UTC. QC2 only. Every job ran through `scripts/iso.sh` + the gate lock.

### What I ran
| run | result |
|---|---|
| builder `probe-cf3-r2.mts` (re-run) | **13/13**. Both positive controls on 000002 REPRODUCED again; the installed and mixed shapes were clean |
| my `review/rv5-r2.mts` (new; rv3/rv4 not edited) | **7/7** (`review/rv5-r2.log`) |
| `scripts/pending/c54n/check-jno-fns-r2.mts` (after its ORACLE-EDIT) | `CHECK OK`: 10/10 functions equal, none extra; rows 000000(orphan)…000003 finished |

I did not re-run typecheck or fitness: the only `src/` change this round is a comment in `account/service.ts`. The builder reports typecheck 0 and fitness 33/33.

### (a) The deviation from RV4-C is safe
000003 takes the lock only when the taken number lies below the book floor (`f > n`). RV4-C took it for every taken number.

A taken number at or above the floor can only come from two places: the row holding the maximum number itself (`n = f`), or a same-docNo row in another book (the floor is per book, the existence check is per system). In both cases the function just loops to the next `nextval`. It never calls `setval` and never walks, so it can only move the sequence forward.

| check | result |
|---|---|
| RV5-B: another transaction holds the advisory lock | taken AT the floor → 1602 in 50 ms · taken ABOVE the book floor (GENERAL-book row) → 1652 in 44 ms · taken 1000 below → waits (55P03 after 377 ms) and the sequence moved by its one `nextval` only |
| RV5-C: RV3-A and RV4-B against the installed body (healer = 000003 copy + 600 ms, cashiers = deployed) | 1602/1603 and 1604/1605/1606, 0 failures |
| RV5-D: deployed only, 6 rounds × 24 cashiers, random gap 1..1599 each round, sampler every 10 ms | 0 failures, 0 duplicates, 0 at/below the floor, 0 backwards in 134 samples |
| other callers that could move the sequence | none in `src/`: no `setval`, `account_next_journal_no` or `account_jno_create`. `account_jno_drop` runs only on PDPA delete |
| raised isolation levels | none in `src/`, so the floor re-read under the lock sees the previous healer's commit |

I found no interleaving where the installed body moves the sequence backwards or makes a caller fail, other than the residual below.

### (a) The stated residual is real in mechanism; reaching it in production is out of the question
**RV5-E (INFO, extreme stand-in):**
- Set-up: the healer is a 000003 copy with a 600 ms window after its read; it reads a gap of 1001 and chooses `setval`. Inside that window, another session runs 1200 raw `nextval`s.
- Result: the sequence went from next 1949 back to 1752. The healer got 1751.

**Why it is not reachable:**
- The window is the gap between two adjacent plpgsql statements, which takes microseconds unless the backend is descheduled.
- Every allocation call adds at most one `nextval` before it either returns (free number) or blocks (taken number below the floor).
- So more than 1000 concurrent allocation calls on one book would have to land inside that gap.

**Recommendation:** do not close it in this card. The header and runbook state it correctly. Their wording "Not reproduced; not proven impossible" could add "reproduced only with 1200 raw nextvals inside a 600 ms injected window (review RV5-E)". That is a nit, not required.

### (b) The lock-wait probe tells the two bodies apart
- R2-WAITS holds the real key (`hashtextextended('account_jno:'||seq_name,0)`) in another transaction and uses `lock_timeout` 300 ms.
- The deployed function waits (55P03) at gaps 1, 500 and 1000. The 000002 copy returns at once at 500 and 1000 (positive control re-ran green).
- Gaps 1001 and 1599 wait under both bodies, so they only check consistency; that is fine.
- My RV5-B repeats the gap-1000 case independently and adds the at/above-floor cases.

### (c) The ORACLE-EDIT is legitimate
- `check-jno-fns-r2.mts` is a builder check under `scripts/pending`, not a seeded `*-expected` oracle.
- The edit composes 000001 → 000002 → 000003, later file wins, which is exactly the set of functions in force. It still demands byte-equal `prosrc` and the pinned config for all 10 functions, and still reports extra functions. Nothing got weaker.
- The controller should log it as an approved ORACLE-EDIT in the register.

### (d) Runbook (`crm-C5.4-N.md` addendum + §2 "Healing exception")
- **Apply order** 000001 → 000002 → 000003: correct.
- **Pre-check 4** (`LIKE '2026110400000%'`) does cover all three names (line 478).
- **"Prod has none":** `origin/main`'s newest migration folder is `20261102000000_crm_v2_c` (verified). Production itself was not queried, which the runbook says.
- **POS:** `origin/session/pos` carries `20261120000000_pos_v2_a` and `…01_pos_v2_a_links`. Neither mentions `AccountJournal`, `account_jno` or `journal_no` (grep: 0 lines each).
- **Out-of-order apply by `migrate deploy`:** still not tested on a throwaway database. The runbook says so and routes it to the CI rehearsal (pre-check 5). Acceptable.
- **Pre-check 7** (`pg_get_userbyid(proowner) = current_user`) is conservative: a role that is only a *member* of the owner role would read `false`. That is safe.
- **Pre-check 8** is correct.
- **Smoke string** `IF f - nv <= 1000 THEN` matches only the 000003 body; 000002 has `< 1000`.
- **Rollback warning** (never re-run 000002 alone; re-running 000001 brings back the unlocked race) is correct.
  - Nit: after such a rollback `_prisma_migrations` still lists 000002/000003, so `check-jno-fns-r2` would report the difference. That is expected.
- **§2 "Healing exception"** names the phase-2 counters (`issueDocNo`, goods-doc) that the step-7 proof does not cover. Good.
  - Nit: the `service.ts:16-21` header names "step 1–6 rows" only, not the phase-2 counters. The "NOT yet at step 7" paragraph a few lines below already says they are held across the posting. INFO.

### (e) Stale assertions
- `rv3-jno.mts` RV3-D/RV3-CLEAN and `rv4-review.mts` RV4-D/RV4-CLEAN assert "deployed == 000002" and are now red by design (the builder's run: 5/7 each).
- Their interleaving checks now read "not reproduced" (RV3-A, RV4-B), which is the intended result.
- They are kept unedited as history. Use `rv5-r2.mts` for the body in force; do not use rv3/rv4 as gates.

### Round-1 findings, status
| finding | status |
|---|---|
| F1 MED | **closed** (000003; verified as above) |
| F2 LOW | **closed** (runbook rewritten and accurate; see (d)) |
| F3 LOW | **closed** (service.ts header + N §2; 40P01 is still possible during healing, as documented) |
| F4 LOW, F5 INFO | open as debt. They are listed in the builder note, but `ledger/CRM-C6-REGISTER-DRAFT.md` was not updated in this diff; the controller should copy them there |

### Round 2 findings
- **INFO:** RV5-E residual (above), documented, not worth closing now.
- **INFO:** service.ts header nit (above).
- **INFO:** F4/F5 are missing from the C6 register.

No BLOCKER, HIGH, MED or LOW.

### Hygiene
- RV5-CLEAN: 0 function copies `rv5_alloc_*`, 0 journal sequences, 0 tenant rows.
- QC2's `account_alloc_journal_no` is still byte-equal to the 000003 file.
- The builder probe re-run also cleaned up (R2-CLEAN, tenant CLEAN).

VERDICT: MERGEABLE
