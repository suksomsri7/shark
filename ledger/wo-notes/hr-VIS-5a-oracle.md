# HR VIS-5a — oracle notes (tests first)

Suite `scripts/qc-hr-vis-5a.mts` + `scripts/qc-hr-vis-5a-lib.mts` (≈49 KB) · brief `ledger/hr-briefs/hr-brief-VIS-5a.md` (+ CONTROLLER RULINGS Q1–Q7) · review `hr-H5.1-visual-review-r1.md` (11a 11b x1–x4 13b).
Base = merge-base(HEAD, local `session/hr`) (env `QC_VIS5A_BASE` overrides; fallback 09713f430).

Run (lane 3 only):
`bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-vis-5a.mts` · `--list` prints the registry.
Without `QC_FORCE=1` the suite skips until `payroll-run-ui.tsx` or the page carries `HR VIS-5a`.

## Method
- Statics: diff vs base, `changedFiles` (tracked + untracked, so `.mts` drafts count) as in priv-2 S4/S5 after its fix. `ledger/` and `scratchpad/` are ignored.
- Pure: `payViewOf` (from `pay-run-view.ts`) and `periodLabel` (from `period-label.ts`) tested against vectors.
- Rendered pages: the real `/hr/payroll` and `/hr/reports` page modules render with `renderToStaticMarkup` inside a Next request scope, the same way priv-2 C1 renders `PayrollSection`. The difference is that the run screen and the reports screen call `next-intl/server`, which only works under Next. The lib therefore serves `next-intl/server` through a CJS `Module._load` shim. The shim uses `use-intl` `createTranslator` with the real `src/messages/{th,en}` files (the same assembly as `src/i18n/request.ts`). The shim does not change any src module. A message key that is missing at render time fails Z1.
- Fixture: own tenant `qc-hr-vis5a-*` on the lane DB. Engine v2 is set in `AppSystem.settings.hrPayroll`. The fixture has 2 branches and 3 employees with ASCII names (Anna and Ben in U1, Cara in U2). Runs are written directly, as priv-2 does: v2 DRAFT (this month), PAID (−1) and APPROVED (−2), both with `stepsJson.finalized` so the reports can read them, REVERSED (−3), and a v1 PAID run (−4). Month −6 has no run. v2 rows carry BASE, OT and COMMISSION lines, and `addSatang` = OT + COMMISSION, so the figures reconcile (Q1). Viewers: owner, payU1 (STAFF [U1] with `hr.payroll.read`, branch-limited) and mgr (MANAGER [U1]). Cleanup: sweepTenants + cleanupFx. Z1 checks residue and outbound requests.

