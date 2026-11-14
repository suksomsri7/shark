# HR-LEAVE-3 — builder notes (lane 2 · branch `wip/hr-leave-3` · 14 Nov 2026)

Brief `ledger/hr-briefs/hr-brief-LEAVE-3.md` (+ CONTROLLER RULINGS, r2) · oracle `scripts/qc-hr-leave-3.mts` (+`-lib`, untouched) · base c6764057f (merge-base with session/hr 2ab0c6b62).
Commits: 55d711bff (R1) · 55be21831 (R2–R4) · this notes commit. No migration · payroll-rules.ts byte-identical (ST1) · no settings writes · no older oracle edited (none tripped — see ORACLE-EDIT list).

## What changed (file:line on the branch head)

### R1 — judge reads every approved leave of the day (F1)
- `src/lib/modules/hr/judge.ts:243-253` new `leavePairOf(onDay, day)` (exactly two APPROVED non-hourly single-day leaves of this day, one AM + one PM) and `pairLeaveOf(windows, pair)` (leave recorded on a slot = the half that covers it: `slotLeaves(windows, am)` non-null ⇒ AM else PM ⇒ a slot crossing the midpoint = AM).
- `judge.ts:277` `pair` per day · `:290-291` shift slots: pair ⇒ every slot `{halfDay:null}` (judge-rules ⇒ LEAVE, unchanged) and `leave` = covering half (`:295`) · `:317-318,:323` DAY (schedule) slot: pair ⇒ `{halfDay:null}`, leave = AM half (window still computed first so a broken window throws as before) · `:330` leaveFraction: first covered slot `"1.0"` for a pair (others `"0.0"`, as before).
- Not changed: `approved = onDay.find(APPROVED)` stays the leave for every non-pair day (one approved half ⇒ today; legacy multi-leave ⇒ today ⇒ LEAVE_MISMATCH, Q7) · hourly stays on `approved` (brief said `approvedAll.find(hours!==null)`; identical for every day filing can create — at most one approved hourly leave and nothing else — so the line was left alone to keep the hunk count low) · `leaveHalf` column = the covering leave's own half (brief text "leaveHalf null" read as the slot's `halfDay:null`; not pinned by the oracle — **open question 1**).
- `src/lib/modules/hr/work-entries-rules.ts:235-243` (buildDay, between the `capped` loop and the expected/LEAVE_MISMATCH check): approved non-hourly leaves of the day = exactly an AM+PM pair and the counted slots record ≥ 10 tenths for them ⇒ `capped` = 5 per leave, `f = 10` ⇒ each half credited by its own `paid/legacy` (existing loop), expected 10 = f ⇒ no LEAVE_MISMATCH. Pending half ⇒ PENDING_LEAVE (unchanged). Stored base-shape rows (ABSENT · AM · 0.5) ⇒ live differs ⇒ STALE (`isStale` unchanged) ⇒ recompute converges (R1.8).
- PREPROD-1 interaction (to do after merging session/hr, not now): a pair where one half is a split sick leave — the 5 tenths given here then go through PREPROD-1's `unpaidTenths` split per leave; re-check R1.4/R1.5 and PREPROD-1's oracle after the merge.

