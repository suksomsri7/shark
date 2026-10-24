# POS P6.1 fix1 — runbook + verify + prod-writer CLIs + oracle + schema-parity card (builder S · account A · 24 Oct 2026)

Branch `wip/pos-p6.1-fix1` · tree `/root/projects/shark-pos-p11` · base c91d8735 (= session/pos 5e5b0675 + merge of `wip/pos-p6.1-prep` 603877ea · verified clean at start, 00:20Z `date -u`).
Brief `ledger/pos-briefs/pos-prompt-accountA-P6.1-FIX1-BUILD.md` · spec = R1 review `ledger/wo-notes/pos-P6.1-prep-review.md` (controller tree) · rulings CD-P61-R1…R6 · O1 · P4.
Scope kept: docs/ scripts/ prisma/ ledger/ only · no src/ · nothing touched production or a prod URL · QC4 only (lane command, `/tmp/shark-gate-pos.lock`) · no build/serve/QC5 · no `.env*` read · no `pnpm install` · no `prisma generate` (not needed) · **no `prisma migrate deploy` on QC4** (see P4) · all node via `iso.sh` ISO_MEM=3G.

## Commits
| sha | group |
|---|---|
| 2b9b2a53 | CD-P61-R3: `scripts/lib/pos-prod-writer-guard.mts` + `pos-backfill-catalog.mts` guard + CLIs `pos-backfill-web-prices.mts` · `pos-shift-required-off.mts` (CD-P61-P8) |
| 164c231b | CD-P61-P4: 14 `@@index` + migration `20261220100000_pos_p61_hand_indexes` + channel-price unique declared |
| 5d00ad81 · 53b8d1f1 | verify-prod-pos: `--counts` · `--crons [--post-merge]` · `POS_DEVICE_KEY` · rehearsal role · self-test pending · S9 |
| 7be4ed69 · 4c68bb36 | runbook rewrite (+ owner read-through fixes) · notes stub |
| 35855663 · 4c182f57 | ORACLE-EDIT CD-P61-O1 (`qc-pos-p6.1`) |
| (this file) | notes |

