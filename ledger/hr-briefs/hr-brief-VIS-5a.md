# HR VIS-5a — payroll area to mockup 06 (layout only)

> DRAFT r0 · 14 Nov 2026 · brief drafter (read-only). Base `session/hr` 09713f430 · branch `wip/hr-vis-5a` · lane 3 · fix batch (not counted). Q defaults (end) hold unless ruled.

## 1. Rule
Move and restyle only: no change to logic, action I/O, privacy gates, loader shapes or money math. Every changed hunk adds a line with `HR VIS-5a` + `◂`. Render = mockup 06 except the owner list.

## 2. Today — `src/app/app/sys/[id]/hr/payroll/page.tsx` (144 lines)
Wrapper `max-w-2xl` :125 · hard-coded Thai desc :126 · `ModuleTabs` :128, then stacked:

| # | Section | Feeds | testids | Who |
|---|---|---|---|---|
| A | `PayrollSection` :129 → `payroll-ui.tsx:71`: profiles :139–202 · attendance :205–235 · adjust form+list :238–294 · v1 create :297–306 · v1 runs/exclusions/stranded/slip chips :309–463 | list* loaders (scoped :93–109); `setSalaryProfileAction`, `RunRowActions`, `markPaidAction`, `reverseRunAction` | 6 + RunRowActions 10 + ClaimGiveBack 5 + `hr-salary-ot-rate` | `canViewPayroll` :80; run buttons `allBranches` :392/:407/:418; limited = in-scope rows + `PAY_SCOPE_EXCLUDED_TEXT` :375 |
| B | `WorkEntriesPanel` :130 → `work-entries-ui.tsx:20` | `?period`, `onBuild/onFinalize` :48–57 (`?we=`) | 6 `hr-we-*` | `canReadWorkEntries` :23 (managers too) |
| C | `PayrollRunSection` :131 → `payroll-run-ui.tsx:48` | `previewPayrollRunV2` (`payroll.ts:3120`) · actions :65–121 (`?r2 ?run`) | 20 `hr-run2-*`/`hr-markpaid-*` | money = OWNER/`hr.payroll.read` :52; manager = minutes + `BranchConfirm` :220/:292; `act` nulled :58; limited totals from visible rows (`payroll.ts:3185`) + `excludedHeadcount` :153 |
| D | `StockChargeSection` :133 → `stock-charge-ui.tsx:22` | `?stock ?stockq ?stockinv` | 29 `hr-stock-*` | own gate :27 |
| E | `BankFileSection` :135 → `bank-files/ui.tsx:66` | `?bank ?bfmt ?beff ?benc ?bmode ?bera ?bbranch ?bmsg ?bfile` | 12 `hr-bank-*` | `canUseBankFiles` :70 |
| F | `OpeningYtdCard` :138 → `payroll-opening-ui.tsx:27` | `?yty ?ymsg ?yn` | 8 `hr-ytd-*` | `listOpeningYtd` :33 |
| G | `FilingSection` :139 → `filings/ui.tsx:87` | `?fk ?fp ?frun ?fmsg ?fflds ?fdoc ?fbi ?fbs ?ffile ?ty ?fperson ?fstop` | 28 `hr-filing-*`/`hr-taxcert-*` | `canUseFilings` :91 |
| H | `SalaryCertSection` :141 → `payslip-ui.tsx:364` | `?sc` | 8 `hr-salarycert-*` | `canUseSalaryCerts` (`payslip.ts:132`) |

133 inventory rows. D–H actions redirect to `/hr/payroll?<own params>#anchor`, no view (`bank-files/actions.ts:106`, `filings/actions.ts:52`, `payroll-opening-actions.ts:61`, `stock-charge-actions.ts:59`, `payslip-actions.ts:28`; untouched) ⇒ view inferred from params.
Causes (payroll-run-ui.tsx): x1/x2 create ignores live run :101 · x3 `pick` skips REVERSED :60 · x4 list `engineVersion: 2` :59 · ISO period :82/:94/:109 · label `hr.run2.title` · 390 `min-w-[560px]` :157.

## 3. Target IA — reuse the attendance sub-nav
Pattern: `AttendanceViewTabs` (`attendance-ui.tsx:93`, `?view=` links, `aria-current`, 44 px). Not sub-routes: `ModuleTabs` matches exact pathname (`module-tabs.tsx:16`). One server page:

| view | content (moved, not rewritten) | shown to |
|---|---|---|
| `run` (default) | C, new layout §4 (engine-1 shops: A runs part) | payroll viewers, managers |
| `hours` | B + A attendance | `canReadWorkEntries` |
| `adjust` | A adjust + D | payroll viewers / D key holders |
| `profiles` | A profiles | `canViewPayroll` |
| `docs` | E + G + H | any of the three gates |
| `ytd` | F | `canUseFilings` |
| `history` | A create + runs (v1 list, exclusions, stranded, slip chips) | `canViewPayroll` |

- `payViewOf(sp)` (pure, in page or `pay-run-view.ts`): explicit `view` wins; `bank*`/`f*`/`ty`/`sc` → docs; `yty/ymsg/yn` → ytd; `stock*` → adjust; `we` → hours; else run. Page's `we` redirects :51/:56 add `&view=hours`; `back2` :64 stays run.
- Nav shows only views whose existing gate passes (no new gate); `flex-wrap`, no scroller. Labels in `hr.payview.*` th+en.
- `PayrollSection` gets `parts?` (profiles|attendance|adjust|create|runs; default all = old output). Loaders unchanged; may skip reads feeding only hidden parts (`monthlyAttendance` :117, `stockConsent` :108, `giveBackPeriods` :134).
- `hr-run2-ytd-link` → `?view=ytd#hr-ytd-card`.
- `max-w-2xl` only for profiles/adjust/ytd/history; run/docs/hours ~1200 px. Desc :126 via messages.

## 4. Run screen per mockup element
EX exists (place/style) · DE loader returns it, new markup · ND new pure read · NF no backend → §10.

| Element | Class | Source |
|---|---|---|
| Breadcrumb, title "รอบจ่าย ก.ย. 2569" | DE | `run.periodKey` → `periodLabel` |
| Sub-line: dates · pay date · N people | DE | `run.payDate`, `rows.length`, `excludedHeadcount` |
| "last pulled 09:12" | NF | not returned |
| Refresh + "add/deduct" buttons | EX | `hr-run2-sync`/`hr-run2-rebuild` to header; link `?view=adjust` |
| Stepper 5 steps | EX | `hr-run2-steps` restyle |
| Step sub-labels (date, approver) | NF | `stepsJson` has makers/branches/ssoLaw/finalized only; "review N" = DE |
| Tiles net (hero), gross, deduct, SSO ee/er, WHT | EX | `hr-run2-tiles`, `totals.*` |
| Tiles OT, commission | ND→Q1 | Σ `lines` by code |
| Tile footnotes (monthly 7 · part-time 1) | DE | count `rows.payType` |
| Equation line, shop labour cost | NF | new money math |
| Cols name+payType, base, add, deduct, SSO, WHT, net | EX/DE | cells :191–196 unchanged |
| Col "worked days" | ND→Q2 | HrWorkDay `workMin>0`, `pv.rows` ids, `run.periodKey` |
| Col OT | ND→Q1 | OT lines have `minutes:null` (`payroll-run-rules.ts:407`) |
| Sub-labels under add/deduct | DE | distinct line codes → `ln_*`, no amounts |
| Status ready/review + reason | DE | `r.review`, `r.flags` → `rv_*`/`fl_*` |
| Totals row | DE | `run.totals` (already scoped); base total = Q1 |
| Selected row + drawer "source of every line" | DE partial | `?emp=` (only ids in `pv.rows`): lines grouped by sign (code·day·minutes·amount·requested), flags, net/SSO/WHT of row |
| Drawer links attendance · slip · edit | EX | `/hr/attendance?view=month&employee=&month=` · `/payroll/[runId]/slip/[emp]` · `?view=adjust` |
| Bar: approve | EX | `hr-run2-approve`, hidden `net`/`items` unchanged |
| Bar: all slips PDF | NF | per-person slip link exists |
| Bar: KBank · PND1 · SSO 1-10 | EX | `?bank=<run>#hr-bank` · `?fk=PND1&fp=<period>#hr-filing` · `?fk=SSO110&frun=<run>#hr-filing` (docs gate) |
| JV callout wording | DE | message |
| JV amounts / posted JV link | ND→Q3 | `payrollAccrualInputsOfRuns`+`accrualAmountsV2`+`payrollAccrualTemplate` |

Counts: EX 8 · DE 11 · ND 4 · NF 5 (+ drawer extras, §10).
Layout: ≥1280 `1fr | 400px` when `?emp`, else drawer after the table (`#hr-run2-drawer`). `hr-run2-review`+`hr-run2-warn` → one `<details>` "review N" grouped per code. Period chips (`hr-run2-row-*`) compact under the title.

