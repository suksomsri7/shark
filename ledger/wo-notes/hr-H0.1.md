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

## Round 2 (7 Oct 2026, on 614bac33 · reviewer ACCEPT WITH NOTES → controller CR11–CR15, appended verbatim to the brief §7)
Code commit c3a9155a. Oracle not edited. CR9 respected (cancelAdjustment / reverse / pay / computeItem / payroll-rules / CRM block untouched — S4.2/S4.3 hashes green).

### What changed → files:lines
| CR | where | how |
|---|---|---|
| CR11 gross in expect | `payroll.ts:647-667` (`ApproveExpect` :649, check :653/:662, claim where :664) · `approveRun` :674-679 · `lockRunRow` now reads `totalGrossSatang` · `payroll-actions.ts:79-89` (`approveExpectFromForm`) · `RunRowActions.tsx:53` (`expectGross` hidden field) | `totalGrossSatang` optional: present + safe integer ⇒ must equal the `FOR UPDATE` re-read and is added to the guarded claim `updateMany`; present but not an integer (direct caller) ⇒ STALE (fail closed). Form: `expectGross` parsed optionally, omitted when missing/non-integer; `expectNet`/`expectItems` semantics unchanged from round 1 |
| CR12 approve with reason | `RunRowActions.tsx:11-12, 39-61` · `payroll-actions.ts:91-128` · `payroll.ts:639-640` (`ApproveFailCode`) + `code` on every `approveRun` refusal · `payroll-ui.tsx:276-289` | approve `ConfirmDialog` (label "อนุมัติ", testId `hr-payroll-run-<period>-approve`) moved into `RunRowActions`, shares the `useActionState` + inline `role=alert` span `hr-payroll-run-<period>-error`. Props `totalNetSatang`/`totalGrossSatang`/`itemCount` + `approveDetail` (dialog text built server-side, byte-identical to round 1). Action returns `Promise<{ ok: boolean; reason?: string }>`: ok ⇒ `{ok:true}` after audit + revalidate; refusals map `code` → fixed texts: STALE "ตัวเลขของรอบนี้เปลี่ยนไปแล้ว กรุณาดูยอดใหม่แล้วกดอนุมัติอีกครั้ง", NOT_FOUND/NOT_DRAFT "รอบนี้ไม่ใช่ร่างแล้ว", POST_FAILED (JV error, run back to DRAFT) "ลงบัญชีไม่สำเร็จ รอบนี้ยังเป็นร่าง — ลองอนุมัติอีกครั้ง หรือให้ผู้ดูแลบัญชีตรวจสอบ". The raw `note` (may hold `e.message`) is only written to the audit, never returned |
| CR13 Forbidden inline | `payroll-actions.ts:102-127` (approve), `:290-320` (delete/recompute) | `requireTenant` outside; `assertHrCan` + service call in try; `ForbiddenError` ⇒ `{ok:false, reason:"คุณไม่มีสิทธิ์ทำรายการนี้"}`; anything else rethrows (error page). Round-1 `console.error + UNEXPECTED_TH` catch removed from these two actions (decide/cancel keep theirs) |
| CR14 bkkParts | `payroll.ts:7` import `bkkParts` from `./service` (hr/service.ts:679) · `bkkStamp` :510-516 | `dateStr` + `minOfDay` → `YYYY-MM-DD HH:mm น.`; no new helper; no import cycle (service.ts does not import payroll). Probe: note `คำนวณใหม่ 2026-10-07 22:40 น.` at 15:40 UTC |
| CR15 privacy note | `payroll.ts:326-327` | 2-line comment above `buildRunRows`; no behaviour change |

