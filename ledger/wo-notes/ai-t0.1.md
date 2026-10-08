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

## 5. Results
(see the end of this file — filled after the green runs)

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
