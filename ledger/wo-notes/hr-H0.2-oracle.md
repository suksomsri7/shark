# H0.2 oracle — payroll run integrity (D1 leavers · D5 closed period · D6 negative net · D12 bogus period)

Worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h0.2-oracle` (base `origin/main` f85f5455, which contains `hotfix/hr-privacy` afcb9bc3) · DB = QC4 only (`ep-frosty-lab`) · oracle writer only, no product code touched.

## Status / checkpoint
- [x] read COMMON (HR + CRM), the H0.2 + H0.1 briefs, the master plan row and §9, REVIEW §3.1/§6/§8, owner answers 5 Oct, fixture oracles
- [x] re-verified file:line on the base: `payroll.ts` requestAdjustment :106-157 (manual path has no closed check), CRM closed check :618-620, decideAdjustment moves CRM rows only :190-199, computeItem :259-316, createPayrollRun :324-429 (profiles :338-341, no active/date filter), approveRun :432-484 (no net<0 guard), strandedCommissionAdjustments :788-808; `payroll-actions.ts:69` loose regex `^\d{4}-\d{2}$`, void action; `payroll-ui.tsx:55-71` early return for non-viewers; `gl.ts:1024` refuses negative JV lines
- [x] `scripts/qc-hr-h0.2.mts` (52 checks) · unforced → SKIP, exit 0 · forced → RED for the right reasons, exit 1, no crash, residue 0
- [x] brief: the H0.2 brief copied from `session/pos` + section "Oracle writer additions (7 Oct)" (OW-1…OW-10, OQ-1, OQ-2)
- next: builder (after H0.1 is accepted) on `wip/pos-hr-h0.2`

## Commands (VPS)
- unforced: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.2.mts`
- forced: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.2.mts`
- no-DB: `--list` (ids), `--hashes` (S5 hashes)
- file-only type-check: tsc with a scratch tsconfig that extends the repo one, run on this file → 0 errors. The full typecheck is the controller's job.

## Summary lines (base f85f5455)
- unforced: `JSON_SUMMARY {"suite":"qc-hr-h0.2","total":0,"passed":0,"failed":[],"skipped":true,…,"registered":52}` exit 0. Skip reasons: payroll.ts has no `runExclusions`, `strandedAdjustments` (H0.2), `recomputeDraftRun`, `deleteDraftRun` (H0.1).
- forced: `ผ่าน 16/52 (QC_FORCE)` exit 1, `"crashed":null` → `ledger/wo-notes/hr-H0.2-red.txt`
- green on the base (guards): S1.1 S1.4 S1.8 · S2.4 S2.5 S2.7 S2.11 S2.12 · S3.1 S3.8 · S5.1–S5.4 · X6.4 · Z1
- RED on the base, for these reasons: S1 out-cases are paid (S1.2/1.5/1.7 in=true), there is no PARTIAL_MONTH flag, the leaver's APPROVED bonus gets bound, 8 items instead of 5, `runExclusions`/`recomputeDraftRun` are missing · S2.1–2.3 the manual path accepts the row (`ok:true`, rows +1), there is no move to 2026-12, `strandedAdjustments` is missing · S3.2 no NEGATIVE_NET flag; S3.3 refused only by the JV ("บรรทัด JV ติดลบไม่ได้"), not by the guard; S3.6 the mixed run is APPROVED + posted; `deleteDraftRun`/`recomputeDraftRun` are missing · S4.1–4.4 rows created for 2026-13/2026-00/2026-1/""; S4.5 a Prisma validation error; the actions return `undefined` / throw · S5.5 the UI is not wired; S5.6 the loose regex and the void action · X6.1/X6.2 all 3 racing runs become APPROVED with a negative item; X6.3 rows end up APPROVED, unbound and not listed in the closed period
- residue: Z1 (every DMMF model that has a `tenantId`, counted for both temp tenants, plus tenant/user) green. An independent count after the run: `{"tenants":0,"users":0,"adjustments":0,"commissionRows":0,"hrSystemsByName":0}`

## Check map (ids `H0.2-…`)
- S1.1–S1.8 D1 matrix (period 2026-08): active → in · end 07-31 → out · end 08-15 + inactive → in + PARTIAL_MONTH, full amount · end 08-31 + inactive → in, no flag · start 09-01 → out · start 08-20 → in + PARTIAL_MONTH, full amount · inactive with no end → out · start 08-01 → in, no flag
- S1.9 an excluded person's APPROVED adjustment stays unbound (positive control: the included person's row gets bound) · S1.10 `runExclusions` = exactly 3 people with reason + name · S1.11 another tenant / another HR system sees none of them · S1.12 totals = Σ items, 5 items · S1.13 recompute → same membership and flags
- S2.1–S2.3 manual request into a DRAFT/APPROVED/PAID period → `PERIOD_CLOSED`, byte-identical to the CRM text, no row · S2.4 CRM reference · S2.5 open period ok · S2.6 `strandedAdjustments` = {manual P1, manual P4, CRM C1} · S2.7 `strandedCommissionAdjustments` = [C1], identical JSON · S2.12 REJECTED does not move · S2.8 approving P1 moves it 2026-09 → 2026-12 · S2.9 the 2026-12 run pulls it · S2.10 stranded = {C1} · S2.11 the CRM move to 2027-01 still works
- S3.1 vector net −8,300 (computeItem unchanged) · S3.2 NEGATIVE_NET only on the negative items · S3.3 approve(expect) refused with the exact N=1 text, DRAFT, JV +0 · S3.4 delete deduction (fixture) → recompute → net 91,700, no flag · S3.5 approve → APPROVED, Dr = Cr, bank Cr = net · S3.6 mixed run (2 negative, total > 0) refused with N=2 · S3.7 product path ลบร่าง → cancel → create → approve · S3.8 RN-10 (`ssoEligible:false`) 0/0 and no flag
- S4.1–S4.5 service refuses 2026-13 / 2026-00 / 2026-1 / "  " / Invalid Date (Thai, no row) · S4.6–S4.8 the action returns `{ok:false, reason}` for 2027-13, payDate 2026-02-31 / abc and a duplicate, and `{ok:true}` + a row for a valid period
- S5.1 computeItem hash · S5.2 payroll-rules.ts hash · S5.3 strandedCommissionAdjustments signature + body hash · S5.4 the PayrollSection guard comes before every read, and the non-viewer branch carries no flag text · S5.5 the UI wiring is after the guard · S5.6 the action uses PERIOD_RE and returns state
- X6.1/X6.2 approve ∥ recompute (5+5 lanes from 2 worker processes × 3 rounds): never APPROVED, JV +0, the negative item stays, ADVANCE bound once, every approve refused in Thai · X6.3/X6.4 decide(APPROVED) ∥ createPayrollRun (5+5 lanes × 3 rounds): every row is in the run, moved, or listed; add = Σ bound; one run per period; the losing creates get the Thai duplicate message
- Z1 residue

## Viewer matrix (COMMON C.2)
H0.2 adds two readers (`runExclusions`, `strandedAdjustments`) and flags inside `snapshotJson`. The only surface is the payroll page, which returns early for non-viewers (S5.4/S5.5). The slip page is a server component and renders only `baseSalarySatang`/`adjustments` from the snapshot. No new client payload, so there is no per-viewer DB matrix in this oracle; the payslip viewer rules stay covered by `qc-hf-hr-privacy`.

## Open questions / assumptions
- OQ-1 (approve refusal text vs `cancelAdjustment` refusing DRAFT-bound rows) and OQ-2 (requests for excluded employees): see the brief's additions.
- OW-7: the H0.1 `actor` shape is assumed to be `{userId, isOwner}`. The H0.1 oracle was not visible (lane 1 had pushed nothing when this was written).

## Unverifiable here
- The green side: the H0.1 functions do not exist on this base, so checks S1.13 S3.4 S3.5 S3.7 X6.1/X6.2 have only been seen RED with "missing". Their green-path logic is checked for type correctness only.
- On the base, X6.3 is timing-dependent (on this run, all 3 rounds stranded rows); X6.4 is green on the base.
- No env problem was seen: the `.env.qc4` replaced by the controller was the one in use for every run above (Tenant reads/writes succeeded).
