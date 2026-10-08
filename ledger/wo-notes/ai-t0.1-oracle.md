# T0.1 — oracle notes (oracle writer → controller)

> Oracle `scripts/qc-ai-t0.1.mts` · branch `wip/pos-ai-t0.1-oracle` · base `session/ai-team` 0ea0377f · 8 Oct 2026
> Contract = the header of the oracle (sections [1]–[5]). Red/SKIP output on the base: `ledger/wo-notes/ai-t0.1-red.txt`.
> Not committed, not pushed. No product file was created or edited. The real provider was never called.

## 1. How it runs
- Unforced: SKIP + exit 0 while `scripts/ai-team-cost-probe.mts` is missing, or when the database is not QC4 (no connection opened in the first case).
- Forced (`QC_FORCE=1`): every check runs; with the probe missing each check is RED with `act scripts/ai-team-cost-probe.mts missing`, no stack trace. Forced on a non-QC4 host = exit 4. Fixed total 26.
- Exit 1 iff a CRITICAL/MAJOR check fails. The three REAL-FILE checks are `PENDING-REAL` (MINOR, shown ⏳, counted not green, exit code unaffected) while `ledger/AI-TEAM-COST-2026-10.md` is absent; once it exists they are CRITICAL.
- The probe is only ever started as a child process, 4 times: (G) without `AI_COST_PROBE`, (M) mock without `PROBE_OUT`, (F) full run with defaults, (C) `COST_CAP_USD=0.000001`. Child env, set explicitly: `SHARK_AI_MOCK=1`, `SHARK_AI_KEY=<random canary>` (exported values win over the QC env file, so the real key never reaches the child; a probe that ignored the mock flag could not buy a completion), `SHARK_AI_MODEL=" "` (blank = auto-routing for `pickModel`), `SHARK_AI_PRICE_MARKUP=1`, `SHARK_THB_PER_USD=37.5` (catches a hard-coded 36), `SHARK_AI_DAILY_REQ/TOKENS` huge (the daily net cannot fail a run). `PROBE_OUT` is always under `os.tmpdir()/qc-ai-t0.1-<rand>`.
- Base result (8 Oct): forced `1/26`, exit 1 (22 red "probe missing", 3 PENDING-REAL, S5.5 green) · unforced SKIPPED, exit 0 · no temp dir left, worktree unchanged, 0 rows written.
- What the oracle writes to QC4: nothing of its own. The probe's ledger rows (USAGE + one ADJUST refund per run) stay on AT-1 by design (append-only ledger; ≈ 33 rows per oracle run once the probe exists). If a broken probe leaves conversations / AiUsage / a wallet drift, the check is RED and a safety net in `finally` restores AT-1 (only then it writes one `ADJUST` row ref `qc-ai-t0.1-oracle-fix-<rand>`, and S5.5 turns red to say so).

## 2. What MockProvider reports (decides the shape of S1 / S3)
`src/lib/ai/provider.ts:95–105`: `tokensIn = ceil(Σ message chars / 4)` (> 0 — the system prompt is always present), `tokensOut = ceil(reply chars / 4)` (> 0), `model: "mock"`. `sendMessage` charges with `routedModel` (`service.ts:118` + `:342–348`), so under mock the CHAT ledger row carries the haiku/sonnet id, tokens > 0 and `amountMicro < 0` (`pricing.ts:39–46`, minimum 1 micro). The AUTO_TITLE row is charged with `reply.model` = `"mock"` (`mobile/chat.ts:82–88`) → fallback (opus) rate.
⇒ "all fields > 0" is asserted under mock (S1.2), and a cap of 1 micro stops after exactly one run (S3.2). What mock cannot prove is that the numbers are real — hence the REAL-FILE checks.

