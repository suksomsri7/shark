# T0.1 — Measure the real cost per task (CONTROLLER-RUN · real model · spend cap US$3)
Read `ai-brief-COMMON.md` first. Contract: AI-TEAM-RUN §2 T0.1. Design: DESIGN §7.1 (the pack task counts in the mockups are unmeasured guesses). Rulings: RESOLUTIONS R-A5, R-E C34.

## Verified facts (REVIEW §2)
- `sendMessage(ctx: SendCtx, input, deps?)` `src/lib/ai/service.ts:97` — `SendCtx = {tenantId, actor}`; charges via `chargeUsageSafe` at `:342` (source `deps.source ?? "CHAT"`, no `userId`).
- Model choice `pickModel(text, hasImages)` `provider.ts:49` (FAST `anthropic/claude-haiku-4.5`, SMART `anthropic/claude-sonnet-5`; env `SHARK_AI_MODEL` forces one). `resolveProvider()` returns `MockProvider` when `SHARK_AI_MOCK=1` — this WO **unsets** it.
- Cost rows: `AiCreditTxn` (`ai_credit.prisma:56–74`) kind USAGE, `amountMicro` negative, `model`, `tokensIn/Out`, `conversationId?`. Price table `pricing.ts:23` (haiku 1/5, sonnet 3/15 per M tokens × `SHARK_AI_PRICE_MARKUP`).
- Mobile chat also charges AUTO_TITLE (`src/lib/mobile/chat.ts:82`) — measure once through the mobile path to include it.
- Daily net `AiUsage` (300 req / 400k tokens per tenant per day) — 30 runs fit.

## Deliverables
- `scripts/ai-team-cost-probe.mts` (controller-run only; header `// CONTROLLER-RUN · real provider · never in qc:all` and a guard `if (!process.env.AI_COST_PROBE) exit 0` so qc-all's auto-discovery skips it).
  - Tenant AT-1 (seed of T0.2 — if T0.2 is not merged yet, use the CRM seed tenant and say so), actor = `aiMemberActor(at-owner)`.
  - 10 task prompts (Thai, realistic, in the file): 1 chat reply (short) · 2 chat reply with 10-message history · 3 quotation 2 lines + 5 % discount · 4 stalled-deals summary · 5 follow-up silent customers · 6 draft a FB post · 7 reply to a 1-star review · 8 invoice from quotation · 9 daily summary · 10 teach-back (reject + rule) — each × 3 rounds; new conversation per run.
  - Per run: capture `pickModel` result, tool rounds, `AiCreditTxn` rows for that conversationId (sum micro, tokens), wall time. Stop when cumulative spend ≥ `COST_CAP_USD` (default 3).
  - Output `ledger/AI-TEAM-COST-2026-10.md`: 30-row table · p50/p95 per type · weighted mean (weights = expected mix, written in the file) · pack math: for each price (490/1,490/3,990 THB at `thbPerUsd()` from `topup.ts:18`) the allowanceMicro that keeps margin ≥ 50 %, and `approxTasks = allowance / weighted mean` · a proposed FREE trial allowance (R-A5) with 2 alternatives.
  - Cleanup: delete the probe conversations/messages/proposals; credit the wallet back with an ADJUST txn ref `qc-ai-t0.1-refund` (so AT-1 wallet is unchanged) — or run on a throwaway tenant and delete it.
- Report the actual spend to the owner in the CP0 message.

## Files you own
`scripts/ai-team-cost-probe.mts` · `ledger/AI-TEAM-COST-2026-10.md`.

## Acceptance (oracle `qc-ai-t0.1` · runs against the produced files + QC4, mock provider)
S1 30 rows, all fields > 0 · S2 Σ micro = Σ txn rows of the measured conversations (the probe writes the ids into the md as a hidden table) · S3 cap stop (run the probe with `COST_CAP_USD=0.01` and mock → stops after first run) · S4 pack formula reproducible from the table · S5 cleanup verified (no probe conversations, wallet balance equal before/after).
X11 the probe itself charges through the normal path (no bypass); X10 no key in output.

## Decisions for the controller
- Expected mix weights (default: chat 50 %, quotation 10 %, summaries 20 %, content 10 %, teach 10 %).
- Whether to also measure with `SHARK_AI_MODEL` forced to sonnet for the chat types (recommended: yes, 1 extra round each, if under cap).

## Controller addendum + rulings (2026-10-08 · the oracle header [1]–[5] is the contract)
- Base `wip/pos-ai-t0.1-oracle` @ session/ai-team 0ea0377f (T0.2 merged: AT-1 seed + `loadAiTeamQcEnv()`/`atIds()`). Builder branch `wip/pos-ai-t0.1`, tree `/root/projects/shark-ai-b`.
- OQ-1…OQ-7, OQ-9 ✅ as fixed in the oracle header (daily-net give-back · mock refuses without PROBE_OUT · one user turn per run, history inserted as rows, single cleanup phase · type→category map · formulas/rounding · `toolCalls` · `cachedTokens: null`).
- OQ-8: the 30-row file contains ONLY the default routing. No forced-sonnet round inside it (the brief's "recommended extra round" is dropped; if wanted later it is a second file with `PROBE_OUT` elsewhere).
- Brief error 1 ✅ refund ref = `qc-ai-t0.1-refund-<runId>` (a fixed ref would refund only once). Error 2 ✅ the mobile type = `createConversation(ctx)` then `sendMobileChat` so AUTO_TITLE is charged. Error 3 ✅ cap test uses 0.000001.
- Brief error 4: the ledger is LIST price (prompt tokens at full rate although caching is on). The cost file must say so in one line: "figures are list price from AiCreditTxn; the provider bill can be lower (cache)". Pack math stays on list price (conservative).
- Brief error 5: before the REAL run the controller checks AT-1's wallet (≥ cap + US$1, otherwise the service degrades to haiku below $0.50) and funds it with an ADJUST txn `qc-ai-t0.1-fund-<date>` if needed — outside the probe, recorded in wo-notes. The probe prints `walletBefore` as "OK"/"LOW" only (no amount on stdout is required by the oracle; follow the header).
- Gate: T0.1 is accepted only at **26/26** — i.e. after the controller's real run produced `ledger/AI-TEAM-COST-2026-10.md` and the oracle was re-run with S1.5/S2.3/S4.4 CRITICAL green. 23/26 under mock = "builder done, controller measurement pending".
- After the real run the controller compares AT-1 table counts by hand (AiMemory/proposals created by real tool calls must be cleaned by the probe's cleanup; anything left is a probe bug).
- Reference probe draft left by the oracle writer at `/tmp/qc-t01-notes/ref-probe.mts` (never executed): the builder may read it but must write and verify its own file.
