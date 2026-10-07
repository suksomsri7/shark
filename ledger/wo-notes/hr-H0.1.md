# H0.1 — builder notes (DRAFT run delete · recompute · approve only the numbers you saw)

Worktree `/root/projects/shark-hr` · branch `wip/pos-hr-h0.1` (cut from `wip/pos-hr-h0.1-oracle` d9372189 = oracle 407131de + briefs + CR1–CR9; base ⊇ hotfix/hr-privacy afcb9bc3 — `merge-base --is-ancestor` OK) · DB = QC4 (`ep-frosty-lab`, `grep -c` = 2) via `iso.sh → qc4.sh → with-gate-lock.sh` only. Oracle not edited.

## Status / checkpoint
- [x] 1. R1 `buildRunRows` extracted → oracle forced 11/50 (= base) · qc-payroll 19/19 · qc-crm-c3.3 90/90 → commit 2e88580f
- [x] 2. R2 `deleteDraftRun` + R3 `recomputeDraftRun` + audits + CR8 hint → oracle forced 40/50 → commit d340da79
- [x] 3. R4 `approveRun(ctx, runId, expect?)` + R5 → oracle forced 43/50, X6.0–X6.6 green → commit e74c23dd
- [x] 4. R6 actions + UI (CR3/CR4) → oracle forced ×2 50/50 + unforced 50/50 → regressions → fitness ×2 → commit 6b491b77
- [x] 5. CR10 (controller addendum): recompute trigger label "ดึงข้อมูลใหม่" (mockup `design-hr/06` wording), dialog body "คำนวณรอบจ่ายใหม่จากข้อมูลปัจจุบัน…", confirm "ยืนยันคำนวณใหม่"; run note still `คำนวณใหม่ …` → oracle forced 50/50 + unforced 50/50 (green file refreshed)

## Acceptance items → files:lines → how → result
| item | files:lines | how | result |
|---|---|---|---|
| R1 extract | `payroll.ts:317-412` (`buildRunRows` :325, `runTotalsData` :384, `runItemData` :397) · `createPayrollRun` :419-456 | profile read → APPROVED unbound adjustments of the period `FOR UPDATE` → H4 filter → `computeItem` per profile → totals, moved verbatim; no profiles = empty items without locking, `createPayrollRun` throws the same text. Duplicate check, lock, run create, bind + count check stay in `createPayrollRun` | S4.1/S4.2/S4.3 green (signature, dup text once, computeItem/rules/schema/CRM-block hashes) · qc-payroll 19/19 · qc-crm-c3.3 90/90 · S2.2 (recompute = fresh create on clone) green |
| R2 delete | `payroll.ts:516-563` (helpers :460-510: `PayrollActor`, texts, `RunRefusal`, `lockRunPeriod`, `lockRunRow`, `bkkStamp`) | one `tenantDb(ctx).$transaction` (tx client for every statement): resolve periodKey → advisory lock (same key as create) → run row `FOR UPDATE` (raw SQL with tenantId+systemId) → DRAFT + `journalEntryId IS NULL` guard → unbind (`updateMany`, count = rows read) → delete items → guarded `deleteMany` (count 1) → audit after commit | S1.1–S1.9, X2.1–X2.3, S5.1/S5.2 green |
| R3 recompute | `payroll.ts:570-630` | same lock + `FOR UPDATE` + DRAFT/no-JV guard → unbind all → delete items → `buildRunRows` → `createMany` items (same run id) → guarded run `updateMany` totals + note `คำนวณใหม่ <YYYY-MM-DD HH:mm น.>` (UTC+07:00) → rebind guarded `runId null + APPROVED` with count check; payDate kept; a refusal after writes throws `RunRefusal` inside the tx (rollback) and is returned as `{ok:false}` | S2.1–S2.9 green |
| R4 approve expect | `payroll.ts:631-655` (`claimApproveExpected`) · `approveRun` :659-680 | with `expect`: tx → run row `FOR UPDATE` → status DRAFT → item count under that lock → claim `updateMany` where `status DRAFT AND totalNetSatang = expect` (count 1). Non-integer expect = stale. Without `expect`: the old claim, untouched | S3.1–S3.6 green |
| R5 races | same | create/delete/recompute serialise on the period advisory lock; delete/recompute/approve(expect) serialise on the run row lock (recompute holds it for the whole rewrite ⇒ an approve queued behind it reads the new totals/count and refuses); `decideAdjustment` never touches bound rows and an approve after the recompute's `FOR UPDATE` select is simply left unbound. Lock order advisory → run row → adjustment rows everywhere; approve takes only the run row ⇒ no cycle | X6.0–X6.6 green ×3 runs (2 worker processes, 15 rounds × 10 lanes) |
| R6 actions | `payroll-actions.ts:78-97` (`approveExpectFromForm` + approve passes `expect`) · `deleteDraftRunAction` :268-282 · `recomputeDraftRunAction` :284-298 | `assertHrCan(auth, "hr.payroll.create")`, return type `Promise<{ ok: boolean; reason?: string }>`, actor `{userId: auth.active.userId, isOwner: role === OWNER}`, unexpected error ⇒ `console.error` + `UNEXPECTED_TH` (no `e.message`); audit is written by the service | S4.5, S4.6, S6.1–S6.4 green |
| R6 UI (+CR10) | `payroll-ui.tsx:14` import · :275 trailing wraps (`flex-wrap`) · :277-291 DRAFT branch: approve `fields` + `expectNet`/`expectItems`, `<RunRowActions>` · new `RunRowActions.tsx` | client component, `useActionState` wrapper (pattern `PayAdjustRowActions`); returns null unless `status === "DRAFT"`; "ดึงข้อมูลใหม่" (= recompute, CR10 wording from the mockup) + "ลบร่าง" (danger) each in `ConfirmDialog`, same tokens as the row's existing buttons (border · `--color-surface-2` hover · `--color-danger` text for delete; no new colours; mockup's ghost-small button style ≈ existing row trigger), triggers `min-h-[44px]`, testIds `hr-payroll-run-<period>-recompute|delete(-trigger/-sheet)` + `-error`; dialog `key` bumps after each result so it closes; reason shown inline (`role=alert`) | S4.4 green |
| CR8 hint | `payroll.ts:735` | `reverseRun` without JV: `… (รอบที่ยังเป็นร่าง ยกเลิกได้ด้วยปุ่ม "ลบร่าง")` — one text for DRAFT and for APPROVED-without-ACCOUNT (both true; old "(ลบร่างได้เลย)" was wrong for both) | S4.7 green |
| CR6 audits | `payroll.ts:552-561`, `:618-628` | `hr.payroll.delete_draft` before `{periodKey, totalAddSatang, totalDeductSatang, totalNetSatang, itemCount, adjustmentIds}`; `hr.payroll.recompute` before/after `{totalAddSatang, totalDeductSatang, totalNetSatang, itemCount}`; targetType `HrPayrollRun`, targetId = run id, actorType USER, actorId = actor.userId | S1.9, S2.9 green |

