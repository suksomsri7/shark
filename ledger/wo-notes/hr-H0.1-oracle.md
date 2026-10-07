# H0.1 — oracle writer notes (DRAFT run delete · recompute · approve-expect)

Worktree `/root/projects/shark-hr` · branch `wip/pos-hr-h0.1-oracle` (cut from origin/main f85f5455 ⊇ hotfix/hr-privacy afcb9bc3 — `merge-base --is-ancestor` OK) · DB = QC4 (`ep-frosty-lab`) via `iso.sh → qc4.sh → with-gate-lock.sh` only.
Brief: `ledger/hr-briefs/hr-brief-H0.1.md` (read from `origin/wip/pos-hrv2-plan`, not on this branch). No product code touched.

## Status / checkpoint
- [x] 1. read COMMON (HR + CRM house style/reports), brief, REVIEW §3.1/§6 #6/§8 D2, fixture oracles, AGENTS.md
- [x] 2. re-verified brief file:line on this base — all match: `payroll.ts` computeItem :259, createPayrollRun :324, approveRun :432, reverseRun hint :485/:496, markPaid :535, payrollRunPeriods :654, adjustmentsOfRun :698; `payroll.prisma` unique :92, cascade :101; `payroll-actions.ts` assertHrCan :25, approvePayrollRunAction :77; `payroll-ui.tsx` DRAFT branch :276
- [x] 3. oracle `scripts/qc-hr-h0.1.mts` (50 checks) — typechecks alone (`tsc -p <scratch tsconfig extending tsconfig.json, include only this file>` exit 0)
- [x] 4. unforced → SKIP exit 0 · forced → RED for the right reasons, no crash, no residue → `hr-H0.1-red.txt`
- [x] 5. commit + push
- next: builder (`wip/hr-h0.1`) makes it green without editing it; ORACLE-EDIT requests go to the controller

## Commands (from /root/projects/shark-hr)
- list (no DB): `pnpm exec tsx scripts/qc-hr-h0.1.mts --list`
- unforced: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.1.mts`
- forced: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.1.mts` (≈4 min; X6 spawns 2 worker processes of this file with `--h01-worker`)

## Summary lines (base f85f5455, 7 Oct 2026)
- unforced: `JSON_SUMMARY {"suite":"qc-hr-h0.1","total":0,"passed":0,"failed":[],"skipped":true,"reason":["…deleteDraftRun absent","…recomputeDraftRun absent"],"registered":50}` · exit 0
- forced: `===== qc-hr-h0.1 ===== passed 11/50 (QC_FORCE)` · JSON_SUMMARY failed 39 (38 CRITICAL + S4.7 MINOR) · crashed null · exit 1
- green on the base (controls / unchanged behaviour): S3.3 S3.4 S3.6 S4.1 S4.2 S4.3 S5.3 S6.0 X6.0 X6.6 Z1
- red on the base and why: S1.*, X2.*, S2.*, S5.1, S5.2, X6.1–X6.5 = `deleteDraftRun`/`recomputeDraftRun` MISSING (S1.3: re-create throws "มีรอบจ่ายงวด … อยู่แล้ว"); S3.1/S3.2/S3.5 = approveRun ignores `expect` (stale approve → APPROVED + JV); S6.1–S6.4 = actions MISSING; S4.4–S4.6 = no buttons/actions/expect fields; S4.7 = hint still "(ลบร่างได้เลย)"
- residue after the forced run (independent count through the same wrappers): tenants `qc-hr-h0.1-*` 0 · users 0 · CrmCommission `qch01*` 0 · adjustments by `qc-h01-requester` 0 · oracle Z1 green (4-pass sweep of every table with tenantId)

## Groups
S1 delete (9) · X2 cross-scope (3) · S2 recompute (9) · S3 approve guard (6) · S4 static (7) · S5 CRM C3.3 regression (3) · S6 viewer matrix via the real server actions in a Next request scope (5: owner · payroll viewer · payroll reader w/o create · MANAGER w/o payroll · STAFF with HR keys · plain member · employee himself · other tenant's owner) · X6 races (7: 5 scenarios × 3 rounds × 10 lanes in 2 worker processes + control + global invariant) · Z1.
Frozen hashes in the file (taken on this base): payroll-rules.ts, payroll.prisma, computeItem body, CRM C3.3 commission block, markPaid block.

## Open questions / interpretations (controller)
1. SKIP convention: the existing `qc-hr*`/`qc-payroll*` scripts have **no** SKIP guard at all; I followed `qc-hf-o23.mts` on this base (`QC_FORCE=1`, SKIP JSON_SUMMARY `skipped:true`, exit 0) and also accept `--force-run` (qc-crm-c3.3 spelling). Once the builder adds both functions the guard no longer triggers.
2. X6.1 "never APPROVED with the old numbers": read as "approve can only win if no recompute succeeded before it" — the oracle accepts either order (approve first ⇒ old numbers + 0 recompute ok + JV; recompute first ⇒ every stale approve refused, DRAFT, new totals) and fails any mix.
3. X6.4 "one run at the end" is not guaranteed by any implementation (creates that run before the delete see the old run and refuse ⇒ 0 runs) — oracle requires delete ok ×1, runs ≤ 1 and = creates ok, adjustments bound to the survivor or all unbound.
4. `actor` shape assumed `{ userId, isOwner }` (cancelAdjustment pattern); service results `{ ok, reason }`; refusals must be **returned** (a throw is red) per R2 "returned refusals"; recompute's non-DRAFT text is not fixed → only "Thai + returned".
5. Audit rows: `targetId = runId`; delete `before` needs `periodKey`, a key containing "count" = item count, the adjustment ids and the net anywhere inside; recompute needs before/after with old/new net and counts 3 → 2. Key names beyond `periodKey` are free.
6. S4.4/S4.5 are static heuristics: buttons must sit inside the `status === "DRAFT"` branch of payroll-ui.tsx (or the separate component must itself check `"DRAFT"`); approve `fields={{…}}` must carry `totalNet|expectNet` and `items.length|itemCount|expectItems` (or hidden inputs named so). The approve-with-expect **action** is not exercised at runtime because the form field names are not in the contract.
7. S4.7 wants the reverseRun hint to name the button (`ปุ่ม "ลบร่าง"` or a quoted «ลบร่าง»), MINOR.
8. S6 (action viewer matrix) is added per hr-brief-COMMON §C.2; it is not in the brief's §3 list.
9. Brief branch names (`wip/hr-h0.1-oracle`) overridden by the controller (`wip/pos-hr-h0.1-oracle`).

## Could not verify
- Full repo typecheck (controller's job). Pre-commit hook (fitness) passed — committed without --no-verify.
- The controller replaced `.env.qc4` before my first DB command; I never saw a permission error and never opened the file.
