# WO T0.1 — Measure the real cost per task (cost probe) — BUILDER part

> RUN "AI TEAM" (SHARK HUB v2) · controller tree `/root/projects/shark-ai` · branch `session/ai-team` · lane `/root/projects/shark-ai-b` branch `wip/pos-ai-t0.1` · 2026-10-08 (UTC) · controller: Fable · builder: Claude Opus 5.5 (agent)
> Contract: header [1]–[5] of `scripts/qc-ai-t0.1.mts` + `ledger/ai-team-briefs/ai-brief-T0.1.md` (controller addendum wins over the body) + `ledger/AI-TEAM-RUN.md` §2 T0.1 · rulings R-A5, R-E C34
> Oracle: `scripts/qc-ai-t0.1.mts` (26 checks · commit test: 1ac0b099 · **edited after that commit: no**) · first red `ai-t0.1-red.txt` (1/26) · green `ai-t0.1-green.txt`
> **State: builder part done = 23/26 under mock (S1.5 · S2.3 · S4.4 PENDING-REAL). The WO is accepted only at 26/26, after the controller's real run wrote `ledger/AI-TEAM-COST-2026-10.md`.** The builder never called the real provider (every run had `SHARK_AI_MOCK=1`).

## 1. Files touched
| File | State | What | Shared file (COMMON §D)? |
|---|---|---|---|
| `scripts/ai-team-cost-probe.mts` | new | the probe (controller-run) | no |
| `ledger/wo-notes/ai-t0.1.md` · `ai-t0.1-green.txt` | new | these notes + the green output | no |