## Per finding — what changed · where · evidence
| finding / ruling | done | where (file:line at 4c68bb36) | evidence |
|---|---|---|---|
| **F1 BLOCKER · CD-P61-R1** deploy order | ✅ | runbook §0 `:13-20` (order 1–7 + why) · §4.1–4.3 `:315-351` · §11 `:572` | §0 cites `scripts/vercel-build.sh:21-25` / `:12-14`, P3009, "No pending migrations to apply."; oracle N1 |
| **F2 · CD-P61-R2** `POS_DEVICE_KEY` | ✅ | §6 row `:434` (W40 · ≥ 32 · `openssl rand -hex 32` · ≠ other keys · before migrate) · §9 pairing `:516` · §1 row 1.13 · verify `ENV_NAMES` `scripts/verify-prod-pos.mts:220` | oracle N2 + E1; CD-P61-P5 closed |
| **F3 · CD-P61-R3** prod writers | ✅ | guard `scripts/lib/pos-prod-writer-guard.mts:30` (allowlist) `:88` (decide) `:146` (self-test) · catalog `scripts/pos-backfill-catalog.mts:38` (env file only when not ALLOW) `:49` (guard) · CLIs `scripts/pos-backfill-web-prices.mts` · `scripts/pos-shift-required-off.mts` · runbook §8 `:474` (7 prod lines, all `DATABASE_URL="$PROD_DIRECT_URL"`, expected output per CLI) | guard self-test 21/21 (probe: NO_ALLOW branch removed → 18/21 red) · refusals below · QC4 dry-runs below · oracle N3 |
| **F4 · CD-P61-R4** unflagged behaviour | ✅ | runbook §1A `:67` (a–e table with file:line + commits, ⛔ GO-3a…3e, W37–W41 links, read-only psql block (a)–(d) + (e) after migrate) | all §1A SQL ran read-only on QC4 without error (30 output lines) · verify `--counts` K3 gives the same numbers in one line · oracle N4 |
| **F5 · CD-P61-R5** counts + index strategy | ✅ | verify `--counts` `scripts/verify-prod-pos.mts:44` `:63` `:643` · runbook §3.2 `:192` (in-file index table + paths ก/ข/ค/ง + exact SQL) · §3.4 `:276` | QC4 `--counts` FAIL 0 (PosSale 519 … no table over 100k ⇒ ทาง ก) · hand-file sed for p111/p34 tested offline (`grep -c CONCURRENTLY` = 1 each, diff = the one index line) · oracle N5 |
| **F6 · CD-P61-R6** crontab checkout | ✅ | verify `--crons [--post-merge]` `scripts/verify-prod-pos.mts:709` · S9 `:564` · runbook §7 `:443-471` (flock all 3 cron locks + `pull --ff-only` + `pnpm install --frozen-lockfile` via iso.sh + post check) | `--crons` on this VPS: R1 OK (3 entries minute/hourly/daily → `/root/projects/shark-in-th`) · R2 WARN (main de0eafc7, 43 behind origin/main a84bca2b) · R3 WARN (0 `pos.*` jobs) · R4 OK. New fact: both `pos.*` jobs are cadence **hourly** ⇒ only the crontab `hourly` line runs them (`/api/cron/outbox` = minute cadence) · oracle N6 |
| F7 stmt files not re-runnable | ✅ | §4.4 step 3 `:352` · appendix A rule `:602` | recount = **20** stmt files with a non-IF-NOT-EXISTS create/add (R1 said 19; list in §B) · oracle N7 |
| F8 promote-previous only before first V2 write | ✅ | §9 `:534` + read-only detector SQL (GO-22) | oracle N7 |
| F9 addendum-2 rulings | ✅ | lock_timeout via URL §3.3 `:259` + `PROD_MIGRATE_URL` in §4.0 · row 1.4 dropped `:38` · W34 step §7 · 100k in §3.2 | **QC4 proof** (read-only): psql with option `5s`, without `0`; `prisma db execute --stdin` DO-check with option exit 0, without exit 1 `lock_timeout=0` — also through `iso.sh` stdin exactly as the runbook command · oracle N7 |
| F10 clean checkout | ✅ | §4.0 `:296` (`worktree add --detach /root/pos-deploy <PR_HEAD_SHA>` · rev-parse · status · no `.env` · `pnpm install --frozen-lockfile` · prisma version) — no prod command runs from `/root/projects/shark-pos` | oracle N7 (scans every prod-token line) |
| F11 owner items shipping with merge | ✅ | §1 rows 1.13–1.21 `:47-55` (W40 W33 W34 W37 W38 W39/W41 W19 + §1A ack + lock proof) | oracle N7 |
| F12 · CD-P61-O1 oracle | ✅ | `scripts/qc-pos-p6.1.mts` (Z1 + prisma/ & LANE_PIN c91d8735 `:26` · E1 `:322` · N1–N8 `:503-650` · R3 `:427` · R2 shell-var lines · S1 + writers/guard/fix1 notes · V2 reads this file first) | 26/28 on disk (R1 + R3 red by design) · red-before `P61_REV=603877ea` 16/28 (E1 R1 R3 Z1 N1–N8 red) · probes §C |
| F13 | ✅ | = F2 (`ENV_NAMES`) | |
| F14 citation drift | ✅ | 1.3 → `src/lib/actions/pos.ts:536` · 1.5 → `scripts/fitness-pos.mts:1062-1068` / `:1072` · §5 schema lines after the `@@index` card | oracle P1: 58 cites, all resolve |
| F15 indisvalid query | ✅ | §5.3 `:406` (VALUES list LEFT JOIN ⇒ 15 rows, missing = `exists f`) | |
| F16 rehearsal role | ✅ | verify `decideTarget(env, mode, allow)` `:108` + G2 cases `:322` (rehearsal = prod rules) · writer guard self-test cases · §4.5 | G2 19/19 · guard 21/21 |
| **CD-P61-P4** schema parity | ✅ (deviation noted) | `@@index` in ecommerce.prisma:29 `:72` · pos.prisma (PosSale ×5 after `:154`, PosSaleLine `:192`) · restaurant.prisma:187 `:470` · inventory.prisma:113 · pos_order.prisma (PosOrderLine/Event) · migration `prisma/migrations/20261220100000_pos_p61_hand_indexes/migration.sql` | see §A |

