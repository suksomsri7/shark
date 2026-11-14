# PRIV-2 — oracle notes (14 Nov 2026)

Branch `wip/hr-priv-2` from `session/hr` 60659e7c0. Oracle `scripts/qc-hr-priv-2.mts` + `scripts/qc-hr-priv-2-lib.mts` · brief `ledger/hr-briefs/hr-brief-PRIV-2.md`.
Base runs (lane wrapper, QC_FORCE=1): 5 runs (first 4 = harness fixes), last `scratchpad/priv2/run5.log`: **BASE-EXPECTATION 40/40 as registered** (23 RED-by-design fail · 17 GREEN controls pass) · RESIDUE none · outbound 0 · no law rows used.

## 1. Pay-scope helpers found at base (answer to R1)
| where | name | rule |
|---|---|---|
| `payslip.ts:136` | `homeInScope(m, viewer, unitId)` (private) | home ∈ scope of DB member AND of passed viewer; null home ⇒ all-branch only |
| `labor.ts:121-123` | gate closure `sees(home)` (`limited = role≠OWNER && scope≠"*"`) | same meaning, viewer from DB (`gateOf`) |
| `payroll.ts:3066,3080` | `unitsOfViewer` + `mine` in `previewPayrollRunV2` | home-only, **but** `unitAccess []` ⇒ no branch (hrScopeOf D-1 says all branches) |
| `attendance-pay.ts:73` / `work-entries.ts:80` | `covers(scope, unitId)` | home-only copies (money / minutes) |
| `privacy.ts:57,132` · `reports.ts:172` · `payroll-ui.tsx:93` · `inbox` via `listAdjustments`→`scopedEmployeeIds` | `employeeInScope` / `unitWhere` | home **or borrowing open today** — the leak |
Payslip (H3.8) and labour (H4.2) agree in meaning but are **two functions** ⇒ S2 requires one `scope.ts inPayScope` (+ `payScopeWhere` for queries).

## 2. Pinned names/shapes
`scope.ts`: `inPayScope(scope: HrScope, homeUnitId): boolean` · `payScopeWhere(scope): Prisma.HrEmployeeWhereInput` (no `units` term) · `PAY_SCOPE_EXCLUDED_TEXT = "ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง {n} คน"` (used in payroll-ui.tsx + payroll-run-ui.tsx). `previewPayrollRunV2(...).run.excludedHeadcount: number` (0 for all-branch). No new reader name is pinned for the page: the oracle renders `PayrollSection` in a Next request scope (h1.1 technique) and inspects HTML **and every prop of the returned element tree**.
Marker: `HR PRIV-2 ▸ … ◂` on every hunk of the allowed files (S5); `inbox.ts` is allowed (see Q3).

## 3. Checks (40) and base evidence
RED by design (23): S1 S2 S7 P1 (helpers absent) · A1 (payU1s/payU1m see nationalId/SSO/house-reg/bank/payType + doc of bNow/bSpan/bLeft) · A2 (≠ mgrU1 DTO) · A4 (loadPayslipForViewer opens bNow/bSpan) · A6 (stale permissions + forged `["*"]` object accepted) · B1/B2 (6 money reports page/CSV/XLSX list bNow/bSpan/bLeft — bNow's borrowing started **after** PERIOD 2026-10) · B3 (OT report rows bSpan with money) · C1 (page: bNow/bSpan names, salary, 6,543.21 bonus) · C2 (whole-run gross/net/SSO/WHT + "10 คน" printed; no note) · C4 (`excludedHeadcount` undefined) · C5 (inbox lists bNow's pending bonus `amountSatang 654321` to payU1s and payU1m, `blocker NO_RIGHT`) · D1 (42/54 report payloads change on doubling) · D2 (12/80: `loadPayslipForViewer` returns the **whole-run totals** in `run` — even for a1 — plus borrowed slips) · D3 (page changes) · D4 (inbox) · W1/W2 (18 bad chars accepted by create/update/save; no reason) · W4/W5 (16/18 owner exports refused ENCODING, reason echoes the raw name).
GREEN controls (17): S3 S4 S5 S6 · A3 A5 · B4 (bEnded absent, aLeft present) B5 · C3 · D0 (259 payloads stable; REST needs a fresh key per round — limiter is per key) · D5 (AI T1–T4, REST hr-read, non-pay viewers) · D6 (owner/pay-key payloads change) · E1 E2 (roster, board, attendance, time report, profile opens, leave + OT reject) · G1 · W3 · Z1.