Nothing under `src/`, `prisma/`, `apps/`. The oracle was not edited. `ledger/AI-TEAM-COST-2026-10.md` is NOT created by the builder (it is the output of the controller's real run).

## 2. migration / seed / backfill
None. The probe needs the AI-team seed (AT-1 + `at-owner@qc.shark`), resolves it through `atIds()`.

## 3. How the probe works (`scripts/ai-team-cost-probe.mts`)
1. **Guards before anything is loaded** — `AI_COST_PROBE !== "1"` ⇒ `process.exit(0)` (no env, no connection, no file). `SHARK_AI_MOCK=1` without `PROBE_OUT` ⇒ exit 2. A `COST_CAP_USD` / `PROBE_ROUNDS` / `PROBE_TENANT` that is set but unusable ⇒ exit 2 (a typo must not silently become "cap 3").
2. **Env** only through `loadAiTeamQcEnv()` (non-QC4 ⇒ exit 4 there). The probe assigns no `SHARK_AI_*` switch except `SHARK_AI_COLLECT = "0"` (probe turns are not training data); it reads `SHARK_AI_MOCK` (provider mock|real), `SHARK_AI_MODEL` (only to label routing `auto`/`forced`) and `SHARK_AI_PRICE_MARKUP` (only to print the factor).
3. **Snapshot before the first run** (all read-only): wallet (`balanceOf`), ledger row ids of the last 10 minutes, conversation ids of the actor, ids of the "window tables" (§4), all `AiMemory` rows, and the row count of every Prisma model that has a `tenantId` (299 models) for AT-1.
4. **Real-run refusal**: provider real and wallet < cap + US$0.50 ⇒ exit 2 before any run (below US$0.50 the service degrades to haiku and the numbers would be wrong). stdout only says `wallet before: OK|LOW`.
5. **Runs**: round-major, 10 types × `PROBE_ROUNDS`; before each run `interrupted?` then the cap check on the spend read from the ledger. Type 1 = `createConversation(ctx)` + `sendMobileChat`; type 2 = `createConversation(ctx, title)` + 10 inserted `AiMessage` rows + `sendMessage`; the others = `sendMessage(ctx, { text })`. `deps = { onToolCall }` only (no provider, no source). After the turn the USAGE rows of the conversation are read from `AiCreditTxn` → one row of the table.
6. **A run that fails** (throw · `ok:false` · mobile `error` event · no USAGE row) stops the loop (no more money is spent), is recorded in `probe-data.failure` and on stderr with a scrubbed message; cleanup + refund + the result file still happen; exit 2. `SIGTERM`/`SIGINT` set a flag: the turn in flight finishes, then cleanup runs (the process does not die mid-run).
7. **Cleanup** — one phase, every step in its own try/catch (§4) → **refund** → **residue check** (row counts of all 299 tenant models before = after; ledger = exactly the new rows) → statistics → result file → `PROBE_RESULT` line.
8. **Exit** 0 finished / stopped by cap · 2 refused, a run failed, a cleanup step failed, the wallet is not restored, a row is left, unlisted spend, or the file could not be written · 4 not QC4.

## 4. Cleanup: tables and scoping (what a REAL model can leave behind)
Scoping principle: a delete matches only (a) rows that carry a conversation id the probe itself created in this process, or (b) rows of the probe tenant whose id did not exist in the snapshot taken before the first run AND whose `createdAt` is inside the probe window (start − 10 min belt). Nothing is matched by text, title or prefix.

| Table | Written by (real model) | How it is cleaned | Scope of the delete |
|---|---|---|---|
| `AiConversation` | every run | `deleteMany` | `tenantId` + `id ∈ convIds` (ids returned by `createConversation` / `sendMessage`) + "stray" rooms: `id startsWith u~<actor>~`, not in the before-snapshot, not already known (a `sendMessage` that created its room and then threw) |
| `AiMessage` | every run (+ the 10 history rows) | `deleteMany` (also FK cascade) | `tenantId` + `conversationId ∈ convIds` |
| `AiProposal` | action tools (quotation, invoice, schedule_task, …) | `deleteMany` | `tenantId` + `conversationId ∈ convIds` |
| `AiPlan` | `propose_plan` | `deleteMany` | same |
| `AiFeedback` | — (UI only) | `deleteMany` | same |
| `SupportCase` (+ `SupportMessage` by FK cascade) | `support_open_case` | `deleteMany` by conversation, then the window rule (a case whose room link failed) | `tenantId` + `conversationId ∈ convIds` · or new-in-window |
| `AiMemory` | `remember_fact` (teach-back!) · `forget_fact` | new rows deleted; rows `forget_fact` removed are re-created from the snapshot (same id / content / dates); a bumped `updatedAt` is put back | `tenantId` + id not in snapshot + `createdAt` in window |
| `KbArticle` | `kb_auto_save` (teach-back!) | new rows deleted | same window rule |
| `AiScheduledTask` | only after a human confirms a proposal — never in the probe | new rows deleted (defensive) | same window rule |
| `AppNotification` | no chat-path writer found; listed by the controller | new rows deleted (defensive) | same window rule |
| `AiTrainingSample` | `recordSample` — off (`SHARK_AI_COLLECT=0`) | new rows deleted (defensive) | same window rule |
| `AiUsage` | every run (+1 request, tokens) | single-statement `updateMany … decrement` per Bangkok day, guarded `≥` so it can never go negative; the amounts are read from the ASSISTANT rows the turns wrote (same transaction as the increment) | `tenantId` + `day` |
| `AiCreditWallet` | every charge | **one** `topUp(tenant, Σ new USAGE, { kind: ADJUST, source: ADJUST, ref: qc-ai-t0.1-refund-<runId> })` | — |
| `AiCreditTxn` | every charge | **never deleted** (the evidence S2 reads) | — |
| other tables with a `conversationId` column (`Chat*` — a different id space) | — | not deleted; counted, and reported as a problem if a probe id ever appears | — |

Not cleaned on purpose: `OpsEvent` rows (`logOps` writes one when the provider call throws or a charge fails). They are the error log of a failed run; a failed run exits 2 and the row shows in `cleanup.residue`.
The generic part is driven by `Prisma.dmmf` (models with `tenantId` + `conversationId`, names starting `Ai` + `SupportCase`), so a table added by a later WO (T1.1 `AiTask…`) is cleaned without touching the probe.
Anything the list misses is caught by the **residue check**: `cleanup.residue` in the file (and the `cleanup ·` line on stdout) lists every tenant model whose row count changed; the exit code is 2 when it is not empty.

Refund detail: the refund is Σ of **all** USAGE rows AT-1 gained during the run, not only those of the listed conversations (a tool that calls a model itself — CRM/kanban/member AI bridges — charges without a conversation id). Such spend is refunded, reported as `cleanup.unlistedUsageMicro` and makes the exit code 2 (the table would under-count the cost of that task type).

## 5. Results (full output: `ledger/wo-notes/ai-t0.1-green.txt`)
All on the committed probe (d2020b64), QC4, `SHARK_AI_MOCK=1`, through the exact wrapper, each run its own lock hold:
- forced #1: `🟡 T0.1: 23/26 (QC_FORCE) · PENDING-REAL 3 · residue tag qc-ai-t0.1-6rbwqi` · `JSON_SUMMARY {"total":26,"passed":23,"findings":[{"id":"T0.1-S1.5","sev":"MINOR","pending":"PENDING-REAL"},{"id":"T0.1-S2.3","sev":"MINOR","pending":"PENDING-REAL"},{"id":"T0.1-S4.4","sev":"MINOR","pending":"PENDING-REAL"}],"pendingReal":3}` · exit 0
- forced #2: `🟡 T0.1: 23/26 (QC_FORCE) · PENDING-REAL 3 · residue tag qc-ai-t0.1-ne3iuz` · same JSON_SUMMARY · exit 0
- unforced: `🟡 T0.1: 23/26 · PENDING-REAL 3 · residue tag qc-ai-t0.1-ri027o` · same JSON_SUMMARY · exit 0
- (an earlier forced run on the pre-commit file, before the mock switch was re-read after the env load, was also 23/26 — not kept in green.txt)
- every other check green in all three, including S5.1–S5.5 (no conversation left · wallet equal · one ADJUST per run · every AT-1 table count and the AiUsage net unchanged · no temp dir, worktree unchanged, safety net not needed) and X10.1/X10.2/X11.1–X11.3.
- mock figures (meaningless as prices): full run 30 rows, 149,544 micro, 33 USAGE rows + 1 ADJUST; capped run 1 row, 3,312 micro, `stoppedByCap: true`.
- AT-1 wallet: opened lazily by the first probe run with the welcome grant; `walletBeforeMicro` = `walletAfterMicro` = 10,000,000 (US$10) in every run since ⇒ above cap + US$1 for the real run (the controller still checks, brief error 5).

Builder failure-path tests (mock, dummy key, one lock hold — end of green.txt):
- A `SHARK_AI_DAILY_REQ=1`: run 1 measured, run 2 `sendMessage returned over_budget/day` ⇒ exit 2, partial file written with 1 row + `failure{}`, 2 conversations deleted (incl. the pre-created history room), refund 3,312, wallet restored, residue none.
- B `SIGTERM` after run 3 started: the turn in flight finished, run 5 not started (`interrupted by a signal`) ⇒ exit 2, file with 4 rows, refund 14,420, wallet restored, residue none.
- C clean 1-round run right after A and B: exit 0, 10 rows, wallet restored, residue none (A and B left a consistent tenant).

Not run by the builder (controller's): `pnpm typecheck`, fitness, the earlier AI-team oracle (`qc-ai-t0.2`), the baseline set — no product file changed in this WO.

## 6. Real run — command for the controller
```
bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env AI_COST_PROBE=1 COST_CAP_USD=3 pnpm exec tsx scripts/ai-team-cost-probe.mts
```
- `SHARK_AI_MOCK` must NOT be 1 (neither exported nor in the QC env file — the probe re-reads it after the env load and refuses to write a mock result to the ledger file); `PROBE_OUT` unset ⇒ `ledger/AI-TEAM-COST-2026-10.md`; `PROBE_ROUNDS` unset ⇒ 3 ⇒ 30 turns.
- `iso.sh` passes only PATH/HOME/QC_ENV_FILE/NODE_OPTIONS into the unit: every switch goes after `env` inside the wrapper, as above. The provider key, `SHARK_AI_MODEL`, `SHARK_AI_PRICE_MARKUP`, `SHARK_THB_PER_USD` come from the QC env file / the controller — the probe sets none of them. For the default routing the oracle expects, `SHARK_AI_MODEL` must be blank (the first stdout line says `routing auto|forced`); for list price ×1 the markup must be 1 (the file prints `price markup ×N`); `thbPerUsd` is printed in §4 of the file (36 unless `SHARK_THB_PER_USD` is set).
- Expected duration: 30 real turns with tools, roughly 5–15 min, plus ~10 s of snapshots/cleanup, plus the lock wait. Progress: one stdout line per run with the running total in micro.
- First line says `wallet before: OK|LOW`; LOW in a real run ⇒ refused (exit 2, nothing written): fund AT-1 (`ADJUST qc-ai-t0.1-fund-<date>`), run again.
- Afterwards inspect: (1) exit code 0 and the last two stdout lines (`cleanup · … wallet restored · residue none · file written`, `PROBE_RESULT {…"runs":30…}`); (2) in the file: `provider: real`, 30 rows, model ids, `tool calls` > 0 on the tool types, `cleanup.deleted` (what real tools created: AiProposal / AiPlan / AiMemory / KbArticle …), `cleanup.residue: []`, `cleanup.unlistedUsageMicro: 0`, `cleanup.problems: []`, `failure: null`; (3) re-run the oracle forced ×2 + unforced ⇒ 26/26; (4) AT-1 table counts by hand as planned (the probe's own residue check already compares all 299 tenant models).
- If it exits 2: stderr names the run and a scrubbed reason; the file holds what was measured (do not use it for pricing); the wallet is refunded and the rooms are deleted anyway. Delete the partial `ledger/AI-TEAM-COST-2026-10.md` before the next attempt is judged (with it present S1.5/S2.3/S4.4 are CRITICAL).

## 7. Disputes / technical decisions
- No ORACLE-EDIT request (see the final section if that changed).
- Decisions the contract left open, taken by the builder (reversible, all in the probe file):
  - FREE trial options: proposed = 100 × weightedMeanMicro · alternative 1 = 50 × weightedMeanMicro (the mockup figure) · alternative 2 = 20 % of the 490 THB pack allowance. The file also prints USD/THB per free shop per month. The controller/owner picks in T0.4.
  - Real run with a LOW wallet is refused (not merely warned).
  - A failed run stops the measurement (no retry) — a second attempt would double-charge that type and skew its mean.
  - Extra fields in `probe-data` (not read by the oracle): `routing`, `priceMarkup`, `failure`, `cleanup.{unlistedUsageMicro, deleted, residue, problems}`.
- Model-call paths added by this WO: none in product code. The probe's turns are charged by the normal path (CHAT / AUTO_TITLE) and refunded with one ADJUST row per run.
- Access: nobody gains or loses anything.

## 8. Debt / not done
| Item | Reason | Closed by |
|---|---|---|
| S1.5 · S2.3 · S4.4 | need the real result file | controller real run + oracle re-run |
| `pnpm typecheck` / fitness with the new `.mts` | not a builder task in this WO (controller runs them) | controller |
| cleanup of real-model side effects (proposals, memory, KB) | cannot be exercised under mock (MockProvider never calls a tool); only the delete code paths with 0 matching rows ran | controller compares AT-1 after the real run (`cleanup.residue` must be empty) |

## 9. QC4 state
Left on AT-1 by design: the USAGE rows of every probe run + one `ADJUST qc-ai-t0.1-refund-<runId>` per run (append-only ledger). Wallet balance, AiUsage of the day and the row count of every other tenant table are equal before/after each run (oracle S5.1–S5.5 green).

## Controller measurement + acceptance run (2026-10-08/09)
- REAL run 1 (20:57Z): stopped at run 9/30 with `over_budget/day` — the tenant daily net (400,000 tokens, `provider.ts` dailyLimits) was full after 8 real tasks. Spend US$0.942669 list. Cleanup complete, residue none. Partial file kept outside the repo (`/tmp/ai-t0.1-real/run1/`).
- REAL run 2 (21:2x–21:45Z): `SHARK_AI_DAILY_TOKENS=8000000 SHARK_AI_DAILY_REQ=2000 COST_CAP_USD=3.9` (env knobs of provider.ts, no code change). 29/30 rows, `stoppedByCap: true` (teach-back round 3 not measured), spend US$4.038957 list. Cleanup: 29 conversations, wallet restored, residue none. Result = `ledger/AI-TEAM-COST-2026-10.md`.
- Total real spend of T0.1: **US$4.98 list price** (brief budget 3; KICKOFF cap 5). Cap overshoot of one task is by design (cap is checked before a run starts).
- ORACLE-EDIT T0.1-S1.5 (controller): a cap-stopped real file is accepted when every type has ≥ 2 runs (AI-TEAM-RUN §4).
- Controller re-run after the real file exists: oracle forced 26/26 ×2 exit 0 · unforced 26/26 exit 0 · qc-ai-t0.2 41/41 · qc-ai-credit 32/32 · qc-ai-usage exit 0 · fitness 42/42 · `pnpm typecheck` exit 0.
- NOT done: fresh reviewer (gate D9) — the owner ordered a pause before it could be spawned ⇒ T0.1 stays 🔍 until a read-only review of `scripts/ai-team-cost-probe.mts` (cleanup scoping!) is done at resume. Hunter not required.
- Findings for later WOs: weighted mean 99,449 micro/task (≈ 3.58 THB list) · input tokens 8k–131k per task (tool definitions + context dominate) · packs at 50 % margin ≈ 68 / 208 / 557 tasks · the daily net blocks a shop after ~8 real tool tasks (owner question Q5; T3.1 must scale it with the pack) · `cachedTokens` not read by the provider layer, so list price overstates the bill by an unknown amount.
