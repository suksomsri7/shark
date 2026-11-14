# PRIV-2 — one pay scope: borrowing never widens pay (fix after H5.2 hunt F1–F5)

> Base `session/hr` 60659e7c0 · branch `wip/hr-priv-2` · no migration · oracle `scripts/qc-hr-priv-2.mts` (+ `-lib`) · notes `ledger/wo-notes/hr-PRIV-2-oracle.md`. Marker on every hunk: `// HR PRIV-2 ▸ … ◂`.

## Problem
A U1-limited payroll viewer got pay data of employees **borrowed** into U1 (`employeeInScope`/`unitWhere` = home **or borrowing open today**):
F1 profile sensitive block + docs (`privacy.ts:57,92`; latent twin `loadPayslipForViewer` `:132`) · F2 money reports page/CSV/XLSX for **every past period** (`reports.ts:172`) · F3 payroll page shows borrowed salary/items/adjustments **and whole-run totals + headcount** (`payroll-ui.tsx:93-105,350-362`) ⇒ hidden pay by subtraction · F4 a name with bidi/control/formula blocks every money export of the owner and the refusal echoes the raw name (`reports.ts:700`) · F5 readers trust caller viewer (debt).
Today two home-only predicates exist with the same meaning: `payslip.ts homeInScope` (private) and `labor.ts` gate `sees` (closure); a third copy `payroll.ts unitsOfViewer`+`mine` (previewPayrollRunV2 — differs: `unitAccess []` = no branch there, = all branches in `hrScopeOf` D-1) and `attendance-pay.ts covers`.

## Rulings (contract)
R1 **One predicate** in `scope.ts`: `export function inPayScope(scope: HrScope, homeUnitId: string | null | undefined): boolean` (pure: `"*"` ⇒ true incl. null home; list ⇒ home ∈ list; null home ⇒ false) and `export function payScopeWhere(scope: HrScope): Prisma.HrEmployeeWhereInput` (`"*"` ⇒ `{}`, `[]` ⇒ none, list ⇒ `{unitId:{in}}` — **no** `units` term). Current home only (= payslip rule; leavers judged by home; no home-history). `homeInScope`, labour `sees`, `previewPayrollRunV2`, `attendance-pay covers` call it (no second implementation). Text `export const PAY_SCOPE_EXCLUDED_TEXT = "ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง {n} คน"`.
(a) **Profile**: sensitive block (nationalId, SSO, house-reg, bank ×3, payType, docs) only when `canViewPayroll && inPayScope`; out-of-pay-scope ⇒ the DTO a manager without payroll gets (byte-identical, `canSeeSensitive:false`). Opening the profile itself still follows `employeeInScope` (R3). `loadPayslipForViewer` payroll branch uses pay scope.
(b) **Pure money reports** (payroll-month/-year, tax-month/-year, wages, register) for a limited payroll viewer: rows from `payScopeWhere` — out-of-pay-scope rows **absent**, any period; totals = Σ own rows. **OT/time** (ruling 1): out-of-pay-scope rows stay with exactly the non-money cells a manager without payroll sees; every money cell of such a row absent/null; money totals from in-pay-scope rows only; DTO `excludedHeadcount` + `notes` ∋ `PAY_SCOPE_EXCLUDED_TEXT` (N = withheld rows). `leave` unchanged.
(c) **Payroll page** (`PayrollSection`) for a limited viewer: employees, salary forms, attendance, adjustments, stranded, exclusions, run items = pay scope only; per run: headcount + totals from shown items only, plus the note with N = hidden items; no whole-run figure in HTML **or props**. `previewPayrollRunV2` adds `run.excludedHeadcount` (0 for all-branch) and the run-v2 section prints the note.
(d) **Inbox** (H2.11, ruling 3): adjustment items of out-of-pay-scope employees are absent for a limited payroll viewer — same as a manager without payroll, whose inbox has no ADJUSTMENT kind (`inbox.ts:71`). **Slip loader** (ruling 4): `loadPayslipForViewer` returns only the slip's own figures to a limited viewer — no whole-run totals.
R2 Doubling every out-of-pay-scope employee's pay (profile rates, items, adjustments, run totals) changes no byte of any covered payload of payU1s/payU1m (list in oracle D1–D5); owner/pay-key payloads do change (D6).
R3 Roster, attendance board, time/leave reports, leave/OT decisions, profile opening for borrowed staff unchanged.
R4 Pinned as found (GREEN): every run action requires an all-branch viewer (`assertRunAllBranches`, H1.1 R12.3); bank/filings/certs/opening need `bankGateOf` (all-branch). Limited viewers cannot create/approve/pay/reverse/delete/recompute runs or issue documents.
R5 Write path (`service.createEmployee/updateEmployee/saveEmployeeProfile`) rejects names containing the H4.8 key-name set (C0/C1 incl. tab/LF, DEL, U+061C, U+200B–200F, U+202A–202E, U+2060, U+2066–2069, U+2028/2029, U+FEFF) with a fixed Thai text (no echo). Formula prefixes (`= + - @`, tab, CR) are not refused on write. Exports never refuse because of a stored name: strip the set on output and neutralise formulas with the house sanitiser `@/lib/core/csv` (`neutralizeFormula`/`csvCell`, ruling 6); refusal texts carry no `{names}`.
R6 F5 = debt **D-PRIV-reader-trust** in full (ruling 2): no membership re-read in this ticket (conflicts with qc-hf-hr-privacy synthetic viewers and the H4.8 API-key viewer → issuer).
Refusals stay byte-identical for forbidden vs unknown ids. API (H4.8) and AI tools (H4.3) unchanged (D5 regression).

