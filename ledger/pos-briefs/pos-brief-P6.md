# Brief — P6 ขึ้น production (2 ใบ · CRM §9): P6.1 migration ลำดับ + backfill + verify-prod (runbook + PR — the owner merges and deploys) · P6.2 HANDOVER + คู่มือในแอป + สกิล + `docs/modules/14-pos.md` V2 + `docs/sds/modules/pos.md` AS-BUILT · lanes: controller + builder S (docs/tools) + R1 · DRAFT by brief drafter (account B) 22 Oct 2026 01:5xZ — controller rules in §10

Read-only survey of `session/pos` **74484db5** (product tip a58122fc · working tree = ledger only). Plan row `POS-MASTER-PLAN.md:99`; closing evidence `:142–143` (§10: a real sale on prod at a trial shop · Z report · MANUAL order to account · qc:all · parity 3 sizes · HANDOVER). Method `CRM-MASTER-PLAN.md` §9–§10 (`:239–258`):
- C6.1: crontab GO · `_prisma_migrations` check via `scripts/prodmig.cjs` · v1 pages still work · OpsEvent ERROR 0 for 24 h;
- C6.2: every backfill `--dry-run` → TG numbers → owner "ทำ" → real, per shop → second run = 0;
- C6.3: pilot shop · 5 roles on prod with `qc-prod-` test rows · 24 h watch · rollback switches;
- C6.4: HANDOVER + evidence pack §10 + memory + TG.

Existing draft = `ledger/pos-briefs/pos-runbook-P6.1-DRAFT.md` (3 Oct, 48 lines) — re-verified item by item in §2. Starts after P5 closes. Notes → `ledger/wo-notes/pos-P6.{1,2}.md`.

⚠️ Prompt-vs-code (read first):
1. **Nothing of POS V2 is on `main` or prod.** `session/pos` = `origin/main` (a84bca2b) merge-base 71a1f363 + **3,014** commits. `HEAD..origin/main` = 1 commit (`a84bca2b fix(chat)…`, 2 files). ⛔ This RUN never pushes `main`: P6.1 ends with a ready branch, a PR body and a runbook. The owner merges and deploys.
2. **36 POS migrations are not on main** (`comm` of the `prisma/migrations` trees). They run from `20261120000000_pos_v2_a` to `20261219100100_pos_p36_credit`, and all sort after main's last (`20261104000003_account_journal_no_alloc_lock_v2`). Main has nothing that HEAD lacks.
   - **8 files contain `DO $$`** (single tx): `pos_v2_a` · `p24_tables` · `p28_orders` · `p26_kds` · `p29_tenders` · `p25_split` · `p29b_deposits` · `p210_customer_display`.
   - **6 files `ALTER TYPE`**: `p16_payment` · `p18_refund` · `p21_sales_channel` · `p29_tenders` · `p27_qr_orders` · `p36_credit_enum`.

   The runbook §1 knows only the first two files.
3. **Existing (non-POS) tables altered by POS migrations = 10**, not the runbook's 5: `RecipeLine` (v2_a) · `MenuItem` `RestaurantOrderItem` `ShopOrderLine` `ShopProduct` (v2_a_links) · `AccountDocument` (p113) · `RestaurantTable` (p24) · `RestaurantOrder` `RestaurantSetting` (p26) · `GiftCard` (p29). Pre-RUN `Pos*` tables (PosSale/PosSaleLine/PosPayment/…) are altered too. Lock pre-flight must cover all of them.
4. **`scripts/verify-prod-pos.mts` does not exist** although `POS-MIGRATION-PLAN.md:46–49` (§4.3) names it. `scripts/prodmig.cjs` is a hard-coded member/kanban check (`:3–5`), not a general tool.
5. **Runbook preconditions now true**:
   - CRM is on main (crm_v2_b/c + account journal migrations present on main);
   - the RC hotfixes are on main (`hotfix/inventory-atomic`, `hotfix/pos-page-authz`, `rc/hotfixes-2026-10-01` are ancestors of `origin/main`);
   - `package.json` differs from main only by `@zxing/browser ^0.2.1` (+36 lockfile lines);
   - Prisma `^7.8.0` (`package.json:105, :125`).
