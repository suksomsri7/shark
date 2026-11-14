# HR-LEAVE-3 — leave pairs · two-person chains · stranded/withdrawn requests (H5.3 hunt F1–F4) · brief

Base `session/hr` 2ab0c6b62 · branch `wip/hr-leave-3` · oracle `scripts/qc-hr-leave-3.mts` (+`-lib`) · probes `shark-hr/scratchpad/h53l/p1–p3` (+`.out`). Mark every hunk `HR LEAVE-3`. Anchors opened on 2ab0c6b62; `hr/` = `src/lib/modules/hr/`, `ap/` = `src/lib/modules/approval/`.

## Goal
AM+PM pair = full leave day · no one-person multi-step chain (OWNER audited) · no stranded requests · withdraw = cancel leave.

## Findings
- **F1** p2 `workDays` 2031-08-05 (AM paid+PM paid, no-show): `ABSENT pl240 ab240 ld0.5 [LEAVE_MISMATCH]` → sync REVIEW → `run.create WORK_ENTRIES` (whole system). 08-06 (AM unpaid+PM paid): `ul240 ab240`, PM ignored. Root `hr/judge.ts:263` `onDay.find(APPROVED)` feeds `slotLeaves` (`:277,:303`) and `leaveFraction` (`:314-315`).
- **F2** p1 A1 (OWNER ×2, MANAGER→OWNER) → APPROVED, 1 decider ×20 · A2 (one MANAGER, MANAGER→MANAGER) → leave APPROVED ×20 · p3 B1 `bulkDecide([id,id])` done 2 ×20. Root `ap/service.ts:283-380` (no expected step, no earlier-decider check), `canDecideStep :238-248`, `bulkDecide :399-420`; AI `ai/proposals.ts:1257`.
- **F3** p1 A5/A5b: `updatePolicy :98-128` (steps replaced `:116-125`) → request at step 2 undecidable, direct path refused, balance reserved.
- **F4** p1 A6: `cancelRequest` alone (= `ap/actions.ts:212-222 cancelMyRequestAction`) → request CANCELLED, leave PENDING, `decideLeaveAs` by another manager → APPROVED+USE, step-1 decision bypassed. Page routes HrLeave rows to `cancelLeaveAction` (`src/app/app/approvals/page.tsx:225-239`) but the server action accepts any own request id. Open door `hr/service.ts:696-710` (CANCELLED chains ignored); pinned by `qc-hf-hr-privacy` CH-4 (`:962-966`).
- **F5** booking (`hr/rules.ts:2-10`) → owner list, no code.

## Scope
**R1 (F1) judge reads all approved leaves of the day**
- Filing matrix (`hr/leave.ts:345-347 halfPair`; p2 `F.*`/`X.*`): the only second leave on a day = opposite half of a single-day half leave. Every other overlap → `LEAVE_TEXT.overlap`. ⇒ hourly+half combinations allowed today: **none**. Filing unchanged.
- `judge.ts slotsOf`: `approvedAll = onDay.filter(APPROVED)`; AM+PM both approved ⇒ every slot `{halfDay:null}` ⇒ LEAVE (judge-rules unchanged). Slot `leave` = covering half (crossing M / DAY slot = AM leave, `leaveHalf` null); `leaveFraction` first covered slot `"1.0"`, others `"0.0"`. Hourly via `approvedAll.find(hours!==null)`. One approved half ⇒ today (p2 `workDays2`: ABSENT 240, no review).
- `work-entries-rules.ts buildDay :208-238`: approved non-hourly leaves of the day = AM+PM pair and slots record ≥10 tenths for them ⇒ `capped` = 5 per leave, each credited by its own `paid/legacy` (`:241-248`); `expected` (`:236`)=10 ⇒ no LEAVE_MISMATCH. PENDING half ⇒ `PENDING_LEAVE` (today).
- Affected stored rows go STALE (`isStale :381-385`); recompute converges. No backfill.
- Numbers (base 3,000,000 st, shift 09–17, N=480, `floor(base·m/(30·N))`; probe `run2` UNPAID 240 = −50,000 ✓): paid+paid no-show → `pl480 ul0 ab0 ld1.0 []`, no UNPAID/ABSENT line ⇒ deduction 0. AM unpaid+PM paid → `pl240 ul240 ab0 ld1.0` ⇒ UNPAID_LEAVE **−50,000**, no ABSENT_RULE (today blocked). PM unpaid+AM paid mirror.

