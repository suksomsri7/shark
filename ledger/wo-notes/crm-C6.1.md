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

## 3. Migration rehearsal on a throw-away Neon branch of prod — 2026-10-07 11:06 UTC ✅ GREEN
Script `scripts/pending/c6/neon-rehearse-migrations.cjs` (Neon API key/project from `.env` in-process; branch of the **production default branch** `br-wispy-glitter-ao4p8ijv`, role `neondb_owner`, branch deleted at the end — also on error). Log `.qc-shots/crm/neon-rehearse-2.log` (run 1 failed only because the script picked the passwordless `anonymous` role; fixed).
- `migrate status` before: 151 migrations, 4 not applied (`20261103000000_crm_perf_indexes`, `20261104000001/2/3_account_journal_no_*`) — exactly the set expected.
- `migrate deploy`: all 4 applied, **2.6 s** on the prod copy (114 journal rows / 52 active systems → 260 `acc_jno_*` sequences pre-created = 52 × 5, as designed).
- `migrate status` after: up to date · `pnpm drift`: No difference detected (first migration with standalone sequences/functions — register §7 Q3 answered: drift stays clean).
- Post-checks on the branch: `acc_jno_%` = 260, N migration rows = 3, docNo shapes 0/0, uiVersion unset for both CRM systems, no duplicate AccountContact / multi-primary.
⇒ register R4 step 5 ("CI migrate on a prod-size branch") satisfied by this rehearsal; Q5 (rehearse on a Neon branch) = yes, done. Deploy-time migrate on prod is expected to take seconds; the Vercel build (migrate → tsc → next build) is the long part.

## 4. DEPLOY 1 — 2026-10-07 11:21 UTC ✅ ON PRODUCTION
- Owner "GO push" in chat (7 Oct). `git push origin HEAD:main` f85f5455..**f132ce21** at 11:10:44 UTC (fast-forward, 281 commits). Prod deployment id `dpl_AQMM29am5Nt424reV1eu6WdFBDAd` → **`dpl_GHA989HSCiYSdWyCVVSPU1mC4UaL`** seen 11:19:28 UTC (≈9 min build; Vercel build log not visible from here).
- Migrations on prod (`_prisma_migrations`, finished_at): `20261103000000_crm_perf_indexes` 11:11:17 · `20261104000001_account_journal_no_sequence` 11:11:19 · `…02_alloc_lock` 11:11:20 · `…03_alloc_lock_v2` 11:11:22 — 5 s total; pending/failed 0; `acc_jno_%` sequences 260; N migration rows 3; CRM systems still uiVersion unset (v1) ⇒ no user-visible CRM change; outbox ERROR crm.* 0.
- Unauthenticated checks after deploy: `/` 200 · `/login` 200 · `/app` 307 · `/api/mobile/conversations` 401 · `/api/mobile/chat/send` 405 (GET) · `/api/v1/crm/ping` 401 · `/l/nope` 302 · `/t/c/nope` 302 · `/api/email/inbound` without secret 503 (EMAIL_INBOUND_SECRET still unset on prod, as before).
- VPS checkout `/root/projects/shark-in-th` pulled to f132ce21 (`pnpm install --frozen-lockfile` + `prisma generate` ok) = deployed commit (register 1.2).
- **crontab installed** (register 1.1, owner OK 7 Oct): the 3 lines from `scripts/crm-cron.mts` header (minute `* * * * *` · hourly `7 * * * *` · daily `40 20 * * *` UTC = 03:40 TH), each `flock -n`, log `/var/log/shark-crm-cron.log`. First ticks: see §5.
- NOT done here (owner, logged-in): post-deploy smoke per register R6 (service invoice 3 % WHT → `RV-yyyy-mm-nnnn` numbering, vendor payment WHT, JV preview stable, new ACCOUNT system ⇒ 5 `acc_jno_<id>_%` sequences), v1 pages visual check, Vercel error watch 1 h for `[account/gl] journal number allocation failed` / `journal sequences not created at setup` / P2002 on AccountJournalEntry / `[after-drain] fallback drain`.
- Rollback now: Vercel Instant Rollback to dpl_AQMM… only until the first journal posting under the new numbering (M2); after that code-only rollback via a new build, never past N. Data stays (all migrations additive).
- Release notes to announce: general API keys lose remember_fact/forget_fact/support_open_case/financial_summary/record_expense via /api/v1/ai (no live caller); JV numbers no longer restart monthly, one jump ≤100; `/l/<code>` destinations now need the shop's allowed-host list (no links exist on prod).