## 5. States and labels
| State | Banner | Actions | Create |
|---|---|---|---|
| DRAFT | draft · review N | rebuild, sync, approve, branch confirm (as today) | hidden |
| APPROVED | approved, awaiting pay | pay (+PayFields), reverse | hidden |
| PAID | paid on payDate | reverse; doc links | hidden |
| REVERSED | danger banner; read-only table | none | shown |
| v1 run | "older engine — act in Run history" + link | no run2 buttons (`run.engineVersion===2` gate) | hidden if live |
| none | empty state + latest-run link | create, sync | shown |

Create only when `!runs.some(r => r.periodKey===periodKey && r.status!=="REVERSED")` (visibility; server still refuses duplicates). `pick` falls back to the newest REVERSED run of the period. Run list drops `engineVersion: 2` (read only; `previewPayrollRunV2` handles v1). Every other visibility rule unchanged.
`periodLabel(key, locale)` in new `src/lib/modules/hr/period-label.ts`: th "ก.ย. 2569" (BE, `hr.self.m.m*` as `self-ui.tsx:1007`), en "Sep 2026" (CE); long form for titles. Status via `hr.run2.st_*`. `hr.run2.title` → "รอบจ่ายเงินเดือน"/"Pay run"; no "(เครื่องรุ่นใหม่)"/"new engine" visible. No raw enum on th.
13b (`reports-ui.tsx`, display only): status cell → `hr.run2.st_*`; hide `engine` column on screen (CSV keeps it; `reports-rules.ts:94` frozen); net column `sticky right-0` inside the scroller :134.

## 6. 390 / 1024
390: stepper "2/5 · review"; net hero full width, other tiles 2-col; table = name (+status chip) · net (`hidden md:table-cell`, one table, no duplicate testids); drop `min-w-[560px]`; name = 44 px link to drawer. Sticky bar = state's primary form only (approve); pay/reverse/doc links in flow; all controls ≥44 px. 1024: hide days · OT · WHT; no scroller.

## 7. Builder constraints
- Keep every testid; `hr-run2-*` stay written in `payroll-run-ui.tsx` (h3.4-lib S1.9; TESTIDS h3.4:44). `hr-run2-lines-*` moves to the row-name link → inventory `kind: link`, `expect: navigate ?emp=`. New ids + rows: `hr-pay-view-*`, `hr-run2-banner`, `hr-run2-drawer`, `hr-run2-excluded` (on note :153 — walker 11a PB `limitedNote` matched `*excluded*` only via bank/filing cards, which leave the run view), `hr-run2-doclink-*`; 13b ids need hr.report parity + rows (h3.9 S1.9).
- `PAY_SCOPE_EXCLUDED_TEXT` stays in payroll-ui.tsx and payroll-run-ui.tsx (priv-2 S2); `YTD_OPENING` + `#hr-ytd-card` in payroll-run-ui.tsx; page keeps importing `payroll-run-ui`, `work-entries-ui`, `stock-charge-ui`, `payroll-opening-ui` outside comments (h3.4, h3.1, h4.6 S14, h3.4-ytd-lib).
- Visible strings via `src/messages/{th,en}/common.json` (hr.run2 parity checked); legacy literals = VIS-5e (Q5). Tokens only (no hex/emoji/bg-blue).
- No client money math; no new `"use client"` file (URL-driven). Else fitness F16.1 (`fitness-hr.mts:98`); never bank account.
- Privacy props unchanged: `allBranches`/`isAllBranches(scope)`, `inPay`/`payScopeEmployeeIds`, `run.scope`, `run.excludedHeadcount`, `canMoney`/`canMgr`, `act` nulling. `?emp` only from `pv.rows`.
- Untouched: `payroll.ts` (PAY_ROW_KEYS exact, h3.4:42), `payroll-run-rules.ts` (sha), `privacy*.ts`, `bank-files/**`, `filings/**`, `reports*.ts`, `src/lib/core/**`, prisma, `*actions.ts`. New pure reads (Q1–Q2) in new `src/lib/modules/hr/pay-run-view.ts` (server, no writes).
- Statics that trip (BASE = merge-base with session/hr): h4.3-lib S1.6 (hrFrozen `payroll*|payslip*|reports*`); priv-2 S5 (page.tsx + new files outside MARKED; MARKED files need "HR PRIV-2" hunks; `unmarkedHunks` "removes-other" when moved lines carry `HR H3.4…`); priv-2 S4 / h4.3-lib for oracle edits. Older h3.x/money-2/hf-sso frozen checks are base-aware (n/a in base) — builder confirms by running them. Acceptance = controller ORACLE-EDIT `VIS5A_ALLOW` (as M2_ALLOW/P2_ALLOW/H49_ALLOW): page.tsx, payroll-ui.tsx, payroll-run-ui.tsx, reports-ui.tsx, period-label.ts, pay-run-view.ts, messages th/en, inventory, walk matrix; each accepted only if every hunk adds a line with `HR VIS-5a` (new file: marker in first 3 lines); oracle hunks marked `ORACLE-EDIT (HR VIS-5a · controller)`.