**R2 (F2) expected step + two-person rule (shared module)**
- `DecideInput.expectedStep?: number`: present and ≠ `currentStepOrder` ⇒ `{ok:false,status:"PENDING",note:null}` = lost-claim result (`:332/:353/:374`) ⇒ bulk text "ไม่มีสิทธิ์ตัดสินขั้นนี้ หรือถูกตัดสินไปแล้ว". Claims use it. Absent ⇒ current step (legacy, Q2).
- In the decide tx after a successful claim (request row locked): a decision by `m.userId` at a lower `stepOrder` exists ⇒ roll back, `{ok:false,status:"PENDING",code:"TWO_PERSON",reason}` "คุณตัดสินขั้นก่อนหน้าของคำขอนี้แล้ว — ขั้นนี้ต้องให้ผู้อนุมัติคนอื่นตัดสิน". Except `role OWNER`: decision written + 1 AuditLog `approval.decide.owner_override` {requestId, stepOrder, earlierSteps} in the same tx (Q3).
- `bulkDecide`: de-dup ids; optional `steps: Record<id,number>` → `expectedStep`. Web: `BulkApprovals` items carry `step` (page `:110-128`), hidden `step:<id>`; `decideAction`/`bulkDecideAction` parse (bad value ⇒ "การตัดสินไม่ถูกต้อง"). AI: `tools.ts:1767-1802` stores `expectedStep` (tenant read of `currentStepOrder`) when `requestId` known; `proposals.ts:1238-1262` passes it, else `matched[0].currentStepOrder` (summary path), else none (old proposals).
- **Callers in src**: `ap/actions.ts` decideAction/bulkDecideAction → `bulkDecide`; `ai/proposals.ts:1257` → `decide`. No other module. Chains come from `createPolicyAction` (1–2 steps) ⇒ single-step chains unchanged (no earlier step).
- **Oracles**: multi-step only qc-approval, qc-approval-edit, qc-hf-hr-privacy SC-5/6 — distinct users ⇒ unchanged. Single-step ⇒ unchanged: qc-svc-r0.3/d.5/d.11/d.12, qc-member-m1.7/m2.5/fix-s4, qc-crm-c3.3, qc-pos-p1.18, qc-pos-p5.2 X4 (no step ⇒ legacy), qc-hr-h0.7/h2.3/h2.6/h2.7, qc-ai-phase-b2, qc-approval-wiring.

**R3 (F3) no step edits while requests are open**
- `updatePolicy` tx: `SELECT … FOR UPDATE` the policy; normalise old/new steps (order, role, userId, sorted); differ and `n = count(PENDING, policyId) > 0` ⇒ throw `แก้ขั้นอนุมัติของสายนี้ไม่ได้ เพราะมีคำขอรอตัดสินอยู่ ${n} รายการ — ตัดสินหรือยกเลิกคำขอเหล่านั้นก่อน หรือปิดสายนี้แล้วสร้างสายใหม่`, nothing written (`updatePolicyAction :143-147` shows `e.message`). Identical steps re-sent (form always sends them) + name/threshold/unit/system ⇒ allowed.
- Other strands: disable — none (`decide`/`listPending` ignore `active`, `:308-317,:425-437`) · delete — no src path (`approval.prisma:54` plain `policyId`) · approver gone — none (OWNER decides every step/unit `:243-245`; R2 exempts OWNER) · (unverified) `isOwnHrSubject` has no sole-owner exemption (swap with the sole OWNER as party on an OWNER step) ⇒ debt row. Race: a submit during the edit lands at step 1 — accepted.

