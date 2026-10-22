# WO H1.3 — Money and law model (HrLawTable global · HrWorkEntry · HrReviewNote · HrOnboardingTask · HrPayrollRun +7 · HrPayrollItem +2 · HrPayAdjustment +2 · scripts/hr-seed-law-draft.mts)

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h1.3` cut at 83806223 (= session/hr c7753731 with H0.7 + H1.1 + H1.2 merged + H1.3 oracle) · 22 Oct 2026 · controller: Fable · builder: this lane (Opus)
> Contract: brief `ledger/hr-briefs/hr-brief-H1.3.md` §2 R1–R10 · §9 rulings Q1–Q16 · §10 rulings on oracle flags · `hr-brief-COMMON.md`
> Oracle: `scripts/qc-hr-h1.3.mts` (63 checks · **not edited by the builder**) · green run `ledger/wo-notes/hr-H1.3-green.txt`
> DB: QC4 only — `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<file>.mts`

## 0. Checkpoint
- done: step 0 (generate · forced oracle on the untouched base = 22/63, `BASE-EXPECTATION 63/63 as registered` — 41 RED / 22 GREEN, all GREEN controls green) · QC4 `migrate status` (157 folders incl. 1201–1205000001 applied, up to date) · schema · migrate diff · migration applied on QC4 · generate · R3/R6/R8/R9 · law seed dry-run + `--apply` ×2 on QC4 · seed-hr-qc ×3 · oracle forced ×3 + unforced ×1 = 63/63 · regressions (§5) · fitness + fitness-hr both modes · typecheck (§5)
- next (controller): rule D-1 / D-2 (ORACLE-EDITs in other suites) · reviewer (schema + race + money) · owner GO for the prod law seed (§6)

## 1. Files touched
| file | new/edited | what | R |
|---|---|---|---|
| `prisma/migrations/20261206000000_hr_money_law_model/migration.sql` | new | header pre-checks + 28 Prisma statements + 9 raw (37 total) | R1 |
| `prisma/schema/payroll.prisma` | edited | enums HrLawKind/HrLawStatus/HrWorkEntryKind/HrPaySource · models HrLawTable/HrWorkEntry · HrPayrollRun +7 · HrPayrollItem +2 · HrPayAdjustment +2 (+ reader-rule comment, `@@index([systemId, sourceType])`) — crmCommissionId block byte-identical (sha 119baf15…) | R1 R2 R4 |
| `prisma/schema/hr.prisma` | edited | enums HrReviewNoteKind/HrOnboardingKind · models HrReviewNote/HrOnboardingTask · HrEmployee back-relations workEntries/reviewNotes/onboardingTasks | R1 |
| `src/lib/core/scope.ts` | edited | HrWorkEntry/HrReviewNote/HrOnboardingTask `sys()` · HrLawTable `g("…")` | R8 |
| `scripts/hr-qc-env.mts` | edited | HR_TABLES +4 (hrLawTable `tenantId: false`) · HR_DELETE_ORDER +3 before hrEmployee (no hrLawTable) | R8 |
| `scripts/fitness-hr.mts` | edited | F16.1 SENSITIVE_FIELDS += ytdJson, filingJson, bankFileKey | R6 |
| `scripts/hr-seed-law-draft.mts` | new | LAW_V1_ROWS · LAW_V1_DIGEST · verifyAgainstFrozen() · CLI dry-run/--apply/--key-prefix · main guarded on argv[1] | R3 |
| `scripts/seed-hr-qc.mts` | edited | section 9c check ML1 (read-only) · expected `moneyLaw {"HrPayrollRun.engineVersion", "HrLawTable.v1"}` | R9 |
| `payroll.ts` · `payroll-rules.ts` · `crm/commissions.ts` · `outbox-consumers.ts` · `account/**` | **untouched** | R5 (S5.5–S5.7 green) | |

## 2. Migration / seed
- `prisma migrate diff --from-schema <HEAD 83806223 schema> --to-schema prisma/schema --script` = 28 statements, read: 6 CREATE TYPE · 3 ALTER TABLE ADD COLUMN (adjustment 2 nullable no default · run 7, only `engineVersion INTEGER NOT NULL DEFAULT 1` · item `lawRowIds TEXT[] DEFAULT ARRAY[]::TEXT[]` + `ytdJson JSONB`) · 4 CREATE TABLE · 12 indexes (2 unique: law sourceKey, work entry (employeeId,date,kind)) · 3 FK CASCADE to HrEmployee. No DROP/RENAME/ALTER COLUMN/ALTER TYPE; `HrPayAdjustment_crmCommissionId_key` and the H0.6 live unique not touched (S1.10 indexdefs byte-equal).
- Raw (9, wording copied from the oracle header S1.6 forms): `HrPayAdjustment_tenant_source_key` (tenantId,sourceType,sourceRef) WHERE sourceRef IS NOT NULL · CHECK sourceRef⇒sourceType · CHECK crmCommissionId∧sourceRef forbidden · law ACTIVE partial unique (kind,effectiveFrom) · ACTIVE sign-off CHECK · onboarding (employeeId,kind,templateKey) WHERE templateKey IS NOT NULL · minutes 0..1440 · score NULL or 1..5 · engineVersion ≥ 1.
- Applied: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` → "20261206000000_hr_money_law_model … successfully applied" · `prisma generate` (own node_modules).
- Law seed on QC4 (`… env QC_FORCE=1 pnpm exec tsx scripts/hr-seed-law-draft.mts [--apply]`): dry-run exit 0 `จะสร้าง 4 · มีอยู่แล้วตรงกัน 0 · ไม่ตรง 0` · apply #1 exit 0 `created 4 · unchanged 0 · mismatched 0` · apply #2 exit 0 `created 0 · unchanged 4 · mismatched 0` · verify line `AST=ตรง · คิดจาก json 4585 ค่า ต่าง 0` · **digest 0ed9de8c2c4df9b4b05ce320889318cc4c755527448f56628235960ae38d9470** (= frozen).
- seed-hr-qc: 28/28 (new ML1) on run #1; counts identical across runs (md5 of counts equal on runs 2 and 3) — **diff for the controller:** counts unchanged vs H1.2 (no new tenant rows; the 3 new tenant tables stay 0 and are omitted by `countsOf` > 0) · `hr-expected.json` (not committed) gains `moneyLaw: {"HrPayrollRun.engineVersion": 1, "HrLawTable.v1": 4}` (the v1 value is the live global count written by `hr-seed-law-draft --apply`, ML1 asserts it = LAW_V1_ROWS.length and all DRAFT).
- Seed runs 2/3 were 27/28: O1 "ร้านอื่นไม่เปลี่ยน" red because other lanes (POS) created/removed tenants and posSale rows on QC4 during the seed (tenant 33→35→34, posSale 531→522→519) — environmental race, not H1.3; run #1 and the last re-run are recorded in §5.

## 3. Script contract (R3 · oracle fixed points §10.5)
- sourceKey `${prefix}:${kind}` (default prefix `v1`) · rows SSO, TAX_BRACKET, DEDUCTION, OT · effectiveFrom `1970-01-01` · status DRAFT · note Thai "ค่าจากเครื่องคิดเงินเดือนรุ่น 1 … รอนักบัญชียืนยัน (HQ23)".
- verifyAgainstFrozen() → `{ ok, staticOk, vectors, mismatches, digest, note }`: TS-AST of payroll-rules.ts = LAW_V1_ROWS **and** own evaluator over the json vs the frozen functions on 4,585 vectors = 0 mismatches; runs before any DB connection; fail ⇒ exit 1, nothing written.
- Apply = one `$transaction` with `pg_advisory_xact_lock`; per row `INSERT … ON CONFLICT ("sourceKey") DO NOTHING RETURNING id`; re-read; any mismatch ⇒ rollback. A pre-existing row with the same sourceKey but different kind/date/json ⇒ exit 1, Thai refusal, nothing written (S2.7). Never writes ACTIVE, never UPDATE/DELETE.
- env like `hr-backfill-pin-hash.mts`: default `acc-v2-env.loadQcEnv()`; prod needs `HR_SEED_LAW_PROD=1 HR_SEED_LAW_ENV_FILE=<file>` with no DATABASE_URL in the shell; prod host without the flag ⇒ exit 3. Prints host only.

## 4. X-group
| X | applies? | check ids |
|---|---|---|
| X1 idempotency | yes | X1.1 · S2.6 · S3.1 · S3.8 · S4.1 · S4.7 |
| X2 isolation | yes | X2.1 (other tenant ok · second system same tenant 23505 by design Q14) · X2.2 · S3.3 |
| X3 permissions | N-A | no action/UI/permission key (R7) |
| X4 money | yes | S5.1–S5.4 (MONTHLY digest/totals/flags frozen) · S2.3 |
| X5 reversal | yes | S5.8 (path digests frozen) |
| X6 race | yes | S3.1 · S3.8 · S4.1 · S4.7 (10 lanes × 3 rounds) |
| X7 time | yes | X7.1 · S4.5 (2028-02-29) |
| X8 not connected | yes | X8.1 |
| X9 outbox | N-A | no new event (S6.6) |
| X10 visual | N-A | no UI |
| X11 PDPA | yes | S6.1–S6.4 · F16.1 += 3 keys |
| X12 no env | yes | X12.1 · fitness/fitness-hr without env |

## 5. Regression (branch head 43100604 + notes; every suite forced through qc4.sh + gate lock)
| suite | result |
|---|---|
| `qc-hr-h1.3` forced ×3 · unforced ×1 | 0 · 63/63 each · RESIDUE none |
| `qc-hr-h1.2` | 0 · 73/73 |
| `qc-hr-h1.1` | 0 · 81/81 |
| `qc-hr-h0.7` | 0 · 74/74 |
| `qc-hf-hr-privacy` | 0 · 194/194 |
| `qc-hr-h0.1` | **1 · 66/67 — S4.2 payroll.prisma SCHEMA_SHA freeze (D-1, same as H0.6 / H1.1 D-4)** |
| `qc-hr-h0.2` · `qc-hr-h0.5` | 0 · 58/58 · 71/71 |
| `qc-hr-h0.6` (QC_H06_BASE=d350c26c…) | 0 · 55/55 |
| `qc-payroll` · `qc-hr-payadjust` · `qc-payroll-reverse` | 0 · 19/19 · 27/27 · 14/14 |
| `qc-crm-c3.3` | **1 · 89/90 — C3.3-S0.4 "C3.3 ships NO migration" lists `20261206000000_hr_money_law_model` (D-2)** |
| `qc-crm-c0.3` · `qc-account-cpa` · `qc-approval-wiring` · `qc-nav-functions` | 0 · 88/88 · 107/107 · 7/7 · 11/11 |
| `seed-hr-qc` ×4 | 28/28 · 27/28 · 27/28 · 27/28 — the 27s are O1 only (POS lane writing posSale/tenants on QC4 during the seed, see §2) · counts md5 identical on runs 2–4 (09fd0779…) · every H1.3 check (ML1) green |
| `pnpm fitness` with env / without | 42/42 · 42/42 (+ pre-commit ×4 green) |
| `fitness-hr` with env / without | 7/7 · 7/7 |
| typecheck (1 run; MemAvailable 10156 MB, no build/tsc unit; NODE_OPTIONS 8192 · ISO_MEM 9800M) | exit 0 · 0 errors · tsbuildinfo 20:12:11 → 21:30:19 UTC |

## 6. Prod runbook (brief §6 confirmed)
1. Read-only pre-checks (in the migration header): `_prisma_migrations` has the 6 HR folders 1201–1205000001 finished · 0 of the 6 new types · 0 of the 4 new tables · info: CRM-linked adjustment count, HrPayrollRun count.
2. `migrate deploy` (one transaction) then the code in the same Vercel build — old code never names the new columns; new code has no reader.
3. Post-checks: run/item/adjustment counts unchanged · 4 new tables empty · every run engineVersion 1 · no HrLawTable row yet.
4. Law seed (owner-pending): `HR_SEED_LAW_PROD=1 HR_SEED_LAW_ENV_FILE=<prod env file> pnpm exec tsx scripts/hr-seed-law-draft.mts` (dry-run) → read: `AST=ตรง · … ต่าง 0`, digest 0ed9de8c…, `จะสร้าง 4 · … ไม่ตรง 0` → **owner GO** → same with `--apply` → expect `created 4 · unchanged 0 · mismatched 0`; re-run = `created 0 · unchanged 4`. Expect 4 DRAFT rows, 0 ACTIVE.
5. Rollback: code rollback safe; schema rollback not planned (additive).
6. (review F4) Deploy **off-peak**, not on a payday: the migration takes ACCESS EXCLUSIVE locks on HrPayAdjustment / HrPayrollRun / HrPayrollItem (ADD COLUMN + ADD CONSTRAINT CHECK scans the table) — short on today's sizes, but payroll writes queue behind it.
7. (review F6) On a fresh QC/dev database run `hr-seed-law-draft.mts --apply` **before** `seed-hr-qc` — check ML1 expects the 4 global `v1:*` DRAFT rows and is red without them.

## 9. Disputes / decisions
- **D-1 ORACLE-EDIT `qc-hr-h0.1` S4.2** — `SCHEMA_SHA` freezes `prisma/schema/payroll.prisma`; R1 must edit it (brief §2 R1). New hash: `686b1910df915a45f292cdf5d178e0446288736da55577d415748d902d875397` (same procedure as H0.6 / H1.1 D-4). rules / computeItem hashes still equal.
- **D-2 ORACLE-EDIT `qc-crm-c3.3` S0.4** — the check lists any migration after crm_v2_c whose SQL mentions `HrPayAdjustment`/`crmCommissionId`; H1.3 adds `sourceType/sourceRef` beside `crmCommissionId` and a CHECK naming it (R1/R4, ruled), without touching the column or its index (S1.10 indexdef byte-equal, S3.7/S3.8 C3.3 behaviour green). Proposed hunk: exclude `20261206000000_hr_money_law_model` in the `migs` filter (like `c51IndexOnly`), or only flag migrations that ALTER/DROP `crmCommissionId` or its index. CRM-owned oracle ⇒ controller routes it.
- Decisions: new models placed money-side (HrLawTable, HrWorkEntry → payroll.prisma) and people-side (HrReviewNote, HrOnboardingTask → hr.prisma) · `@@index([tenantId])` added on the 3 tenant tables (house convention) · no `updatedAt` on HrLawTable/HrWorkEntry (ruling §10.6) · `prisma format` NOT run (it reformats 16 unrelated schema files); new blocks hand-aligned.

## 10. Debts (in addition to brief §7 D1–D8)
| item | reason | closes in |
|---|---|---|
| seed-hr-qc O1 races with other lanes writing QC4 | environmental (shared QC4) | not H1.3 |
| `HrLawTable` has no `updatedAt` — the future activation path (status/approval update) has no row timestamp beyond approvedAt | ruling §10.6 optional | H3.3 |

## 11. QC4 restored / temp data
- oracle residue none ×4 · law rows `qc-h1.3-*` swept by the oracle · QC4 keeps the migration + the 4 global `v1:*` DRAFT rows (by design, S7.4) · seed re-run last (qc-hr-v2 rebuilt) · nothing of this lane running.

## R12. Review follow-ups (review `shark-hr-c/ledger/wo-notes/hr-H1.3-review.md` · verdict MERGE · controller ORACLE-EDITs D-1/D-2 at eddba717)
| finding | what | owner / status |
|---|---|---|
| F1 | HrLawTable is global and `tenantDb` passes global models through ⇒ "platform owner signs off" is convention only | **now:** fitness-hr **F16.9** (MAJOR) — no `hrLawTable` create/createMany/update/updateMany/upsert/delete/deleteMany, no `$executeRaw…HrLawTable`, no SQL INSERT/UPDATE/DELETE of "HrLawTable" under src/lib/modules/** · src/app/** · src/lib/ai/** (writes allowed: src/lib/platform/** · scripts/hr-seed-law-draft.mts) · **H3.3:** writes through platformDb only |
| F2 | one-link CHECK (`crmCommissionId` xor `sourceRef`) does not tie `sourceType` to the link (a CRM row could carry `sourceType = POS_SALE_LINE` with no sourceRef) | H2.9 (first sourceType writer — tighten the CHECK / reader rule there) |
| F3 | `qc-crm-c3.3` S0.4 tripwire scope (fixed by the controller's ORACLE-EDIT D-2: only DROP/RENAME/ALTER of crmCommissionId) | CRM owner |
| F4 | runbook: deploy off-peak | done — §6 step 6 |
| F5 | `hr-seed-law-draft.mts` accepted a `--key-prefix` value starting with `--` | **fixed:** unknown flag, duplicate flag, missing/`-`-leading/invalid `--key-prefix` value ⇒ usage message + exit 2, before verify and before any DB connection (evidence: `--bogus` · `--key-prefix --apply` · `--key-prefix` · `--apply --apply` · `x` → exit 2 each, no "DB host" line) |
| F6 | fresh QC: ML1 needs the law seed first | done — §6 step 7 |
| F7 | HrWorkEntry / HrReviewNote / HrOnboardingTask cascade-delete with the employee (retention of work-time snapshots and HR records after an employee row is deleted) | H3.1 (work entries frozen by a run) / H4.4 (notes, onboarding retention) |
- F16.9 evidence: real tree `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-hr.mts` ⇒ exit 0 · `✅ [F16.9] … สะอาด` · 8/8. RED control on a throwaway copy (/tmp, deleted) with a scratch `db.hrLawTable.update(…)` + `$executeRawUnsafe(\`UPDATE "HrLawTable" …\`)` appended to src/lib/modules/hr/payroll-digest.ts ⇒ exit 1 · `❌ [F16.9] … payroll-digest.ts:49 hrLawTable.update · … UPDATE "HrLawTable" · … $executeRawUnsafe(…)` · 7/8. Real tree never edited for the RED test. No DB suite / typecheck run in this round (controller unit hr-ctl-h13 owns them).