### R2 — expected step + two-person rule (shared approval module, F2)
- `src/lib/modules/approval/service.ts:56-57` `DecideInput.expectedStep?: number` · `:265` `TWO_PERSON_REFUSED` text.
- `decide` `:304` present and ≠ `currentStepOrder` ⇒ `{ok:false,status:"PENDING",note:null}` (= lost-claim result), placed after the status check so a decided request still returns its status (R2.8 literal).
- `decide` tx `:338-346`: `earlier` = this user's decision on a lower `stepOrder` of this request; non-OWNER ⇒ `{ok:false,status:"PENDING",note:null,code:"TWO_PERSON",reason}` before any write; OWNER ⇒ after the claim + decision row, one `AuditLog` (`approval.owner_override`, targetType `ApprovalRequest`, targetId = request id, after `{step, previousDeciderStep}`) in the same tx (`:357,:379,:401` in the REJECT / final / intermediate branches). Read before the claim is safe: an earlier step's decision commits in the same tx that moved `currentStepOrder`, and the claim is still conditional on the step we read.
- `bulkDecide` `:429-435`: 6th arg `steps?: Record<id, number>` → `expectedStep`; ids de-duplicated (Q4).
- `src/lib/modules/approval/actions.ts:42-47` `stepOf` (positive integer · empty = undefined · anything else = bad) · `decideAction :182-184` field `step` (bad ⇒ "การตัดสินไม่ถูกต้อง") · `bulkDecideAction :214-221` fields `step:<id>` → map (bad ⇒ status error "การตัดสินไม่ถูกต้อง").
- `src/app/app/approvals/page.tsx:115,119,126` every item carries `step: r.currentStepOrder` · `BulkApprovals.tsx:13` `step?: number` · `:50` hidden `step:<id>` inputs.
- AI: `src/lib/ai/tools.ts:1797` `approval_decide` stores `expectedStep` (tenant read of `currentStepOrder`) when `requestId` is known · `src/lib/ai/proposals.ts:188` payload type, `:1242` take it from the payload, `:1257` summary path uses `matched[0].currentStepOrder`, `:1264` pass to `decide` (old proposals: none ⇒ legacy).
- Single-step chains: no earlier step exists ⇒ no refusal, no audit; `expectedStep` absent ⇒ identical path (R2.8 literal GREEN · qc-approval/-edit/-wiring GREEN).

### R3 — no stranding step edits (F3, ruling r2-1)
- `approval/service.ts:94-95` fixed text template · `updatePolicy` tx `:110-115`: `SELECT … FOR UPDATE` the policy row, count PENDING requests of this policy whose `currentStepOrder` ∉ new step orders; > 0 ⇒ throw the text with that count (stranded count), before any write. Non-stranding edits (rename, role change, add/remove other steps, reordering the same steps) unchanged. `updatePolicyAction` shows `e.message` (unchanged).

### R4 — withdraw = cancel the HR entity (F4, Q1/Q5/Q6)
- `src/lib/approval-effects.ts:233-248` (composition root) `HR_WITHDRAW_TYPES` + `withdrawHrRequest({tenantId, systemId, entityType, entityId}, actor)` → dynamic `@/lib/modules/hr`: HrLeave → `cancelLeave(ctx, id, {actorUserId})` · HrTimeCorrection → `cancelCorrection` · HrShiftSwapRequest → `cancelSwap`; null systemId ⇒ no write. Each of those already does lock → `cancelRequest(…,{tx})` + entity CANCELLED + its own audit in one tx.
- `src/lib/modules/hr/index.ts:84-87` re-exports `cancelLeave`, `cancelCorrection`, `cancelSwap` (re-export only).
- `approval/actions.ts:12` import · `cancelMyRequestAction :235-242`: ownership check unchanged (requestedById = me); HR types ⇒ only when the request is PENDING, delegate to `withdrawHrRequest` (never the bare `cancelRequest`); other types unchanged.
- `src/lib/modules/hr/service.ts:649` text · `decideLeave :702-705` (Q5 gate, before the existing chain checks, well above the MONEY-2/PREPROD-1 paid-run gate line): an APPROVED decision on a CANCELLED HrLeave chain of this leave ⇒ decider must be a tenant OWNER (`isTenantOwner(…, tx)`), else "ใบลานี้เคยผ่านขั้นอนุมัติบางขั้นแล้วก่อนถูกถอนจากสาย — ให้เจ้าของกิจการเป็นผู้ตัดสิน". Cancelled chain without a decision ⇒ unchanged (CH-4 GREEN).

