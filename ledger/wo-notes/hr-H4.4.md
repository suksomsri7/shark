# WO H4.4 — people lifecycle (builder notes)

Tree `shark-hr-b` · branch `wip/hr-h4.4` from 37fa508f0 (base `session/hr` 2e23c8164) · lane DB l2 (`ep-orange-dust`, via `scripts/qc-hr.sh`) · green run `hr-H4.4-green.txt`.

## 0. Checkpoint
- done: migration applied on l2 · lifecycle.ts + bridge + consumers/labels/cron · UI (register panel, profile, settings) · seed §6 · oracle 67/67 forced ×2 + unforced · regressions · typecheck 0.
- next: controller screenshot run (§5) → control run (seed changed ⇒ FULL).

## 1. Files
New: `src/lib/modules/hr/lifecycle.ts` · `lifecycle-actions.ts` · `lifecycle-ui.tsx` · `src/lib/platform/hr-lifecycle-bridges.ts` · `prisma/migrations/20261231000000_hr_lifecycle/`.
Edited: `hr.prisma` · `hr/actions.ts` (remove + ENDED save → offboardEmployee) · `hr/ui.tsx` (panel mount) · profile + settings pages · `outbox-consumers.ts` / `automation/labels.ts` / `cron/hourly/route.ts` (one marked hunk each) · `messages/{th,en}` (`hr.life`) · `hr-ui-inventory.json` (+23) · `fitness-hr.mts` (F16.1 offboardNote · F16.5 lifecycle.ts) · `hr-qc-env.mts` + `seed-hr-qc.mts`.

## 2. Migration runbook
Migrate first, then deploy. Pre-check: none (additive; the FK swap is DROP/ADD CONSTRAINT on HrReviewNote, which has no product writer before H4.4). Note: PostgreSQL reports RESTRICT refusals as 23001.

## 3. Controller rulings applied
Q1 endFuture text names the contract end date · Q4 confirmation states payslip loss · Q11 spanning leaves (APPROVED or PENDING) untouched, counted · offboarding revokes PIN + app access (membership acceptedAt null, linked rows unlinked) + push bindings inside the offboarding transaction (not via `revokeStaffAccess` after commit).

## 4. ORACLE-EDITs
qc-hr-h4.4 S8.2 (TASK_KEYS not sorted) · S11.1 (P2010 meta code; RESTRICT = 23001) · qc-hr-h1.3 S1.12/S4.6 (Q13) · S6.1 (lifecycle.ts excluded) · S7.3 (0/1/13) · qc-hr-h1.2 S5.1/S5.2 (PRIOR_WO_KEYS + 4 columns) · seed ML1 (Q13).

## 5. Debts
D1–D5 of the brief · D6 ex-employee payslip access = owner export (Q4) · D7 in-tx revoke unlinks employee rows of this HR system only (other HR systems of the tenant keep the link; membership is revoked tenant-wide) · D8 OWNER-linked employees (or non-STAFF targets of a non-owner) keep app access (accessRevoked:false) · qc-hr-h1.2 S7.4 red pre-existing (seed step 9d roster 48 rows since H2.2, not touched here).
