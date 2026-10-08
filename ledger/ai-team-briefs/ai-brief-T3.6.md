# T3.6 — Owner-bound FREE pack · no welcome credit · "notify me when on sale" (Opus · server lane · **after T3.1**)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A3/R-A4, R-E C2/C3/C19 first. Contract: AI-TEAM-RUN §2 T3.6. Owner question Q2 default: existing balances kept.

## Verified facts (REVIEW §2.3, §3)
- `ensureWallet(tenantId)` `credit.ts:34–67` creates the wallet with `balanceMicro: welcomeGrantMicro()` + GRANT txn `ref:"welcome-grant"`; called from `balanceOf/canSpend` (T3.1 removed the `canSpend` call), `creditView` (`ai/actions.ts:69`), `GET /api/mobile/usage` (T1.10 switched to `peekWallet`), `topUp`, `chargePlatform`.
- `welcomeGrantMicro()` `:22` env `SHARK_AI_WELCOME_USD` default $10; `canSpendPeek` `:85` reads it (T3.1 rewrote `canSpendPeek`).
- Owner transfer: `src/lib/platform/account-deletion.ts:90` (transfer path) — hook point for re-binding.
- `/api/mobile/usage` shape frozen; `pct` semantics change to pack % here; `balanceMicro` keeps the wallet number; `blocked` = `"credit"` when `canRunAi` false (so build #24 shows its existing "blocked" state).

## Deliverables
- `credit.ts#ensureWallet`: grant only when `packs.AI_WELCOME_GRANT === true` **and** env allows; otherwise create the wallet with 0 and no GRANT row (`grantedAt` stays null). Existing wallets untouched (S2).
- `quota.ts#rebindOwner(tenantId, newOwnerUserId, actor)`: called from the owner-transfer path (hunk at `account-deletion.ts:90` or the transfer service it calls): delete/replace `AiPackBinding`, `ensureBinding` again, audit `ai.pack.rebind` with before/after; if the old subscription has no more bindings it stays (history).
- `AiSaleNotify`: `saleNotify(ctx, userId, pack)` idempotent (unique), rate limited (`checkRateLimitDb` bucket `team-sale-notify` 10/min per user); route `POST /api/mobile/team/sale-notify`; export list helper for the owner (`scripts/ai-team-sale-notify-export.mts` CSV via `csvRow`).
- `/api/mobile/usage` content: `pct` = pack pct, `used/limit` = pct-scaled integers (0–100) to keep ints, `warn` = pct ≥ 80, `degraded` = pct ≥ 95, `blocked` = `canRunAi.ok ? null : "credit"`, `resetAt` = `cycleEnd`, `balanceMicro` = wallet or 0.
- Docs/i18n updates.

## Files you own
hunks: `src/lib/ai/credit.ts` (`ensureWallet` only), `src/lib/platform/account-deletion.ts` (or transfer service — name it), `src/app/api/mobile/usage/route.ts`; new: `src/lib/ai/team/sale-notify.ts`, route, export script; `quota.ts#rebindOwner`.

## Acceptance (oracle `qc-ai-t3.6`)
S1 new tenant: wallet 0, no GRANT, chat works on the FREE pack · S2 existing granted wallet unchanged · S3 owner transfer re-binds with audit; sibling tenant unaffected · S4 sale-notify idempotent + 429 + tenant isolation · S5 `/usage` keys identical, pct = pack · S6 shared allowance proven again · S7 flag on → grant works (flip in test via a parameter, not env). Regressions `qc-ai-credit` `qc-ai-usage` `qc-mobile-app` + platform account suites.

## Controller rulings
- The welcome-grant switch is code (`packs.ts`), not env; env `SHARK_AI_WELCOME_USD` becomes irrelevant when the flag is off (documented in HANDOVER).