## 3. Checks (26 = 12 of the contract + 9 extra S + 5 X)
| id | sev | proves |
|---|---|---|
| S1.1 | CRIT | [mock] full run with defaults exits 0; `probe-data` has the contract shape: provider mock, 10 types (key/category/path, in order), rounds 3, cap 3, 30 rows in round-major order, tenant AT-1, actor at-owner |
| S1.2 | CRIT | [mock] every row: tokensIn/tokensOut/micro/wallMs > 0, model = FAST_MODEL or SMART_MODEL, toolCalls ≥ 0, cachedTokens null/≥ 0, its own conversation id `u~<at-owner>~…`, ≥ 1 ledger id |
| S1.3 | CRIT | [mock] the markdown table (fixed 10-column header) equals the rows cell for cell |
| S1.4 | MAJOR | [mock] p50/p95 (nearest rank) and mean per type recomputed |
| **S1.5** | PENDING-REAL → CRIT | real file: provider `real`, 30 rows, all > 0, real model ids (not `mock`), table = data, totals = Σ rows, spend ≤ cap (+ one run) |
| S2.1 | CRIT | [mock] per row: the USAGE rows of its conversation in QC4 are exactly `txnIds`; Σ micro and Σ tokens equal the row |
| S2.2 | CRIT | [mock] totals = Σ rows = Σ ledger; every USAGE row AT-1 gained during the run belongs to a listed conversation; every conversation seen live is listed |
| **S2.3** | PENDING-REAL → CRIT | real file: Σ micro = Σ `AiCreditTxn` rows still in QC4, looked up by `txnIds`; no extra USAGE row for the listed conversations |
| S3.1 | CRIT | [mock] full run: 0 < spend ≤ 3,000,000 micro, not stopped, stdout ends with `PROBE_RESULT {…}` equal to the file |
| S3.2 | CRIT | [mock] `COST_CAP_USD=0.000001`: exit 0, exactly 1 run (type 1 round 1), `stoppedByCap: true`, `STOPPED BY CAP` in the text, spend = ledger |
| S3.3 | CRIT | without `AI_COST_PROBE`: exit 0, no file, no row in any AT-1 table, wallet and AiUsage untouched |
| S3.4 | MAJOR | mock without `PROBE_OUT`: exit ≠ 0, the real ledger file untouched, no row |
| S4.1 | CRIT | [mock] weights = default mix, Σ = 1, named in the text; `categoryMeanMicro` and `weightedMeanMicro` recomputed from the rows |
| S4.2 | CRIT | [mock] 490/1490/3990: `revenueMicro`, `allowanceMicro` (and 2 × allowance ≤ revenue), `approxTasks` recomputed; `thbPerUsd` = the pinned 37.5; formula names + numbers in the text |
| S4.3 | MAJOR | [mock] FREE trial: proposed + exactly 2 alternatives, three different allowances, approxTasks recomputed, a note each |
| **S4.4** | PENDING-REAL → CRIT | real file: per-type stats, weighted mean, packs, FREE trial recomputed from its own table (its own weights and thbPerUsd) |
| S5.1 | CRIT | after the full and the capped run: 0 `AiConversation` rows for the listed ids, 0 rows in any table with a `conversationId` column (ledger excepted), 0 new conversations |
| S5.2 | CRIT | wallet balance before = after, per run (a wallet opened lazily by the first turn is expected at its welcome grant) |
| S5.3 | CRIT | exactly one ADJUST row per run: ref `qc-ai-t0.1-refund-<runId>`, + spent, `balanceAfter` = balance before; `cleanup{}` in the file agrees |
| S5.4 | MAJOR | row count of every tenant table of AT-1 unchanged (ledger: new USAGE rows = listed ids); AiUsage requests/tokens of every day given back |
| S5.5 | MAJOR | oracle residue: no temp dir, identical `git status` for scripts/src/prisma/docs + the real ledger file, safety net not needed |
| X10.1 | CRIT | stdout + result files: no secret of this env, no canary key, no key pattern, no Bearer header, no provider host, no URL; stderr: no secret |
| X10.2 | CRIT | [static] probe: no key literal, no env-file access, env through `loadAiTeamQcEnv()`, never prints secret variables, `CONTROLLER-RUN` header; real file clean when present |
| X11.1 | CRIT | [static] uses `sendMessage`, `createConversation` + `sendMobileChat`, refund through `topUp`; no `chargeUsage*`, no AiCreditTxn/Wallet write, no `$executeRaw`, no provider class, no `fetch`, no assignment of `SHARK_AI_*` switches |
| X11.2 | CRIT | [mock] per run exactly one CHAT row, model = row model, every row priced exactly `costMicroUsd(model, tokensIn, tokensOut)`; exactly one AUTO_TITLE row on the mobile-path type, none elsewhere |
| X11.3 | CRIT | [mock] seen live (200 ms poll while the child runs): ≥ 2 conversations with a USER + ASSISTANT pair whose answer starts with MockProvider's `รับทราบ` and has tokensIn > 0; none unlisted |