## Files
Likely: `scope.ts` · `privacy.ts` · `payslip.ts` · `labor.ts` · `reports.ts` · `reports-rules.ts` · `payroll.ts` (previewPayrollRunV2) · `payroll-ui.tsx` · `payroll-run-ui.tsx` · `service.ts` · `attendance-pay.ts` · `inbox.ts` · (`actions.ts`, `privacy-shared.ts`, `reports-ui.tsx`, messages th/en if needed). Only marked hunks; a new hr file must say `HR PRIV-2` in its first 3 lines.
**Frozen** (S4): `prisma/**` · `src/lib/core/**` · `src/lib/ai/**` · `hr/api/**` · `hr/filings/**` · `hr/bank-files/**` · payroll-rules*/payroll-run-rules/payslip-rules/labor-rules · roster*/judge*/leave*/ot*/inbox-*/swap*/correction*/lifecycle*/self*/clock*/pin/work-entries*/settings*/law*/ai*/payroll-opening*/stock-charge*/line-* · `qc-hr-lib.mts` + h3.8/h4.3 libs · every older oracle · `package.json`.

## Run list (lane wrapper, one at a time)
`qc-hr-`: priv-2 · h0.6 · h1.1 · h1.2 · h1.3 · h2.4 · h3.4-ytd · h3.5 · h3.6 · h3.7 · h3.8 · h3.9 · h4.2 · h4.3 · h4.8 · `qc-hf-hr-privacy` · `qc-audit-trail` · tsc (touched). Expected older-suite changes (ORACLE-EDIT requests, not builder edits): see notes §4.

## Debts
D-PRIV-reader-trust (F5, ~35 readers) · D-PRIV-home-history (pay scope = current home; a moved employee's past pay follows the new home) · D-PRIV-workentries (work-entries `covers` stays a minutes-only copy) · D-PRIV-service-run-guard (approveRun/markPaidRun/reverseRun services take no viewer; the all-branch rule lives in actions only).

## CONTROLLER RULINGS (oracle r2 · controller numbering; brief R6 above unchanged)
R6 `ot.ts` + `stock-charge.ts` unfrozen (marked hunks). N1 `otRequestList` money (`amountSatang`, `segments`, any rate field) only when `inPayScope(home)`; rows/minutes keep the borrowing rule; `myOtRequests`, owner, all-branch unchanged (oracle N1/N3/N4, D4 `otList`). N2 `listStockCharges` + `stockPeriodCapFlags`: out-of-pay-scope rows/flags not returned to a limited viewer (`payScopeWhere`) (N2/N3/N4, D4 `stock`).
R7 h3.8 S3.22 positive control: borrowing row exists AND `loadEmployeeProfileForViewer(payBranch, e6)` non-null (applied, `ORACLE-EDIT (HR-PRIV-2 · controller R7)`).
R8 own slip: `loadPayslipForViewer` for the employee = item figures equal the DB row, run object without `total*` keys (A7).
R9 statics base = merge-base(HEAD, session/hr) older oracles may differ only in files carrying `ORACLE-EDIT …PRIV-2`; `qc-hr-h4.3-lib.mts` only in hunks each carrying `ORACLE-EDIT (HR-PRIV-2` (S4).
R10 booking staff path obeys the R5 name rule or stores the name clean (W6); `booking/service.ts` allowed (marked hunks).
R11 `openStockClaims` + `stockAttention` (stock-charge.ts): no out-of-pay-scope row for a limited viewer; all-branch unchanged (N5, S2). W6 tightened: typed bad name ⇒ `HR_NAME_BAD_TEXT`; `linkStaffToHr` stores each stripped name.
Controller debts (out of ticket): register position/nationality formula cells · bank-files `{names}` · `confirmBranchHours` unitsOfViewer · blind approve `decideAdjustmentAs` · more invisible code points.
