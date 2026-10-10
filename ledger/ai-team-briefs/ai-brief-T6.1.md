# T6.1 — Migrate existing shops + production steps (Opus builder for the script · controller for prod) 🎯 hunter (backfill)
Read `ai-brief-COMMON.md` + MASTER-PLAN §9 + RESOLUTIONS R-B (default employee), R-E C2/C7/C26 first. Contract: AI-TEAM-RUN §2 T6.1. Every production step waits for the owner's "ทำ".

## Verified facts
- Shops that use AI today: tenants with `AiConversation` or `AiCreditWallet` rows. Their rooms have no `AiTask`; reads already fall back to the default employee (T1.2) — the backfill makes it explicit.
- `AiSettings.uiVersion` default 1 (T1.1) → 1.0 app unchanged for everyone until the owner names a pilot tenant.
- CRM C6.1 precedent: migration rehearsal on a throw-away Neon branch of prod (`scripts/prodmig.cjs` read-only check; the rehearsal script name from CRM's ledger `C6.1` notes — copy the approach, not the file).
- Indexes deferred from T1.1 (on `AiProposal(aiEmployeeId, status)`, `AiScheduledTask(aiEmployeeId, active)`, `AiCreditTxn(subscriptionId, createdAt)`, `AiCreditTxn(aiEmployeeId, createdAt)`) → CONCURRENTLY by hand.
- Backfill guard pattern from CRM C6.2: `ALLOW_PROD_BACKFILL=1` + `--dry-run` default + host check.

## Deliverables
- `scripts/ai-team-backfill.mts`: `--dry-run` (default) / `--apply` (needs `ALLOW_PROD_BACKFILL=1`; refuses prod host without it; refuses QC1); per tenant: `ensureDefaultEmployee`, `AiTask` for every conversation lacking one (`status` = `deletedAt ? ARCHIVED : OPEN`, `startedById` = creator from the id when `u~`, else null → `aiEmployeeId` default), `ensureBinding`, leave `uiVersion` 1; idempotent (second run reports 0 changes); prints a per-tenant table (tenant, rooms, created tasks, binding owner) without PII.
- `ledger/AI-TEAM-PROD-INDEXES.sql`: the CONCURRENTLY statements + the exact psql invocation (no credentials in the file).
- 1.0 app quota message: when `/api/mobile/usage.blocked === "credit"` the existing banner text comes from the server? (check `QuotaBar.tsx` — if the text is client-side, no change is possible for build #24; document) — otherwise adjust the server message to mention "โควตารอบนี้หมด · รอบใหม่ <date>".
- Rehearsal script `scripts/ai-team-prod-rehearsal.sh` (creates a Neon branch from prod via the Neon API key in env — never printed; runs `prisma migrate deploy` + `--dry-run` backfill; deletes the branch) — controller-run.
- Owner checklist in `AI-TEAM-OWNER-QUESTIONS.md` O3/O5 filled with the dry-run numbers.

## Files you own
`scripts/ai-team-backfill.mts`, `scripts/ai-team-prod-rehearsal.sh`, `ledger/AI-TEAM-PROD-INDEXES.sql`, possibly a server message hunk.

## Acceptance (oracle `qc-ai-t6.1` on QC4)
S1 dry-run writes nothing + report · S2 apply results · S3 second run = 0 · S4 prod host without flag ⇒ exit ≠ 0 · S5 legacy rooms behave as baseline after backfill · S6 [static] SQL CONCURRENTLY only, not in migrations · S7 1.0 app message shot. Regression: entire baseline + all AI-team oracles.

## Production order (controller, each step after the owner's "ทำ")
1 rehearsal on a Neon branch → 2 push `session/ai-team` → main (deploy + migrations `_ai_team_a[,b]`) → 3 `--dry-run` on prod (read-only) → numbers to the owner → 4 `--apply` → 5 CONCURRENTLY indexes → 6 pilot tenant `uiVersion = 2` (owner names it) → 7 watch 24 h (outbox `lastError`, model spend, mobile errors) → 8 record in RESUME + HANDOVER.
