# C6.2 — prod backfills (P15) — CLOSED 2026-10-07 22:34 UTC

Owner said "ทำ" (chat, 7 Oct 22:3x UTC). Run from `/root/projects/shark-in-th` at main `f132ce21` (the deployed commit); `DATABASE_URL`/`DIRECT_URL` taken by `grep|cut` from `.env` with a prod-host guard (`ep-royal-night`), never printed. Log: `ledger/evidence/c62/c62-apply-p15.log` (dry-run of 11:xx UTC: `c62-dryrun-p15.log`).

| script | dry-run (before) | `--apply` | dry-run (after) |
|---|---|---|---|
| `scripts/pending/c54b/backfill-revoke-ended-portal.mts` | accesses 0 · liveSessions 0 | revoked 0 | accesses 0 |
| `scripts/pending/c54c/backfill-invoice-status.mts` | candidates 2 · wouldFix 0 | applied 0/0 (no outbox events) | candidates 2 · wouldFix 0 |

Result: prod data needed no change (CRM v2 tables empty; the 2 invoice candidates have live credit notes but are not fully settled — info only, by design). Second run = 0 ⇒ idempotent, closed.

P15 item 3 (active API key with no creator) = the live Siamdive chat key (`SHARK_CHAT_API_KEY` in siamdive2) — NOT revoked. Owner re-issues a key with a creator in SIAM DIVE CENTER → settings → API keys, swaps it into siamdive2 (Vercel env + local `.env`), then the controller revokes the old one (tracked in CRM-C6-REGISTER P15).