**R4 (F4) withdraw = cancel the leave**
- Approve/reject effects = outbox → `src/lib/approval-effects.ts:202-209` → `applyLeaveDecision` (`leave.ts:524-568`). An outbox withdraw leaves a window (request CANCELLED, leave PENDING) ⇒ use the existing one-tx `cancelLeave` (`service.ts:789-863`: locks → `cancelRequest(…,{tx})` + leave CANCELLED).
- `cancelMyRequestAction`: `entityType==="HrLeave"` ⇒ `withdrawHrLeaveRequest` (new, composition root `approval-effects.ts`, dynamic `@/lib/modules/hr` which exports `cancelLeave`) with `{tenantId, systemId: req.systemId}`, `req.entityId`, actor; null systemId ⇒ no write. No `approval→hr` F2 edge (Q1).
- PENDING leave: no ledger row (reservation computed from PENDING rows, `leave.ts:356-368`) ⇒ released by the flip; `hr.leave.decided` 0 (Q-E, `service.ts:787`); audit `hr.leave.cancel` 1; booking unaffected (C-2 counts APPROVED).
- Still reaching direct-after-cancel: **legacy rows only** — HrLeave `cancelRequest` callers in src = `cancelLeave` and offboarding (`lifecycle.ts:517-521`, cancels the leaves too); pos/crm/dorm pass their own ids. Gate in `decideLeave :696-710`: CANCELLED chain with ≥1 APPROVED decision ⇒ decider must be OWNER (`isTenantOwner(…, tx)`, `:825` pattern), else "ใบลานี้เคยผ่านขั้นอนุมัติบางขั้นแล้วก่อนถูกถอนจากสาย — ให้เจ้าของกิจการเป็นผู้ตัดสิน". CH-4 (no decision, decider U.owner) stays GREEN.

## Allowed files (all else frozen)
`hr/judge.ts` · `hr/work-entries-rules.ts` (buildDay) · `hr/service.ts` (decideLeave chain block) · `hr/index.ts` (export) · `ap/service.ts` · `ap/actions.ts` · `src/lib/approval-effects.ts` · `src/app/app/approvals/page.tsx` + `BulkApprovals.tsx` · `src/lib/ai/tools.ts` + `proposals.ts` · `hr/ot.ts` (fullDayLeave — r3 W3) + `hr/self.ts` (myWeek — r3 W4.2) [added by controller, r3] · new oracle · ORACLE-EDITs below.
**`payroll-rules.ts` byte-frozen (sha).** Unchanged: judge-rules · work-entries · leave(-rules) · attendance-pay* · payroll* · rules · correction* · swap* · lifecycle · `prisma/**` · `core/**`. **No migration.**

## Hard rules
`HR LEAVE-3` on every changed hunk · no syntactic dodges of statics · fixed Thai texts, no names/ids/amounts (R3 count only) · lock orders unchanged · older-oracle acceptances only as explicit allowlist entries (`M2_ALLOW`/`P2_ALLOW` style). Expected to trip: **h1.3 S6.1** (+`"HR LEAVE-3"`) · **h2.4**, **h2.7** S11.3 base+marked blocks (ids unverified) · **h2.6** FROZEN/HUNKS (judge, ap/service, ap/actions, approval-effects) · **h3.1** FROZEN (service.ts, ap/service.ts) · **h3.2/h3.4/h3.9** frozen lists (judge, work-entries-rules) · **h4.3-lib** S1.6 · **priv-2 S4/S5** (unverified) · **money-2** `:118` unchanged-vs-base · qc-approval: none expected · **qc-hf-hr-privacy** CH-4 stays GREEN, UI-1 re-check.

