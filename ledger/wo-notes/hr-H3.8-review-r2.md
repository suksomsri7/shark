# H3.8 delta review r2 — 29cc93d9b → e101d1820 (merge 0679d70d8 · fix df729ccff · ORACLE-EDITs e101d1820)

Reviewer: independent, read-only. Scope: H3.8-owned hunks only (H3.6/H3.9 code identical to session/hr b357957e7 ignored).
Evidence: code read + git diffs; no suites run by me. The builder's scratch logs (/tmp/claude-0/.../scratchpad/h38/suites/summary.txt, 20:46–20:48)
show h3.8 65/65 ×3, h3.6 62/62, h3.9 60/60, typecheck exit 0 (tc3.txt 21:17). The committed green log still shows only the 59-check round.

## Findings from review r1: verification
- M1 (gate slip page) — FIXED. `slip/[employeeId]/page.tsx:26-41`: payroll viewers (same predicate as rbac `canViewPayroll`) go only through
  `slipForViewer`, which re-reads the DB Membership (`memberOf`, role must match), uses the home branch only (`homeInScope`), loads run FOR SHARE, and calls
  `notFound()` on every refusal except SLIP_DATA. SLIP_DATA is returned only after gate and scope pass, so it reveals nothing. The hotfix loader is reached
  only by non-payroll viewers (own link + ISSUED check from the privacy.ts hunk). Bank line, code and history now come from the service.
- M2 (h3.6 S1.2/S1.6) — FIXED as ruled (see O1/O2 for remaining weakness).
- M3 (onlyH38) — removed. h3.4-lib S1.6 now uses the in-base rule. qc-hr-h3.8 S1.13 pins the sha of privacy.ts and self.ts (unguarded, so any later change must re-take the pin).
- m1 — FIXED. `payslip.ts:323,329` `payDate < start of tomorrow (BKK)`. S3.23 is a real test: the future-paid PAID run would otherwise be the latest source.
- m2 — FIXED. `notIssued` relaxes only gross/net (isInt) in `dtoOf` for non-ISSUED states. `issuedRows`, `latestIssued`, the PDF path (state check before
  dtoOf) and `slipCardFromHotfix` keep the strict rule. S2.9 still covers negative ⇒ SLIP_DATA for the default path.
- m3 — FIXED, with a race left open (MINOR-1). The slip download uses a throwing `auditLog.create` (same columns as writeAudit) before the bytes are
  returned. On the certificate path, the counter and the audit row are written in one tx. A failed audit throws, so the route returns 500 with no bytes.
  No oracle exercises the "audit fails ⇒ no file" path (NOTE-3).
- m4 — FIXED. `self.ts:522-523` puts the issued predicate in the query and keeps the JS guard. The keys are unchanged (h2.10 57/57).
- m5 — OK. The only "use client" importer of `./self` (`self-ui.tsx:28`) is `import type`. `payslip-ui.tsx` has no "use client". The cycles
  self.ts↔payslip.ts and self.ts↔payslip-ui.tsx use bindings only inside functions. react-pdf is loaded lazily (`payslip-pdf.tsx:12-26`), so the new edge
  `app/layout.tsx → self.ts` adds no eager PDF load. Nothing server-only reaches a client bundle.
- m6 — FIXED, but the lock is wider than needed (MINOR-2).
- Rulings: one slip list (ruling 4) OK (`SelfPay` children; rows keep `hr-self-slip-<runId>`). CERT summary (ruling 5) OK: name + purpose code, no amount
  (see NOTE-1). `sourceWithdrawn` OK: only for ISSUED rows, runId not exposed (S3.25 checks this), gate list only (inbox uses status REQUESTED ⇒ false).
- Routes: all 4 still answer 405 to HEAD/other methods before any read; rsc/prefetch get 204. They were not changed this round.

## Privacy matrix (delta surfaces)
- Gate page: the payroll decision comes from the passed flags, but the data comes only from `slipForViewer`, which re-checks DB Membership. A forged or stale
  payroll claim gets 404 and never falls back to the hotfix loader. A branch-limited payroll viewer gets an identical NO for a borrowed employee (e6) and for
  another branch's employee (e5). S3.22 includes a positive control (the hotfix loader alone opens e6).
- `GateSlipHistory` → `slipHistory` (DB gate + home scope). Inbox CERT is visible only when `certGateOf`, and the list comes from `listSalaryCertificates`
  (DB `certGate`). The viewer's own request is hidden. Self lists use `resolveSelf` only. I found no path where an employee or a branch-limited manager reads
  another person's slip or certificate, or learns that one exists.

## New findings
MINOR-1 `payslip.ts:451-465` (`certPdf`): a void can commit between the unlocked read and the tx, and the file is still served.
  The certificate is read without a lock, the PDF is rendered, and then the tx runs `updateMany({id})` without `voidedAt: null` / `status: "ISSUED"` and
  without a `count === 1` check. Scenario: the owner voids HRSC-2032-0004 while an employee or gate holder is downloading it. The void commits during
  `renderSalaryCertPdf`, then the tx increments `downloads`, writes an audit row, and returns the PDF of a certificate that is already void. Self downloads get the
  same (`liveOnly` is checked on the stale read). Fix: guard the updateMany with `voidedAt: null, status: "ISSUED"` and refuse VOIDED (gate) / NO (self)
  when count ≠ 1. Alternative: lock the row FOR SHARE in the tx before rendering.
