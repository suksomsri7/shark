# HR-PREPROD-1 — builder notes (15 Nov 2026)

Tree `/root/projects/shark-hr-l4` (lane 4) · branch `wip/hr-preprod-1` from e0de57dd8 (base `session/hr` a4e2fb4ae) · brief `ledger/hr-briefs/hr-brief-PREPROD-1.md` (both rulings sections) · oracle `scripts/qc-hr-preprod-1.mts` + lib (57 checks, not edited) · green table `hr-PREPROD-1-green.txt`.
No migration · `payroll-rules.ts` byte-identical · no settings writer added.

## 1. What changed where
| req | file | change |
|---|---|---|
| R1 | — | nothing (oracle GREEN pins) |
| R2 | `payroll.ts` | `strandedAdjustments` + `refundsBehindOf`: REFUND rows with `sourceRef refund:…`, PENDING/APPROVED, unbound, period without a live run, period ≤ `giveBackWindowInTx().lastCovered` ⇒ listed with `reason: "REFUND_BEHIND"` (old rows keep their 8 keys). `moveStrandedAdjustment`: such a row (re-checked under P lock) moves to the first run-less period after max(p, lastCovered) (`giveBackPeriodOf` rule); target after `endPeriod` ⇒ fixed text `REFUND_BEHIND_ENDED`, nothing written. |
| R2 | `payroll-ui.tsx` | one fixed line under "รายการค้าง" when a REFUND_BEHIND row is shown; PRIV-2 filter line unchanged. |
| R3 | `leave.ts` | `reserveLeaveInTx` skips the balance refusal for day-based SICK leave of a quota policy · `leaveApprovalCheckInTx` → `sickSplitInTx` (paid = min(days, L3-available) floored to ½ day; unpaid = rest; `from` = first counted day (`leaveDaysInTx` day set, new `meta.counted`) not fully paid; `half`) · `leaveLedgerInTx` USE = −paid (0.0 allowed) + note `unpaid:<d.d>;from:<day>[;half]` (fully paid ⇒ note null) · second gate `leaveUnpaidPartRefusalInTx` (unpaid days' months with an APPROVED/PAID run ⇒ `CORRECTION_TEXT.paid`) on chain apply (→ CANCELLED + PAID) · reader `leaveSplitsIn(db, ids)` / exported `leaveSplitOf(ctx, ids)` → `{ paidDays, unpaidDays, unpaidFrom }`. |
| R3 | `service.ts` | `decideLeave`: second gate after the check (refused ⇒ `HrLeaveDecisionError`, PENDING, no USE) · owner auto-approve: `sickSplitInTx` + second gate (refused ⇒ tx rolled back, no row). MONEY-2 gate untouched and still first. |
| R3 | `work-entries.ts` · `work-entries-rules.ts` | `WorkLeave.unpaidTenths?` (per day: 0 before `from`, 5/10 on `from`, 10 after) — paid policy minutes split into paid/unpaid ⇒ `unpaidLeaveMin` ⇒ UNPAID_LEAVE (run rules unchanged). Day hash carries the per-day value **only for split leaves** (all other hashes byte-same). v1 unchanged (Q4). |
| R3 | `privacy.ts` · `ui.tsx` · `self.ts` · `self-ui.tsx` · messages | list items gain `paidDays`/`unpaidDays` only for split leaves (`LeaveItemSplitDto` in privacy.ts; privacy-shared.ts untouched); history line and "ของฉัน" show the unpaid days (`hr.self.unpaidDaysN` th+en). |
| R4 | `scope.ts` | one constant `PAY_SCOPE_NO_ACCESS_TEXT`. |
| R4 | `payroll-actions.ts` | `payTarget(…, pay = true)` for decide / cancel / move: limited viewer + (missing row \| home not in pay scope) ⇒ `HrBranchError(PAY_SCOPE_NO_ACCESS_TEXT)` (same bytes as a missing id); all-branch path unchanged. |
| R4 | `payroll.ts` | `payScopeBlocked(ctx, scope, employeeId)` (only `inPayScope`) used by `decideAdjustmentAs` (→ `PAY_SCOPE_NO_ACCESS_TEXT`), `setAdjustmentConsent` and `giveBackClaim` (→ their existing not-found text). |
| R4 | `stock-charge.ts` | `chargeGate`: `inPayScope` on the employee's home ⇒ `T.noAccess` (= its missing-row answer). |
| R5 | `settings.ts` · `leave.ts` | `updateLeavePolicy`: `paid` changes and `leavePolicyPaidLockedInTx` (an APPROVED leave of the policy touches a month with an APPROVED/PAID run) ⇒ `SETTINGS_TEXT.paidLocked`, nothing written (before the update, under the existing row lock). |
| R6 | `ledger/HANDOVER-H3.md` §3 | row `13a (HF-SSO-M2)` directly under row 13 (a table row, so the table stays one table). |

Design limits (for the reviewer): sick split only for day-based leave (hourly SICK leave keeps the balance refusal); paid part floored to ½-day steps so the unpaid boundary is a whole/half day.

## 2. §F self-check
1 n/a (no new page/route) · 2 ✔ tx bodies use the tx client only (new helpers take the caller's tx; `refundsBehindOf` is a read outside any tx) · 3 ✔ limited `[]`/list scope via `hrScopeOf`/`isAllBranches`/`inPayScope` only · 4 ✔ fixed Thai texts, no ids/names/periods · 5 ✔ no new tx options · 6 n/a no migration · 7 ✔ no second connection under a lock · 8 n/a · 9 n/a no new event · 10 ✔ files ⊆ brief list (+ messages, ledger, oracle edits below).

## 3. ORACLE-EDITs (explicit allowlist style, every hunk marked `ORACLE-EDIT (HR PREPROD-1 · controller)`)
- `qc-hr-h1.3.mts` S6.1 `PAY_MARKED` + `"HR PREPROD-1": 3` (3 × sourceRef: refund-behind reader where · move select · move REFUND check).
- `qc-hr-h3.2.mts` S1.8: `PP1_S18` explicit file set; a listed file passes when every hunk carries `HR PREPROD-1`.
- `qc-hr-h3.4-lib.mts` S1.6: `PP1_S16` + `pp1Only` (same rule).
- `qc-hr-h3.6.mts` S1.6: `PP1_S16` + `pp1Only` (in base only).
- `qc-hr-h3.9.mts` S1.5: `PP1_S15` + `pp1Only` (in base only).
- `qc-hr-h4.3-lib.mts` S1.6: `PP1_ALLOW` (leave · privacy · self · payroll · payroll-actions · payroll-ui · the edited oracles) + `PP1_OWN` (the two own oracle files by name — the lib carries no source mark).
- `qc-hr-priv-2.mts` S4/S5 (no in-base guard): `PP1_SRC` / `PP1_OR` / `PP1_OWN` + `pp1Ok` — listed src files and edited oracles with every hunk marked, own oracle files by name.
- money-2: no edit (n/a in base).

## 4. Open items / debts
- Q4 (ruled): engine v1 never deducts unpaid leave — debt row stays.
- API `hr/api/**` is frozen; it passes the leave DTO through, so split leaves also carry `paidDays`/`unpaidDays` there.
- **Not green — needs a ruling:** `qc-hr-h3.8` S1.13 pins the sha256 of `privacy.ts` and `self.ts` ("later tickets re-take consciously"). h3.8 is not on the pre-authorised list, so it is not edited. Proposed re-take (the R3 leave-DTO split fields + "ของฉัน" unpaid days, all marked HR PREPROD-1): privacy.ts `ea0017fa…` → `6b8e3f05207e687f9e2acf7302e821fddf72cf0d004c68f3db2693eeb0d4d47e` · self.ts `d63dd889…` → `6a54690e198fdb1bf6b24cf2e31b9faa00ad2087caff03cd81feea3afe987fec`. (Alternative: drop the self.ts/self-ui.tsx display — the oracle does not need it; privacy.ts is needed by R3.3.)

## 5. Review fix round (rulings V1–V9 · oracle 491779afd: main 57 + 1b 22)
- **V1** `leave.ts sickSplitInTx`: paid = min(days, available) in exact tenths; note `unpaid:<d.d>;from:<first counted day with any unpaid part>` (`;half` gone). Per-day unpaid tenths are re-derived by `leaveUnpaidByDayIn` (counted-day set of `leaveDaysInTx`, paid = days − note's unpaid, filled from the first day) and fed to work entries (`WorkLeave.unpaidTenths`) and to the day hash (so a note change outdates the month — V5.4). 27.3 used ⇒ 2.7/2.3 ⇒ 12 Mar 144 min = 30,000.
- **V2** `privacy.ts leaveItemsForViewer`: `paidDays`/`unpaidDays` only when the viewer is the employee (linked user) or `canViewPayroll` ∧ `inPayScope(scope, employee.unitId)`; others get the row without the keys (UI text follows the keys).
- **V3** `sickSplits` requires `policy.paid !== false` (`paid` added to leave.ts `POLICY_SELECT`): an unpaid SICK policy never splits; over the balance ⇒ `LEAVE_TEXT.balance`.
- **V4** `leavePaidRunRefusalInTx` reads `paid` with `SELECT … FOR SHARE` on the policy row before deciding. Lock order checked by reading every caller: decideLeave / applyLeaveDecision (hr-leave → emp → roster keys → policy SHARE), owner auto-approve (emp → roster keys → policy SHARE already taken by reserveLeaveInTx), cancelLeave (hr-leave → emp → policy SHARE); the only FOR UPDATE holder of the policy row is `updateLeavePolicy`, which takes no advisory lock and no leave row lock ⇒ no cycle. Z2 (deadlocks) unchanged in both suites, V4.1 shows the decide waiting on the row.
- **V7** `requestAdjustmentAction`: `payView = canViewPayroll ∧ (all branches ∨ inPayScope(home))` drives the OT screen and the reply; an out-of-pay-scope requester gets one fixed reply (`ADJUST_OUT_OF_PAY_SCOPE`, status ok, no amount) for success and for every salary-dependent refusal (profile / no profile) — filing stays allowed. **Decision for the controller:** for an employee without a salary profile nothing is filed, yet the reply is the same neutral text ("ผลการยื่น…ไม่แสดงที่นี่ — ผู้ดูแลเงินเดือนของสาขาประจำ…เป็นผู้ตรวจยอดและแจ้งผล"), which is what V7.1 requires.
- **V8** `resplitSickInTx(employee, policy, years)` called by every positive writer in leave.ts: `use-revert` (+ `expire-late`, same branch) for the leave's year, `carry-top` for year+1, year-job `carry:` (when > 0). Split leaves (note `unpaid:`) re-split in date order up to the available balance (USE days + note updated, null when fully paid), skipping leaves with any day in an APPROVED/PAID month. Callers already hold `hr-leave-emp:<sys>:<emp>`.
- **V9** `moveStrandedAdjustment`: a leaver's refund whose run-less target is past the end period moves into the first DRAFT period in [first, endPeriod] (re-checked under the P lock: still DRAFT); the draft carries it after "ดึงข้อมูลใหม่" (paid once). No DRAFT ⇒ the fixed refusal.
- **(c)** `refundsBehindOf` reads lastCovered for all candidate employees in one grouped query and applies the page `take` after the filter (read cap 5,000).
- **(a)** h3.8 S1.13 pins re-taken (privacy.ts `45b20c1b…`, self.ts `6a54690e…`).
- **(b)** `PP1_OWN` (h4.3-lib, priv-2) + `qc-hr-preprod-1b.mts`; h3.8 added to h4.3-lib `PP1_ALLOW` and priv-2 `PP1_OR`.
- **(d)** PAY_MARKED "HR PREPROD-1" stays 3.
- **Needs an ORACLE-EDIT in `qc-hr-preprod-1.mts` ST3:** its `ORACLE_ALLOW` lists h1.3 … priv-2-lib but not `h3.8`; the authorised pin re-take makes ST3 red until `"h3.8"` is added (my edit carries `ORACLE-EDIT (HR PREPROD-1 · controller)` on every hunk).

### Debts (recorded, no code)
- Hourly SICK leave over the balance is still refused (only day-based SICK splits).
- Leave deciders and time-correction approvers are not pay-scope checked, although their decisions now move UNPAID_LEAVE money.
- **Accountant list:** on engine v1, sick days beyond the balance are now approved and paid in full — v1 never deducts unpaid leave (Q4).
- AM+PM pair of one day where only one half is split → HR-LEAVE-3.
- **Not green — needs rulings (I did not edit these oracles):**
  1. `qc-hr-preprod-1` ST3: `ORACLE_ALLOW` lacks `h3.8`; the controller-authorised S1.13 pin re-take makes it red. Proposed ORACLE-EDIT: add `"h3.8"` to `ORACLE_ALLOW` (my h3.8 hunks carry `ORACLE-EDIT (HR PREPROD-1 · controller)`).
  2. `qc-hr-h2.7` S1.5 "append-only": V8 requires updating the USE row (days + note) of a re-split leave (`hrLeaveBalanceTxn.updateMany` in `resplitSickInTx`), which the H2.7 static forbids in all of src. Proposed ORACLE-EDIT: allow exactly that writer (leave.ts, inside `resplitSickInTx`, marked `HR PREPROD-1`). Not done by a raw-SQL rewrite (no syntactic dodge).
- V7 rework after `qc-hf-hr-privacy` S-15: the out-of-scope reply is a separate builder `adjustmentReplyOutOfPayScope` (privacy.ts); `adjustmentReplyForViewer` and its call keep the H0/HF shape (`{ byHours: … }`).
- Merge of `session/hr` db19e793f (HF-SSO fix2 · H4.9-FIX1): conflicts only in h3.4-lib S1.6, h3.9 S1.5, h4.3-lib S1.6, priv-2 S4/S5 — every allowlist kept (HF-SSO narrowed files · H4.9 · MONEY-2 · PRIV-2 · PREPROD-1).
- Typecheck after the merge: 0 errors in tracked files; 23 errors all in the untracked `scratchpad/preprod1-oracle/*.mts` (oracle-author drafts, left alone).

## 6. V8b — append-only re-split (oracle 66b1524d6: main 57 · 1b 24)
- `resplitSickInTx` no longer updates a ledger row: it appends a USE row for the same leave — `sourceKey use-resplit:<leaveId>:<n>` (n = latest + 1), `leaveId` set, days = −(new paid − paid so far), note `resplit;unpaid:<d.d>;from:<day>` or `resplit;unpaid:0.0`. `hrLeaveBalanceTxn.update*` is gone from src (h2.7 S1.5 untouched, 94/94).
- One reader for every path: `leaveUseRowsIn` + `splitsOf` (leave.ts) — paid = −Σ USE rows of the leave; unpaid/from = note of the LATEST row by sequence (`use:` = 0, `use-resplit:…:<n>` = n; createdAt is the tx start time, so not used for order). `leaveSplitsIn`/`leaveSplitOf`/`leaveUnpaidByDayIn`/re-split all go through it. `leaveYearStateInTx` counts re-split rows into the leave's consumed days; revoke writes `use-revert` = Σ USE rows (V8.7: +5.0).
- Second return of balance: the next re-split reads the latest row (paid so far = Σ) and appends `…:<n+1>`.
- Balance consumed again by an earlier-dated leave after a re-split: that leave's approval splits against the available balance, which already counts the re-split rows (Σ ledger), so its paid part is at most what is left — the ledger never goes negative. Leaves already re-split keep their paid days (no downward re-split: the ledger has no negative correction writer, by ruling). Not covered by the oracle.
- PAY_MARKED "HR PREPROD-1" stays 3 (payroll.ts unchanged in this round).
- `session/hr` moved to 81fece63f (docs/notes only) → merged (d858e19cd), no conflicts.
- Final run (V8b, post-merge d858e19cd): every suite on the list green, typecheck exit 0 with no errors (green.txt).

## 7. Delta round (V1b · V7b · V8c · oracle 681ed7464: main 57 · 1b 25 · 1c 10)
- **V1b** (`leave.ts splitDaysIn` used by `leaveSplitsIn` and `leaveUnpaidByDayIn`): for a split leave (latest USE note has an unpaid part) the leave's CURRENT counted days are walked in date order, paid tenths given until Σ USE rows (what the ledger charged) is used up; the rest is unpaid — the unpaid count, `unpaidFrom`, the DTO and the work-entry minutes all follow the recount; the ledger is never touched. The day hash also carries a split signature (Σ USE · latest row · note) so a ledger change still outdates the month (V5.4).
- **V7b** (`payroll.ts requestAdjustment` codes + `privacy.ts adjustmentReplyOutOfPayScope(res)`): the two pay-derived refusals now carry codes — `PAY_NO_RATE` (no salary / OT rate) and `PAY_OT_ZERO` (OT by hours rounds to 0). Out-of-pay-scope requester: ok ⇒ neutral success text without amount; code `PAY_*` ⇒ non-success fixed text "ยื่นรายการนี้ไม่ได้ — ติดต่อผู้ดูแลเงินเดือนของสาขาประจำของพนักงานคนนี้" (nothing written — requestAdjustment returns before the insert); any other refusal ⇒ the real reason (same bytes as an all-branch viewer, V7.4). Classified by code only.
- **V8c** (`payroll.ts pp1ResplitAfterReverse` → `leave.ts resplitAfterReverse`): called after the reversal has COMMITTED on both reverse bodies (v1 `reverseRun` with JV · `reverseRunH37` no-book and booked; the v1 → H3.7 reroute goes through the latter). For the run's employees: approved SICK leaves overlapping the reversed period → one tx per employee: `hr-leave-emp:<sys>:<emp>` then `resplitSickInTx` (same rules: append-only, skips leaves with a day in a month that still has an APPROVED/PAID run).
  - Lock order: the re-split runs in its own transaction after the reverse transaction has released the period advisory lock and the run row — no nesting, so no cycle between `hr:payroll:run:<sys>:<P>` / run row and `hr-leave-emp`. Inside, the order is the leave paths' own (emp → policy SHARE via reads).
  - Reverse rolls back / refused ⇒ the hook is never called. Re-split fails after a committed reverse ⇒ the reverse still reports ok, a WARN goes to ops, the leaves keep their old split (unpaid days stay unpaid — never over-pay); the next positive ledger writer re-splits them.
- PAY_MARKED "HR PREPROD-1" — recounted with h1.3 (see green table).
- `session/hr` moved to df2073462 with no src change (walk tooling + resume) ⇒ not merged.

### Debts (added)
- A re-split can race a run approval between the run's freshness check and the approve (the re-split commits after the build read the work entries) — approve's INPUTS/WORK_ENTRIES gate catches a changed hash only if the work entries were rebuilt; not covered by a check.
- Offboarding (employee end) does not trigger a re-split; not covered by a check.
- If the post-reverse re-split fails, nothing retries it automatically (ops WARN only).
- **PAY_MARKED (h1.3):** unchanged at `"HR PREPROD-1": 3` — the delta round adds no sourceRef token in payroll.ts (pp1ResplitAfterReverse + PAY_NO_RATE/PAY_OT_ZERO codes); h1.3 63/63.
- **Open red:** h3.8 S1.13 privacy.ts sha pin — V7b changed privacy.ts (45b20c1b… → 1847a6a01c8bd85b…); the pin re-take is left to the controller (builder not authorised to edit it this round).
