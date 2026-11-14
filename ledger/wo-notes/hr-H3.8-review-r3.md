# H3.8 delta review r3 — e101d1820 → 8c807aa6e (wip/hr-h3.8) · read-only · 14 Nov 2026

Scope: fix round 2 / 2b (9a8bc45a1, beafe0e6c, 8c807aa6e) + the session/hr merges ad7279eaa and 7f2f4b094. No code was run. File:line references are to the 8c807aa6e tree.

## Merge integrity: OK
- Files that differ from session/hr 93a0b76ee but that H3.8 did not touch (mb b357957e7..e101d1820): only qc-hr-h3.7.mts and qc-hr-set-1.mts (the ruled ORACLE-EDITs) plus the ledger notes. Nothing of H3.7 or HR-SET-1 is reverted.
- messages th/en common.json: a 3-way key+value check (mb / session/hr / e101 / head) found 0 dropped keys and 0 wrong values. The only new keys are hr.slip.rowProblem, hr.salaryCert.stFULFILLED and hr.salaryCert.fulfilled. The -50 lines against session/hr are block moves, not deletions.
- hr-ui-inventory.json: head vs session/hr = +699/-0, the same as H3.8's own delta. prisma/: identical to e101d1820 (session/hr has no prisma change), and the H3.8 migration and schema are intact.

## Rulings
- B (download ∥ void): correct. payslip.ts:535-547 runs one tx that takes the certificate row FOR UPDATE, re-checks status, voided flag, sha and jsonb equality, then does a guarded updateMany (count 1) before the audit row. If it is voided: no bytes, no counter, no audit.
  Lock order: download and void each lock only that certificate row. Issue goes advisory lock → request cert rows → run FOR SHARE → seq. Reverse-run never touches HrSalaryCertificate. No cycle found.
- C (idempotent direct issue): mostly correct. The check sits after lockEmp and in the same tx as reserveSeq/create (payslip.ts:428-444). The key is exact: purpose is an enum (isSlipPurpose, payslip-rules.ts:231-233), so no whitespace/case/unicode bypass, and there is no addressee field. It is scoped to emp.id + ISSUED + voidedAt IS NULL + the cited run, so it cannot return another employee's certificate. See MINOR-2 for the void race.
- D (request fulfilled): presentation is done in listMySalaryCertificates, listSalaryCertificates (FULFILLED + filter), the gate and self UI, and inbox (REQUESTED only).
  No other reader exists: no AI tool, REST, report, export or H3.9 code reads HrSalaryCertificate (git grep).
  The certPdf hop (payslip.ts:524-528) keeps employeeId on the self path, and both entry points re-run certGate/resolveSelf. Cancel, approve and reject of a fulfilled row ⇒ NOT_DECIDABLE. A re-request ⇒ same certificate (dup), no second number. See MINOR-1 and MINOR-3.
- E (corrupt item): correct. The neutral row carries only runId/periodKey/payDate/href of an item that passed the same ISSUED filter and scope check as a healthy row, so it leaks nothing new. Totals and count leave it out.
- F (strip): applied to every free-text field that reaches the frozen JSON/PDF (employer name/address, employee name/position, signer). docNo, purpose, dates and periodKey are produced by the system. Thai combining marks, ZWNJ and ZWJ (U+200C/D) are kept. See NOTE-1.
- H (FOR SHARE APPROVED/PAID only, ORDER BY id): correct (payslip.ts:237-248), and the old year-wide lock is gone. See NOTE-2 on wait time.
- I, L, ORACLE-EDITs: correct and limited as ruled.
  - qc-hr-h3.9 S1.2: LCS hunks with no context; a removed-only hunk fails; only active once H3.9 is IN_BASE.
  - qc-hr-set-1 S1.6: before SET-1 is in the base nothing changes. After that, prisma/ may only add NEW migration folders (status A, folder absent from base); editing, deleting or renaming an existing migration fails. Schema hunks come from git diff -U0, and every hunk needs a marked added line.
  - qc-hr-h3.7 S1.4: an exact per-file allowlist (= fitness F2.2).
  - Nothing is permanently n/a. canViewPayroll is identical to the old inline test (rbac.ts:47).