### Results (all from /root/projects/shark-hr)
- oracle forced run 1: `===== qc-hr-h0.1 ===== passed 50/50 (QC_FORCE)` exit 0 · Z1 green
- oracle forced run 2: `===== qc-hr-h0.1 ===== passed 50/50 (QC_FORCE)` exit 0 · Z1 green
- oracle unforced: `===== qc-hr-h0.1 ===== passed 50/50` exit 0 · Z1 green → `hr-H0.1-green.txt` refreshed
- throwaway probe (scripts/pending, deleted, not committed; own tenant, residue 0): wrong gross → STALE, DRAFT kept · NaN gross → STALE · right gross → APPROVED · second approve → NOT_DRAFT · expect without gross → APPROVED
- regressions (same wrapper, QC_FORCE) vs `hr-baseline-f85f5455.txt` — all identical, exit 0: qc-hf-hr-privacy 194/194 · qc-hr 9/9 · qc-hr-attendance 31/31 · qc-hr-roster 24/24 · qc-hr-leave-booking 14/14 · qc-hr-payadjust 27/27 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-booking-hours-hr 13/13 · qc-crm-c3.3 90/90 · qc-approval 16/16 · qc-approval-wiring 7/7
- fitness: `bash scripts/iso.sh pnpm fitness` → `{"total":33,"passed":33}` exit 0 · `env -u DATABASE_URL` → same exit 0 · pre-commit hook passed (no `--no-verify`)
- typecheck: **DEFERRED (machine lock)** — one attempt 16:01:56–16:21:56 UTC under `timeout 1200` → exit 124, tsc never started (`/tmp/shark-gate.lock` still held by CRM `qc-all.mts` pid 970499 in shark-crm, idle since ~12:19 UTC; not touched). Its inner `flock -w 3600` waiter (pid 1214655, own iso unit, cwd shark-hr) outlived the timeout and expires by itself ≤ 17:02 UTC; not killed. Scoped tsc fallback skipped: swap in use (2/3 GB).

### Decisions (round 2)
1. `expectNet`/`expectItems` kept exactly as round 1 (both absent ⇒ no expectation; present but unreadable ⇒ STALE), as I read CR11's "exactly as in round 1".
2. `totalGrossSatang` passed directly (not via form) but non-integer ⇒ STALE (fail closed, same rule as net/items); the form path never sends a non-integer gross.
3. `approveRun` gained an additive `code` field (`ApproveFailCode`) so the action picks fixed texts without matching note strings; `note` unchanged for all callers.
4. A stale/refused approve still revalidates the page, so the row shows the new figures next to the reason.
5. Round-1 decision 3 (stale approve not shown inline) is now resolved by CR12.

## Oracle round 2 (7 Oct 2026, oracle writer, on 65a45626) — additive only
`scripts/qc-hr-h0.1.mts`: the 50 round-1 checks are unchanged (same ids, same order). 10 new checks are registered before Z1 and run at the end of `runDb` in their own HR systems (`HR round2`, `HR round2 gross`) of the same throwaway tenant, so Z1's sweep covers them. No production code touched.
| id | what it checks |
|---|---|
| S7.1 | source: RunRowActions recompute trigger "ดึงข้อมูลใหม่" + dialog "คำนวณใหม่" · delete "ลบร่าง" (danger) · op routing to the 3 actions |
| S7.2 | service: net+count+gross ok → OK · gross+1 → STALE (code STALE, DRAFT, no JV) · no gross → OK. Form via real `approvePayrollRunAction` (request scope, OWNER; `approveExpectFromForm` is not exported): expectGross missing / "abc" / "12.5" → OK · gross+1 → STALE text · expectNet "abc" → STALE (fail closed, controller ruling) · no net+items → legacy OK |
| S7.3 | gross up while net + count stay equal: base 12,500→13,000 + an APPROVED DEDUCTION equal to the net gain (47,500), recompute → net 3,112,500 = before, gross 3,250,000→3,252,500 · stale approve refused, fresh approve APPROVED + JV |
| S7.4 | JV throws (AccountPeriod 2034-01 CLOSED): approveRun → code POST_FAILED, DRAFT, no journalEntryId, no JV · action returns the fixed POST_FAILED text (no raw error) · then recompute + delete ok, 1 audit row each, adjustment unbound APPROVED |
| S7.5 | bound APPROVED rows: cancelAdjustment (with/without actor) refused with the exact text "รายการนี้เข้ารอบจ่ายแล้ว ลบไม่ได้ (ใช้กลับรายการรอบจ่ายแทน)" · CRM withdraw/move → false · rows stay bound · recompute totals identical, Σ ok |
| S7.6 | CR13: 5 viewers (reader-no-create, MANAGER no payroll, STAFF HR keys, plain member, employee self) × approve/recompute/delete actions → `{ok:false, reason:"คุณไม่มีสิทธิ์ทำรายการนี้"}` (no throw), run untouched · source: requireTenant before try, `instanceof ForbiddenError` → Thai constant, `throw e`, no e.message |
| S7.7 | source: approve action signature, error span shows `state.reason`, approve fields expectNet/expectItems/expectGross from row props (ConfirmDialog renders them hidden) |
| S7.8 | source: `bkkParts` import, bkkStamp uses it, no +7 h by hand in the H0.1 block / approveRun · runtime: note stamp = Bangkok clock (Intl Asia/Bangkok) of the call |
| X7.1 | recompute ∥ recompute in-process ×3: no throw, ≥1 ok, Σ = totals, 1 run row, audit rows = ok count, rows bound |
| X7.2 | delete ∥ approve(fresh expect) in-process ×3 (start order varied: delete first · approve first · approve +400 ms): exactly one ok, loser {ok:false}, final state consistent. Winners: approve, approve, del |