6. **POS code reads env** `APP_URL` · `SESSION_SECRET` · `NODE_ENV` · **`POS_CREDENTIALS_KEY`** (new · W4: set it on prod before any creds; never reuse `CHAT_CREDENTIALS_KEY`/`SESSION_SECRET` — `wo-notes/pos-P3-SKEL.md:43`). Beam keys stay platform env (W20).
7. **POS jobs ride the existing schedulers**: `api/cron/hourly/route.ts:10–14, :89–98` (force-close shifts · expire intents · expire preorders · daily brief · approvals) and `platform/minute-jobs.ts:459–486` (`pos.staffCommission.payroll` · `pos.slip.purge` + print-job expiry). Prod must already call these routes — verify, don't assume.
8. **Docs today**: `docs/modules/14-pos.md` 1,107 lines is the pre-build spec, with a pointer to HANDOVER-P2 (`:3`). `docs/sds/modules/pos.md` 40 lines is AS-BUILT **2026-07-16 = POS v1** (PosSale/Line/Payment/ReceiptCounter only). Also `docs/pos/PLATFORM-SETUP.md` (P3-SKEL) · generated `docs/api/POS-API.md`. The skill is tracked at `skills/shark-pos-api/{SKILL.md, references/recipes.md, references/endpoints.md}` and copied by `scripts/sync-skills.sh` (`--check`) to both account homes + `.claude/skills` (gitignored, P2.14 ruling 4).
9. **In-app manual precedent**: `src/app/app/sys/[id]/account/help/page.tsx` ("คู่มือเริ่มต้นในแอป 1 หน้า", read-only, reached from ⌘K, checklist + menu groups + monthly flow). POS has no help page. A new page triggers `qc-pos-p2.14` V3/V4 (page map + registry/authz) and P4's registry.

## 1. Scope / goal
- **P6.1** — make the deploy boring and reversible:
  - a final runbook (order, locks, failure handling, backfills, indexes, flags, env, crons, rollback);
  - a read-only `verify-prod-pos.mts`;
  - a full rehearsal on a Neon branch **of prod** (owner GO);
  - a merge-ready branch with the PR text.

  The owner presses merge/deploy and gives each prod GO.
- **P6.2** — hand the system over:
  - final HANDOVER-POS + evidence pack;
  - in-app POS manual page;
  - skill(s) synced;
  - `14-pos.md` rewritten as V2;
  - `sds/modules/pos.md` AS-BUILT V2.

