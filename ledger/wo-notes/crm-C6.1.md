# C6.1 — production state check (read-only) + migration rehearsal

Controller card (no agent touches production). Owner authorised the read-only prod probe + C6 recommendations on 7 Oct 2026 (chat).

## 1. Read-only probe — 2026-10-07 08:18 UTC (script `scripts/pending/c6/prod-probe-c61.cjs`, pooled + direct, `BEGIN READ ONLY`, raw logs `.qc-shots/crm/prod-probe-c61-{pooled,direct}.log`)

| check | result | verdict |
|---|---|---|
| role on DATABASE_URL and DIRECT_URL | both `neondb_owner`, `has_schema_privilege(public, CREATE)` = **true**, PostgreSQL 18.6 | ✅ register 1.12 / N pre-check 3 + 3b satisfied — same role, no GRANT needed (owner action NOT required) |
| `_prisma_migrations` | crm_v2_a (18 Sep) · crm_v2_b + ai_credit_crm_assist (23 Sep) · crm_v2_c (27 Sep) applied; 0 pending/failed; **not on prod**: `20261103000000_crm_perf_indexes`, `20261104000001/2/3_account_journal_no_*` | ✅ as expected (register header) |
| CRM systems `uiVersion` | 2 CRM systems in 1 tenant, `settings.uiVersion` unset (= v1) | ✅ no tenant on v2 |
| outbox `crm.*` | 0 events ever; 0 ERROR in 24 h; 0 events of any type in 24 h | ✅ (also: no CRM consumer has ever run on prod) |
| API keys | 1 active key: shop-level, `[]` scopes, **createdById NULL** (= P15 item 3, count 1); account-bound keys with non-account scopes = 0 (owner item 4 answered) | ⚠ 1 creator-less key → C6.2 list for the owner |
| N pre-check 1 lock capacity | lock_slots 57 664 (max_connections 901); candidates (systems with journal rows in 90 d) = 52 → ≈265 lock entries | ✅ ≫ 5 100 |
| N pre-check 2 docNo shapes | bad shape 0 · ≥7-digit tail 0 (114 journal entries) | ✅ |
| N pre-check 4 | `acc_jno_%` sequences 0 · N migration rows 0 | ✅ never run |
| row counts (index lock risk, register 1.13/R15) | CrmContact 0 · CustomRecord 0 · CrmEmailMessage 0 · CrmCompanyContact 0 · AccountContact 17 · OutboxEvent 886 · AccountJournalEntry 114 · tenants 10 | ✅ index builds are instant; CRM v2 tables are EMPTY on prod ⇒ C6.2 backfills will be near no-ops |
| register 1.6 / 1.7 (unique candidates) | AccountContact (systemId, partyId) duplicates 0 · companies with >1 primary 0 | ✅ both uniques could ship without a clean-up |

Not checked here (needs the owner / other access): env parity VPS ↔ Vercel (SESSION_SECRET, APP_URL, RESEND_WEBHOOK_SECRET, CRM_INBOUND_AUTHSERV_ID) — controller never reads `.env`; Vercel error log; v1 pages visual check on prod (do after the deploy, not before — nothing changes before it).

## 2. Still to do in C6.1
- Migration rehearsal (`prisma migrate deploy` + `migrate status` + `pnpm drift`) on a fresh Neon branch of prod from the C6.0 merge commit — after C6.0 lands.
- crontab (register 1.1/1.2): install together with the first deploy that carries `scripts/crm-cron.mts` (it is not on main yet); VPS checkout `/root/projects/shark-in-th` must be at the deployed commit.