Results (wrapper `iso.sh → qc4.sh → with-gate-lock.sh`): forced run A `passed 60/60 (QC_FORCE)` exit 0 · forced run B `passed 60/60 (QC_FORCE)` exit 0 · unforced `passed 60/60` exit 0 · Z1 green every run (residue 0) · scoped `tsc -p <scratch tsconfig: this file + next-env.d.ts>` through iso.sh exit 0.
Observations for the controller (no check red):
1. The brief's S7.3 recipe (BONUS +X and DEDUCTION +X) cannot change gross: gross = base + add − deduct (`payroll-rules.ts:148-154`) and SSO/WHT use the base only (`payroll.ts` computeItem). So the check uses a base raise plus a compensating deduction instead. The case BONUS +X / DEDUCTION +X (net, count and gross unchanged, only add/deduct totals move) is still approved with the old expectation. That is by design of CR11, but the approver did not see that change.
2. The cancelAdjustment refusal for a row bound to a DRAFT says "(ใช้กลับรายการรอบจ่ายแทน)", but reverseRun refuses DRAFT runs. The real ways out are "ลบร่าง" / "ดึงข้อมูลใหม่". The text is frozen by CR9, so this is for H0.2 OQ-1.
3. In S7.2(h), a present but unreadable expectNet is refused as STALE (fail closed) as the controller ruled. The round-2 task's "assert undefined" variant is not applicable because `approveExpectFromForm` is not exported.

## Oracle round 3 (7 Oct 2026, oracle writer, on 987d3abd) — hunter findings · CR16–CR19
`scripts/qc-hr-h0.1.mts`: 60 → 67 checks. The ids and texts already there are unchanged except S7.2 (CR18). New checks S8.1–S8.6 and X8.1 are registered before Z1. They run at the end of `runDb` in their own HR systems (`HR round3 swap/shift/misc/race`, periods 2036-xx) of the throwaway tenant, so Z1 covers them. No production code touched. CR16–CR19 are appended word for word to the brief §7 as "Hunter rulings (controller, 7 Oct)".
| id | what it checks |
|---|---|
| S8.1 | A's profile removed, C added at A's base, recompute → net/count/gross equal, digest differs · approveRun(old expect incl. digest) → code STALE, DRAFT, 0 new JV · fresh expect → APPROVED + 1 balanced JV |
| S8.2 | BONUS 5,000 for A + DEDUCTION 5,000 for B, recompute → net/count/gross equal (add/deduct +5,000) · old STALE · fresh OK + 1 JV |
| S8.3 | `payrollItemsDigest`: found by grep in `src/lib/modules/hr/*.ts`, file not "use server" · 64-hex · deterministic · does not change its input · order-free · changes with each of the 7 item numbers and with employeeId · source: `expectDigest` on the approve dialog, `payrollItemsDigest(` called in payroll-ui.tsx (not in the client RunRowActions), `.get("expectDigest")` in the actions · runtime: foreign digest through the action → STALE text |
| S8.4 | approved run forced back to DRAFT keeping journalEntryId · approveRun(expect) / approveRun() → code DRAFT_HAS_JV · action → "รอบนี้มีเอกสารบัญชีค้างอยู่ ต้องให้ผู้ดูแลตรวจสอบก่อน" · DRAFT, same JV, 0 new JV (state put back after each sub-case so each sees the precondition) |
| S8.5 | action POST with none / only expectNet / only expectItems → CR18 text · DRAFT · no JV |
| S8.6 | through the actions (OWNER session): STALE, DRAFT_HAS_JV (the S8.4 action call), NOT_DRAFT (APPROVED run) → `hr.payroll.approve.refused` · delete + recompute of that APPROVED run → `hr.payroll.delete_draft.refused` / `hr.payroll.recompute.refused` · exactly 1 row per (action, run) with actorId = session user · payload in `after` or `before` = `{code, seen, actual}` · seen = posted figures (null for delete/recompute) · actual net/items/gross/digest = DB |
| X8.1 | approve(old expect) ∥ recompute (same-pay swap), in-process ×3 (recompute first · approve first · approve +400 ms) · JV delta ≤ 1 · APPROVED only if the digest of the final items = the seen digest and recompute was refused · otherwise DRAFT, approve code STALE, 0 JV |
| S7.2 (changed, CR18) | (i) no expectNet/expectItems → now refused with the CR18 text, DRAFT, no JV (was legacy approve) · (h) expectNet "abc" → CR18 text (was the STALE text). CR18 says "missing/non-integer", so (h) moves too |