## 2. What exists today — runbook re-verification (DRAFT §0–§6 vs 74484db5)
| DRAFT item | today | action |
|---|---|---|
| §0 CRM on main first; POS timestamps after CRM | ✅ ⚠️5 · ⚠️2 order OK | keep as a check (`comm` + sort) in verify |
| §0 RC hotfixes on main | ✅ ⚠️5 | drop from blockers |
| §0 merge checklist (`checkCatalogWrite` ≡ `posCanSetTenantPrice` · `qc-prisma.sh` ep-frosty-lab · `catalog-legacy.ts` in `SYSTEM_MARKER_ALLOWLIST` · registerCatalog availability = listForUnit) | not re-checked by this survey | builder greps each; a fitness/oracle line per item |
| §0 `--update-pos-contract` at merge | contract sha 762e073c since P3.6 (`POS-RESUME.md:2025`) | run `fitness-pos` at the merge commit |
| §0 `@zxing` lockfile | ✅ only dep diff (⚠️5) | `pnpm install` after taking both sides; never hand-merge the lockfile |
| §0 full suites on a fresh Neon branch of prod | not done | P6.1 rehearsal (§4) |
| §1 direct URL only · Prisma 7.8 statement mode · DO $$ = one tx | 8 DO files + 6 ALTER TYPE files (⚠️2) | table per file: tx mode · lock targets · rollback SQL |
| §2 window · `pg_stat_activity`/`pg_locks` on 5 tables · Neon branch before deploy | 10 + Pos* tables (⚠️3) | widen the list; record row counts (owner GO, read-only) |
| §3 P3018/P3009 → resolve → redeploy (rehearsed on QC4 for `_links`) | only P1.1a rehearsed | rehearse the full 36 on the prod-copy branch |
| §4 CONCURRENTLY indexes (InvItem barcode + 5 from P1.1a M7) + TL-6 (HANDOVER-P2 §5) + P5.3 outputs | list grows | one ordered list with `indisvalid` checks |
| §4 `pos-backfill-catalog.mts` dry → owner → real → `--verify` 0 · `backfillWebPrices` (`catalog.ts`) before web price reads | scripts exist (`pos-backfill-catalog.mts:1–12`) | the order goes in the runbook; numbers to TG |
| §4 `registerV2` OFF until P1.6+P1.12 | done long ago; flag still per shop | rollout = per-shop flags (§10.5) |
| §5 O18 prod read-only checks (`inv-cache-audit.mts` `ALLOW_PROD_AUDIT=1`) | owed | owner GO each |
| §6 who deploys / from where (VPS; cloud cannot reach PG TCP) | open | W-next-8 |
| P1.9 shift rollout (a) · m2 price-override grant | owner chose (a) | data step script + owner role review line |
| (new) env `POS_CREDENTIALS_KEY` · crons (⚠️6–7) · `qc-account-api-*` ×5 on the acc-v2 lane (HANDOVER-P2 `:219`) · `qc-account-api-settings` SKIPPED (P3.12 F23) | — | preconditions |

## 3. Gaps
- G1: no verify script.
- G2: the runbook is partial (⚠️2–3, env, crons, flags, rollback).
- G3: no rehearsal on a prod copy.
- G4: no PR text / merge plan.
- G5: v1-era docs.
- G6: no POS manual page.
- G7: no final HANDOVER/evidence pack.

## 4. Proposed oracles
- **P6.1 — `scripts/qc-pos-p6.1.mts`** (static, no DB · ≈ 14 checks):
  - **M1** every `prisma/migrations/*pos*` not on main appears in the runbook table in sort order with tx mode (DO / per-statement / ALTER TYPE).
  - **M2** each listed existing table is in the lock pre-flight list (parse `ALTER TABLE` targets).
  - **M3** every migration has a rollback block (`IF EXISTS`, one statement per line) in the runbook appendix.
  - **M4** no POS migration creates an index on an existing table without being in the CONCURRENTLY list.
  - **E1** every `process.env.X` used under POS paths is in the env checklist.
  - **C1** every POS cron entry (`minute-jobs`/`hourly`) is in the cron checklist.
  - **F1** every POS feature flag/settings switch default = off/as before (registerV2, offline, credit, chat ×4, board, ai, platform, slip, LAN) is listed with its rollback.
  - **B1** every backfill script has `--dry-run` + an idempotency note + a verify step.
  - **V1** `scripts/verify-prod-pos.mts` exists and refuses any write: it uses a read-only transaction (`SET TRANSACTION READ ONLY`), no `$executeRaw` writes, a host allowlist (prod host only with `ALLOW_PROD_AUDIT=1`; QC hosts for its self-test).
  - **V2** its `--self-test` on QC4 is green (counts PosProduct vs InvItem+MenuItem+ShopProduct links · `_prisma_migrations` POS set complete · per-tenant POS settings flags · outbox backlog of `pos.*` · OpsEvent ERROR 24 h).
  - **R1** the PR body file exists (`ledger/pos-briefs/pos-PR-main.md`): summary, migration list, flags, rollback, test evidence links.
  - **R2** the runbook names the owner GO points (each prod step).

  Red-before ≈ 13/14.