## Commands (from /root/projects/shark-hr) and final summary lines
- oracle forced: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.1.mts`
  - run 1: `===== qc-hr-h0.1 ===== passed 50/50 (QC_FORCE)` · exit 0 · Z1 green
  - run 2: `===== qc-hr-h0.1 ===== passed 50/50 (QC_FORCE)` · exit 0 · Z1 green
- oracle unforced (same without `env QC_FORCE=1`): `===== qc-hr-h0.1 ===== passed 50/50` · exit 0 · Z1 green
- after CR10: forced `===== qc-hr-h0.1 ===== passed 50/50 (QC_FORCE)` exit 0 · unforced `===== qc-hr-h0.1 ===== passed 50/50` exit 0 → `hr-H0.1-green.txt` (regressions/fitness unaffected: CR10 changes only strings in a client component)
- regressions (each `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<suite>.mts`):
  - `qc-hf-hr-privacy` → `JSON_SUMMARY {"total":194,"passed":194,"findings":[]}` · exit 0 (baseline 194/194 — identical)
  - `qc-hr` → `JSON_SUMMARY {"total":9,"passed":9,"findings":[]}` · exit 0 (baseline 9/9 — identical)
  - `qc-hr-attendance` → `JSON_SUMMARY {"total":31,"passed":31,"findings":[]}` · exit 0 (baseline 31/31 — identical)
  - `qc-hr-roster` → `JSON_SUMMARY {"total":24,"passed":24,"findings":[]}` · exit 0 (baseline 24/24 — identical)
  - `qc-hr-leave-booking` → `JSON_SUMMARY {"total":14,"passed":14,"findings":[]}` · exit 0 (baseline 14/14 — identical)
  - `qc-hr-payadjust` → `JSON_SUMMARY {"total":27,"passed":27,"findings":[]}` · exit 0 (baseline 27/27 — identical)
  - `qc-payroll` → `JSON_SUMMARY {"total":19,"passed":19,"findings":[]}` · exit 0 (baseline 19/19 — identical)
  - `qc-payroll-reverse` → `✅ PASS — 14/14` · exit 0 (baseline 14/14 — identical)
  - `qc-booking-hours-hr` → `JSON_SUMMARY {"total":13,"passed":13,"findings":[]}` · exit 0 (baseline 13/13 — identical)
  - `qc-crm-c3.3` → `JSON_SUMMARY {"total":90,"passed":90,"findings":[]}` · exit 0 (baseline 90/90 — identical)
  - `qc-approval` → `JSON_SUMMARY {"total":16,"passed":16,"findings":[]}` · exit 0 (baseline 16/16 — identical)
  - `qc-approval-wiring` → `JSON_SUMMARY {"total":7,"passed":7,"findings":[]}` · exit 0 (baseline 7/7 — identical)
- typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → **NOT RUN (DEFERRED)**: both attempts (12:25 and 13:28 UTC) waited the full `flock -w 3600` on `/tmp/shark-gate.lock` and exited 1 without starting tsc — the lock was held from 12:19 UTC by CRM's `scripts/qc-all.mts` (`/root/projects/shark-crm`, pid 970499, ~0% CPU for 2 h, looks stalled; not touched/killed). Substitute evidence: scoped `tsc -p <scratch tsconfig extending tsconfig.json, include payroll.ts + payroll-actions.ts + payroll-ui.tsx + RunRowActions.tsx + next-env.d.ts>` through `iso.sh` = exit 0, no errors (final tree incl. CR10). **Controller: run the full typecheck once the lock is free.**
- fitness: `bash scripts/iso.sh pnpm fitness` → `JSON_SUMMARY {"total":33,"passed":33,"findings":[]}` exit 0 · `bash scripts/iso.sh env -u DATABASE_URL pnpm fitness` → same, exit 0
- pre-commit hook (fitness) passed on every commit — no `--no-verify`.

## Who gains access to what
- **Delete / recompute a DRAFT run:** OWNER, and any member who passes `assertHrCan(…, "hr.payroll.create")` = holds `hr.payroll.create` **and** `canViewPayroll` (OWNER or `hr.payroll.read`). Same people who could already create a run. Refused (S6.2/S6.4): payroll reader without create, MANAGER without payroll, STAFF with other HR keys, plain member, the employee himself, other tenant's OWNER.
- **Approve:** unchanged audience (`hr.payroll.approve` + payroll viewer); the web form now refuses when the numbers changed since the page was rendered.
- Nobody loses access.

## DEFERRED
- full `pnpm typecheck` (machine lock held by CRM qc-all, see Commands) — controller to run.
- CONTROLLER-RUN screenshots of the DRAFT row at 1440 / 390.

## ORACLE-EDIT requests
- none.

## Decisions for the controller
1. **DRAFT with an orphan `journalEntryId`** (S1.7): delete and recompute both refuse with "รอบนี้มีรายการบัญชีผูกอยู่แล้ว จึงแก้ร่างไม่ได้ — ให้ผู้ดูแลบัญชีตรวจสอบรายการบัญชีของงวดนี้ก่อน" (not one of R2's three fixed texts — R2 lists no text for this case).
2. **Recompute non-DRAFT text** = "คำนวณใหม่ได้เฉพาะรอบที่ยังเป็นร่าง"; recompute with no salary profiles left = "ยังไม่มีโปรไฟล์เงินเดือน — ตั้งเงินเดือนพนักงานก่อนคำนวณใหม่" (rolled back, run unchanged).
3. **Approve stale refusal is not shown inline yet**: `approvePayrollRunAction` stays a void form action (CR3 asked only for the hidden fields); a stale approve leaves the row DRAFT with the new numbers after revalidation and writes the `hr.payroll.approve` audit with `ok:false` + the Thai note. Showing the reason in the row needs the action to return `{ok, reason}` — suggest a later UI WO.
4. Approve with `expect` whose values are not integers (tampered form) is treated as stale (refused), never as "no expect".
5. The self-row rule (COMMON §C.6) is not applied to delete/recompute: neither changes anyone's money (adjustments keep their status; recompute only re-reads approved data). Say if you want OWNER-only for runs containing the actor's own row.
6. Existing approve/mark-paid/reverse triggers keep their ~30 px height (not touched); only the two new triggers are 44 px. Trailing button row now wraps (`flex-wrap justify-end`) so four buttons fit at 390 px. CONTROLLER-RUN screenshots (1440 / 390) still to do.
7. Recompute keeps `payDate` (Q1 default) and allows CRM commission rows (Q2 default — they return to unbound APPROVED on delete; S5.1/S5.2 green).

## Temp data left
- none: Z1 green on every run (throwaway tenants, every tenantId row, users/sessions swept by the oracle).