## Lock order (R2/R4) — why no deadlock
- `decide`: reads outside tx · tx: (read ApprovalDecision) → `ApprovalRequest` row (claim UPDATE) → inserts (decision, audit, outbox). Takes no HR lock.
- withdraw HrLeave (`cancelLeave`, unchanged): advisory `hr-leave:<id>` → advisory `hr-leave-emp:<sys>:<emp>` → `ApprovalRequest` row (cancelRequest UPDATE) → HrLeave row. Correction/swap: their own advisory/row lock → `ApprovalRequest` row → entity row.
- Effects (`applyLeaveDecision` etc., outbox, unchanged): HR locks → HR rows; they never lock `ApprovalRequest`.
- So `ApprovalRequest` is always the last lock taken by withdraw paths and the only lock taken by `decide` ⇒ no cycle. R4.11 (both orders under a held row lock) and R4.7 GREEN.
- `updatePolicy`: `ApprovalPolicy` row only (+ step rows); no path holds an `ApprovalRequest` row and then waits for the policy row.

## Callers (src) and behaviour change
- `decide`: `ai/proposals.ts` approval_decide — now passes `expectedStep` when the proposal carries it or the summary search found it; else as before. Two-person/owner-override apply to every caller (multi-step chains only).
- `bulkDecide`: `approval/actions.ts` decideAction / bulkDecideAction — now send the step the page rendered; duplicates dropped. No other caller.
- `cancelRequest`: function unchanged. Callers: pos-approval ×2, crm commissions ×4 / portal ×2 / deals, dorm moveout ×2, hr service cancelLeave, correction, swap, roster, lifecycle — unchanged. `approval/actions.ts cancelMyRequestAction` — HR entity types now go through `withdrawHrRequest` (entity cancelled too); other types unchanged.
- `updatePolicy`: `approval/actions.ts updatePolicyAction` (+ oracles) — refuses stranding step edits only.

## ORACLE-EDIT list (commit d3a5d92d3 · explicit allowlists, every hunk marked `ORACLE-EDIT (HR LEAVE-3 · controller)`)
- `scripts/qc-hr-h3.2.mts` S1.8 — `l3`: "HR LEAVE-3" counts as a mark only in hr `judge.ts` · `service.ts` · `work-entries-rules.ts`.
- `scripts/qc-hr-h3.4-lib.mts` S1.6 — `L3_ALLOW` (same three files) inside `laterOnly`.
- `scripts/qc-hr-h3.9.mts` S1.5 — `L3_FILES`: hr `judge.ts` · hr `service.ts` · approval `service.ts` · approval `actions.ts`.
- `scripts/qc-hr-h4.3-lib.mts` S1.6 — `L3_ALLOW` + `l3Marked` (hr judge.ts · qc-hr-h3.2 · h3.4-lib · h3.9 · priv-2 · qc-hr-leave-3 + -lib; every hunk "HR LEAVE-3"/"HR-LEAVE-3"/"ORACLE-EDIT (HR LEAVE-3") · S1.7 — tools.ts / proposals.ts hunks carrying "HR LEAVE-3" accepted (in base only) and excluded from `propsRemoved`.
- `scripts/qc-hr-priv-2.mts` S4 — `L3_SRC` (the 11 allowed src files, every hunk "HR LEAVE-3") filtered from the frozen diff; `L3_ORACLES` (h3.2 · h3.4-lib · h3.9 · h4.3-lib · leave-3 + -lib, every hunk LEAVE-3-marked) accepted · S5 — `L3_SRC` files not "outside", and excluded from the PRIV-2 hunk-mark check.
- Brief-predicted trips that did NOT trip (no edit): h1.3 S6.1 · h2.4 · h2.6 (guarded n/a, correction.ts in base) · h2.7 S11.3 · h3.1 · money-2. No non-HR oracle edited.

## Debts / notes
- Sole-owner strand via `isOwnHrSubject` (brief R3 "unverified") — not tested, debt.
- Non-contiguous step numbers (Q9) — debt.
- `cancelMyRequestAction` keeps its ownership check (`requestedById` = me): legacy HrLeave requests whose `requestedById` is an employee id still cannot be withdrawn from "my requests" (unchanged; page routes HrLeave rows to `cancelLeaveAction` anyway).
- `qc-ai-actions` CRASH (AA-5.2 kanban `lastProp` null) is pre-existing: same result on base c6764057f (positive control run in a base worktree).
- `qc-pos-p5.2` refuses the lane DB (QC4 only, writes nothing). X4 by reading: it decides single-step POS requests via `decide`/`bulkDecide` without a step ⇒ `expectedStep` undefined ⇒ legacy path; no earlier step ⇒ no two-person/audit; `canDecideStep` unchanged ⇒ unaffected.