## 8. Acceptance
(a) Walker re-shoots 11a, 11b, x1–x4, 13b + one state per new view (O/P/PB/M) at 3 sizes × th/en; controller compares MOCKUP|RENDER. Above fold — 1440: title, nav, stepper, both tile rows, table header ≤ y 1000; 1024: title, stepper, tile row 1; 390: title, banner, step, net tile, sticky primary. x1/x2 no create; x3 REVERSED banner + table; x4 v1 banner + table + right title.
(b) Run view at 1440, 14 people, DRAFT, no drawer ≤ 2,300 px (today 15,920); 390 ≤ 3,000 px.
(c) Clean: HSCROLL-PAGE, HSCROLL-EL (13b table declared), EN-THAI from UI strings, TH-RAW-ENUM, TAP-44 on primaries at 390; PB has `hr-run2-excluded`; managers no ฿.
(d) Green: qc-hr-h0.1, h0.2, h3.1, h3.3, h3.4 (+lib), h3.4-ytd (+lib), h3.5, h3.6, h3.7, h3.8, h3.9, h4.6, h4.3-lib, priv-2 (+lib), money-2 (+lib), hf-sso, qc-hf-hr-privacy, qc-payroll, qc-payroll-reverse, preprod-1(b) if merged; fitness + fitness-hr via iso.sh both modes; typecheck `ISO_MEM=14000M`.
(e) New `qc-hr-vis-5a.mts` (static/pure; controller builds + walks): `payViewOf` vectors · create guard · `?emp` filtered by `pv.rows` · no `min-w-[` on `hr-run2-table` · `periodLabel` vectors · message parity, no "new engine" text · inventory parity · no new `*Satang` arithmetic in added tsx lines (moved :191 allowed) · VIS5A_ALLOW rule.

## 9. Steps (each leaves the page working)
1. Views + move: page.tsx, payroll-ui.tsx (`parts`), payroll-run-ui.tsx (ytd link), messages, inventory, matrix.
2. Run screen: payroll-run-ui.tsx (header, stepper, tiles, columns, totals, status, drawer, bar, JV wording, review collapse, responsive columns), `pay-run-view.ts` (Q1/Q2), messages.
3. States + labels + 13b: payroll-run-ui.tsx (create guard, REVERSED pick, v1 list + gate, banners), `period-label.ts`, `hr.run2` labels, reports-ui.tsx, messages, inventory.

## QUESTIONS FOR THE CONTROLLER
- Q1 OT/commission split (tiles, OT col, drawer in/out totals, base total)? **Default: server Σ of stored `lines[].amountSatang` by code in `pay-run-view.ts`, shown only where it reconciles with `addSatang`, else "—"** — parity without new pricing.
- Q2 Worked-days column from HrWorkDay? **Default yes** — not money, same table and scope the loader reads.
- Q3 JV callout amounts? **Default no — wording + step 5 only**; limited viewers must not see whole-run JV, H3.7 owns it.
- Q4 Landing = current month or latest run? **Default current month + latest-run link** — `period` drives create/sync.
- Q5 Translate legacy Thai inside moved parts? **Default no (VIS-5e)** — keeps this diff to layout.
- Q6 13b hide engine column on screen? **Default yes** — internal label; CSV unchanged.
- Q7 Builder adds walk-matrix states for new views? **Default yes** — else inventory missingRequired grows.

## NOT IN THIS TICKET (owner list)
Bulk slips PDF · per-line formula text + POS bill numbers · calc history · vs last month · employer SSO per person (Run2PayRow frozen) · masked bank account (sensitive) · step dates/approver · "last pulled" time · equation line + shop labour cost · law effective-date line.
