# HR-MONEY-2 — builder notes (14 Nov 2026)

Tree `/root/projects/shark-hr` · branch `wip/hr-money-2` (from session/hr 60659e7c0; oracle commits 85ffe50d7 + db37e6b4b) · brief `ledger/hr-briefs/hr-brief-MONEY-2.md` · oracle `scripts/qc-hr-money-2.mts` (49 checks, not edited) · green run `hr-MONEY-2-green.txt`.
No schema / migration. `payroll-rules.ts` byte-identical (ST1). Files of ST2 untouched.

## 0. Checkpoint
- done: R1–R5 code (20bd1d017) · ORACLE-EDITs (bcfa069a2) · oracle 49/49 ×4 · regression all green (green.txt) · typecheck clean 431 s.
- next: controller full regression + reviewer + hunter.

## 1. What changed where
| file | what |
|---|---|
| `hr/payroll.ts` | **R1** `money2VoidRefundsInTx` (reverse v1 path after `reverseCarryInTx` + `reverseRunH37` both modes): run's DEDUCTION claims FOR UPDATE → their live `refund:<claim>#…` rows FOR UPDATE → unbound ⇒ REJECTED (runId NULL, decidedAt now) · bound to APPROVED/PAID run ⇒ `LATER_RUN` · bound to a DRAFT or UPDATE count < read ⇒ `REFUND_BOUND` (fixed text `MONEY2_TEXT.refundBound`, audited by `reverseRefused`) · audit `hr.payadjust.refund_void {code DEDUCTION_REVERSED, claimId, runId}` after commit. `cancelAdjustment` of an unbound DEDUCTION → `money2DeleteClaim` (delete + void unbound live refunds in one tx, audit code `CLAIM_CANCELLED`). Build backstop `money2HeldRefundsInTx` in `buildRunV2InTx` (both modes): refund whose claim does not stand is not bound, stays APPROVED, item flag `REFUND_HELD`; at approve the bound-mode rebuild drops it ⇒ digest differs ⇒ `INPUTS_CHANGED`. **R4** `money2OverV1` (createPayrollRun · rebuildDraftRun) and `money2OverV2InTx` in `writeRunV2InTx` (totals · item money columns · every `accrualAmountsV2` amount) ⇒ `RUN_LIMIT` / `PayrollInputError` / `{ok:false, reason}` before any write; `Run2Code` + `"RUN_LIMIT"`. Reader `payrollAccrualInputsOfRuns` for labor.ts. |
| `hr/labor.ts` | **R2** month ACTUAL wage per item = `accrualAmountsV2([item], bound, claims).salaryExpenseSatang` (v2 with lines) · v1 = base + add − bound LATE/ABSENT · no lines / inconsistent = gross; + employer SSO. **R3** day unit = unit of `sourcesJson.rosterEntryIds` entry (fallback `HrWorkDay.unitId`); `money2Split` floors shares, remainder → home if it has minutes else most minutes (tie lowest id). Privacy gate (`g.sees(home)`, excludedHeadcount) unchanged. `largestRemainder`/labor-rules untouched. |
| `hr/leave.ts` | **R5** `leavePaidRunRefusalInTx` (policy `paid === false` ∧ APPROVED/PAID run of the HR system in any BKK month of the leave ⇒ `CORRECTION_TEXT.paid`, imported) · `applyLeaveDecision` approved ⇒ CANCELLED + audit `hr.leave.apply_refused {code PAID}`. Same rule as correction.ts `paidMonthsOf` (that file is frozen, so the 1-query rule is restated, not exported). |
| `hr/service.ts` | R5 on `decideLeave` (PENDING→APPROVED and APPROVED→REJECTED) · `requestLeave` owner auto-approve (rolls back, no row) · `cancelLeave` of an approved owner leave. |
| `src/messages/{th,en}/common.json` | `hr.…fl_REFUND_HELD` label (JSON has no marker). |

