# HF-TENANT — oracle + test environment (17 Nov 2026)

Brief: `ledger/hr-briefs/hr-brief-HF-TENANT.md` (on `session/hr`). Oracle writer only — no product code, schema or migration in this commit.

## Environment
- Worktree `/root/projects/shark-hr-hf` · branch `hotfix/hr-hf-tenant` · base `origin/main` **bda823d22** (same commit the brief's line numbers use). Own `node_modules` (real dir, `pnpm install --frozen-lockfile` + `prisma generate`). Not pushed.
- Test DB: **database `hf_tenant`** created (`CREATE DATABASE`, empty) on the HR lane-5 QC branch host **ep-orange-dust-aotwbyc7** (Neon, PG 18). No Neon branch created. The lane's own `neondb`, QC4 and production were not touched. Note: the database lives on the lane-5 branch — deleting that branch deletes `hf_tenant`.
- `.env.qc-hf` (mode 600, ignored by `.env*`): DATABASE_URL (pooler) / DIRECT_URL point at `hf_tenant`; other variables copied from lane-5 `.env.qc-hr` minus `NEON_API_KEY`, `NEON_PROJECT_ID`, `SHARK_VERCEL_*`.
- `scripts/qc-hf.sh`: refuses prod/QC1/QC4 marks, any host other than ep-orange-dust-aotwbyc7(-pooler), any database other than `hf_tenant`; gate lock `/tmp/shark-gate-hf-tenant.lock`; exports `HF_QC_DB=hf_tenant`. Negative-tested (neondb / ep-royal-night / ep-frosty-lab / other host → exit 4).
- `scripts/qc-env-guard.mts` on main has no host allow-list (prod deny only) → no change needed.
- `prisma migrate deploy` (main's 208 migrations) through `iso.sh` + `qc-hf.sh`: all applied. Pre-check SQL A: `HrSalaryProfile_systemId_employeeId_key`, `HrPayrollRun_systemId_periodKey_key` both present, `indisvalid = t`. `HrPayrollRun.reversedAt` absent.
- **Main already drifts by one item on a clean DB**: `pnpm drift` exits 2 with `DormUtilityRate` "Removed unique index (unitId, buildingId, kind, periodKey)" (raw-SQL `NULLS NOT DISTINCT` index from `20261223000000_svc_d`). M5 treats that as the baseline.

## Run
```
bash scripts/iso.sh bash scripts/qc-hf.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-hf-tenant.mts            # full
bash scripts/iso.sh bash scripts/qc-hf.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-hf-tenant.mts --mig-seed           # before migrate
bash scripts/iso.sh bash scripts/qc-hf.sh pnpm exec prisma migrate deploy
bash scripts/iso.sh bash scripts/qc-hf.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-hf-tenant.mts --mig-check          # after migrate (M1–M5 + sweep)
pnpm exec tsx scripts/qc-hr-hf-tenant.mts --static | --list                                                                                # no DB
```
Without `QC_FORCE=1` and without `hr-target.ts` → SKIPPED (exit 0). Refuses to start (exit 4, nothing written) unless both URLs are ep-orange-dust-aotwbyc7 / `hf_tenant`, `HF_QC_DB` is set by the wrapper, `current_database() = hf_tenant` and `HrPayrollRun.reversedAt` does not exist. Fixture tenants `qc-hr-hft-<stamp>-a/-b`; sweep = every table with `tenantId`/`systemId` of those tenants/systems (DO-block, FK-retry) + `account_jno_drop` for the ACCOUNT system + sessions/users; Z1 recounts all of them. `--mig-seed` tenants (`qc-hr-hft-mig-*`) stay until `--mig-check`.

## Checks — unfixed main (bda823d22), full run, `QC_FORCE=1` → `hr-HF-TENANT-red.txt` (6/17, exit 1, no crash, Z1 green)
| id | unfixed main | why (evidence) |
|---|---|---|
| T1 | RED | B writes `HrSalaryProfile` on SA/U/SN for a ghost employee, updates the residue profile (B,SA,eA2); eA1 = P2002 throw (no write) |
| T2 | RED | B creates `HrPayrollRun`+items on SA from residue profiles (and on U/SN from the T1 junk) |
| T3 | RED | 54 drives: `AuditLog` row for every approve/markPaid/reverse; residue run approved/paid (+ `hr.payroll.paid` outbox) |
| T4 | RED | request on SA with the residue employee → `HrPayAdjustment` written ("ยื่นแล้ว 5,000 บาท"); decide/cancel of residue rows → approved/deleted + audit; SA answer ≠ U answer |
| T5 | RED | create → `HrEmployee` (+`Party` when the system is SA) on SA/U/SN; update/remove/restore of the residue employee on SA |
| T6 | RED | 23/52 keys differ between SA / U / SN |
| T7 | RED | no `hr-target.ts`, no import, first await of every action = the service call |
| T8 | RED | clock → `HrAttendance`, requestLeave → `HrLeave` + `hr.leave.submitted` outbox on SA/U/SN |
| C1 | GREEN | owner A + payroll staff A, complete forms, every action reaches its write: employee create(+Party)/update/remove/restore, profile, 2 requests, decide (APPROVED + audit), cancel (deleted + audit), run (2 items, add 100,000), approve (JV posted, journalEntryId), markPaid (PAID + outbox + audit), reverse (REVERSED + audit), clock, leave (+outbox) |
| C2 | GREEN | own SA + ghost runId → exactly one `AuditLog` row each, nothing else |
| C3 | RED (by design) | own SA + ghost employee → orphan profile written |
| M1 | RED | new index names absent, old present |
| M2 | RED | owner A setProfile(eA2) and createRun(P2) → P2002 against residue (B,SA,…) |
| M3 | GREEN | duplicate (A,SA,eA1) / (A,SA,P1) → P2002 |
| M4 | GREEN | residue rows unchanged |
| M5 | GREEN | only the DormUtilityRate baseline (schema not changed yet) |
| Z1 | GREEN | residue 0 |

**Positive control (temporary, uncommitted, reverted):** copied V2 `hr-target.ts` + 14 guards exactly as §1 → 15/17 (only M1, M2 red). + schema `@@unique` change + brief §3 SQL applied with psql (twice: idempotent, no `_prisma_migrations` row) → `--mig-check` 6/6, full 17/17. Indexes then reverted with psql (state = main again: old indexes, 208 migrations, 0 tenants/users) → `--mig-check` with patched schema: M1, M2, **M5 red** (drift shows HrPayrollRun/HrSalaryProfile) — proves M5 catches schema-without-migration. Tree reverted (`git status` clean except the committed files).

## Deviations from the brief
1. DB = new empty database `hf_tenant` on the lane-5 host, not a new Neon branch (controller's order: project at branch limit; a branch copies prod data).
2. M5 = "no `Hr*` table in `prisma migrate diff`, changed tables ⊆ {DormUtilityRate}", not `pnpm drift = 0` — main is never 0 (see above). M5 is GREEN on unfixed main; it is RED only in the half-done state (schema changed, not migrated).
3. M-checks run three ways: inside the full run (fresh seed), and `--mig-seed` → migrate → `--mig-check` for the real before/after on the same rows (R1 rehearsal).
4. T1 drives ghost / eA2 / eA1 on all three systems (brief: SA × 3 + U + SN) so T6 can compare every key.
5. T4 SA-vs-U answer compared for both actors × {fake employee, eA1} × {BONUS, OT-by-hours}. Both attackers are payroll viewers (brief: XP holds `hr.payroll.*`); a non-viewer attacker is not driven.
6. `inScope` taken from main's `qc-hf-o23.mts` (same technique as V2 `qc-hr-priv-3-lib.mts:127-133`); no `qc-hr-lib` import (does not exist on main). Single file, ~46 KB (≤ 60 KB).

## Verified "ยังไม่ได้ยืนยัน" items
- Next internals used by `inScope` (`work-async-storage.external.js`, `work-unit-async-storage.external.js`, `spec-extension/cookies.js`) exist on main; next 16.2.11 on main and on lane trees; C1 proves actions run in scope.
- `adjustmentReplyForViewer` non-payroll branch (`privacy.ts:185-210`): "ไม่พบพนักงาน" contains no "เงินเดือน" → passed through unchanged, **except** OT-by-hours (`byHours`) where a non-viewer always gets `ADJUST_REFUSED_GENERIC`. The literal guard therefore gives a non-viewer filing OT-by-hours "ไม่พบพนักงาน" on a foreign system vs the generic text for a missing employee in its own system. SA = U = SN still holds (T6) and V2 uses the same literal → oracle pins the literal (T7). Controller may rule otherwise (ORACLE-EDIT T7 P6 refusal).
- Table names: `AppSystem`, `AuditLog`, `OutboxEvent`, `Party`, `HrAttendance`, `HrLeave`, `HrPayrollItem`, `HrPayAdjustment` exist with `tenantId`/`systemId`/`targetId`/`action` as the pre-check SQL D/E assume.
- Migration folder `20261229000000_hr_hf_tenant_unique_keys`: no folder with that timestamp on any local/remote ref (only `20261229100000_*`, `20261229110000_*` on `session/account-fix`, which sort after).
- `scripts/fitness.mts` has no rule that counts files in `src/lib/modules/hr/` (grep) — builder still runs `pnpm fitness` after adding the file.
- Not verified (outside the oracle): Prisma's transaction handling of the migration file / `SET lock_timeout`; priv-3 S6 `newMigs()` after merge.

## Builder scope (line numbers on bda823d22, all verified by the positive control)
- `src/lib/modules/hr/hr-target.ts` — new, byte-copy of `session/hr:src/lib/modules/hr/hr-target.ts` (blob `d033fd775909d57ccf5e4874ae3069833b73ac21`, T7 checks it).
- `src/lib/modules/hr/payroll-actions.ts` — `import { hrTargetOwned } from "./hr-target";` after :21 · guard after :45 (P1, `{ employeeId }`) :69 :82 :103 :124 (`return;`) · :171 (`return { status: "error", message: "ไม่พบพนักงาน" };`) · :209 :239 (`return { ok: false, reason: "ไม่พบรายการ" };`).
- `src/lib/modules/hr/actions.ts` — import after :24 · guard (`return;`) after :50 (create) :68 (clock) :81 (update) :96 (remove) :106 (restore) :236 (requestLeave).
- Guard text T7 expects: `if (!(await hrTargetOwned({ tenantId: auth.active.tenantId, systemId }<, { employeeId }>))) <refusal>` — first await after `requireTenant()`; a trailing `// HR … ◂` comment is fine.
- `prisma/schema/payroll.prisma:68` → `@@unique([tenantId, systemId, employeeId])` · `:92` → `@@unique([tenantId, systemId, periodKey])`.
- `prisma/migrations/20261229000000_hr_hf_tenant_unique_keys/migration.sql` = brief §3 SQL (ran twice on hf_tenant via psql: idempotent).
- Then: `migrate deploy` on hf_tenant through `qc-hf.sh`, oracle full + `--mig-seed`/`--mig-check`, main's HR suites, fitness, typecheck.
- typecheck (iso.sh · ISO_MEM=14000M · max-old-space 12288): `tsc --noEmit` exit 0 on this commit's tree.

## Round 2 — controller rulings after review (`hr-HF-TENANT-review.md` F1, F2, F6) · head a6878cfd7
Oracle now 20 checks. Evidence on a6878cfd7 (builder's fix, hotfix migration applied on hf_tenant): `hr-HF-TENANT-r2-red.txt` — **17/20, red T7, T9, T10**; every earlier check (M1–M5, C1–C3, T1–T6, T8, Z1) stays GREEN; new C4 GREEN. Typecheck exit 0.

| id | a6878cfd7 | evidence |
|---|---|---|
| T9 (R-F1) | RED | XO/XP on their own SB with eA1/eA2: clock → `HrAttendance:B`, requestLeave → `HrLeave:B` + `hr.leave.submitted` outbox; ghost employee on SB → FK error (different answer); read-side: B rows referencing A's employees |
| T10 (R-F2) | RED | 8/8 actions on SA with B's residue rows write: save profile (HrEmployee + Party, "บันทึกแล้ว"), add doc, remove residue doc, kiosk clock ("<residue name> · เข้างาน"), set PIN, decide leave (+audit), bulk decide (done 1), schedule; ghost ids → refusal |
| T7 | RED | 22 actions now: clock/requestLeave guards must pass `{ employeeId }`; 8 new guards absent |
| C4 (control) | GREEN | owner A + payroll staff A on A's own employee (the one C1 creates): save profile (name + nationalId saved), add doc, remove doc, set PIN, kiosk clock with that PIN (+1 attendance), schedule (2 rows), decide leave (C1's leave → APPROVED), bulk decide (second leave → REJECTED, done 1) |
| C1 | GREEN | clock/leave already run on a real own employee (the employee C1 creates) — unchanged |

Fixture additions: B's residue employee `fB` has PIN 9876 · residue `HrEmployeeDoc` (B,SA,fB) · residue leaves resLv1/resLv2 (B,SA,fB, PENDING) · F6: attacker **XM** = STAFF of B with only `hr.payadjust.request` (not a payroll viewer), added to the T4 request drives (green on head: guard answers "ไม่พบพนักงาน" on SA/U/SN). Snapshot now also fingerprints `HrEmployeeDoc`, `HrWorkSchedule`.

T10 rule: on SA, residue-id drive and ghost-id drive must both write nothing and give the same answer (ids normalised to `<id>` for bulk's per-id list) — i.e. the answer no longer reveals or uses residue rows.

**Positive control (temporary, uncommitted, reverted — `actions.ts` restored byte-for-byte):** the guards below → `--static` green, full run **20/20**.

### Builder scope round 2 (line numbers on a6878cfd7, `src/lib/modules/hr/actions.ts` only)
Guard form `if (!(await hrTargetOwned({ tenantId: auth.active.tenantId, systemId }<ids>))) <refusal>` — refusal = that action's existing answer for an unknown id:
| action | where | ids | refusal |
|---|---|---|---|
| clockAction | edit :71 | `, { employeeId }` | `return;` |
| requestLeaveAction | edit :243 | `, { employeeId }` | `return;` |
| saveEmployeeProfileAction | after :137 (`assertHrCan`) | `, { employeeId }` | `return { status: "error", message: "ไม่พบพนักงาน" };` |
| addEmployeeDocAction | after :156 (`if (!systemId \|\| !employeeId) return;`) | `, { employeeId }` | `return;` |
| removeEmployeeDocAction | after :173 (`if (!systemId \|\| !docId) return;`) | system only | `return;` |
| setPinAction | after :183 (`assertHrCan`) | `, { employeeId }` | `return { status: "error", message: "ไม่พบพนักงาน" };` |
| kioskClockAction | after :207 (PIN-format check), **before `checkRateLimit` :208** | `, { employeeId }` | `return { status: "error", message: "ไม่พบพนักงาน" };` |
| decideLeaveAction | after :262 (input check) | system only | `return;` |
| bulkDecideLeaveAction | after :290 (`leaveIds.length === 0` check) | system only | `return { status: "error", message: "ไม่พบระบบ" };` |
| setWorkScheduleAction | after :305 (`if (!systemId \|\| !employeeId) return;`) | `, { employeeId }` | `return;` |
`hr-target.ts` unchanged (R-F3: byte-identical to V2).

Notes on the choices (open for the controller):
- **kioskClockAction** is not anonymous: it calls `requireTenant()` + `assertHrCan("hr.attendance.clock")` (the kiosk page runs on the shop's logged-in session); the PIN identifies the employee *within* that tenant/system. So the ordinary guard fits. Placed before `checkRateLimit` so a foreign or unknown employee id no longer consumes the per-employee PIN bucket (the bucket key is still `hr-kiosk:${employeeId}`, not tenant-scoped — reviewer side note, unchanged).
- **removeEmployeeDocAction** — system only: the form's `employeeId` is used only for `revalidatePath`; the doc is found by `docId` inside (tenant, system), so passing `employeeId` would not bind the doc to the employee.
- **decideLeaveAction / bulkDecideLeaveAction** take leave ids, which `hrTargetOwned` cannot check → system only. Answers differ from today's unknown-leave answer: decide today *throws* `HrLeaveDecisionError("ไม่พบใบลา หรืออยู่นอกร้านนี้")`, guard returns void (same shape as every other void guard); bulk today returns `{ done: 0, failed: [{ id, "ไม่พบใบลา…" }] }`, guard returns the action's existing "ไม่พบระบบ" error. SA = U = SN still holds. If the controller prefers byte-identical answers, ORACLE-EDIT T7 refusal for these two.
- **setPinAction / saveEmployeeProfileAction**: guard sits before the service's input validation, so a foreign/unknown id with an invalid PIN (or invalid profile field) now answers "ไม่พบพนักงาน" instead of the validation message — own valid employees unchanged.
- Debt (R-F3, not in this hotfix): non-string bound `systemId` passes `hrTargetOwned` (reviewer F3); fix on V2 + main together later.
