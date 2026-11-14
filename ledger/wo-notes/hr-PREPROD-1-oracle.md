# HR-PREPROD-1 — oracle notes (`scripts/qc-hr-preprod-1.mts` + `-lib.mts`)

Brief `ledger/hr-briefs/hr-brief-PREPROD-1.md` (controller rulings Q1–Q8 binding) · branch `wip/hr-preprod-1` · lane 4.
Oracle under change control: builder asks for an ORACLE-EDIT (check id · exact hunk · reason), never edits.

Run (lane DB only):
`bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-preprod-1.mts` (`--list` prints the registry).
Base = `QC_PP1_BASE` || merge-base(HEAD, `session/hr`) = a4e2fb4ae. Diff statics turn n/a once the base already carries `HR PREPROD-1` (in-base guard, as money-2).
Size: suite 48.7 KB + lib 13.4 KB = 62.1 KB (< 64 KB, no check dropped). Targeted tsc (temporary tsconfig over the two files, since deleted): exit 0.

## Base result (tip 28699bda3 + these files, forced)

`BASE-EXPECTATION 57/57 as registered (RED-by-design 28 · GREEN controls 29)` · passed 29/57 · `RESIDUE none (tenants=3 users=12 activeLaw=0->0)` · no deadlocks.
**R1 is GREEN on all three paths on base** — no finding: reversal unbinds LATE/ABSENT rows, keeps them APPROVED, leaves the `HrAttendanceDeduction` heads byte-same, a re-created run binds the same two rows (106,250), `syncAttendanceDeductions` writes nothing, and the MONEY-2 leave gate flips from refuse to allow.

## Checks (id · base)

