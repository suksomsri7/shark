# HF-TENANT — build (17 Nov 2026)

Branch `hotfix/hr-hf-tenant` · fix commit **9f05a5fea** (parent 6a3e0c34f oracle · base origin/main bda823d22) · **not pushed** · no prod, no deploy · DB = `hf_tenant` only (via `scripts/qc-hf.sh`).
Oracle `scripts/qc-hr-hf-tenant.mts` and `scripts/qc-hf.sh` not edited.

## Diff (line numbers = after the fix)
| file | change |
|---|---|
| `src/lib/modules/hr/hr-target.ts` | new · `git show session/hr:…` byte copy · `git hash-object` = `d033fd775909d57ccf5e4874ae3069833b73ac21` (= oracle's V2 blob) · no `"use server"` · not re-exported |
| `src/lib/modules/hr/payroll-actions.ts` | :22 import · :47 P1 setSalaryProfile (`{ employeeId }`, `return;`) · :72 P2 createPayrollRun (`return;`) · :86 P3 approve · :108 P4 reverse · :130 P5 markPaid (system only, `return;` — own system + unknown runId still writes the refusal audit, C2) · :178 P6 requestAdjustment (`{ status: "error", message: "ไม่พบพนักงาน" }` — controller ruling: plain literal, not via `adjustmentReplyForViewer`) · :217 P7 decide / :248 P8 cancel (`{ ok: false, reason: "ไม่พบรายการ" }`) |
| `src/lib/modules/hr/actions.ts` | :25 import · `return;` guards (system only) at :52 createEmployee · :71 clock · :85 updateEmployee · :101 removeEmployee · :112 restoreEmployee · :243 requestLeave |
| `prisma/schema/payroll.prisma` | :68 `@@unique([tenantId, systemId, employeeId])` · :92 `@@unique([tenantId, systemId, periodKey])` |
| `prisma/migrations/20261229000000_hr_hf_tenant_unique_keys/migration.sql` | brief §3 SQL, extracted programmatically from the brief's code block (verbatim) |

Every guard sits right after the action's existing input-validation `return` and is the first `await` after `requireTenant()` (T7). Each guard line carries a trailing `// HR HF-TENANT ▸ … ◂` comment (V2 uses `// HR PRIV-3 ▸ …` — merge back: take V2 side, as the brief says).
No code uses the Prisma compound keys `systemId_employeeId` / `systemId_periodKey` of these two models (the only `systemId_periodKey` hit is `accountPeriod` in `account/gl.ts`, unrelated); payroll.ts uses find→update/create.

## Results (all on `hf_tenant` through `iso.sh` + `qc-hf.sh` [+ `with-gate-lock.sh`])
- `--static`: T7 ✅
- Before/after: `--mig-seed` (tenants `qc-hr-hft-mig-mwkz1l53-*`) → `prisma migrate deploy` ("209 migrations found · Applying 20261229000000_hr_hf_tenant_unique_keys · applied") → `--mig-check` **6/6** (M1–M5 + Z1, mig tenants swept).
- Full oracle `QC_FORCE=1`: **17/17**, exit 0, Z1 residue 0.
- `_prisma_migrations` row: `20261229000000_hr_hf_tenant_unique_keys` started 17:33:53.846Z, finished 17:33:53.948Z, `applied_steps_count = 1`, logs NULL, not rolled back · 209 rows total. Indexes now: `HrSalaryProfile_tenantId_systemId_employeeId_key`, `HrPayrollRun_tenantId_systemId_periodKey_key` (old names gone).
- main's HR suites on hf_tenant: qc-hr 9/9 · qc-hr-attendance 31/31 · qc-hr-leave-booking 14/14 · qc-hr-roster 24/24 · qc-hr-payadjust 27/27 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hf-hr-privacy **193/194** (exit 0) — L-5 MAJOR: AI tool `pending_leaves` returns the employee name masked (`เพื่อนร่วมงาน •••••…77`) where the check expects the plain name. That path is `hr.requestLeave` (service) + `tools.runTool("pending_leaves")`; it touches none of the changed files (actions.ts / payroll-actions.ts are not called) and the index change cannot affect it → judged pre-existing on main. **Not verified by a baseline run on unfixed main.** None of these suites sweep their fixtures through the oracle's sweep (hf_tenant now holds their leftover QC tenants; the oracle's own Z1 counts only `qc-hr-hft-*`).
- `pnpm drift` (hf_tenant): exit 2, only `DormUtilityRate` "Removed unique index (unitId, buildingId, kind, periodKey)" = known baseline. No Hr* table.
- `pnpm fitness` 53/53 · `fitness-pos.mts` 8/8.
- typecheck: `ISO_MEM=14000M NODE_OPTIONS=--max-old-space-size=12288 bash scripts/iso.sh pnpm exec tsc --noEmit` exit 0 (MemAvailable 24.6 GB at start).
- Commit through `iso.sh git commit` with the normal pre-commit hook (fitness ✅) — no `--no-verify`.

## Unverified / notes
- Transaction: Prisma recorded the file as one step (`applied_steps_count = 1`, ~100 ms). Prisma's schema engine sends the whole script as one simple-query batch, which PostgreSQL runs as one implicit transaction (no explicit BEGIN/COMMIT in the file; `CREATE INDEX` without `CONCURRENTLY` is allowed in it). This is inferred from Prisma behaviour, not observed (no failure-injection test). `SET lock_timeout` not added (out of scope, brief §3).
- Migration idempotency on a V2 database (V2 indexes already present) not exercised here — only main's state.
- L-5 baseline on unfixed main not run (see above).
- Same-tenant behaviour: only intended change is C3 (own system + non-existent employee on setSalaryProfile is now refused). Covered by C1/C2/C3 + the 8 existing suites.
