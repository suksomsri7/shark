# H3.7 — independent review of the delta after df8222e3d (fix round 3 + merge rounds)
Reviewer: read-only · head fec04273b (wip/hr-h3.7) · scope: `git diff df8222e3d cd6af9ce4 -- src`, qc-hr-h3.7 S1.12/S4.34/S4.35,
merge commits 6e7848d60 / 21a34f7f2 / fec04273b. Rulings in "# Fix round 3" and "# Final merge round" taken as decided.

## What was checked and holds
- **Period window (payroll.ts:3599-3620, 3664-3670).** The check runs inside the giveBack `$transaction`, after the per-claim advisory lock,
  the period lock P(p) and `FOR UPDATE` on the claim. Refused when p <= deduction-run period, p <= latest APPROVED/PAID/finalized
  (non-REVERSED) run that holds an item for the employee, or p > end-date period. `YYYY-MM` string comparison is safe once PERIOD_RE has
  passed. `nextPeriodOf` handles Dec->Jan correctly. The end-date period itself is allowed (`>` rather than `>=`), which is right for a
  partial last month. No off-by-one found.
- **BKK end date.** `HrEmployee.endDate` is `@db.Date` (UTC midnight). `h37BkkDay` = `bkkParts(d).dateStr` adds +7h, so the calendar day
  stays the same. A value stored as a BKK-midnight timestamp would also map to the right day. Correct.
- **Offer vs check consistency.** `giveBackPeriodOf` starts at max(lastCovered, claim run)+1, skips live periods and returns null after the
  end period. Every value it offers passes the transactional check, unless a race happens in between. The function is display-only:
  payroll.ts has no "use server", so it cannot be called from the client.
- **Permission gate (3626-3638).** Role, unitAccess and permissions come from the DB `membership` row of `viewer.userId`. Nothing comes from
  a passed viewer object. The branch rule is `employeeUnitsOf` -> `unitTargetOf(hrScopeOf(DB m), emp, new Date())`, the same day argument
  the adjustment-request paths use (payroll-actions.ts:293/342/381/453 pass `new Date()`). A missing employee gives NO. That is stricter
  than payTarget, which returns `{}`, and is fine. The `evaluate` unitId comes from the target.
- **Refusal texts.** All are fixed `GIVE_BACK_TEXT.*` constants with no interpolated data. The new `period` text carries no figures.
- **PAID ⇔ exactly one pay entry.** markPaidV2 is unchanged in this delta (payroll.ts:2927-2945). It forwards to markPaidRun up front when
  the book is set, and again from inside the tx after re-reading `accountSystemId` under P and the row lock. The PAID update is guarded by
  `status: "APPROVED"`, `count !== 1` gives NO, and the non-booked PAID path requires `runFinalizedInTx` with no book. I found no path to
  PAID without a pay entry when a book is set.
- **S1.12 `v2BookReread`** really checks the order (raw re-read index < `updateMany` index, with `return "BOOKED"` between them). The first
  pre-tx read uses Prisma rather than the raw string, so the static locks onto the in-tx re-read. Not weakened.
- **S4.34** is now deterministic. Approve is blocked under P, then held at `__inFinal`, while pay is observed waiting. After release it
  asserts pay ok, PAID, pe=1, and pay entry createdAt > accrual createdAt. The pay ∥ pay part (`payOnce`, `blocked2`) is kept. Stronger
  than r2. (`__inFinal` is a pre-existing service-only hook; the action layer does not pass it.)
- **Merges.** `git diff-tree --cc` lists the files that differ from both parents. 6e7848d60: hr-ui-inventory.json, qc-hr-h3.7.mts, th/en
  common.json. fec04273b: qc-hr-h3.9.mts only.
  - th/en JSON: a 3-way key-level check (base d295e6d09) found 0 lost keys, 0 conflicting keys, 0 extra keys.
  - inventory: rows 485 = 462 + 468 − 445, with 0 rows lost from either side, 0 resurrected and 0 invented. `$fields`, `$foreign` and
    `$debt` are equal to both sides.
  - qc-hr-h3.7 resolution is additive only (base-aware BASE plus the in-base guard).
  - qc-hr-h3.9 S1.10 takes the controller's b357957e7 form, which is equivalent to the dropped local one.
  - No src code was dropped from either side.
- **Frozen-file relaxations in practice.** Every H3.7 hunk vs b357957e7 in the H3.6 and H3.9 frozen lists carries its own "H3.7" mark
  (scripted `-U0` scan: none passed only through a generic or inherited mark). The relaxations do not hide anything today.

## Findings