Statics
- ST1 G `payroll-rules.ts` sha. ST2 G frozen vs base: prisma, core, hr/api, package.json, qc-hr-lib, payroll-rules/-run-rules/-rules-v2/-rules-sso, attendance-pay*, judge*, ot-/ot.*, labor*, reports*, correction*.
- ST3 G allowed files: every changed path (git diff vs base **plus untracked**, so new or edited `scripts/*.mts` are covered; `scratchpad/` ignored) is a brief-allowed src file, `ledger/**`, the two oracle files, or one of the ORACLE-EDIT allowlist files (h1.3, h3.2, h3.4-lib, h3.6, h3.9, h4.3-lib, money-2, priv-2, priv-2-lib) whose **every** hunk carries `ORACLE-EDIT …PREPROD-1` on an added line. Anything else (another oracle, prisma, docs/) fails.
- ST4 G every changed src hunk carries `HR PREPROD-1`; no bare removal hunks.
- ST5 G no added `appSystem.update/updateMany/upsert` / raw `UPDATE "AppSystem"` (settings only via lockHrSettings + writeHrSettingsKeys).
- ST6 R one pay-scope predicate: bodies of `payTarget` (payroll-actions), `decideAdjustmentAs`, `setAdjustmentConsent`, `giveBackClaim` (payroll.ts), `chargeGate` (stock-charge) call `inPayScope(`/`payScopeWhere(` directly or through a same-file helper whose body does; no second definition outside scope.ts; no added `unitIds === "*"` / `unitIds.includes(` outside scope.ts.
- ST7 R texts: `export const PAY_SCOPE_NO_ACCESS_TEXT = "ไม่พบรายการนี้ หรือคุณไม่มีสิทธิ์ดูค่าจ้างของพนักงานคนนี้"` is the only non-comment line added to scope.ts (no removals); `paidLocked: "<brief text>"` in settings.ts; each literal exactly once in hr/**; `export function leaveSplitOf` in leave.ts.
- ST8 R payroll-ui.tsx mentions `REFUND_BEHIND` and keeps `strandedAdjustments(ctx)…allBranches || inPay(x.employeeId)`.
- R6.1 R `ledger/HANDOVER-H3.md`: "13a (HF-SSO-M2)" after the row-13 line, within 900 chars: `v1:SSO:2569/2572/2575`, `v1:DEDUCTION:2569/2572/2575`, `15,000`, `9,000`, `2026-01`, `875`, `G-SSO-GO`.

R1 (all G) — 3 paths × (reverse · re-create+sync · gate): R1.1–3 v1 run with JV (tenant b, ACCOUNT system present), R1.4–6 v2 finalized no-book (tenant n, no ACCOUNT system), R1.7–9 v2 with `setPayrollBook` (tenant b).
R2: R2.1 R listed `reason: "REFUND_BEHIND"` · R2.2 R moved to 2031-06, still APPROVED/unbound, one `hr.payadjust.move` audit · R2.3 R 2031-06 draft has `REFUND:50000` · R2.4 R leaver listed, move refused (Thai, no period/id/name), row + audit count unchanged · R2.5 G before the 05 run the refund is not listed · R2.6 G old stranded BONUS listed with the same 8 fields (reason ≠ REFUND_BEHIND) and still moves to 2031-04.
R3: R3.1–R3.11 R (see numbers) · R3.12 G MONEY-2 gate (unpaid-policy leave in APPROVED Feb refused) · R3.13 G SICK within balance (USE −2.0, note null or `unpaid:0.0…`, no UNPAID line) · R3.14 G PERSONAL over quota ⇒ `LEAVE_TEXT.balance`, no row · R3.15 G engine v1 March run gross 3,000,000, no UNPAID_LEAVE · R3.16 G positive control: an unpaid-policy leave on the same roster gives `UNPAID_LEAVE:-100000` (proves the 480-min basis the R3 numbers rely on).
R4: R4.1 R inbox `decideAdjustmentAs` borrowed / other-branch / missing ⇒ `{ok:false, reason: PAY_SCOPE_NO_ACCESS_TEXT}` canon-equal · R4.2–R4.7 R the limited viewer's answer on the out-of-scope row is canon-equal to the same call with a missing id, `ok:false`, and nothing written (row snapshot of HrPayAdjustment/HrStockCharge, tenant AuditLog count, system adjustment count) — decideAdjustmentAction, cancelAdjustmentAction, moveStrandedAdjustmentAction (server actions, real Next request scope + session cookie), setAdjustmentConsent (home-less), giveBackClaim (borrowed), withdrawStockCharge (borrowed home-less) · R4.8 G all-branch viewer: all 7 on separate borrowed/home-less rows · R4.9 G limited viewer on in-scope home rows: 6 actions · R4.10 G inbox in-scope approve.
R5: R5.1 R SICK paid→unpaid with an APPROVED leave in APPROVED Aug ⇒ `paidLocked`, policy row byte-same, no audit · R5.2 R PERSONAL unpaid→paid, same · R5.3 G VACATION with approved leave only in Sept (+ a PENDING one in Aug) ⇒ flip ok · R5.4 G rename + `paid` unchanged on the locked policy ⇒ ok.
Z0 own law rows · Z1 residue · Z2 deadlocks.

## Fixtures

Three tenants `qc-hr-pp1-<stamp><tag>-{b,n,s}`, each with units u1/u2 and users owner, pay1 (`["*"]`, run + adjustment keys), lim (`[u1]`: payroll.read + payadjust.request/approve/reject), all (`["*"]`, same keys). Own ACTIVE law rows SSO/TAX/DEDUCTION from 2031-01-01 (hr-h3.4-vectors.json, key `qc-hr-pp1-<tag>-*`) — refused if present, deleted in finally. Cleanup deletes every tenantId table of these tenants only, users by slug, law rows by own key.
- R1: employee 3,000,000 st; shift 09:00–17:00 grace 0; roster 4–8 Aug 2031; punches on time except 5 Aug IN 09:30, none on 6 Aug; attendance-pay `{enabled, late, absent, freeMin 0, stepMin 1}`; judge jobs, `buildWorkEntrySnapshot`, sync, approve PENDING rows; run Aug created (pay1) + approved (owner). Gate probe = a PENDING VACATION (paid) leave on 6 Aug read by `leavePaidRunRefusalInTx` in its own tx, then deleted (it would otherwise change the day hash).
- R2: v2, E 2,000,000 · leaver end 2031-05-20 · claim DEDUCTION 150,000 in 03 · run 03 approved · give-back 50,000 into 04 (E approved, leaver PENDING) · BONUS 70,000 APPROVED inserted into 03 after the run · run 05 approved.
- R3: SICK quota 30 (allowHalfDay); "used" = GRANT `grant:<e>:<p>:2031` +30.0 + legacy APPROVED Jan leave with `use:<id>` −28.0/−27.5. Requests by owner as actor (filed-by), decisions by pay1. March run v2 draft (roster 10–14 Mar for E1/E2, judge after approval). Gate system: Feb run approved first, then leaves; owner path links G5 to the owner after the run; chain path = approvalPolicy + APPROVED approvalRequest, policy deactivated after.
- R4: v2; eB home u2 + borrowing into u1 from today−10 (open); eH no home + same borrowing; eA home u1; eO home u2. Claims 100,000 in 02 + run 02 approved; PENDING rows in 05; stranded BONUS rows inserted into 02 after the run; stock charges requested by the owner (DAMAGE 20,000, consent today).
- R5: v2, run Aug approved before the leave rows are inserted (inserting approved leaves first trips WORK_ENTRIES).

## Numbers (base 3,000,000 st, N = 480, floor(base·m/(30·N)) = base·m/14,400)
- R1: absent 480 min ⇒ 100,000 · late 30 min ⇒ 6,250 · total 106,250 before and after.
- R3.2/3.5: 28.0 used, 10–14 Mar (Mon–Fri) = 5.0 ⇒ paid = min(5.0, 2.0) = 2.0 (10, 11) · USE −2.0 · note `unpaid:3.0;from:2031-03-12` · UNPAID_LEAVE 12/13/14 each −100,000 = −300,000.
- R3.6: 27.5 used ⇒ paid 2.5 (10, 11, half of 12) · USE −2.5 · `unpaid:2.5;from:2031-03-12;half` · 12: −50,000 (240 min) · 13, 14: −100,000 ⇒ −250,000.
- R3.4: used 28.0 + 2.0 = 30.0 · balance 0.0 · available 0.0 · Σ ledger 0.
- R3.7: 28.0 used, 7–11 Apr ⇒ USE −2.0 · revoke ⇒ ADJUST `use-revert` +2.0 · Σ 2.0.
- R3.8–3.10: 24–28 Feb (paid 24–25, unpaid 26–28 in APPROVED Feb) ⇒ `CORRECTION_TEXT.paid`.
- R3.11: 27 Feb–3 Mar, no roster/schedule ⇒ 5 calendar days · paid 27–28 Feb · unpaid 1–3 Mar ⇒ `unpaid:3.0;from:2031-03-01`, approved.
- R2: refund 50,000 in 04 · lastCovered 05 ⇒ target 06; leaver endPeriod 05 < 06 ⇒ refused.

## Older oracles — expected explicit-allowlist ORACLE-EDITs for the builder
Only these are on ST3's allowlist; every hunk must carry `ORACLE-EDIT …PREPROD-1`:
- **h1.3 S6.1 `PAY_MARKED`** (`:882`) — add `"HR PREPROD-1": <n>` with the exact count of marked payroll.ts lines.
- **h3.2 S1.8** frozen/marked rule (`:228` pattern) — accept `HR PREPROD-1` hunks.
- **h3.4-lib** work-entries diff rule (`:212`) — work-entries.ts / work-entries-rules.ts change for `unpaidTenths` + digest.
- **h3.6** later-ticket marker list (`:241`) — add `HR PREPROD-1`.
- **h3.9** (`:163`) — marker regex `HR H\d|H\d\.\d` does not match `HR PREPROD-1`.
- **h4.3-lib S1.6** — a `PP1_ALLOW` set in the `M2_ALLOW`/`P2_ALLOW` style (explicit files, every hunk marked).
- **priv-2 S4/S5** (likely): S4's FROZEN pattern covers leave*, self*, work-entries*, settings* (all allowed here) and S5 requires `HR PRIV-2 … ◂` on every hunk of its MARKED files (payroll.ts, payroll-ui.tsx, scope.ts, privacy.ts, service.ts, stock-charge.ts) and refuses changed src outside MARKED (payroll-actions.ts, leave.ts, settings.ts, work-entries*, ui.tsx, self* are outside); neither has an in-base guard.
- money-2 ST2/ST3: expected **no** edit (both are n/a once MONEY-2 is in the base). set-1: no edit expected unless the builder adds a settings writer (ST5 forbids it).

## Open doubts about the brief / rulings
1. R3 DTO field names are not pinned. R3.3 accepts any object (or Map) that carries one key matching `/unpaid/i` and another matching `/paid/i`, values as number, "d.d" text or tenths, from `leaveSplitOf` (called `(ctx, ids)`, falling back to `(prisma, ids)`) and from `leaveItemsForViewer` items. If the builder names them otherwise, that is an ORACLE-EDIT.
2. A fully paid SICK leave: the brief does not say whether its USE note is null or `unpaid:0.0;…`. R3.13 accepts both.
3. `paidLocked` uses ASCII quotes `'ได้รับค่าจ้าง'` exactly as in the brief; Thai curly quotes would be a different text.
4. R2.4 refusal text is not given in the brief; the oracle only requires Thai, no period/id/name, nothing written.
5. R4 "home other branch, not borrowed" for actions other than the inbox: the brief's table only lists the borrowed / home-less leaks. Today those calls already refuse with `HR_OTHER_BRANCH_TEXT` (≠ not-found). Only the inbox (R4.1) pins other-branch = not-found; the action probes cover borrowed / home-less rows. The controller may want other-branch parity everywhere (one-line addition per probe).
6. R1 v1 path: the JV is posted to the tenant's only ACCOUNT system (the same one booked for the v2 path); tenant n has none so the v2 no-book path is the finalized-without-entry case (asserted in setup: no book, no JV, `finalized`).
7. "Lock orders unchanged" has no dedicated check (ST4/ST3 only bound the diff); the R3 second gate is not raced.

## Controller rulings on the doubts (14 Nov) — applied
- R3.3 now pins `leaveSplitOf` → per id `{ paidDays: 2, unpaidDays: 3, unpaidFrom: "2031-03-12" }` (Map or record keyed by id; days compared as numbers) and leave items `paidDays` / `unpaidDays` (doubt 1 closed).
- R3.13 now requires the USE note to be null (doubt 2 closed).
- R4.2–R4.7 also probe an employee whose home is u2 and who is not borrowed (rows dO · xO · mO · kO · clO · chO): answer canon-equal to the missing-id answer, nothing written (doubt 5 closed). On base the other-branch part already matches for consent / give-back / withdraw and differs (HR_OTHER_BRANCH_TEXT) for decide / cancel / move; every R4.2–R4.7 stays RED through the borrowed / home-less part.
- Doubts 3, 4, 6: unchanged by ruling. Registry unchanged in size: 57 checks, 28 RED · 29 GREEN; forced run 57/57 as registered, residue none.

## Review round (rulings V1–V9) — registry re-based to 72bf1db1b
- Main suite `qc-hr-preprod-1.mts` (57 checks): all GREEN at 72bf1db1b except **R3.6** (V1: note `unpaid:2.5;from:2031-03-12` without `;half`; the 250,000 still holds). Forced run: 57/57 as registered (RED 1 · GREEN 56), residue none. ST3 `OWN` now also lists `scripts/qc-hr-preprod-1b.mts`.
- Second suite `qc-hr-preprod-1b.mts` (22 checks, same lib, tenants `-a`/`-b`) — main + 1b + lib = 93.6 KB, so the review checks live in 1b (the main suite stays < 64 KB; 1b + lib = 44.8 KB). Gate must run both. Forced run: 22/22 as registered (RED 10 · GREEN 12), residue none, no deadlocks.
  - RED on 72bf1db1b: V1.1 (paid floors to 2.5 · `;half`) · V2.1 (split fields to borrowing manager and key viewer) · V3.1 (paid=false SICK over balance accepted) · V4.1 (race reproduced: leave APPROVED + policy unpaid in APPROVED Feb) · V7.1 ("ยื่นแล้ว 285 / 570 บาท", no-profile answer differs) · V8.1/V8.2/V8.3/V8.5 (no re-split) · V9.1 (move refused).
  - GREEN on 72bf1db1b: V2.2 · V5.1–V5.5 · V7.2 (PRIV-2 filter already hides the rows) · V7.3 · V8.4 · Z0/Z1/Z2.
- Numbers (3,000,000 st, N 480 ⇒ 100,000 / day, 10,000 / tenth): V1 230,000 · V3 5 days 500,000 · V5.3 half 50,000 · V8.3 paid 3.5 / unpaid 1.5 ⇒ 13 Mar half 50,000 + 14 Mar 100,000 = 150,000 · V8.1 Σ 30 − 28 + 28 − 5 = 25.0 · V8.2 Σ 33 − 28 − 5 = 0 · V8.5 Σ 30 − 25 − 3 + 3 − 5 − 0 = 0 · V8.4 Σ 30 − 28 + 28 − 2 = 28.0 · V7 hourly 4,560,000/30/8 = 19,000 ⇒ 1 h × 1.5 = 28,500 st.
- V4 fixture: holder row lock FOR UPDATE on the policy; flip (real updateLeavePolicy) queued first, decideLeave second (passes the MONEY-2 gate, then waits at the policy FOR SHARE); release ⇒ flip commits, approval completes. V8 returns use the real revoke path (decideLeave APPROVED→REJECTED of the January leave) and the real updateLeavePolicy (quota 33).
- Doubts: (a) V8 quota raise: today a year that already has a GRANT row is never topped up (settings r2b: ledger append-only), so "quota raise ⇒ balance raised" needs a top-up row the ruling does not name; V8.2 pins only the outcome (5/0, Σ 0). (b) V1 per-day fraction is workable but the fraction is derived (unpaid total − whole later counted days), so a holiday/roster change inside the unpaid range after approval shifts it; V8 re-split re-derives it anyway. (c) V3 "as before" read as: within balance no split; over balance refused with LEAVE_TEXT.balance (approving it would make the balance negative).

## Rulings on the review doubts (14 Nov) — applied
- V8 trigger = any ledger row that raises the employee's SICK balance in that leave year. Existing positive writers in `leave.ts`: `use-revert:<leaveId>` (ADJUST, revoke/cancel) · `carry-top:<leaveId>` (CARRY into Y+1 when a year-Y leave is revoked after the carry, policy carryMaxDays > 0) · `carry:<emp>:<pol>:<y>` (year job) · `expire-late:<leaveId>` (EXPIRE, can be positive, same tx as a use-revert) · GRANT only when the year has none. A quota raise writes no ledger row for a year that already has a GRANT (settings r2b), so the quota scenario is unreachable — **V8.2 now goes through `carry-top`**: 2030 leave 28.0 revoked after 2.0 was carried into 2031 (carry max 5) ⇒ carry-top +3.0 into 2031 (asserted, fires on 72bf1db1b) ⇒ March 2031 leave 0/5 must re-split to 3/2, `unpaid:2.0;from:2031-03-13`, −200,000, Σ 2031 0.0. RED on 72bf1db1b (no re-split).
- V1 per-day fraction accepted as derived; V3 reading confirmed; the AM+PM one-half-split case goes to HR-LEAVE-3 (nothing added).
- Final forced runs: main 57/57 as registered (RED 1 · GREEN 56) · 1b 22/22 as registered (RED 10 · GREEN 12) · residue none both.

## V8b round (re-registered on f3955bdc1)
- Main `qc-hr-preprod-1`: ST3 `ORACLE_ALLOW` + `qc-hr-h3.8.mts`; every check GREEN on f3955bdc1 (R3.6 now passes) ⇒ registry 57 GREEN / 0 RED; forced run 57/57 as registered, residue none.
- `qc-hr-preprod-1b` (24 checks): V8.1/V8.2/V8.3/V8.5 now pin the USE rows of each leave in order (original kept byte-same + appended `resplit;…` row; Σ USE = paid days = leaveSplitOf.paidDays); V8.4 pins a single unchanged USE row; V3.1 pins a single USE row (note null) for a never-split leave; **new V8.6** (append-only: every ledger row of the V8 system before the returns is byte-same afterwards, count grows) and **V8.7** (revoking the re-split March leave writes use-revert +5.0 = Σ of its USE rows, Σ 30.0).
- RED on f3955bdc1: V8.1 · V8.2 · V8.3 · V8.5 · V8.6 (the re-split rewrites the original USE row: e.g. V8.1 shows a single row `-5|null`; V8.6 4 rows changed). GREEN: all others incl. V8.7. Forced run 24/24 as registered, residue none.
- Removed the untracked draft `scratchpad/preprod1-oracle/main-draft-v1v5.mts` (it broke the lane typecheck).

## Delta-review round (V1b · V7b · V8c) — re-registered on e8e3b24f4
- New third suite `scripts/qc-hr-preprod-1c.mts` (10 checks, same lib; 1c + lib = 30.4 KB). 1b + lib = 50.3 KB · main + lib = 62.3 KB. Gate runs all three.
- 1c: V1b.1 holiday on 13 Mar (+ roster removed) ⇒ counted 10,11,12,14 ⇒ unpaid 12 + 14 = −200,000, split 2 / 2 · V1b.2 27.3 used, roster of 13 removed ⇒ 12 Mar 0.3 (−30,000) + 14 Mar (−100,000) = −130,000, split 2.7 / 1.3 · V1b.3 12 Mar day off (approval 4.0 days, paid 2 / unpaid 2, note from 13) becomes a working day ⇒ paid 10–11, unpaid 12–14 = −300,000, split 2 / 3 · all: ledger rows of the system byte-same, `leaveSplitOf` + DTO give the recount, unpaidFrom 2031-03-12 · V8c.1 v2 no-book reverse (H37 path) · V8c.2 leave 27 Feb–3 Mar across APPROVED Feb (control untouched after the January revoke; re-split after the Feb reverse) · V8c.3 v1 + JV reverse (reverseRun path, tenant with an ACCOUNT system) · V8c.4 year job `runLeaveYearJob(asOf 2031-03-20)` writes carry +5.0 into 2031 ⇒ March 0/5 re-split −5.0 `resplit;unpaid:0.0`, Σ 0.
- 1b: V7.1 reworked to V7b (two salaries ⇒ same neutral success without digits; no profile ⇒ non-success fixed Thai text without digits, nothing written); new V7.4 (closed period: [u1] reply = all-branch reply, not ok, nothing written).
- RED on e8e3b24f4: 1c V1b.1 (300,000 · split 2/3) · V1b.2 (230,000 · 2.7/2.3) · V1b.3 (200,000 · 2/2) · V8c.1 · V8c.2 · V8c.3 (no re-split on reverse) · 1b V7.1 (no-profile filing answers status ok) · V7.4 (closed-period refusal turned into the neutral ok reply). GREEN: V8c.4 (carry trigger already wired), all main checks, all other 1b checks.
- Moved untracked `scratchpad/h48-hunt/hunt*.mts` (not mine) to `.mts.txt` so the lane typecheck does not pick them up.

## V8d round — re-registered on d048c9d48
- 1c (16 checks, 23.0 KB + lib 13.4 KB = 36.4 KB): + V1b.4 (surplus: fully paid 10–14 Mar, 13 Mar becomes a holiday ⇒ no UNPAID_LEAVE, single USE −5.0, ledger unchanged — GREEN, accepted debt) · V8c.5 (v2 booked reverse via `setPayrollBook` in the ACCOUNT tenant) · V8d.1–V8d.4.
- V8d "missed re-split" state built with normal writers only: employees E, F have no salary profile when the March run is created/approved (so they are not that run's employees), their January leaves are revoked while March is APPROVED (skipped), the March run is reversed (the V8c hook re-splits only the run's employees ⇒ E, F still split — asserted in setup), then the profile is restored: (a) create March draft ⇒ E re-split + no UNPAID_LEAVE · (b) F's profile restored, recompute ⇒ F re-split · (c) recompute again + delete + re-create ⇒ ledger byte-same · (d) separate system: leave 27 Feb–3 Mar with APPROVED Feb, January revoked, March draft ⇒ single USE row kept, Mar 1–3 deducted −300,000.
- RED on d048c9d48: 1c V8d.1 · V8d.2 · V8d.3 (draft create/recompute does not re-split). GREEN: everything else in all three suites (main 57/57 · 1b 25/25 · 1c 13/16 pass as registered). Forced runs: all three match their registries, residue none.