## A. CD-P61-P4 evidence (no migrate deploy on QC4)
- `prisma validate` → valid.
- `prisma migrate diff --from-schema <c91d8735 schema> --to-schema prisma/schema --script` = exactly the 14 `CREATE INDEX` of the migration + `CREATE UNIQUE INDEX "PosProductChannelPrice_product_code_unit_key"` (already created by `pos_p22_prices` with NULLS NOT DISTINCT).
- QC4 `migrate diff --from-config-datasource --to-schema` (read-only), POS lines: **before** = 1 (`PosProductChannelPrice` "Removed unique index (productId, channelCode, unitId)") · **after** = only the 14 "Added index" that #37 creates (QC4 does not have them). HR lines (other lanes' schema on shared QC4) are unchanged ⇒ `qc-migrate-status` MS-2 on QC4 stays red for **non-POS** reasons (baseline before this card: MS-1 ✅ MS-2 ❌ on HR tables/enums).
- **Deviations**: (1) `one_open_session_per_table` stays SQL-only — Prisma 7.8 cannot declare a partial unique; QC4 has it and `migrate diff` does not report it; putting it in #37 would build it non-concurrently on prod before the duplicate count. (2) Added `@@unique([productId, channelCode, unitId], map: "PosProductChannelPrice_product_code_unit_key")` — a pre-existing POS drift the schema comment wrongly called invisible; declaring it makes the POS diff empty (DB index unchanged). (3) **Did not deploy #37 on QC4**: QC4 is shared; an applied migration other trees do not have would turn their `prisma migrate status` red ("applied but missing locally"). Evidence = the two diffs above. Controller decides whether to apply it on QC4/QC5 at merge time.
- Lane-pin oracles red on the prisma diff (not edited, as ruled): `qc-pos-p3.8 --no-db` ST3 ("แตะ prisma") · `qc-hf-fu2 --no-db` ST1 ("ไม่มี migration · prisma เท่าเดิม"). `qc-pos-p2.14 --no-db` 15/15 (its G2 was red already at c91d8735 — it reads the word for the lane force variable in the `qc-pos-p6.1` header as a SKIP gate; the O1 edit rewords that comment).

