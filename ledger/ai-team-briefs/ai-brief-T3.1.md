# T3.1 — Subscription · monthly cycle · pack-before-wallet charging (Opus · server lane) 🎯 hunter (quota)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A2/R-A3, R-C1/R-C5, R-E C2/C3/C4/C5/C6/C19 first. Contract: AI-TEAM-RUN §2 T3.1. Must land **before** T3.6. Owner questions Q4/Q5 defaults apply.

## Verified facts (REVIEW §2.3)
- Charging choke point: `chargeUsage(ctx, input)` `credit.ts:119–146` (tx: `AiCreditWallet.balanceMicro decrement` + `AiCreditTxn` USAGE with `balanceAfter`; may go negative), `chargeUsageSafe` `:152` (17 callers), `chargePlatform` `:166` (platform ledger `__platform__`), `canSpend(tenantId)` `:74` (= `balanceOf > 0`, calls `ensureWallet` which grants $10 lazily), `canSpendPeek` `:85` (no write, but reads `welcomeGrantMicro()`), `balanceOf` `:69`, `ensureWallet` `:34`.
- `service.ts:127` blocks chat when `!canSpend`; `:146` degrades to FAST_MODEL when balance < `LOW_BALANCE_MICRO` ($0.50); daily net `AiUsage` `:133–141` (keep — Q5).
- `AiUsageWindow` is dead code (C4) — do not touch.
- Sources: `AiCreditSource` 14 values; `SUPPORT_DRAFT` is platform-paid (goes through `chargePlatform`?) — verify which function the support-draft path calls and keep it off the pack.
- Owner rule for FREE binding (C2): OWNER membership with oldest `acceptedAt`, tie → oldest `createdAt`; no OWNER → bind to tenant. Owner transfer path `platform/account-deletion.ts:90`.
- Tables (T1.1): `AiSubscription`, `AiPackBinding`, `AiEmployee.usedMicroCycle/cycleKey`, `AiCreditTxn.subscriptionId/aiEmployeeId`.
- Bangkok month boundaries: use the repo's BKK helpers (`rules.ts#dayKeyBangkok`, `usage.ts#weekStartBangkok` pattern) to compute `cycleStart/End` as the 1st of the month 00:00 Asia/Bangkok; `cycleKey = "YYYY-MM"`.

## Deliverables (`src/lib/ai/team/quota.ts` + hunks in `credit.ts`, `service.ts`)
- `ensureBinding(tenantId, tx?) → { subscriptionId, ownerUserId | null }` — `AiPackBinding` lookup; create: resolve owner by the rule; find/create `AiSubscription{ ownerUserId, pack FREE, allowanceMicro: FREE_PACK.allowanceMicro, cycle… }` (unique partial index catches races → re-read); no owner → `AiSubscription{ tenantId }`.
- `ensureCycle(subscriptionId, now, tx?)` — if `now ≥ cycleEnd`: single `updateMany({ where: { id, cycleEnd: { lte: now } }, data: { cycleStart, cycleEnd, usedMicro: 0, lastResetKey } })` (idempotent) and reset `AiEmployee.usedMicroCycle` for employees of bound tenants where `cycleKey ≠ newKey` (single `updateMany`); T3.3's cron calls this too.
- `chargeToPack(tx, { subscriptionId, aiEmployeeId?, micro }) → { packMicro, overflowMicro }` — **one** `UPDATE "AiSubscription" SET "usedMicro" = "usedMicro" + LEAST($micro, GREATEST("allowanceMicro" - "usedMicro", 0)) WHERE id=$1 RETURNING "usedMicro", "allowanceMicro"` (raw SQL via `tx.$queryRaw`), derive `packMicro`/`overflowMicro`; then `UPDATE "AiEmployee" SET "usedMicroCycle" = "usedMicroCycle" + $micro WHERE id=$aiEmployeeId AND "cycleKey" = $key` (employee counts the full amount, pack or overflow).
- `credit.ts#chargeUsage` hunk: inside the existing tx: `binding = ensureBinding(tenantId, tx)`, `ensureCycle`, `{packMicro, overflowMicro} = chargeToPack(...)`; wallet decrement only `overflowMicro` **and only if** `overflowMode === WALLET` (2.0: PAUSE ⇒ overflow is recorded on the txn `note` and **not** charged to the wallet; the call still succeeds — the *next* `canRunAi` returns false); `AiCreditTxn` gets `subscriptionId`, `aiEmployeeId`, `amountMicro` = full cost (negative) and `balanceAfter` = wallet balance (unchanged in PAUSE). `chargePlatform` untouched. Source `SUPPORT_DRAFT` bypasses the pack (if it goes through `chargeUsage`, branch on source).
- `canRunAi(tenantId, { aiEmployeeId? }) → { ok, reason?: "team_quota_exhausted"|"employee_quota_cap"|"team_paused"|"wallet_empty" }` — pack left > 0 (or overflow WALLET && wallet > 0) and (employee: `usedMicroCycle < cap%×allowance`, status ACTIVE) and `AiSettings.teamPausedUntil` not in the future; `canSpend(tenantId)` and `canSpendPeek` become `canRunAi(tenantId).ok` (names kept; `ensureWallet` is no longer called from `canSpend` — wallet creation happens only on top-up/charge; verify every caller of `balanceOf` tolerates "no wallet" = 0 — `peekWallet` from T1.10).
- `quotaSnapshot(tenantId) → { pct, state: "OK"|"WARN80"|"WARN95"|"EXHAUSTED"|"PAUSED", cycleEnd, daysLeft, sharedAcrossTenants: boolean, perEmployee: [{ aiEmployeeId, pct, capPct, paused }] }` — percentages only (X10).
- `service.ts:146` degrade: `pct ≥ DEGRADE_PCT` (packs.ts) → FAST_MODEL; wallet balance no longer considered. `service.ts:127` uses `canRunAi` and returns `{ ok:false, error:"over_budget", scope:"credit" }` as today (shape kept for the 1.0 app) with the Thai message from `team.quota.*`.
- Migration `_ai_team_b` **only** if a column is missing (expected: none).

## Files you own
`src/lib/ai/team/quota.ts`, hunks: `src/lib/ai/credit.ts` (`chargeUsage`, `canSpend`, `canSpendPeek`, `ChargeInput`), `src/lib/ai/service.ts` (`:127`, `:146`), `index.ts`. Not: the 17 callers.

## Acceptance (oracle `qc-ai-t3.1`)
S1 binding rule + owner-shared · S2 cycle idempotent/reset · S3 X3 20 parallel charges exact · S4 3 real callers charge the pack not the wallet; SUPPORT_DRAFT platform · S5 exhausted + PAUSE → `canRunAi` false, wallet untouched · S6 WALLET flag closed · S7 degrade by pct · S8 snapshot DTO no micro · S9 tenants without binding when team flag is off? — **ruling: binding is always created lazily** (there is no "off" mode); S9 instead asserts a tenant with zero employees still charges its pack and chat works · S10 daily net still blocks · S11 txn columns. Regressions: `qc-ai-credit` `qc-ai-usage` `qc-ai-tools` `qc-mobile-chat` + `qc-crm-c1.10` + chat translate/suggest suites + member reviews suites.

## Controller rulings
- Allowance of the FREE pack applies per owner; a tenant bound to itself (no OWNER) gets its own FREE allowance.
- Negative wallet balances from the past are left alone.
- Hunter lens: any path that charges without going through `chargeUsage` (grep `balanceMicro` writes), and whether `ensureCycle` can double-reset across two subscriptions of the same owner.
