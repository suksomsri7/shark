# PRIV-2 — oracle notes (14 Nov 2026)

Branch `wip/hr-priv-2` from `session/hr` 60659e7c0. Oracle `scripts/qc-hr-priv-2.mts` + `scripts/qc-hr-priv-2-lib.mts` · brief `ledger/hr-briefs/hr-brief-PRIV-2.md`.
Base runs (lane wrapper, QC_FORCE=1): 6 runs (1–4 harness fixes, 5 = r0, 6 = after the coordinator rulings 1–6), last `scratchpad/priv2/run6.log`: **BASE-EXPECTATION 39/39 as registered** (22 RED-by-design fail · 17 GREEN controls pass) · RESIDUE none · outbound 0 · no law rows used.

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
Marker: `HR PRIV-2 ▸ … ◂` on every hunk of the allowed files (S5); `inbox.ts` is allowed (ruling 3). OT DTO: `excludedHeadcount: number` + `notes` ∋ note (ruling 1). Export cells reuse `@/lib/core/csv` `neutralizeFormula`/`csvCell` (ruling 6, S7).

## 3. Checks (39) and base evidence
RED by design (22): S1 S2 P1 (helpers absent) · S7 (`{names}` interpolated; core/csv not reused) · A1 (payU1s/payU1m see nationalId/SSO/house-reg/bank/payType + doc of bNow/bSpan/bLeft) · A2 (≠ mgrU1 DTO) · A4 (loadPayslipForViewer opens bNow/bSpan; a1's result carries whole-run gross/net/SSO/WHT) · B1/B2 (6 money reports page/CSV/XLSX list bNow/bSpan/bLeft — bNow's borrowing started **after** PERIOD 2026-10) · B3 (OT: bSpan row has 5 money cells, totals include it, no excludedHeadcount/note, CSV/XLSX carry 3,333.31) · C1 (page: bNow/bSpan names, salary, 6,543.21 bonus) · C2 (whole-run gross/net/SSO/WHT + "10 คน"; no note) · C4 (`excludedHeadcount` undefined) · C5 (inbox lists bNow's adjustment `amountSatang 654321` to payU1s + payU1m; mgrU1 has none — premise verified) · D1 (42/54) · D2 (12/80) · D3 · D4 (inbox) · W1/W2 (18 bad chars accepted, no reason) · W4/W5 (16/18 owner exports refused ENCODING, reason echoes the raw name).
GREEN controls (17): S3 S4 S5 S6 · A3 A5 · B4 (bEnded absent, aLeft present) B5 · C3 · D0 (259 payloads stable; REST needs a fresh key per round — limiter is per key) · D5 (AI T1–T4, REST hr-read, non-pay viewers) · D6 · E1 E2 (roster, board, attendance, time report, profile opens, leave + OT reject) · G1 · W3 · Z1.
Dropped after ruling 2: A6 (stale/forged viewer objects are trusted today by privacy.ts — documented as D-PRIV-reader-trust, not pinned either way).

## 4. R4 — what limited payroll viewers can do to runs today
All 11 run actions (v1 create/approve/markPaid/reverse/deleteDraft/recompute; v2 create/recompute/approve/pay/reverse) call `assertRunAllBranches` (H1.1 R12.3) — verified live (G1: payU1m with every pay key gets the fixed text 11×, nothing written). Bank file / filings / salary certs / opening YTD use `bankGateOf` (all-branch). Pinned GREEN. Only `confirmBranchHoursAction` is unit-scoped (H3.4, no money). Debt D-PRIV-service-run-guard: services `approveRun/markPaidRun/reverseRun` take no viewer.

## 5. Older suites whose expectations change (builder authorised · old → new) — 8 places
1. `qc-hr-h3.8.mts:727,731` S3.22 control `!!hotfixE6` (loadPayslipForViewer opens borrowed e6 for the branch payroll viewer) → `hotfixE6 === null`.
2. `qc-hr-h3.9.mts:1254,1256` S5.4 refusal text `T.formula/encoding.replace("{names}", name)` → fixed text without the name; where the cell is a NAME the export now succeeds sanitised (ruling 6) — re-pin that case as ok + neutralised.
3. `qc-hr-h3.9.mts:339` (S1.5 `laterMark`) + `:440` (S1.10 `anyMarked`) → also accept `HR PRIV-\d+`.
4. `qc-hr-h3.6.mts:241` S1.6 `laterMarked` → also accept `HR PRIV-\d+`.
5. `qc-hr-h4.3-lib.mts:186-192` S1.6 `hrFrozen` (reports*/inbox*/privacy*/payroll*/payslip*, strict) + `:203 anyMark` → accept hunks marked `HR PRIV-\d+`.
6. `qc-hr-h4.2-lib.mts:144` S1.6 in-base mark regex → + `HR PRIV-\d+` (labor.ts hunk).
7. `qc-hr-h1.3.mts:907-908` literal `return { run, item, employee };` in loadPayslipForViewer → keep the literal with a trimmed `run` (ruling 4), or accept the new shape; `:896` listRuns/listAdjustments callers only payroll-ui.tsx + inbox.ts (constraint).
8. `qc-hr-h0.2.mts:336-347` S5.4 PayrollSection shape (guard → `const ctx` → reads after) → keep, or re-pin to the new reader (not in the run list).
Dropped: qc-hf-hr-privacy (its only reason was R6). Unchanged (checked): h1.1 S4.7/S4.8/S10.6/S10.7 · h3.5/h3.8/h4.8 frozen statics (IN_BASE ⇒ n/a) · h4.8 REST (D5) · h3.9 report matrices (no borrowed fixture).

## 6. Rulings received (coordinator, 14 Nov) — all applied
1 OT/time rows stay, money withheld + excludedHeadcount + note (B3 re-pinned) · 2 R6 = debt (A6 dropped) · 3 inbox in scope, absent like a manager without payroll (C5) · 4 slip loader: own figures only (A4) · 5 `[]` = all branches OK · 6 formula names neutralised via core/csv, bad chars refused on write (S7, W1–W5).
Open: none blocking. Note for the builder: time report has no money columns ⇒ no change there; the API-key viewer path through privacy.ts must stay byte-identical (D5).