## Findings
- MINOR-1 · payslip.ts:435-443 (+ display at :170 and :643). A direct issue closes an open request of a DIFFERENT purpose as "fulfilled".
  Scenario: e has a live VISA certificate for the current run. The employee requests BANK (open). HR does a direct issue of VISA. The dup branch closes the BANK request with fulfilledBy = the VISA certificate.
  Both lists then show "BANK · ออกให้แล้ว — เลขที่ HRSC-…" (r.purpose), but the downloaded PDF says VISA. Ruling D speaks of a request that *matches* a live certificate.
  Fix (cheap): in the dup branch, only fulfil when open.purpose === purpose (otherwise return dup and leave the request open), or render d.purpose. S7.3/S7.11 do not cover this.
- MINOR-2 · payslip.ts:428-434. The dup row is read without a lock, and void (payslip.ts:502-518) does not take lockEmp.
  Scenario: issue T1 finds live certificate D. The owner voids D and commits. T1 returns D's docNo as "issued", or closes an open request with fulfilledBy = D.
  That request then vanishes from the employee's list (targets with voidedAt are filtered at :643), and it does not show as cancelled either.
  Fix: `… FOR UPDATE` on the dup SELECT. Order would be adv → request rows → run share → dup cert; void and download lock a single cert row, so no cycle.
- MINOR-3 · payslip.ts:475. The fulfilled-path audit has targetId = the existing certificate and `after` has no requestId. The closed request row gets no audit event of its own, so a per-target trail of the request ends at "request" with no decision. Add `requestId: open.id` to `after`.
- MINOR-4 (oracle) · qc-hr-h3.8.mts:1096-1104. S7.6 only proves that DRAFT holds do not block. Nothing proves the remaining APPROVED/PAID FOR SHARE still waits for a reverse in flight (m6), so a regression to "no lock at all" would stay green.
  Add a positive control: hold an APPROVED run of e4 FOR UPDATE ⇒ pg_blocking_pids sees mySlips blocked.
- NOTE-1 · payslip.ts:81-88. The strip set misses U+061C ARABIC LETTER MARK, which is Bidi_Control in Unicode. Also consider U+FEFF and U+2060-2064 (invisible). Adding them leaves Thai, ZWNJ and ZWJ untouched.
- NOTE-2 · H wait time: the payslip tx is maxWait 15 s / timeout 30 s with no `SET LOCAL lock_timeout`. Reverse-run holds the run FOR UPDATE for up to 120 s (REVERSE_TX_OPTS).
  The employee page fails after about 30 s, and the blocked statement can keep the pool connection until the reverse ends. Suggest `SET LOCAL lock_timeout='10s'` in issuedRows' tx (this is the existing m6 pattern, not new).
- NOTE-3 · payslip.ts:327-332. The CANCELLED filter does take:200 *before* dropping fulfilled rows, so many fulfilled rows can crowd out real cancellations. The default list merges 200 base + 200 fulfilled rows (up to 400, unbounded by the UI).
- NOTE-4 · S7.3 uses permissive ORs (closed/approve). myView/oneVisa still pin the intended path, so this is acceptable. S7.1, S7.2 and S7.6 detect blocking with pg_blocking_pids; the 100 ms sleep is only the poll interval, never the verdict.
- NOTE-5 · Ruling C returns the old frozen certificate even if the employee's name or position or the employer profile changed since then (same run + purpose). This is as ruled; HR must void first to re-issue.

## Verdict: MERGE WITH NOTES
No BLOCKER or MAJOR. MINOR-1 and MINOR-2 are a few lines each and worth folding in before or right after the merge. MINOR-4 is an oracle gap.