Oracle readings (for the controller):
1. Digest columns: CR16 line names `ssoSatang`, while the item has `ssoEmployeeSatang` and `ssoEmployerSatang`. The check says "any of the 7 numbers", so S8.3 requires a change in the digest when either SSO column changes. That makes 7 numbers = the 7 run totals. S8.3 does not pin the exact line text, only the properties and the 64-hex format. While the helper is missing, the oracle posts a local stand-in digest (same 7 columns); the base ignores it.
2. For an APPROVED run (it has a JV), the approve refusal must be `NOT_DRAFT`, not `DRAFT_HAS_JV`. That is CR17 ("a DRAFT that already carries…").
3. Audit rows are matched by `targetId = runId` (as CR6) and `actorId` = the session user. Service calls with no session (S8.4) may also write rows; they are not counted.

Results on 987d3abd (wrapper `iso.sh → qc4.sh → with-gate-lock.sh`): forced run A `passed 59/67 (QC_FORCE)` · forced run B `59/67 (QC_FORCE)` · unforced `59/67` · each run red on exactly S7.2 · S8.1–S8.6 · X8.1, no crash, Z1 green every run (residue 0) · scoped `tsc` (this file + next-env.d.ts) through iso.sh exit 0.
Red reasons, the same in every run: S7.2 (h) gives the STALE text and (i) is approved the old way · S8.1/S8.2 old expect approved + JV (precondition true: net/count/gross equal, digest differs) · S8.3 helper missing, no expectDigest, foreign digest approved · S8.4 every sub-case approves and posts a second JV · S8.5 "none" approved, net/items only → STALE text · S8.6 0 `*.refused` rows · X8.1 round 2036-11 (approve +400 ms): recompute and approve both ok → APPROVED with items whose digest ≠ seen (2036-09/10: approve won before the recompute, which is legitimately green).