## Oracle plan (`qc-hr-leave-3`, fixtures from h53l `common.mts`)
- **R1** RED: 1.1 paid+paid → attendance LEAVE · 1.2 work day `480/0/0/1.0/[]` · 1.3 sync no wait + `createPayrollRunV2` ok · 1.4 no UNPAID/ABSENT line · 1.5 unpaid+paid → −50,000 UNPAID, no ABSENT_RULE · 1.6 mirror · 1.7 two shifts 09–13/13–17 · 1.8 base-shape stored row → STALE → recompute converges. GREEN: 1.9 PM pending → PENDING_LEAVE · 1.10 PM revoked → ABSENT 240 · 1.11 AM leave + PM worked · 1.12 full day; 4 h unpaid hourly 240/240.
- **R2** RED: 2.1 OWNER replay `expectedStep 1` ×2 → no-op, step 2, 1 decision · 2.2 same MANAGER → TWO_PERSON · 2.3 bulk dup → done 1 · 2.4 AI same refusal · 2.5 OWNER both → APPROVED + exactly 1 override audit · 2.6 stale step → lost-claim text · 2.11 static: every src caller passes a step · 2.12 page renders `step:<id>`. GREEN: 2.7 two deciders, one step, under held `ApprovalRequest FOR UPDATE` (`underLock`, no sleeps) → 1 ok · 2.8 single-step ± step · 2.9 distinct users · 2.10 SELF_* unchanged.
- **R3** RED: 3.1 steps edit, 1 pending → text "1", steps+name byte-same · 3.6 count = this policy only. GREEN: 3.2 name/threshold with pending · 3.3 none pending · 3.4 identical steps · 3.5 disabled still decidable.
- **R4** RED: 4.1 `cancelMyRequestAction` (callAct) → leave+request CANCELLED, audit 1, event 0, pending released · 4.2 then `decideLeaveAs` refused · 4.3 legacy cancel after step 1 → MANAGER refused, OWNER ok. GREEN: 4.4 CH-4 · 4.5 PurchaseOrder unchanged · 4.6 not-mine · 4.7 withdraw vs final approve under request row lock (A7b) · 4.8 decided → nothing.
- ST1–4 marks · sha · unchanged · texts.

## Lane run list (lane wrapper, gate lock, `scripts/iso.sh`)
`qc-hr-` leave-3 h0.6 h0.7 h1.3 h2.3 h2.4 h2.6 h2.7 h3.1 h3.2 h3.4 h3.9 h4.1 h4.3 money-2 priv-2 leave-booking · qc-approval(-edit,-wiring) · qc-hf-hr-privacy · qc-booking-hours-hr · qc-ai-tools · qc-ai-phase-b2 · sample qc-pos-p5.2 p1.18 · qc-crm-c3.3 · qc-svc-r0.3 · qc-member-m1.7 · fitness + fitness-hr (both modes) · clean typecheck (rm `.next/types` + tsbuildinfo, `ISO_MEM=14000M`).

## Collision with PREPROD-1 (`wip/hr-preprod-1`)
Same functions: **`hr/service.ts decideLeave`** (P1: second paid-run gate around `:711/:716`; L3: chain block `:696-710`, adjacent) · **`hr/work-entries-rules.ts buildDay`** (P1: `WorkLeave :85` `unpaidTenths`, minutes `:240-247`, hourly `:315-316`; L3: `capped :228-238`, adjacent). No overlap: `leave.ts` (`leaveSplitOf`, USE note, `leavePaidRunRefusalInTx`), `settings.ts` paid-flip refusal, `work-entries.ts` digest (L3 input unchanged), `cancelLeave` (L3 calls, never edits). Pair gives 5 tenths per leave, then P1 splits each; MONEY-2 R5/R6 gates untouched.

## QUESTIONS FOR THE CONTROLLER
1. R4 mechanism — **default: route via composition root → `hr.cancelLeave`.** One tx; outbox reopens F4.
2. `expectedStep` missing in web actions — **default: legacy current step.** Required ⇒ qc-pos-p5.2 X4 RED.
3. Owner override as AuditLog row — **default: yes.** No flag column on ApprovalDecision.
4. Bulk duplicates dropped silently — **default: yes.** Not a user error.
5. Legacy cancelled-with-decision → OWNER only — **default: yes.** No bypass of a decided step.
6. Same F4 shape for `HrTimeCorrection` (`page.tsx:256`, `correction.ts:452`) and `HrShiftSwapRequest` (`swap.ts:494`), unverified — **default: include via the same seam.** Same hole.
7. Legacy other multi-leave days — **default: today (visible LEAVE_MISMATCH).** Filing cannot create them.
8. Merge order — **default: PREPROD-1 first, LEAVE-3 rebases.** Ruled, in flight, adjacent hunks.
9. Contiguous step orders — **default: no (debt).** Form cannot make gaps.
10. F5 — **default: owner list only.**