- **P6.2 — `scripts/qc-pos-p6.2.mts`** (static · ≈ 12 checks):
  - **H1** `ledger/HANDOVER-*-POS.md` (final) has §0–§8: card table 55 rows with SHAs that are ancestors of HEAD · real bugs found (hunter/review High/Med list) · ORACLE-EDIT list (`git log --grep ORACLE`) · debt · owner items W1–W-last with state · how to roll back · how to run · evidence pack index.
  - **H2** the evidence pack index lists CRM §10-style items + POS §10 (`POS-MASTER-PLAN.md:142–143`). Items that need the owner (real prod sale at a trial shop = W5) are marked "owner".
  - **D1** `docs/modules/14-pos.md` V2 head line + sections cover: register/pay/tenders · bills/refund · shifts · products/prices/channels · tables/KDS/orders/QR · display · multi-branch · reports · REST · integrations (13 cards) · offline · AI · permissions table (from `core/permissions.ts` `pos.*` keys — every key present).
  - **D2** `docs/sds/modules/pos.md` AS-BUILT V2: every `prisma/schema/pos*.prisma` model named · every `pos.*` outbox key (= POS-CONTRACTS table) · every facade export of `modules/pos/index.ts`.
  - **M1** the manual page exists (`src/app/app/sys/[id]/pos/help/page.tsx`) and is read-only (no DB beyond the guard, like the account help page). Every `href` resolves to a POS page. Th/en keys. Registry rows + p2.14 V3 page map + authz pin.
  - **S1** `sync-skills.sh --check` exit 0 · `gen-pos-api-docs --check` exit 0 · SKILL.md mentions every REST op group (registry).
  - **Z** no product logic diff outside the manual page (docs/ledger/skills/scripts only).

## 5. Lanes · order · estimate
- **P6.1**:
  1. Builder S (tree b): verify script + runbook final + PR body (≈ 0.5 day). R1 reviews.
  2. Owner GO → controller cuts a Neon branch **of prod**, then `migrate deploy` through the direct URL from the VPS, applying all 36 migrations.
  3. Backfill dry-runs → verify `--self-test` against the branch.
  4. Full gates + qc:all on that branch (QC7 recipe of P3.12 — allowlist = that branch host only), then the branch is deleted (≈ 0.5 day).

  ≈ 1–1.5 days + owner wait.