## Round 3 (7 Oct 2026, builder, on 8a897627) — CR16–CR19
| CR | where | what |
|---|---|---|
| CR16 digest | new `src/lib/modules/hr/payroll-digest.ts:19` `payrollItemsDigest(items)` (no "use server"; `node:crypto` sha256 hex) + `PAYROLL_DIGEST_SELECT` · `payroll.ts:518-521` `runActual` · `payroll.ts:686-712` expect `itemsDigest?` checked under the run row lock · `payroll.ts:880` `listRuns` items select = id + the 8 digest columns · `payroll-ui.tsx:288` `itemsDigest={payrollItemsDigest(r.items)}` (server) · `RunRowActions.tsx:56` hidden `expectDigest: itemsDigest` · `payroll-actions.ts:83-95` parses `expectDigest` (64 lowercase hex, else omitted) | line per item `employeeId:gross:add:deduct:ssoEmployee:ssoEmployer:wht:net`, sorted by employeeId (tie-break full line), joined "\n". **Both SSO columns** are in the line (controller note) ⇒ the 7 numbers = the 7 run totals. A digest passed directly to the service that is not 64-hex ⇒ STALE (fail closed, like gross) |
| CR17 no second JV | `payroll.ts:696` FOR UPDATE check `journalEntryId` ⇒ `DRAFT_HAS_JV` · `:715` guarded `updateMany` where `journalEntryId: null` · `:670` Thai text · `payroll-actions.ts:103,138` action text | **one** claim function for both paths: the no-expect path (scripts/tests) now also goes `lockRunRow FOR UPDATE` → status/JV checks → guarded `updateMany` (was a bare `updateMany`). An APPROVED run still answers `NOT_DRAFT` (status checked before JV). Delete/recompute keep their own DRAFT_HAS_JV text (code shared, text unchanged — oracle S1/S2 untouched) |
| CR18 action always carries expect | `payroll-actions.ts:88-90` `expectNet`/`expectItems` must both be integers (`/^-?\d+$/` + safe int) else `undefined` · `:119` refusal `"ไม่พบตัวเลขที่คุณเห็นบนหน้าจอ กรุณาโหลดหน้าใหม่แล้วกดอนุมัติอีกครั้ง"` before `approveRun` | `approveRun(ctx, runId)` without expect stays for scripts (qc-payroll, qc-payroll-reverse, qc-crm-c3.3 use it). No audit row for this refusal (not in CR19's list) |
| CR19 refusal audits | `payroll.ts:512-533` `RunActual`/`RunSeen`/`RunRefused` + `auditRefusal` (core `writeAudit`) · approve `:734-753` · delete `:561-562,583-586` · recompute `:618-619,652-655` · action passes the session actor `payroll-actions.ts:121` (`approveRun(ctx, runId, expect, { userId, isOwner })`) | rows `hr.payroll.approve.refused` (STALE · DRAFT_HAS_JV · NOT_DRAFT), `hr.payroll.delete_draft.refused` / `hr.payroll.recompute.refused` (NOT_DRAFT · DRAFT_HAS_JV); `targetId` = run id; `after = { code, seen, actual }`; `actual` read inside the same tx under the run row lock (net · items · gross · digest); `seen` = expect figures (`null` without expect and for delete/recompute). Written by the service after the tx; service calls without an actor write `actorId null` |

### Results (all from /root/projects/shark-hr)
- oracle forced run 1 (before a fix, see decision 5): 66/67 — S4.5 red (`form=false`); after the fix:
- oracle forced run 2: `===== qc-hr-h0.1 ===== passed 67/67 (QC_FORCE)` exit 0 · Z1 green · X8.1 winners approve, approve, recompute · X7.2 approve, approve, del
- oracle forced run 3: `passed 67/67 (QC_FORCE)` exit 0 · Z1 green · same winners
- oracle unforced: `===== qc-hr-h0.1 ===== passed 67/67` exit 0 · Z1 green (`failed: []`)
- regressions (same wrapper, QC_FORCE) vs `hr-baseline-f85f5455.txt` — all identical, exit 0: qc-hf-hr-privacy 194/194 · qc-hr 9/9 · qc-hr-attendance 31/31 · qc-hr-roster 24/24 · qc-hr-leave-booking 14/14 · qc-hr-payadjust 27/27 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-booking-hours-hr 13/13 · qc-crm-c3.3 90/90 · qc-approval 16/16 · qc-approval-wiring 7/7
- fitness: `bash scripts/iso.sh pnpm fitness` → `{"total":33,"passed":33}` exit 0 · `env -u DATABASE_URL` → same exit 0
- protected: `payroll-rules.ts`, `computeItem`, CRM C3.3 block — no diff hunks there (hunks only at :8, :511-533, delete/recompute refusals, approve block, `listRuns` select)
- typecheck: **DEFERRED (machine lock)** — one attempt 18:03:36–18:23:36 UTC, `timeout 1200` placed *inside* the iso unit (plus an outer `timeout 1230`) → exit 124, tsc never started; `/tmp/shark-gate.lock` still held by `flock -w 1800 … qc-all.mts` pid 960506 (started 12:11 UTC, another session; not touched). No waiter of mine left behind (pgrep after: only pid 960506). Scoped `tsc` fallback skipped: swap in use 2/3 GB (rule: < 1 GB). Types were reviewed by hand (discriminated `ClaimResult`, `res.refused` optional on the `ok:false` member, `PAYROLL_DIGEST_SELECT` `as const` spread into the Prisma select).
- pre-commit hook (fitness) on the commit below — no `--no-verify`.

### Decisions (round 3)
1. The digest module is `payroll-digest.ts` (not `*-shared.ts`): it imports `node:crypto`, so it must never be pulled into a client bundle; only server code (payroll.ts, payroll-ui.tsx) and the oracle import it. RunRowActions gets the digest as a prop and never calls the helper.
2. `listRuns` now selects the 8 digest columns per item (was id/employeeId/gross/net). Its only caller is `payroll-ui.tsx` (server); items are not sent to the client except through the digest string.
3. Approve claim order under the lock: not found → NOT_DRAFT → DRAFT_HAS_JV → (with expect) STALE. A malformed expect handed directly to the service is now judged after the run is found (was: STALE before any read); the action never sends a malformed one (CR18).
4. No-expect `approveRun` on an unknown run keeps its round-1 answer (`NOT_DRAFT` + "รอบนี้อนุมัติหรือจ่ายไปแล้ว") so legacy callers see no change; with expect it stays `NOT_FOUND`.
5. S4.5 looks for `fields={{…}}` within 600 chars after `approvePayrollRunAction`; adding `expectDigest` pushed the closing `}}` to char 626 (forced run 1 red on S4.5 only). Fixed by moving the one-line "ปุ่มของร่างเท่านั้น" comment out of the function body to the header comment (now 559) — no behaviour change; the oracle was not edited.
6. The existing `hr.payroll.approve` audit row (`{ok, note}`) is kept for every approve that reaches the service; the `*.refused` row is in addition. CR18 refusals (no figures) write neither.