**MINOR-1 — S4.35 does not test the "≤ latest covered run" branch on its own** — scripts/qc-hr-h3.7.mts:1144 (code payroll.ts:3670)
In fixture hG1 the only run is the deduction run (2031-09), so lastCovered == dedP. `covered` (2031-09) and `past` (2031-08) are both
refused by `p <= dedP`, and `offered` (2031-10) is dedP+1 either way. If `(win.lastCovered && p <= win.lastCovered)` were deleted, or
`giveBackPeriodOf` ignored lastCovered, the suite would stay 68/68. Failing scenario that goes undetected: claim deducted in 2031-09,
employee also covered by an APPROVED 2031-11 run, no run in 2031-10. A refund for 2031-10 must be refused (ruling 3) and must not be
offered; nothing asserts either. The notes say "covered 2031-09 refused" as if this were a separate case. Suggest adding a covered later run
and asserting refusal of the gap period plus the offer = period after the later run.

**MINOR-2 — `branchUnitless` has no positive control** — scripts/qc-hr-h3.7.mts:1150-1153
The test only asserts that a STAFF user limited to one branch is refused (code NO) on a unit-less employee. No assertion shows the same
user, or one with the same keys, accepted for an employee of their own branch. If `evaluate(hr.payadjust.request)` or `canViewPayroll`
refused brl for an unrelated reason (permission key spelling, STAFF evaluate rules), the check would pass without the unit-less rule being
exercised. No RED was recorded for it either (the notes' RED covers F1 only). The code itself is right
(`unitTargetOf` returns `ok:false`/HR_UNASSIGNED for a branch-limited scope and a unit-less employee).

**NOTE-1 — the covered-run check is not serialised against approve of other periods (accepted by design)** — payroll.ts:3647, 3668
giveBack locks only P(p). Approving a run at q≠p takes P(q), so a concurrent approve of a run covering the employee at q > p can commit
after the window read, leaving the refund at p < lastCovered. This is no money loss: the row is PENDING/unbound and is paid only by a run
created for p. The end state is also identical to the legitimate sequence "give back at p, then create and approve q". Runs may be
created for any period, and ruling 3 counts only APPROVED/PAID/finalized runs. One side effect: such a refund sits in a run-less period,
so `strandedAdjustments` (live-run periods only) does not list it. Closing this would need a per-employee lock taken by both approve and
giveBack. Not required by the ruling, so no fix requested.

**NOTE-2 — the "later ticket" mark regexes accept any ticket mark, including inherited ones** — qc-hr-h3.6.mts:239,
qc-hr-h3.9.mts:311
`/HR H\d+\.\d+|ORACLE-EDIT[^\n]*H\d+\.\d+/` on added lines does not require the mark to belong to a later ticket. A future unmarked
edit to a line that already ends in an inline mark (e.g. payroll.ts:17 `… // HR H2.11 ▸ …`) re-adds that line with the old mark and passes
S1.6/S1.5. Hunks that only delete lines still fail (`added` is empty), and the rule only applies once the frozen ticket is in the base, so
it is a narrow hole that nothing exploits today (see above). It matches the controller's stated rule; tightening it to
`H(?!3\.6\b)` / the ticket list is optional.

**NOTE-3 — base-aware statics depend on the local `session/hr` ref** — qc-hr-h3.7.mts:122-131
Once `payroll-journal-rules.ts` is in merge-base(HEAD, session/hr), S1.1, the S1.2 hunk parts, S1.3 and S1.6 become n/a permanently.
That is intended after the merge. A local `session/hr` that already holds a premature or partial H3.7 merge would silence them before
review. The `commitInBase(BASE0, LOCAL_MB)` guard prevents an unrelated base, not that case. Run the final pre-merge statics with
`QC_H37_BASE=<session/hr tip before merge>` or check the "n/a — H3.7 in base" detail is absent.

**NOTE-4 — `reversedRun` asserts only `ok === false`** — qc-hr-h3.7.mts:1159
Now that the PERIOD check exists, a regression that admits reversed-run claims could still be refused for PERIOD, so the check would pass
for the wrong reason. Today the claim is unbound, so the refusal is NO before the window. Assert `code === "NO"`.

**NOTE-5 — payroll-ui.tsx:130 costs N+1 queries**
Up to 30 calls to `giveBackPeriodOf`. Each does about 5 queries, including `findMany` of every run of the system. Render cost only; it
could share one runs list. No correctness impact.

## Verdict
No BLOCKER or MAJOR. The money logic of the give-back window, the DB-membership gate, the fixed refusal texts and the PAID/pay-entry
invariant hold. The merges dropped nothing. The oracle edits relax frozen statics only for marked hunks of later tickets, with the
regex-breadth caveat in NOTE-2. The two MINORs are oracle coverage gaps, not code defects.

MERGE WITH NOTES