## 2. §F self-check
1 n/a (no page/route) · 2 ✔ inside every new `$transaction` only the tx client (`money2DeleteClaim`; reverse/build/leave helpers take the caller's tx) · 3 n/a (no new scope surface; labor viewer scope unchanged) · 4 ✔ refusals are fixed Thai texts (REFUND_BOUND, RUN_LIMIT, CORRECTION_TEXT.paid), no ids · 5 ✔ new tx uses H34_TX (60 s) like the neighbours · 6 n/a no migration · 7 ✔ no second connection under a lock (audits after commit) · 8 n/a · 9 n/a no new outbox event · 10 ✔ files ⊆ brief list (+ messages, notes, 6 oracle files with pre-authorised marked edits).

## 3. ORACLE-EDITs (pre-authorised kind — minimal, marked)
- `qc-hr-h1.3.mts` S6.1: `PAY_MARKED` + `"HR MONEY-2": 10` (10 × sourceRef in the marked MONEY-2 block of payroll.ts: refund hold/void readers + accrual-input reader for labour ACTUAL).
- `qc-hr-h3.2.mts` S1.8: marked-hunk regex `/HR H\d|HR-SET-\d/` → `/HR H\d|HR-SET-\d|HR MONEY-2/` (leave.ts, service.ts hunks).
- `qc-hr-h3.4-lib.mts` S1.6 `laterOnly`: `/HR-SET-\d+|HR H\d+\.\d+/` → `+ |HR MONEY-2` (same files).
- `qc-hr-h3.6.mts` S1.6 `laterMarked` regex `+ |HR MONEY-2` (payroll.ts, service.ts hunks).
- `qc-hr-h3.9.mts` S1.5 `laterMark`: `/HR-SET-\d+/` → `/HR-SET-\d+|HR MONEY-2/`.
- `qc-hr-h4.3-lib.mts` S1.6 (in base only): hr-frozen files / older oracles pass when every hunk carries "HR MONEY-2"; the ticket's own new oracle files `qc-hr-money-2(-lib).mts` are not "other oracles" (S1.6 was already RED at the oracle commit db37e6b4b because of them — controller please confirm) · S1.7 `anyMark` + `|HR MONEY-2`.
No expectation/golden changed. h4.2 S4.11/S5.1/S5.7/S7.1 unchanged as the oracle note predicted (E: 1,391,667 / 695,833).

## 4. R6 — accountant list (no code)
1. **m6 (+D4)** same-month rehire = two HrEmployee rows ⇒ SSO clamped per item ⇒ up to 2 × ceiling, and SSO 1-10 has two lines for one national id.
2. **m7** v1 manual OT by hours rounds twice (rate, then hours × rate) — v1 frozen; +1 sat at 10 h, +93 sat at 744 h on 15,123 ฿.
3. **K1 / NA-12** leaver's final-period WHT still projects the remaining months (e.g. 1,566.25 ฿ where the true year tax is 0).
4. **N1 (HF-SSO hunt)** two v2 runs paid in the same January both get month index 1 ⇒ the second projects 13 months of income.

## 5. Production note
No migration. Labour-cost ACTUAL figures (`laborMonth`, AI `hr_labor_percent`) change for months with advance/claim recoveries or give-back refunds (now = accrual Dr 6000 + Dr 6010) and for borrowed shifts (split to the rostered unit). Give-back refunds whose deduction no longer stands are held (flag REFUND_HELD) or voided on reverse/cancel; a reverse whose refund sits in a later draft is refused REFUND_BOUND. Existing legacy APPROVED refunds of already-reversed claims will be held at the next build (not paid) — visible as REFUND_HELD; owner may reject them by hand.

## 6. Decisions / notes for the controller
- Cancel of an unbound claim voids only unbound live refunds; a refund already bound to a DRAFT is left for the approve backstop (INPUTS_CHANGED, then rebuild holds it). Not pinned by the oracle.
- R4 v1 checks run totals + item money columns only (brief); the v1 one-step JV uses the same totals.

## 7. Fix round 1 (controller, after review = MERGE WITH NOTES + re-hunt N1) — oracle 28dfffbe7 (56 checks)
- **N1/R6** `leave.ts leavePaidRunRefusalInTx(tx, ctx, leaveId, {revoke})`: (a) unpaid policy, or `revoke` (decideLeave APPROVED→REJECTED · cancelLeave of an approved leave) of any leave with a policy, in a month with an APPROVED/PAID run ⇒ `CORRECTION_TEXT.paid` (R5.8 flipped); (b) any leave (paid/unpaid/legacy) covering a day that appears in an `HrAttendanceDeduction.linesJson` line (amount > 0, kind DEDUCTION) whose adjustment is bound to an APPROVED/PAID run ⇒ same text. Day-exact through the deduction's lines; no sourceRef read. Entry points unchanged (decideLeave · requestLeave owner auto · cancelLeave · applyLeaveDecision → CANCELLED + PAID). Nothing written on refusal (tx rolls back / no update).
- **F1** h4.3-lib S1.6: explicit allowlist — `hr/leave.ts`, `hr/payroll.ts` (labor.ts and service.ts are not in S1.6's sets) + oracles h1.3, h3.2, h3.4-lib, h3.6, h3.9, h4.3-lib (own, excluded by S1.6 anyway), qc-hr-money-2(.mts|-lib.mts); every hunk must still carry "HR MONEY-2".
- **F2** `payrollAccrualInputsOfRuns` groups bound rows once per `<runId>|<employeeId>` and reads ≤ 50,000 rows (`LIMIT 50,001` → `truncated` → labour `truncated` flag); labor.ts passes only that employee's rows to `accrualAmountsV2`, and groups work days per employee once. Numbers identical (oracle R2/R3 + h4.2 green).
- **F3** a live refund bound to a run that is neither DRAFT nor APPROVED/PAID (legacy REVERSED-but-bound) ⇒ still refused, code REFUND_BOUND, new neutral text `MONEY2_TEXT.refundStuck` (service text, Thai — service refusals have no en copy; see open item below).
- **F4** `let rv = {` restored (no hunk there now).
- PAY_MARKED "HR MONEY-2" stays **10** (no new tracked token).
- Fallback to gross (accrualAmountsV2 not-ok): **not surfaced to the user** anywhere — laborMonth returns no flag. For booked v2 runs it cannot happen (finalize refuses INCONSISTENT before posting); it can for no-book v2 runs with hand-edited items. Logged as a debt by the controller.
- **Open item for the controller:** the run page maps refusal texts through the `RUN2_MSG` allowlist (`payroll-run-ui.tsx`); `MONEY2_TEXT` (REFUND_BOUND, refundStuck, RUN_LIMIT) is not in it, so the page shows the generic "failed" for these refusals. Fixing needs payroll-run-ui.tsx (not in this brief's file list) — not done.
- **Merge** session/hr 6ebaab7ad into the branch (5016f64b7): conflicts only in older-oracle statics edited by both HF-SSO and MONEY-2 (h3.2 S1.8 · h3.4-lib S1.6 · h3.6 S1.6 · h3.9 S1.5 · h4.3-lib S1.6/S1.7) — resolved by keeping both marks ("HR HF-SSO" and "HR MONEY-2"); h4.3 S1.6 keeps HF-SSO's `hfOk` + MONEY-2's explicit allowlist. Inventory JSON untouched by MONEY-2 (= session/hr). PAY_MARKED auto-merged, "HR MONEY-2" = 10. Post-merge reruns green (green.txt).

## 8. Ruling R7 + delta review D1/D2
- **R7** `payroll-run-ui.tsx` (one import line + one line in `RUN2_MSG`, both marked `HR MONEY-2`): `MONEY2_TEXT` entries listed as `m.<key>` like the sibling texts ⇒ REFUND_BOUND (`m.refundBound`), refundStuck (`m.refundStuck`), RUN_LIMIT (`m.runLimit`) now reach the v2 run page instead of "failed".
  v1 paths: no separate allowlist exists — v1 create (`createPayrollRunAction` → `PayrollInputError.message`) and v1 recompute (`recomputeDraftRunAction` → `reason`) already pass the fixed RUN_LIMIT text to `RunRowActions.tsx` verbatim. The v1 reverse (`reverseRunAction`, payroll-actions.ts:220) returns nothing for **any** refusal (pre-existing: also CARRY_BOUND / LATER_RUN / JV codes) — REFUND_BOUND on a v1 reverse is therefore silent there too; not changed (outside R7's single file) → for the controller.
  Oracles that read the UI file: h3.4(-lib), h3.4-ytd-lib, h3.8 — all green with the change, no edit needed. h4.3 S1.6 covers it (`payroll[^/]*`) ⇒ added `payroll-run-ui.tsx` to the explicit MONEY-2 allowlist.
- **D1** `leavePaidRunRefusalInTx` no longer reads attendance-deduction heads with an unordered `take`: it starts from the employee's ABSENT/LATE DEDUCTION adjustments bound to a run (runId not null) → keeps those whose run is APPROVED/PAID → reads only those heads (`adjustmentId in`, months of the leave) → day match on linesJson. No row cap.
- **D2** the revoke refusal (decideLeave APPROVED→REJECTED · cancelLeave of an approved leave) no longer requires a leave policy — a legacy leave in a paid month is refused too. **No oracle check pins D2** (R5.6/R5.8 use policies) — for the oracle author.
- Open item 1 (gross fallback not surfaced) recorded as debt by the controller.