MINOR-2 `payslip.ts:293` (`issuedRows`, m6): the FOR SHARE lock covers every run of the employee, including DRAFT runs, across all years.
  Readers of `/app/me/hr/pay`, the `[runId]` page (via `mySlipHistory`) and gate history now queue behind any draft-run writer that holds the run row
  FOR UPDATE: create/rebuild/delete-draft (H34_TX timeout 60 s) or H3.4 approve. The reader's tx has maxWait 15 s / timeout 30 s, so the employee's pay page
  can fail while payroll rebuilds a draft. The read also blocks those writers for its duration. I see no deadlock cycle, because no payroll writer holds two
  run rows. The only state change a reader must wait for is APPROVED/PAID → REVERSED. Fix: add `AND r."status" IN ('APPROVED','PAID')` (+ the year range when
  given) and `ORDER BY r."id"`.
MINOR-3 `scripts/qc-hr-h3.9.mts` S1.2 `frozenBlocks: IN_BASE ||` and S1.5 `diff = IN_BASE ? "unchanged"` / `dlrOk = IN_BASE ||`: these make H3.9's freeze
  permanently n/a, with no marker test, as soon as H3.9 is in the base (it already is on session/hr).
  The red that caused this was one marked H3.8 hunk in privacy.ts (suites-final1/h39.log S1.5). Ruling 1 named only h3.6 S1.2 and h3.4-lib S1.6; the h3.9
  edits are builder-initiated. They follow controller precedent (h3.9 S1.10, h3.4 S1.6 in-base guards), so this is not a hole in H3.8. However, an
  unmarked edit to any of H3.9's ~33 frozen files, or to the HrSalaryProfile/HrPayrollRun/HrPayrollItem blocks, no longer fails qc-hr-h3.9. Coverage is
  left to h0.1 S4.2 (schema sha), h3.6 S1.2 runSame, and the payroll-rules sha. Needs a controller ack, or a narrower edit (accept only hunks whose added
  lines carry `HR H\d+\.\d+`, as was done in h3.6 S1.6).
MINOR-4 `scripts/qc-hr-h3.6.mts:239-241` (S1.6 `|HR H\d+\.\d+`): unmarked hunks still fail, as intended, but the check looks only at added lines.
  A later hunk that deletes or rewrites frozen H3.6 code passes as long as one added line carries any `HR H<n>.<n>`, including `HR H3.6` itself. qc-hr-h3.8
  S1.7 has the right pattern (removes-other-ticket); h3.6 does not. Acceptable as ruled; record it as a known weakness.
NOTE-1 `inbox-shared.ts:142-147` + `inboxInlineDecide :151`: side effect of ruling 5. A summarisable CERT is now inline-decidable on the team overview
  (`overview-ui.tsx:78` compact). One tap issues a numbered, frozen certificate without seeing which salary it will cite. Batch issue was already possible
  (`inbox.ts:153` batchable ≠ ADJUSTMENT). Controller: keep, or exclude CERT from inline/batch the same way ADJUSTMENT is excluded?
NOTE-2 `slip/[employeeId]/page.tsx:26`: the code repeats the `canViewPayroll` predicate instead of calling it. It matches today (`rbac.ts:47-51`). If rbac
  ever widens payroll readers, those viewers would land on the hotfix loader with H1.1 borrowing scope and see every run state. Use `canViewPayroll(viewer)`.
NOTE-3 Untested claims: m3 "failed audit ⇒ no file/no counter", m4 "36 rows not shortened after filter", m5 (static only). S4.3 simulates the reversal with a
  raw UPDATE under FOR UPDATE, not the real reverse function (lock semantics are equivalent for this read).
NOTE-4 `ledger/wo-notes/hr-H3.8-green.txt` was not updated for the fix round. The only evidence of 65/65 and the h3.6/h3.9 re-runs is in the builder's
  session scratchpad (/tmp, will vanish). The controller should re-run or paste the logs.
NOTE-5 `app/me/hr/pay/page.tsx`: `myDocuments` is still loaded and passed to the client `SelfPay` even though its slip list is no longer rendered (own data
  only; extra query and payload).

## Merge 0679d70d8
- env/scope: both entries kept (`scope.ts:286-287`, `hr-qc-env.mts:94-95`).
- Messages th/en: no key from either parent was dropped or changed (29cc93d9b 1582 keys, b357957e7 1504, merge 1605).
- Inventory: merged by (page, testid). Every row from both parents is present and unchanged (476 + 468 → 499), with no duplicates and no top-level key lost.
- Fix round: inventory untouched; it stays consistent (`hr-self-slip-*` already belongs to H2.10).

## Locks: issue-certificate vs reverse-run
Issue order: hrsc advisory → request FOR UPDATE → runs FOR SHARE (APPROVED/PAID, payDate desc) → profile → reserveSeq(HR, WHT_CERT, HRSC:y).
Reverse/approve: period advisory → one run FOR UPDATE → items → account counters. I found no shared second resource and no deadlock path. EvalPlanQual
re-checks status after the wait, so a reversed run is excluded (S4.3).

## Verdict: MERGE WITH NOTES
No BLOCKER or MAJOR. MINOR-1 and MINOR-2 are small code fixes (a follow-up or a 10-line fix before merge, controller's choice). MINOR-3 needs a controller ack or
a narrower oracle edit. NOTE-1 needs a controller ruling.