## B. Runs (all `date -u` 24 Oct · QC4 via `iso.sh → qc4.sh → GATE_LOCK_FILE=/tmp/shark-gate-pos.lock with-gate-lock.sh`)
Final verify record: head=4c68bb36 dirty=0 start=2026-10-24T01:16:42Z
```
JSON_SUMMARY {"suite":"verify-prod-pos","mode":"self-test","role":"qc4","host":"ep-frosty-lab…","total":23,"passed":23,"fail":0,"warn":5,"failed":[],"warned":["M1","X1","S1","S6","S7"],"posMigrations":38,"pending":["20261220100000_pos_p61_hand_indexes"]}
```
- self-test WARNs: M1 = #37 pending on QC4 (self-test only; prod audit = FAIL) · X1 1/15 hand indexes on QC4 · S1 InvItem 1 · InvLocationStock 113 · S6 FAILED 2 · S7 ERROR 112 (outbox test noise). G2 19/19 · RO probe 25006 · N1 canaries 4/4 + 3/3 · S9 INFO (pos jobs never ran on QC4).
- `--counts` FAIL 0 WARN 0: PosSale 519 · RestaurantOrder 0 · GiftCard 12 · PosSaleLine 878 · … ⇒ ทาง ก · K2 registerV2=true 2 · K3 (a) 2 units/2 tenants · (b) open deposits 0/0/0, tenants taking deposits 1 · (c) general keys 2 (0 used in 30 d) · (d) managers not "*" 6/5 tenants · (e) devices 10/6 units · K4 0.
- `--crons` FAIL 0 WARN 2 (R2 R3 — see F6). `--list` total 32 ids.
- Refusals (fake URLs, no DB): verify prod w/o ALLOW → exit 4 NO_ALLOW (audit and --counts) · QC4 audit → exit 4 QC4_NEEDS_SELFTEST · two modes → exit 2.
- Writer CLIs: wrong host (`ep-not-allowed-…`) → exit 4 NOT_ALLOWLISTED ×3 · prod mark w/o tenant → exit 4 NO_TENANT ×3 · prod mark w/o ALLOW → exit 4 NO_ALLOW (web-prices, shift) / MIXED (catalog: QC_ENV_FILE supplied a QC4 DIRECT_URL next to the fake prod URL — still refused before connect).
- QC4 `--dry-run` (`--tenant=pos-qc-coffee --tenant=pos-qc-resto`): catalog exit 0 (would create 0 · already 9/4/0) · web-prices exit 0 (scanned 0) and all 34 tenants: scanned 5 · would write 0 · conflict 1 · shift-required-off exit 0 (registerV2=true 2 · would set 2). Shift write SQL checked read-only on QC4: `jsonb_set` result = `{"required":{"register":false}}`, other top-level/pos keys identical; synthetic row keeps `otherSources` and `blindClose`.
- 20 non-re-runnable stmt files (F7 recount): p15 p19 p12 p19b p117 p114 p18 p110 p111 p115 p17 p113 p112 p21 p22 p35 p34 p3skel p3skel_slip_hash p36_credit.
- Strict single-file tsc (isolated tsconfig extending the repo one + noUnused*) on guard · 3 CLIs · verify · qc-pos-p6.1 → exit 0; positive control (TS2322 file) → exit 2.
- fitness no-env 53/53 · fitness QC4-env 53/53 · fitness-pos 8/8 · pre-commit fitness green on every commit.
- `pos-oracle-check.sh <tree> qc-pos-p6.1 --base 23c85130` → VERDICT green · with `--prompt <fix1 prompt>` → warn 2 (prompt does not use pos-pre-submit / does not name the base) · with `--base c91d8735` → red O11 (PIN default 23c85130 is the DRAFT-freeze base of D2 and must stay; LANE_PIN carries c91d8735).
- `qc-pos-p6.1` final: 26/28, failed = [P6.1-R1, P6.1-R3] (PR body, by design).

## C. Negative probes (mutate → run → restore with git checkout; tree clean after)
E1 (drop W40 from the row) ❌ · N1 (drop vercel-build cite) ❌ · N2 (drop pairing button text) ❌ · N3 (drop URL from one §8 line) ❌ · N3 (re-add `loadEnvFile(".env")` to catalog) ❌ · N4 (drop row e) ❌ · N5 (drop resolve of p34) ❌ · N6 (drop `--ff-only`) ❌ · N7 (re-insert "ทุกไฟล์รันซ้ำได้") ❌ · N8 (drop `@@index([crmDealId])`) ❌ · R2 (drop ⛔ on the URL-setup comment) ❌ · R3 vs R1 (PR body with only the 5 R1 sections: R1 ✅ R3 ❌) · Z1 (untracked src/ file) ❌.

## D. For the controller / owner
1. **Apply #37 on QC4/QC5?** Not done (shared DB). Pure `CREATE INDEX IF NOT EXISTS`; recommend applying it to QC4 and QC5 in the same step as the merge of this branch into session/pos (then verify self-test M1 turns 🟢).
2. Lane pins to re-pin after merge: `qc-pos-p3.8` ST3 · `qc-hf-fu2` ST1 (prisma diff).
3. `PosProductChannelPrice` `@@unique` declaration (deviation 2) — accept or rule otherwise.
4. Owner: none new beyond the runbook GO list; W33/W34 now have tools (`--counts`, `--crons`). ⚠️ assumptions to prove in the rehearsal: resolve-first paths ข/ง, crontab lock paths, `pnpm install` on the dispatcher checkout.
5. PR body (R1 + R3) still to be written by the controller: must carry the §0 order (vercel-build · migrate before merge · `POS_DEVICE_KEY`) and the forward-fix rollback policy.