## 4. R4 — what limited payroll viewers can do to runs today
All 11 run actions (v1 create/approve/markPaid/reverse/deleteDraft/recompute; v2 create/recompute/approve/pay/reverse) call `assertRunAllBranches` (H1.1 R12.3) — verified live (G1: payU1m with every pay key gets the fixed text 11×, nothing written). Bank file / filings / salary certs / opening YTD use `bankGateOf` (all-branch). ⇒ pinned GREEN, no question. Only `confirmBranchHoursAction` is unit-scoped (H3.4 design, no money). Debt: services `approveRun/markPaidRun/reverseRun` take no viewer — rule lives in actions only (D-PRIV-service-run-guard).

## 5. Older suites whose expectations change (ORACLE-EDIT requests — not edited)
1. `qc-hr-h3.8.mts:727,731` S3.22 control `!!hotfixE6` (loadPayslipForViewer opens borrowed e6 for the branch payroll viewer) → expect `null`.
2. `qc-hr-h3.9.mts:1254,1256` S5.4 refusal text `T.formula/encoding.replace("{names}", name)` → fixed text without names (R5/S7); if output sanitising also covers position/nationality, the refusal case itself goes → re-pin as "export ok, sanitised".
3. `qc-hr-h3.9.mts:339` (S1.5 `laterMark`) and `:440` (S1.10 `anyMarked`) → accept `HR PRIV-\d+` (payroll.ts/privacy.ts/service.ts/scope.ts are frozen there).
4. `qc-hr-h3.6.mts:241` S1.6 `laterMarked` regex → accept `HR PRIV-\d+` (same files + payroll-ui.tsx).
5. `qc-hr-h4.3-lib.mts:186-192` S1.6 `hrFrozen` (reports*/inbox*/privacy*/payroll*/payslip*, no in-base or mark allowance) and `:203 anyMark` → accept `HR PRIV-\d+` hunks.
6. `qc-hr-h4.2-lib.mts:144` S1.6 in-base mark regex `/HR H\d+\.\d+|HR-SET-\d+|POS P\d|HR H4\.2/` → + `HR PRIV-\d+` (labor.ts hunk).
7. `qc-hr-h1.3.mts:907-908` static: `loadPayslipForViewer` body must contain literal `return { run, item, employee };` — builder keeps the literal with a trimmed `run`, or edit. `:896` allows `listRuns`/`listAdjustments` only in payroll-ui.tsx + inbox.ts (constraint on any new page reader).
8. `qc-hf-hr-privacy.mts:164-180` synthetic viewers (`userId u-owner-…`, no Membership) used at `:218/:239/:270` → R6 DB re-read in privacy.ts turns P-*/Pr-* RED → edit to real memberships, or rule (Q2).
9. `qc-hr-h0.2.mts:336-347` S5.4 pins PayrollSection shape (guard → `const ctx` → reads after) — keep or edit (not in the run list).
Unchanged (checked): h1.1 S4.7/S4.8/S10.6/S10.7 (borrowed e4 not asserted for pay) · h3.5/h3.8/h4.8 frozen statics (IN_BASE ⇒ n/a) · h4.8 REST reads (D5) · h3.9 report matrices (no borrowed fixture). Total: **9 places** (7 in the run list).

## 6. Questions for the controller
Q1 OT report: pinned "borrowed rows absent for a limited payroll viewer" (B3, literal R1(b)); alternative = keep the row without $ cells (mgr without pay sees the row today).
Q2 R6 vs synthetic viewers: hf-hr-privacy (no memberships) and H4.8 API (`apikey:` viewer whose authority is the issuer) both call privacy.ts — re-reading Membership must map the API viewer to its issuer (D5 would catch a break) and needs item 8 above.
Q3 New finding (not in the hunt): H2.11 inbox shows borrowed employees' pending pay adjustments with amounts to limited payroll viewers (C5). Pinned "absent"; `inbox.ts` added to the allowed files.
Q4 New finding: `loadPayslipForViewer` returns the run row with whole-run totals to a branch-limited viewer (D2) — same class as F3.
Q5 One helper changes `previewPayrollRunV2` for `unitAccess []` + pay (today: no branch; after: all branches per D-1). OK?
Q6 R5: formula-prefixed **names** are sanitised (W4/W5), not refused; refusals for other cells (position, nationality) left to the builder as long as the text carries no value.
