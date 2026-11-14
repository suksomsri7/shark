# PRIV-2 — one pay scope: borrowing never widens pay (builder notes · 14 Nov 2026)

> Branch `wip/hr-priv-2` (worktree `shark-hr-b`) from `session/hr` 60659e7c0 · oracle head 170050544 · no migration · brief `ledger/hr-briefs/hr-brief-PRIV-2.md` · oracle notes `hr-PRIV-2-oracle.md` · green run `hr-PRIV-2-green.txt` · raw logs `scratchpad/priv2b/` (untracked).

## 0. Checkpoint
- done: product change (12 src files, all hunks `HR PRIV-2 ▸ … ◂`) — commits 5a291458e (helper + 4 former copies + payroll.ts) · c23c0fc6b (surfaces + R5) · ORACLE-EDITs 1c734d9cf (h3.8 ×2 places, h3.9 ×2, h3.6 ×1) · suites + fitness + clean typecheck (tracked code 0 errors; 5 errors only in untracked `scratchpad/h52p/p1-sweep.mts`, another agent's probe) — see `hr-PRIV-2-green.txt`.
- open (controller): h3.9 S2.1 texts fixture · h4.3 S1.6/S1.7 vs priv-2 S4 (see §4).

## 1. The one helper (`scope.ts`)
`inPayScope(scope, homeUnitId)` · `payScopeWhere(scope)` (`"*"` ⇒ `{}` · `[]` ⇒ `{id:{in:[]}}` · list ⇒ `{unitId:{in}}`, no `units` term) · `payScopeEmployeeIds(ctx, scope)` (id list for tables without a relation; null = all) · `PAY_SCOPE_EXCLUDED_TEXT`.

| former copy | now |
|---|---|
| `payslip.ts homeInScope` (private `ok(sc)`) | body = `inPayScope(dbScope) && inPayScope(passedScope)` (same meaning, both viewers still checked) |
| `labor.ts gateOf` closure `sees` (`limited` + `ids.includes`) | `sees = (home) => inPayScope(scope, home)` (`ids` const removed) |
| `payroll.ts previewPayrollRunV2` `unitsOfViewer` + `mine` | `hrScopeOf` + `inPayScope` (`unitsOfViewer` stays only for `confirmBranchHours`, no money) |
| `attendance-pay.ts covers` | `covers = (s, u) => inPayScope(s, u)` |

Other users of the helper: `privacy.ts` (profile sensitive block · `loadPayslipForViewer`) · `reports.ts` (6 money reports via `payScopeWhere`, OT/time money cells via `inPayScope`) · `payroll.ts listAdjustments` (via `payScopeEmployeeIds` — callers = payroll page + inbox only) · `payroll-ui.tsx` (employees, run rows, exclusions, stranded) · `payroll-run-ui.tsx` (note). Work-entries `covers` untouched (frozen · debt D-PRIV-workentries).

## 2. What changed where
| file | change |
|---|---|
| `scope.ts` | helper block (§1) |
| `privacy.ts` | profile: `seeSensitive = canViewPayroll && inPayScope(home)` drives nationalId/SSO/house-reg/bank×3/payType/docs/`canSeeSensitive` (opening still `employeeInScope`) · `loadPayslipForViewer`: payroll branch = `inPayScope(home)`; run row returned without `total*` keys unless viewer is an all-branch payroll viewer (type `SlipRunOwn`); literal `return { run, item, employee };` kept (h1.3 S6.3 unchanged) |
| `payslip.ts` · `labor.ts` · `attendance-pay.ts` | §1 |
| `payroll.ts` | `listAdjustments` = pay scope · `previewPayrollRunV2`: rows/totals on pay scope, `run.excludedHeadcount = items − shown` (0 for all-branch), return type named `Run2Preview` (one-line signature so the S2 static can read the body — no behaviour change) |
| `reports.ts` | `employeesOf`: payroll-month/-year, tax-month/-year, wages, register ⇒ `payScopeWhere` (out-of-scope rows absent for every period) · other reports keep `unitWhere`; when money columns are shown, rows outside pay scope keep non-money cells, money cells `""`, totals therefore Σ in-scope, `excludedHeadcount` (only when > 0) + note · export: name cell = strip H4.8 set (+ lone surrogates, U+FFFE/FFFF) → `neutralizeFormula` (`@/lib/core/csv`) → `'` if still formula-like (full-width); other cells keep the H3.9 `exportProblem` guard; refusal text has no names |
| `reports-rules.ts` | `formula`/`encoding` texts (th + en) without `{names}` |
| `privacy-shared.ts` | `HR_NAME_BAD` (= `hr/api/keys.ts NAME_BAD`) + `HR_NAME_BAD_TEXT` |
| `service.ts` | `createEmployee` throws `HR_NAME_BAD_TEXT` before Party/DB · `updateEmployee` / `saveEmployeeProfile` return `{ok:false, reason: HR_NAME_BAD_TEXT}` (formula prefixes not refused) |
| `payroll-ui.tsx` | employees = active list ∩ `inPayScope` · run items / exclusions / stranded = `payScopeEmployeeIds` (leavers of the home branch included) · per run: count + net/gross/SSO/WHT from shown items, note `ไม่รวม… N คน` when N > 0 · all-branch view unchanged |
| `payroll-run-ui.tsx` | note under the tiles when `run.excludedHeadcount > 0` |

## 3. What a branch-limited payroll viewer sees now
| surface | home-branch employee | borrowed / other-branch employee |
|---|---|---|
| profile `/hr/employees/[id]` | full incl. sensitive + docs | opens (if borrowed today) with the DTO of a manager without payroll (`canSeeSensitive:false`, no docs) · other branch = null (unchanged) |
| `loadPayslipForViewer` | slip, run row without `total*` | null |
| payroll-month/-year · tax-month/-year · wages · register (page/CSV/XLSX) | rows | absent, any period |
| OT report (page/CSV/XLSX) | row with money | row kept, money cells empty, excluded from money totals · `excludedHeadcount` + note |
| time · leave reports | unchanged | unchanged (no money columns) |
| payroll page | salary form, attendance, adjustments, slip links, run count/totals from own rows | absent · note "ไม่รวม… N คน" per run · no whole-run figure in HTML or props |
| run v2 preview / section | rows + Σ own rows | absent · `excludedHeadcount` + note |
| inbox adjustments | listed with amount | absent (as for a manager without payroll) |
| roster · board · attendance · time report · leave/OT decisions | unchanged | unchanged (R3) |
| run actions · bank/filings/certs/opening | refused (all-branch only, unchanged R4) | — |
Owner / all-branch viewers / API keys (`*` scope) / AI tools: unchanged (D5/D6).

## 4. ORACLE-EDITs (all marked `ORACLE-EDIT (HR-PRIV-2 · controller ruling …)`)
| # (§5) | file:check | old → new | status |
|---|---|---|---|
| 1 | `qc-hr-h3.8.mts` S3.22 | `control: !!hotfixE6` → `control: hotfixE6 === null` | applied (= note) |
| 1b | `qc-hr-h3.8.mts` S1.13 | privacy.ts pin `bbf7604b…` → `ea0017fa…` (authorised re-take; self.ts pin unchanged) | applied |
| 2 | `qc-hr-h3.9.mts` S5.4 | `T.formula/encoding.replace("{names}", name)` → `T.formula/encoding.replace(": {names}", "")` (fixed text; both S5.4 cells are not names ⇒ still refused) | applied (= note) |
| 3 | `qc-hr-h3.9.mts` S1.5 `laterMark` | + `/HR PRIV-\d+/` | applied (= note) · S1.10 `anyMarked`: **not needed** (green unchanged) — not edited |
| 4 | `qc-hr-h3.6.mts` S1.6 `laterMarked` | + `|HR PRIV-\d+` | applied (= note) |
| 5 | `qc-hr-h4.3-lib.mts` S1.6 `hrFrozen` + S1.7 `anyMark` | **NOT applied — conflict**: `qc-hr-priv-2` S4 freezes `scripts/qc-hr-h4.3-lib.mts` byte-for-byte (applying it ⇒ priv-2 38/39). Also the note's edit is insufficient: S1.6 `oracles` sub-check lists `qc-hr-priv-2(.mts,-lib.mts)` + the edited h3.6/h3.8/h3.9 (diff vs merge-base 60659e7c0). Proposed patch (hrFrozen + anyMark only) kept at `scratchpad/priv2b/oracle-edit-h4.3-lib.proposed.patch`. Both checks are branch-only (pass once merged: merge-base = head) | controller ruling needed |
| 6 | `qc-hr-h4.2-lib.mts` | not needed (h4.2 57/57 without it) | not edited |
| 7 | `qc-hr-h1.3.mts:907` | not needed (literal kept, run trimmed) · S6.1 PAY_MARKED: no `HR PRIV-2` entry needed (h1.3 63/63) | not edited |
| 8 | `qc-hr-h0.2.mts` S5.4 | not needed (guard → ctx → reads order kept; 58/58) | not edited |
| new | `scripts/fixtures/hr-h3.9-texts.json` (h3.9 S2.1) | th `formula`: "…อาจอ่านเป็นสูตร: {names} — แก้…" → "…อาจอ่านเป็นสูตร — แก้…", th `encoding` same pattern; en `formula`/`encoding` drop ": {names}". Forced by priv-2 S7 (no `{names}` anywhere in reports-rules.ts) | **outside §5 — not edited, controller ruling needed** (h3.9 59/60 until then) |

## 5. COMMON §F self-check
1 ☑ no new page/route · 2 ☑ no new transaction; no `tenantDb(`/`prisma.` inside tx bodies added · 3 ☑ `[]` = all branches via `hrScopeOf` everywhere (previewPayrollRunV2 now agrees with D-1; side effect: a MANAGER **without** pay keys and `unitAccess []` gets the fixed `no` there instead of empty rows — the existing `mgr && all-branch ⇒ NO` rule) · 4 ☑ refusals fixed Thai (`HR_NAME_BAD_TEXT`, report texts without names); forbidden vs unknown parity kept (A5) · 5 ☑ n/a (no tx options) · 6 ☑ n/a (no migration) · 7 ☑ n/a · 8 ☑ n/a · 9 ☑ n/a (no events) · 10 ☑ src files ⊆ brief list (scope · privacy · privacy-shared · payslip · labor · reports · reports-rules · payroll · payroll-ui · payroll-run-ui · service · attendance-pay); `inbox.ts` not touched (C5 via `listAdjustments`).

## 6. Decisions for the controller
- `loadPayslipForViewer` trims `total*` for every viewer that is not an all-branch payroll viewer — including the employee viewing their own slip (ruling 4 names "limited viewer"; self is wider than needed but no consumer reads run totals).
- Name sanitising on export covers the `name` cell only (as notes §5.2 implies); other text cells (position, nationality, policy) keep the H3.9 refusal, now with fixed text.
- `createEmployee` refusal is a thrown `Error(HR_NAME_BAD_TEXT)` (its return type has no `ok`); AI proposal path surfaces it as the proposal error.

## 7. Debts
D-PRIV-reader-trust (F5 · R6 · ~35 readers trust ctx+viewer; no membership re-read here) · D-PRIV-home-history (pay scope = current home) · D-PRIV-workentries (work-entries `covers` minutes-only copy, frozen) · D-PRIV-service-run-guard (approveRun/markPaidRun/reverseRun services take no viewer).

## 8. Temp data
None left by my runs (priv-2 Z1 + RESIDUE none on every run). Raw logs in untracked `scratchpad/priv2b/`.
