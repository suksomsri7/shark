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

## 4b. r2 (reviewer M1/M2 · hunt F1–F3 · controller rulings 1–9)
Oracle addendum S16.1–S16.12 RED on the r1 tree (`hr-H4.4-r2-red.txt`), then fixed. App access: revoked in the offboard tx or the whole offboard is refused (STAFF target = offboard key suffices · MANAGER target = OWNER only · OWNER-linked row = always refused · untick while the shop policy revokes = OWNER only, result `accessKept`). The r1 debts D7/D8 are gone (tenant-wide unlink = the single row allowed by the partial unique `(tenantId, linkedUserId)`). The self row hides notes/checklist/offboard reason. Decided approval requests are kept and named in the offboard audit (`requestsKept`). The offboard audit is written in the tx with leave/swap/roster ids. pos-seam `clockSelf` has requireActive (one marked hunk; ORACLE-EDIT h4.4 S15.1 + h2.4 S12.3). h1.3 S6.1 narrowed to the 4 tokens.

## 4c. r3 (merge of session/hr 6c614c04c · H2.7 ledger)
APPROVED leaves after the end date are cancelled through leave.ts `leaveLedgerInTx(APPROVED→CANCELLED)` (use-revert + expire-late/carry-top) + `hr.leave.decided` in the offboard tx; PENDING ones need nothing (reservation = Σ pending). Combined lock order emp → clock → hr-leave:* (sorted) → hr-leave-emp → hr-swap:* (sorted) → roster keys; H2.7 takes hr-leave → hr-leave-emp → roster → policy row (FOR SHARE), swaps take hr-swap → roster, nobody takes hr:emp/hr:clock after a leave key ⇒ no cycle. D-H44-leave-race closed: H2.7 refuses approving a leave outside the employment window (S16.14). The due panel drops the viewer's own row; remove/ENDED save show "account kept".

## 5. Debts
D1–D5 of the brief · D6 ex-employee payslip access = owner export (Q4) · **D-H44-leave-race** (hunt F3 — closed in r3: H2.7 refuses approval outside the employment window, S16.14): `requestLeave` checks `active` outside its tx and takes no `hr:emp` lock. Repro: hold `LOCK TABLE "HrLeave" IN EXCLUSIVE MODE` → `requestLeave(from after the end date)` waits → `offboardEmployee` commits with `cancelled.leaves=0` → release ⇒ a PENDING leave on an ENDED employee. H2.7 refuses it at approval (outside the employment window) · qc-hr-h1.2 S7.4 red pre-existing (seed step 9d roster 48 rows since H2.2, not touched here).