## 4. Things the header fixes that the brief left open (controller: confirm or change before the builder starts)
- **OQ-1 AiUsage is given back.** Not in the brief. The daily net is 300 requests / 400k tokens per tenant (`provider.ts:220–226`); a real 30-run measurement and every mock oracle run add to AT-1's row of the day, and later AI-team oracles of the same day would hit `over_budget/day`. Contract [5] requires the probe to decrement what it added (S5.4, MAJOR).
- **OQ-2 Mock without `PROBE_OUT` is refused** (S3.4, MAJOR). Addition: otherwise one mock run without the variable replaces the measured ledger file.
- **OQ-3 One user turn per run, cleanup in one phase at the end.** "New conversation per run" + "one CHAT row per conversation" makes S2/X11.2 exact; the 10-message history of type 2 is inserted as rows, not generated. Cleanup at the end (not per run) is what lets X11.3 observe the messages.
- **OQ-4 Type → category map and round-major order** are fixed in the header (`follow-up-silent` → summaries, `review-reply` → content, `invoice-from-quotation` → quotation). The brief gives 5 weights for 10 types without a map.
- **OQ-5 Formulas.** `revenueMicro = round(price / thbPerUsd × 1e6)`, `allowanceMicro = floor(revenue × (1 − margin))`, `approxTasks = floor(allowance / weightedMeanMicro)`, `weightedMeanMicro = ceil(Σ weight × category mean)`; percentiles by nearest rank (with n = 3: p50 = middle, p95 = max). Tolerance ±1 on allowance and weighted mean, exact elsewhere.
- **OQ-6 "tool rounds" → `toolCalls`.** `sendMessage` exposes no round counter; the only observable is `deps.onToolCall` (`service.ts:107`, excludes `load_skill`). Column header `tool calls`.
- **OQ-7 `cachedTokens` is null.** `OpenRouterProvider` reads only `prompt_tokens` / `completion_tokens` (`provider.ts:178`, `:198–199`).
- **OQ-8 The optional extra sonnet round** (brief "Decisions") would break S1.5 (`rows = 10 × rounds`, exactly 30). If wanted, it needs a second file or an ORACLE-EDIT.
- **OQ-9 Real file freshness.** S2.3 needs the listed ledger rows to still be in QC4; a QC4 branch reset after the measurement turns it red.
- **OQ-10 Exit code with PENDING-REAL.** A mock-green oracle exits 0 with 23/26 and `pendingReal: 3` in JSON_SUMMARY; the final line is 🟡. Say so if the gate should stay red until the real file exists.

## 5. Found wrong / inconsistent in the brief (evidence)
1. **Fixed refund ref cannot be reused.** `AiCreditTxn` has `@@unique([tenantId, ref])` (`prisma/schema/ai_credit.prisma:83`) and `topUp` swallows P2002 and returns `credited: false` (`src/lib/ai/credit.ts:225–229`). With the ref `qc-ai-t0.1-refund` of the brief only the first probe run ever on AT-1 is refunded; every later run (the oracle alone does two per run) silently drains the wallet. Contract: `qc-ai-t0.1-refund-<runId>`.
2. **"Through the mobile path" does not charge AUTO_TITLE by itself.** `sendMessage` creates the conversation with `title: titleFrom(text)` (`service.ts:195–197`), and `autoTitle` returns when the title is not empty (`mobile/chat.ts:73`). Only a conversation opened first with `createConversation(ctx)` (empty title, `mobile/conversations.ts:42–46` — what the app does) reaches the AUTO_TITLE charge. `qc-mobile-chat` MC-2.4 passes either way. Contract [2] fixes the mobile path as createConversation + sendMobileChat; X11.2 asserts the AUTO_TITLE row.
3. **Brief S3 "COST_CAP_USD=0.01 → stops after first run"** holds only if the first mock run costs ≥ 10,000 micro, which depends on the system prompt length. The oracle uses 0.000001 (1 micro), where it is certain.
4. **"model picked" under mock** is not `mock`: the ledger stores the routed model (see §2). A mock file and a real file cannot be told apart by model id, so `probe-data.provider` exists and S1.5 requires `real`.
5. **Ledger cost ≠ provider bill.** Prompt caching is always on (`provider.ts:152–156`) but the charge uses `prompt_tokens` at list price (`service.ts:342`, `pricing.ts:39`). T0.1 measures what SHARK charges a tenant (R-E C34), not what OpenRouter invoices; the pack margin computed from it is on list price.
6. **Low wallet distorts the measurement.** Below 500,000 micro `sendMessage` degrades to haiku (`service.ts:35`, `:146–156`); at ≤ 0 it refuses. Not machine-checked; the controller should look at AT-1's balance before the real run (cap 3 USD + 0.5).
7. **Real-model side effects** (`remember_fact` on the teach-back prompt, proposals for quotation/invoice) are covered generically by S5.4 under mock only — MockProvider never calls a tool. After the real run the controller should compare AT-1 `AiMemory` / `AiProposal` counts by hand.

## 6. Not verified
- **The green path.** The oracle was run only on the base (probe missing). No probe was placed in the worktree — that file is the builder's. A scratch reference probe written to the contract is at `/tmp/qc-t01-notes/ref-probe.mts` (outside the worktree, never executed); the controller can copy it to `scripts/ai-team-cost-probe.mts` for a positive control or discard it. Until some probe runs, the validators, the live poll (X11.3) and the 37.5 pin are unexercised; an ORACLE-EDIT on first contact is possible.
- Whether `process.loadEnvFile` keeps a blank exported `SHARK_AI_MODEL=" "` over a value in the QC env file (expected: exported wins). If not, and the QC env forces a model, S1.2 still passes for a haiku/sonnet id; a forced other model would turn it red.
- Type-check: not run (no typecheck in this role). Missing things are reached by child process only; dynamic imports are of files that exist today.
- Duration with the probe present (estimate: 4 children, ~32 mock turns, a few minutes on Neon).
