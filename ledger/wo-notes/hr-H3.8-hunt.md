# H3.8 bug hunt — privacy · money · race (13 Nov 2026)

Tree `/root/projects/shark-hr` · branch `wip/hr-h3.8` · head `e101d1820` · no src/prisma/oracle edits.
Probe script: `scratchpad/h38-hunt/hunt.mts` (one file, 5 probes, select with `P1`…`P5` args; run via
`bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h38-hunt/hunt.mts`).
One run, lane DB `ep-nameless-sea-aokjm6d2` (QC4 ✓). Fixture: 2 tenants (`qc-hr-h38hunt-*`), systems A/B (+ T2 system), units u1/u2,
11 users, 9 employees, 7 runs (v1 PAID, v2 APPROVED final, REVERSED, DRAFT, APPROVED unfinal, Dec run paid Jan, system B).
Cleanup: `RESIDUE none (tenants=2 users=11)` + own tables (HrSalaryCertificate, HrFilingProfile, AccountDocSequence, HrEmployeeUnit) = none.

## Probes

### P1 — privacy matrix (EXECUTED, service layer)
Viewers × 13 surfaces. Viewers: owner · pay (read+pay, all branches) · payBranch (read, u1) · payBranchPay (read+pay, u1, is also employee A10) ·
mgr (MANAGER u1, no key) · self (e4, u1) · selfU2 (e5, u2) · ended (former e7, membership still accepted) · other (OWNER of T2) ·
forged (mgr membership, passed role OWNER/*) · forgedPerm (mgr membership, passed read+pay/*).
Surfaces: slipForViewer e1/e5 · downloadPayslipPdf e1/e5 · slipHistory e1/e5 · listSalaryCertificates · listSalaryCertEmployees ·
downloadSalaryCertificate(cert of e1) · mySlip(r2) · mySlips · downloadMySalaryCertificate(cert of e1) · listInbox type CERT.
Result: every cell matches the brief (branch payroll key sees u1 only; borrow-free; cert surfaces only OWNER / read+pay+all;
self sees only own; forged claims ignored — DB membership wins). Every refusal = identical NO bytes.
Existence oracle: 4 pairs (forbidden id vs unknown id: gate slip, gate cert, self cert, self slip) — 0/4 differ.
HEAD on the 4 route helpers ⇒ 405,405,405,405.
Extra cell: former employee whose Membership row was DELETED ⇒ `mySlips` OK and `downloadMyPayslipPdf` OK (see I1).
Evidence: `P1 result: unexpected cells = none · existence pairs differing = 0/4 · HEAD = 405,405,405,405 · membership-deleted former employee: mySlips=OK pdf=OK`
Only READ (not executed): the 4 Next route files (requireTenant / rsc 204 order), the in-app pages (`/app/me/hr/pay/[runId]`, gate slip page),
`myDocuments` for non-self actors, inbox `decideInbox` by non-gate viewer (read: issue/reject re-check certGate ⇒ NO), timing side channels.

### P2 — run states + money (EXECUTED)
REVERSED / DRAFT / NOT_FINAL: self view NO · self PDF NO · gate PDF WITHDRAWN / NOT_ISSUED / NOT_FINAL · gate in-app state banner — correct.
`myDocuments` lists r2 only — correct. Certificate for an employee with only a future-paid (31 Jan 2032, now 10 Jan) + a REVERSED run ⇒ CERT_NO_SLIP — correct.
One corrupt ISSUED item (net ≠ gross − SSO − WHT, run 2031-08) for e4 ⇒ `mySlips` = SLIP_DATA (all years gone), gate `slipHistory` 2031 = SLIP_DATA,
while the healthy single slip (r2) still opens. Certificate issue then refuses SLIP_DATA (no fallback) — see F4.
Evidence: `P2 one corrupt ISSUED item (2031-08) for e4: mySlips=SLIP_DATA · mySlip(r2, healthy)=OK · gate history 2031=SLIP_DATA`

### P3 — races (EXECUTED)
a) void ∥ download: holder locks the certificate row FOR UPDATE; download is started, renders, blocks on its counter update (seen in pg_stat_activity);
   holder sets voidedAt and commits ⇒ download returns the PDF of a now-voided certificate, counter +1, audit +1. Same for the gate download. **F1.**
   Evidence: `P3a void ∥ self download: waited=true holder=ok result=OK bytes=14431 · row voided=true downloads=1 · audit +1` ·
   `P3a' void ∥ gate download: waited=true result=OK · voided=true downloads=1`
b) double-click direct issue (same employee, same purpose, parallel) ⇒ both succeed: HRSC-2032-0004 + -0005 (two live certificates). **F2.**
c) direct issue for e5 while e5's own request is REQUESTED ⇒ request stays open (1), approving it later issues a second certificate (0006 + 0007). **F3.**
d) cancel ∥ approve on the same request ×6 ⇒ never both, never neither; numbers 1–10 in system A contiguous, no duplicates — correct.

### P4 — injection (EXECUTED)
Employee name `U+202E evil U+2028 line U+2029 ก×300 U+200F`, position `U+202E tsop`, code `Z-9_9`.
Slip PDF 200, `filename="payslip-2031-03-Z-9_9.pdf"`; certificate 200, `filename="HRSC-2032-0011.pdf"` — no name in headers.
Stored certificate `contentJson.employee.name` keeps all 4 control/bidi chars (len 312); text extracted from both PDFs shows none (I2).
Traversal ids (`../<run>`, `..%2F<cert>`, systemId `../x`, `../../etc`) ⇒ 404 ×4.

### P5 — IDOR across systems / tenants (EXECUTED)
16 cells: owner of system A on system-B request (issue/reject), B certificate (void/download), B employee (issue), B run slip;
T2 owner with ctx (T2,sA) / (TT,sA) / (T2,sO) on cert1, request of e4, slip, history; system-B employee cancelling e4's request,
downloading cert1, opening r2; e4 actor with tenantId=T2. All NO (identical bytes); reqB and req4 still REQUESTED (no side effect).

## Findings

**F1 — MINOR (borderline MAJOR) — voided salary certificate served by a download racing the void.**
Cause: `src/lib/modules/hr/payslip.ts:456-458` reads the row (voided check) outside any lock; the counter/audit tx at `:462-465`
`updateMany({ where: { id, tenantId, systemId } })` does not re-assert `status: "ISSUED", voidedAt: null` nor check `count`; bytes returned at `:466`.
Effect: self (who must get NO for voided) and gate holder receive a voided certificate; download counted and audited as a normal download.
Repro: `hunt.mts P3` (holdCert: lock row FOR UPDATE → start downloadMySalaryCertificate → set voidedAt → commit).
Fix idea: in the counter tx `updateMany` with `voidedAt: null, status: "ISSUED"` (and `contentSha256` unchanged), `count !== 1` ⇒ refuse (self NO / gate VOIDED), or read the row FOR SHARE inside the same tx before rendering.

**F2 — MINOR — double submit of "issue directly" creates two numbered certificates.**
Cause: `payslip.ts:359-364` + `:404` — the direct path has no idempotency / duplicate guard; the advisory lock (`:366`) only serialises.
Repro: `hunt.mts P3` (two parallel `issueSalaryCertificate(cA, pay, {employeeId:e1, purpose:"BANK"})`) ⇒ HRSC-2032-0004 and -0005.
Effect: number burnt, a second live document; only OWNER can void (CERT_VOID_OWNER), so a non-owner gate holder cannot undo it.

**F3 — MINOR — direct issue leaves the employee's open request pending ⇒ duplicate on approval.**
Cause: `payslip.ts:359-405` direct path never touches an open REQUESTED row of the same employee.
Repro: `hunt.mts P3` (request e5 → direct issue e5 → open=1 → approve request ⇒ second certificate).
Fix idea: direct issue consumes (or refuses while) an open request of that employee, or the UI only offers "issue from request" when one is open.

**F4 — MINOR — one corrupt issued item hides every slip of the employee.**
Cause: `payslip.ts:243` `issuedRows` returns null on the first bad item ⇒ `mySlips` (`:491`) and `slipHistory` (`:276`) refuse SLIP_DATA as a whole.
Effect: employee loses the whole list on `/app/me/hr/pay` (all years) because of one row; healthy slips stay reachable only by direct URL. Fail-closed is per brief
("never repaired"), but per-row SLIP_DATA would keep the rest visible. Repro: `hunt.mts P2`.

**I1 — INFO (inherited, not H3.8 code) — self paths don't re-check Membership.** `resolveSelf` (`self.ts:101-123`, via `employeeOfUser` service.ts:1208)
serves a linked employee even after the Membership row is deleted. Routes/pages are protected by `requireTenant` (session memberships), so not reachable over HTTP;
noted because the H3.8 brief rests the self surfaces solely on resolveSelf. Repro: `hunt.mts P1` last cell.

**I2 — INFO — bidi/line-separator characters frozen into certificate content.** `payslip.ts:392` copies `emp.name`/`position` verbatim into
`contentJson` (hashed, permanent); the employee-name writer (frozen H1 service) has no CONTROL filter (filings has one, `filings/service.ts:121`).
Not seen in extracted PDF text; visible risk is in HTML lists (cert list / inbox summary) where U+202E can reorder text. Repro: `hunt.mts P4`.

## Not found
No cross-tenant / cross-system / cross-branch read; no existence oracle by refusal bytes; HEAD refused; no reversed / draft / unfinalized / future-paid slip
served as issued or cited; numbering contiguous under cancel∥approve; no name/ID in file names.