- **P6.2**: builder S docs/manual/skills (≈ 1 day; parallel with the owner's deploy) → R1 → visual round on QC5 for the manual page (th/en · 3 sizes) → HANDOVER filled by the controller.

  ≈ 1 day.

## 6. Risks
- Lock waits on large legacy tables at deploy (outside selling hours; per-statement mode).
- `ALTER TYPE ADD VALUE` is not transactional (own files — kept).
- A prod copy branch contains real PII: same rules as prod — no test writes besides the rehearsal, delete after, no screenshots of customer data.
- The deploy order between Vercel build and migrations — the old code must run on the new schema (additive only).
- Feature flags default off ⇒ prod behaviour unchanged at deploy; risk = shops with registerV2 already on (P1.9 shift-required data step).
- The cron routes might not be hit on prod.
- The skills copy drifts if `sync-skills.sh` is not run on both homes.
- The final HANDOVER grows past usefulness — keep §0 to 10 lines.

## 7. Owner questions → OP W-items
- **W-next-8**: who runs `prisma migrate deploy` on prod, and when (window, outside selling hours)? Default: the owner from the VPS, with the controller reading the runbook aloud step by step.
- **W-next-9**: rehearsal on a Neon branch of prod (contains PII) — GO? Default: yes, deleted the same day.
- **W-next-10**: rollout order — flags on for the trial shop(s) only (W5), others stay V1/off until the owner says. Default: as stated.
- **W-next-11**: approve the merge of `session/pos` → `main` (the owner merges the PR). Default: wait.

## 8. Hard rules
- ⛔ Never push `main`. No prod write without an explicit owner GO per step. No test suite against prod. Never touch `.env` (mtime check in evidence, CRM §10.8). No EAS build.
- `prisma migrate deploy` only through the **direct** URL, never `-pooler` (session `SET` leaks).
- Never reseed QC4/QC5.
- `POS_CREDENTIALS_KEY` must be set on prod before any credentials (W4).
- W21–W26 (+ W-next) defaults stand until the owner answers.
- All node via `iso.sh`. `date -u`. ORACLE-EDIT rule. `pos-oracle-check.sh` / `pos-pre-submit.sh` as everywhere.

## 9. Counters / done-definition
- **P6.1 done** = `qc-pos-p6.1` green · R1 MERGEABLE · rehearsal record (branch name, migrate log, backfill dry numbers, verify output, gates + qc:all on the branch, branch deleted) · PR body ready · owner GO points listed.

  The real deploy is **not** part of done — it is the owner's step.
- **P6.2 done** = `qc-pos-p6.2` green · R1 MERGEABLE · manual page visual round green · HANDOVER-POS final + evidence index · memory + TG 100 % report.

Counter +1 each (2) ⇒ the run ends at 55/55 under the P3.12 §10.9 counting rule.

## 10. PROPOSED rulings for the controller
1. P6.1 = prepare only (runbook + verify script + rehearsal on a prod-copy branch + PR body); deploy and merge are owner steps outside the counter. `(confirmed · controller B …)`
2. The runbook becomes `docs/pos/DEPLOY-RUNBOOK.md` (tracked), and the DRAFT in `pos-briefs/` is frozen with a pointer. `(confirmed · controller B …)`
3. `scripts/verify-prod-pos.mts` = read-only transaction + host allowlist + `ALLOW_PROD_AUDIT=1` + `--self-test` on QC4; it replaces the hard-coded `prodmig.cjs` for POS. `(confirmed · controller B …)`
4. Migration order = timestamp order as committed (no renames needed — ⚠️2); the CONCURRENTLY indexes after the migrations and before the flags; backfill catalog → `--verify` 0 → `backfillWebPrices` → flags. `(confirmed · controller B …)`
5. Rollout = per-shop flags, trial shop first (W5); rollback = flags off (data is additive) + documented reverse SQL only for a failed migration. `(confirmed · controller B …)`
6. Manual = one read-only page `/app/sys/[id]/pos/help` (account help precedent), linked from ⌘K and settings; th/en; registry + sweep rows; no new server code. `(confirmed · controller B …)`
7. Docs: `14-pos.md` rewritten as V2 (the old spec moved to an appendix "v1 design notes"); `sds/modules/pos.md` regenerated AS-BUILT V2 from code (models · events · facade · permissions). `(confirmed · controller B …)`
8. Skills: only `shark-pos-api` (tracked) is updated + synced; other modules' skills are untouched (the owner's lanes). `(confirmed · controller B …)`
9. The final HANDOVER doubles as the evidence pack index (CRM §10 + POS §10); owner-only items are marked and do not block the counter. `(confirmed · controller B …)`

### §10 addendum — controller B (22 Oct 07:3xZ): rulings 1–9 **confirmed as drafted**. Owner questions → **W31** (rehearsal of the migration order on a Neon branch copied from prod = real customer data on a throw-away branch; default: allowed only if the branch is deleted the same day and nothing is exported; otherwise rehearse on QC4 only) · **W32** (who runs the production deploy: default = the owner, following `docs/pos/DEPLOY-RUNBOOK.md`; the controller never pushes main or deploys). Order: P6.1 **prep** (runbook rewrite + `verify-prod-pos.mts` + `--self-test` on QC4) may start now as a light lane; the rehearsal and the PR body wait for P3.12/P4/P5 to close.