## Green table (lane 2 DB · qc-hr.sh + iso + gate lock · outputs `scratchpad/leave3/out/`)
| suite | result |
|---|---|
| seed-hr-qc | 34/34 |
| qc-hr-leave-3 forced ×4 (run1, #2, #3, #f4 after ORACLE-EDITs) + unforced ×1 | 53/53 each (28 RED→pass · 25 GREEN) · RESIDUE none · activeLaw 0→0 |
| qc-approval / -edit / -wiring | 16/16 · 12/12 · 7/7 |
| qc-hf-hr-privacy | 194/194 (CH-4 GREEN) |
| qc-ai-tools / tools2 / proposals | 18/18 · 8/8 · 16/16 |
| qc-ai-actions | 11/12 — CRASH at AA-5.2 (kanban `lastProp` null) · **same on base c6764057f** (positive control, base worktree) · not this ticket |
| qc-pos-p5.2 | refuses lane DB (QC4 only, exit 4, nothing written) · X4 read: no `step` fields ⇒ legacy path |
| qc-hr-h0.6 · h1.1 · h1.3 · h2.4 · h2.5 · h2.6 · h2.7 · h2.9 · h2.10 · h2.11 · h3.1 | 55 · 81 · 63 · 68 · 79 · 56 · 94 · 58 · 57 · 70 · 58 — all pass |
| qc-hr-h3.2 · h3.4 · h3.9 | first run 63/64 · 84/85 · 59/60 (frozen lists) → after ORACLE-EDITs 64/64 · 85/85 · 60/60 |
| qc-hr-h4.1 · h4.5 · h4.8 | 47 · 90 · 48 — all pass |
| qc-hr-h4.3 | 43/45 (S1.6, S1.7) → after ORACLE-EDITs 45/45 |
| qc-hr-set-1 · money-2 · hf-sso | 25 · 57 · 41 — all pass |
| qc-hr-priv-2 | 45/47 (S4, S5) → after ORACLE-EDITs 47/47 |
| qc-payroll · payroll-reverse · hr-payadjust · audit-trail | 19/19 · 14/14 · 27/27 · 21/21 |
| qc-hr · hr-attendance · hr-roster · hr-leave-booking · booking-hours-hr | 9 · 31 · 24 · 14 · 13 — all pass |
| fitness · fitness-hr (env and `env -u DATABASE_URL -u DIRECT_URL`, before and after ORACLE-EDITs) | 54/54 · 9/9 |
| clean typecheck (rm .next/types + tsbuildinfo · ISO_MEM=14000M) | 0 errors |

## Fix round r3 (CONTROLLER RULINGS r3 W1–W9 · commits 7f605bc0a src · 2ff687c1d ORACLE-EDITs)
- **W1** `approval/service.ts:337-345` inside the `decide` tx: `SELECT … FROM "ApprovalPolicy" … FOR SHARE`, re-read the steps in the tx, take the step for `curOrder` from the LIVE list (shadows the pre-tx read), re-check `canDecideStep` on it (missing step / no right ⇒ lost-claim result, nothing written), `isFinal` from the live list, `:400` next step from the live list. Step 1 that became final ⇒ request finishes APPROVED, effect once (3b W1 both orders GREEN).
  - **Lock order:** `decide`: ApprovalPolicy row (FOR SHARE) → ApprovalRequest row (claim UPDATE) → inserts. `updatePolicy`: ApprovalPolicy row (FOR UPDATE) → plain count of requests (no row lock) → step rows. HR withdraw paths (`cancelLeave`/`cancelCorrection`/`cancelSwap`): HR advisory locks → ApprovalRequest row; they never touch the policy row. `submitForApproval`: no policy lock. No path holds an ApprovalRequest row and then waits for the policy row ⇒ no cycle. Two `decide`s share the policy lock; an edit waits for in-flight decisions, then counts strands on the committed state (decide-first ⇒ request at step 2 ⇒ edit refused "1"; edit-first ⇒ decide plans on [1] ⇒ APPROVED).
- **W2** `ai/tools.ts:1802-1810` approval_decide with only `requestSummary`: resolved at proposal time against `listPending` of the proposer (same set as the approvals page); exactly one hit ⇒ payload gets `requestId` + `expectedStep`; none/many/unknown actor ⇒ unchanged (confirm-time search). `proposals.ts` dispatch already prefers the payload's requestId/expectedStep.
- **W4.1** `hr/judge.ts:253-255,325` pair-day slots store the covering half's `leaveId` with `leaveHalf = null` (`asFullDay`); single halves unchanged (W4.3 GREEN).
- **W5** `approval/actions.ts:226-264` `cancelMyRequestAction` returns `{ ok, reason? }`: not mine / no id ⇒ "ไม่พบคำขอนี้ในคำขอของคุณ" · not PENDING ⇒ "คำขอนี้ตัดสินหรือยกเลิกไปแล้ว — ถอนไม่ได้" · HR refusal ⇒ HR's own fixed Thai reason · HR without system ⇒ "ถอนคำขอนี้ไม่สำเร็จ — …". `withdrawMyRequestFormAction` (same file) is the page's form action: refusal ⇒ throws the Thai reason, like the page's other cancel buttons (`cancelLeaveAction`/`cancelSwapAction`); `page.tsx:4,267` uses it (ConfirmDialog takes a void form action and is outside the allowed files).
- **W6** `approval/service.ts:468-472` `listPending`: for a non-OWNER, one extra read of this user's decisions on the pending requests; a request whose current step is above a step this user decided is not listed. OWNER unchanged. Also narrows the AI summary search (uses `listPending`).
- **W9** ORACLE-EDITs (2ff687c1d): `qc-hr-h4.3-lib.mts` S1.7 — LEAVE-3 acceptance now only for hunks whose every added line (current file) and removed line (base file) lies inside `tools.ts const approvalDecide…const inventoryConsume` or `proposals.ts type ApprovalDecidePayload…type InventoryConsumePayload` / `kind === "approval_decide"…kind === "inventory_consume"`; `propsRemoved` ignores removals only for such hunks · S1.6 `L3_ALLOW` + `scripts/qc-hr-leave-3b.mts` · `qc-hr-priv-2.mts` S4 `L3_ORACLES` + `scripts/qc-hr-leave-3b.mts`.
- **W3 / W4.2 — NOT DONE (blocked):** they need `src/lib/modules/hr/ot.ts` (`fullDayLeave`) and `src/lib/modules/hr/self.ts` (`myWeek` reads `HrLeave.halfDay` directly). Neither is in `qc-hr-leave-3.mts` ALLOWED (unchanged at cefce05a4) ⇒ editing them turns ST2 red. Per the coordinator's instruction: stopped, not edited, oracle not touched. 3b: W3.1 and W4.2 stay RED (9/11).
- **Step two (merge session/hr):** not done — local `session/hr` has no HR-PREPROD-1 code (only docs commits mention it).
- Debts (recorded, no code): late-approved leave (single or pair) is not auto-recomputed — the row stays STALE until someone recomputes (pre-existing, 3b W7 GREEN control) · sole-owner-as-requester strand · non-contiguous step numbers.
- r3 verification on 2ff687c1d (lane 2): qc-hr-leave-3 forced 53/53 + unforced 53/53 · qc-hr-leave-3b forced 9/11 (W3.1, W4.2 RED = blocked above; W1 W2 W4.1 W4.3 W5 W6 W7 W3.2 Z1 pass) · qc-approval 16 · -edit 12 · -wiring 7 · hf-hr-privacy 194 · ai-tools 18 · tools2 8 · proposals 16 · h1.3 63 · h2.6 56 · h2.7 94 · h3.2 64 · h3.4 85 · h3.9 60 · h4.3 45 · priv-2 47 · money-2 57 · hf-sso 41 · hr-attendance 31 · leave-booking 14 — all pass · fitness 54/54 + fitness-hr 9/9 both modes · clean typecheck 0 errors. Repeats ×3 and the rest of the run list held until W3/W4.2 are unblocked.