## Registry — forced run on base dc478e07b: BASE-EXPECTATION 38/38 (r2) · RESIDUE none
| id | sev | base | contract |
|---|---|---|---|
| S1 | C | G | payroll-rules sha; payroll-run-rules byte-identical; payroll.ts, privacy*.ts, scope.ts, bank-files/**, filings/**, reports.ts, reports-rules.ts, src/lib/core/**, prisma and every hr `*actions.ts` are unchanged |
| S2 | M | G | changed files ⊆ VIS5A_ALLOW (page.tsx, payroll-ui.tsx, payroll-run-ui.tsx, reports-ui.tsx, period-label.ts, pay-run-view.ts, messages th/en, inventory, walk matrix, this oracle). An older `scripts/qc-*.mts` may change only when every hunk adds `ORACLE-EDIT (HR VIS-5a · controller)` |
| S3 | M | G | every hunk in the 6 src files adds a line with `HR VIS-5a` and `◂`, including hunks that only remove lines. A new file needs the marker in its first 3 lines. The JSON files are exempt because JSON has no comment syntax |
| S4 | C | G | bodies hashed = base: previewPayrollRunV2, listRuns, listSalaryProfiles, listAdjustments, runExclusions, strandedAdjustments, giveBackPeriodOf, getPayrollEngine, payAccountsOfRun, getPayrollAccounting, canRunV2, hrScopeOf, isAllBranches, inPayScope, payScopeWhere, payScopeEmployeeIds, canViewPayroll, hrViewerOf, loadReport, exportReport, reportAccessOf, stockConsentByAdjustment, canReadWorkEntries, bankGateOf, filings gate, certGate, listOpeningYtd, and every `export async function` in hr `*actions.ts`. The privacy lines of payroll-run-ui (payV, mgrV, act nulling, viewer, preview call) and of payroll-ui (canViewPayroll, scope, allBranches, inPayScope, payIds, inPay, shownItems, scoped list calls) must be kept verbatim (whitespace-normalised) |
| S5 | C | G | no new `*Satang` arithmetic in added tsx lines. The multiset of added minus removed lets the moved :191 expression through only if it is moved unchanged. No new `"use client"` file |
| S6 | M | G | fitness-hr F16.1 ✅ |
| S7 | M | R | page calls `payViewOf(`; both `we=` redirects add `view=hours`; `hr-run2-ytd-link` → `?view=ytd#hr-ytd-card`; `hr-pay-view-*` exists; the page keeps importing payroll-run-ui, work-entries-ui, stock-charge-ui and payroll-opening-ui; YTD_OPENING, #hr-ytd-card and PAY_SCOPE_EXCLUDED_TEXT stay where they are |
| V1 | C | R | 47 `payViewOf` vectors: every redirect of the bank, filing, opening, stock, salary-cert and run actions; the page `we` and `back2` redirects; links and GET forms; default → run; unknown/empty/upper-case view → run; an explicit valid view wins |
| V2 | M | G | [meta] the vectors cover every param the frozen action files can emit (literal `x=` + `keep()` lists) |
| K1 | M | R | `PayrollSection({ parts: [p] })` for profiles, attendance, adjust, create and runs: the id sets are disjoint and their union = the default render |
| K2 | C | G | every base inventory testid of `/hr/payroll` (133 rows) is still in the code |
| K3 | M | G | `hr-run2-*` strings appear only in payroll-run-ui.tsx; every base hr-run2 id is kept |
| K4 | M | R | payroll-run-ui.tsx has hr-run2-banner, -drawer, -excluded (on the PAY_SCOPE_EXCLUDED_TEXT note), -doclink-*, -totals, -bar, -jv |
| K5 | M | R | exactly one `hr-run2-table`, without `min-w-[`; `md:table-cell` is used; one `<table>` |
| W1 | M | R | owner, each `?view=`: the view's own section signature only (run=hr-run2 · hours=hr-we-panel · adjust=hr-stock · profiles=hr-salary-ot-rate · docs=hr-bank-/hr-filing-/hr-salarycert · ytd=hr-ytd-card · history=hr-payroll-create/run-*). No id appears in 2 views. Every id of the legacy PayrollSection appears in some view. Nav `hr-pay-view-*` is on every view. Nav per viewer per CONTROLLER RULINGS r2: owner = all 7, branch-limited payroll = run+hours+adjust+profiles+history, manager = run+hours+adjust. Manager no-access notice only in the run view. Engine-1 shop: history hidden in nav, `?view=history` still renders |
| W2 | M | G | [control, r2] section roots per viewer (owner / payU1 / mgr: ids hr-run2, hr-we-panel, hr-stock, hr-stock-form, hr-bank-, hr-filing-/taxcert-, hr-salarycert, hr-ytd-card + PayrollSection titles profiles/attendance/adjust/create/runs + no-access notice) — union over the viewer's nav views = `BASE_ROOTS` recorded from base (nothing gained, nothing lost) |
| R0 | m | G | [control] month without a run: create shown, no run buttons |
| R1 | M | R | APPROVED, PAID and DRAFT months: no `hr-run2-create`; table shown |
| R2 | M | R | REVERSED month: `hr-run2-banner` (text has st_REVERSED or "กลับรายการ"), table, create; no approve/pay/reverse/rebuild/branch |
| R3 | M | R | v1 month: banner with a `view=history` link; table; no v2 run buttons and no create (sync allowed) |
| R4 | M | R | run section text, th and en: `periodLabel` of the APPROVED month; no ISO `YYYY-MM`; no "เครื่องรุ่นใหม่"/"new engine"; no raw status enum |
| R5 | C | G | [privacy] limited viewer: no Cara name or amount anywhere on the page; the net shown = Σ in-scope net; note "ไม่รวม…ค่าจ้าง 1 คน" |
| R6 | M | R | `hr-run2-excluded` (holding the note) for the limited viewer only |
| R7 | C | G | [privacy] no whole-run total of any run on the limited viewer's page; `hr-run2-jv` (owner and limited) carries no amount. Vacuous on base |
| R8 | C | G | [privacy] manager run section: no ฿, no tiles |
| R9 | M | R | `?emp=<Anna>` → `hr-run2-drawer` with her name and her OT line amount; `?emp=<unknown>` → no drawer |
| R10 | C | G | [privacy] limited viewer with `?emp=<Cara>` → nothing about Cara. Vacuous on base |
| R11 | m | R | the run section shows Σ OT lines and Σ COMMISSION lines (Q1, reconciling data) |
| R12 | m | G | en run section (owner): no Thai letters (฿ is not counted as Thai) |
| P1 | M | R | `periodLabel` vectors: 2026-09 th "ก.ย. 2569", en "Sep 2026"; ม.ค. 2569; ธ.ค. 2568; Dec 2026; มิ.ย. 2569; Feb 2027 |
| B1 | M | R | 13b page, th and en: no engine header or cell, no raw "PAID" cell, `st_PAID` text shown, net `<th>` has `sticky` + `right-0` |
| B2 | C | G | [control] loadReport still returns the `engine` column and raw `PAID`; the CSV still has the engine column and PAID |
| I1 | M | G | hr.run2 th = en (msgParity); every literal `t("…")` key and `t(\`x${…}\`)` prefix in payroll-run-ui exists in th and en |
| I2 | M | R | `hr.payview.{run,hours,adjust,profiles,docs,ytd,history}` in th and en; hr.run2.title has no engine wording; the page `desc=` has no Thai literal |
| I3 | M | G | no Thai letters in the added non-comment code lines of page, run-ui, reports-ui, period-label and pay-run-view. **Q5 exemption: `payroll-ui.tsx` as a whole (moved legacy sections)** |
| T1 | M | R | [r3] run table read at 1440 and 1024 via a Tailwind display evaluator (md/xl/2xl): ≥1280 OT column shown and add excludes OT; <1280 no OT column, add = stored total with "รวม OT"; every row and the totals row: wage + add (+OT) + deduct + SSO + WHT (signed cells, WHT read from the ≥1280 view) = net; a no-OT row (Cara) has equal add in both; totals add/OT/net = Σ rows; limited viewer: same rule, in-scope rows only; hint key th+en |
| N1 | M | R | (r3 fix) code ids without a payroll row are excused only if no payroll render shows them and another page has their row (`hr-run2-engine*` → /hr/settings) · inventory rows (page `/app/sys/[id]/hr/payroll`) for the K4 ids and `hr-pay-view-*`, and for every `hr-run2-*` id in the code; `hr-run2-lines-*` has `kind: "link"` |
| N2 | m | R | walk matrix: a payroll state whose path has `view=hours|adjust|profiles|docs|ytd|history` (presence only) |
| Z1 | C | G | residue none · no outbound request · intl shim used · no missing message at render |

RED-by-design 19 · GREEN controls 20 (W2 r2 · T1 r3). On builder head e9edb3338: 38/39 pass, only T1 red. The registry is honest: R7 and R10 are GREEN on base only because the elements do not exist yet. They stay meaningful after the build.

## Names the oracle pins (the brief left them open)
- `payViewOf` must be **exported from `pay-run-view.ts`**. A Next page file cannot export extra names, so "in page" is not testable.
- The `PayrollSection` prop is `parts?: ("profiles"|"attendance"|"adjust"|"create"|"runs")[]` (an array).
- Nav ids are `hr-pay-view-<view>`.
- Totals row = `hr-run2-totals`, sticky/action bar = `hr-run2-bar`, accounting callout = `hr-run2-jv`.
- `?emp=` is tested end to end through the page's searchParams, so the prop name is free.

## Only pictures can prove (controller walk)
Above-fold positions; page heights (≤2,300 / ≤3,000 px); HSCROLL-PAGE and HSCROLL-EL; TAP-44 sizes; the side drawer at ≥1280 versus after the table; the sticky bar at 390; which columns hide at 1024 (only `md:table-cell` and no `min-w-[` are checked); stepper and tile look and the hero tile; `<details>` review collapse; `max-w-2xl` per view; date-input format; MOCKUP|RENDER parity; EN-THAI inside the legacy sections (Q5); the other viewers' (P/PB/M) look per view.

## Older statics the builder needs explicit-allowlist ORACLE-EDITs for (controller, `VIS5A_ALLOW`)
These come from brief §7. They were not re-run here; the builder confirms them by running each one.
- h4.3-lib S1.6: hrFrozen `payroll*|payslip*|reports*` trips on payroll-ui, payroll-run-ui, reports-ui and the new files.
- priv-2 S5: page.tsx and new files are outside MARKED; payroll-ui, run-ui and reports-ui are MARKED, so they need "HR PRIV-2" hunks; moved lines carrying `HR H3.4…` give "removes-other". S4 needs to accept the oracle edits themselves.
- h3.4-lib S1.9: ids stay in run-ui. Recheck the TESTIDS and inventory `wo:"H3.4"` row count if `hr-run2-lines-*` changes kind.
- h3.9 S1.9 (13b ids and hr.report parity), h3.3, h3.6, h3.7 and h3.8 frozen lists, money-2 and preprod-1 statics, hf-sso, h4.6 S14, h3.1 and h3.4-ytd-lib (page imports, YTD_OPENING): mostly base-aware per the brief. Run each one.

## Doubts about the brief
1. The VIS5A marker rule cannot apply to JSON. Messages, inventory and matrix are exempt from it here.
2. Under the strict reading, a removal-only hunk (the old location of moved code) also needs an added marker line. That forces marker comments at the old sites.
3. §8(e) says "static/pure". This suite also renders the pages through an intl shim, a new technique under the established `renderToStaticMarkup` method. The controller should accept or reject the shim.
4. Sync on REVERSED and v1 months is allowed: §5 does not say whether it is hidden.
5. ~~manager adjust hidden~~ — superseded by CONTROLLER RULINGS r2 (manager sees adjust).
6. Q2 (worked-days column) has no figure check, only the picture.