## CONTROLLER RULINGS (14 Nov) — drafter defaults ACCEPTED for Q1–Q10
- Q1 withdrawal goes through the composition root to `hr.cancelLeave`, one transaction · Q2 `expectedStep` optional, missing ⇒ current step (web actions and the AI tool must pass it) · Q3 OWNER override written as an AuditLog row · Q4 duplicate ids in bulk dropped silently · Q5 legacy cancelled chain that already had a decision ⇒ only OWNER may decide the leave directly · Q6 time corrections and shift swaps get the same withdrawal fix · Q7 other legacy multi-leave days keep LEAVE_MISMATCH · Q8 PREPROD-1 merges first, LEAVE-3 re-merges · Q9 non-contiguous step numbers = debt · Q10 F5 owner list only.
- Shared approval module: single-step chains must behave byte-identically (GREEN control required in the oracle).
- Acceptances in older oracles: explicit allowlist style only. Oracle size cap 64 KB, coverage never dropped for size.

## CONTROLLER RULINGS r2 (14 Nov, after oracle f5548afef) — binding
1. **R3 narrowed:** `updatePolicy` refuses a step change only when it would STRAND a pending request (some PENDING request's `currentStepOrder` is not a step number in the new list) — fixed R3 text with the count, nothing written. Non-stranding step changes (role change of the current step, adding/removing other steps) are allowed; the request stays decidable under the new definition. Renumbering [1,2]→[1,3] with a request at step 2 = stranding ⇒ refused. (`qc-svc-r0.3` RV-2 edits [1 OWNER]→[1 MANAGER] at step 1 ⇒ allowed.)
2. OWNER double click WITHOUT a step moving two steps (audited) is the fallback only; web actions and the AI tool always send the step (owner double click through the actions advances one step).
3. Names: `decideAction` form field `step` (integer the page rendered) · `bulkDecide(m, ctx, ids, decision, note, steps?: Record<id, number>)` — bulk action sends the map (form fields `step:<id>`) · owner-override audit: action `approval.owner_override`, `targetId` = request id, `after` = `{ step, previousDeciderStep }`.
4. Q6 corrections/swaps: outcome-only checks.

## CONTROLLER RULINGS r3 (14 Nov, after review MERGE WITH NOTES + re-hunt on ed06b0514) — binding · oracle part b `scripts/qc-hr-leave-3b.mts` (shares the lib)
- **W1 (MAJOR, race)** chain MANAGER(1)→OWNER(2), request at step 1; the manager's `decide(expectedStep 1)` has read steps [1,2] and waits on the request row; `updatePolicy → [MANAGER(1)]` commits (strand count 0); the decision then sets currentStepOrder = 2 ⇒ stranded 20/20 (hunt N1). Required: `decide` takes the policy row FOR SHARE inside its transaction and re-reads the steps before the claim; a changed step list ⇒ plan on the LIVE steps (step 1 now final ⇒ APPROVED, effects once) — never a request at a non-existent step. Check: row-lock-ordered, both orders.
- **W2** AI path by request summary: the proposal captures requestId + expectedStep at PROPOSAL time; confirming after someone else advanced the request decides nothing (same answer as a stale step).
- **W3** an approved AM+PM pair day is a full-day leave for OT: `requestOt` and OT approval on that day are refused exactly as on a full-day leave day (`hr/ot.ts` fullDayLeave). Control: a single half day still allows OT.
- **W4** pair day stores `leaveHalf = null` and the self week view (`hr/self.ts` myWeek) shows the day as full-day leave, not "AM".
- **W5** withdrawing through the approvals action returns the HR result: a refused withdrawal (not mine / already decided / no system) is reported as refused, not success.
- **W6** `listPending` does not offer a step-N request to a non-OWNER who already decided an earlier step of it; OWNER still sees it.
- **W7** late second half approved after the day was judged must be picked up like a late single leave (measured: both only via STALE in the work-entry build, neither auto-recomputed nor in attendanceNeedsRecompute ⇒ GREEN control, no new rule).
- **W8** pair + sick-leave split: tested after the merge with HR-PREPROD-1, not now.
- No tightening of older oracles.
