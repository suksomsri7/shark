# POS P2.12U — builder notes (reports UI: print page/PDF · hourly · branches · anomalies · staff flag · thresholds card · bills 12)

Builder · account B · 15–16 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.12u` from `origin/session/pos` 91a28635 (= 1c29ca9e + ledger; code = P2.12 S merged d0561566) · merged `origin/session/pos` 3ece536c (ledger only, P2.13 not merged yet).
Contract: `pos-prompt-accountB-P2.12U.md` rulings 1–10 · `wo-notes/pos-P2.12.md` §"U-card contract" + "Fix round 1" deltas · spec `pos-briefs/pos-spec-P2.12-reports-ui.md`.
**No server behaviour change**: no edit to `reports.ts`, `report-overview.ts`, `report-actions.ts`, `bills*.ts`, `settings-*.ts`, `permissions.ts`, `prisma/`, any `qc-*.mts` except the authz test row; one marked F5 hunk in `report-print-shared.ts`. No P2.13 lane file (`pos/api/**`, `api-keys/scopes.ts`, `ai/skills.ts`, `catalog.ts`, `register.ts`/`shift.ts`, `SharkSettings.tsx`, `/developers/pos`) touched.

## Commits (one per step)
| step | commit | files |
|---|---|---|
| test (R1 authz, test-first) | e1d6a286 | `scripts/qc-hf-pos-page-authz.mts` RP-1 (81 → 82) |
| 1 print page + PDF button | 6632a486 | `reports/print/{page,PrintFrame}.tsx` · `ReportsClient.tsx` · messages · inventory |
| 2 hourly chart + tab | bff02405 | `ReportsOverview.tsx` · `ReportsClient.tsx` · `reports/page.tsx` · messages · inventory |
| 3 branches tab | 840c96a6 | `ReportsClient.tsx` · messages |
| 4 anomalies tab + staff flag + F5 | bed1d2fa | `ReportsClient.tsx` · `ReportsOverview.tsx` · `reports/page.tsx` · `report-print-shared.ts` (F5 hunk) · messages · inventory |
| 5 settings thresholds card | ead768cb | `settings/GeneralSettings.tsx` · messages · inventory |
| 6 bills 12 | 0a734092 | `sales/{page,BillsClient}.tsx` · messages · inventory |
| 7 visual states | 1e8c8c6a | `scripts/visual-pos.mts` |
| 7 spec | 64439301 | `pos-briefs/pos-spec-P2.12-reports-ui.md` |
| 8 merge origin/session/pos 3ece536c (ledger only) | 94800926 | `POS-RESUME.md` |
| polish after gates | 66780c71 | `ReportsOverview.tsx` (hourly value label inward, no 390 overflow) · `visual-pos.mts` (forecast boxes by `data-forecast`) |

## Components / files
- NEW `src/app/app/sys/[id]/pos/reports/print/page.tsx` (server print page, gate, overview composite) · NEW `print/PrintFrame.tsx` (client island: A4 iframe srcdoc, font adoption, one-shot `print()`).
- `reports/page.tsx` (+ `HOURLY_MAX_DAYS`, `posDayCutoffMinutes`, `canAnomaly`, `discountFlagBp` from `posAnomalyThresholds`) · `reports/ReportsClient.tsx` (PDF link, tabs branches/hourly/anomalies, `AnomalyBody`, hourly/branches tables, denied card) · `reports/ReportsOverview.tsx` (`HourlyBars`, hourly card, `only` always, A3 flag).
- `settings/GeneralSettings.tsx` (card "รายงาน: จุดสังเกตผิดปกติ") · `sales/page.tsx` + `sales/BillsClient.tsx` (all branches, chips, channel counts, refund-aware drawer lines, day note).
- `src/lib/modules/pos/report-print-shared.ts` — F5 EN label hunk only · `scripts/qc-hf-pos-page-authz.mts` (RP-1) · `scripts/visual-pos.mts` (wo p2.12u) · `scripts/pos-ui-inventory.json` (+10 rows → 942) · messages th/en.

## Message keys (th Thai · en ASCII)
`pos.report.print.{back,overviewTitle}` · `pos.report.hourly.{peak,inProgress,forecastNote,foldNote,cols.{hour,bills,net,forecast}}` · `pos.report.branches.cols.{refunds,refundTotal,cash,platform,commission,commissionVat}` · `pos.report.anomaly.{cols.{unit,date,staff,value,count,ref},short,over,or,threshold,groupCount,wholeRange,unnamed,viewBill}` · `pos.settings.general.anomaly.{enabledHint,namesNote,or,field.{count,satang,bp},countUnit.{A1,A2,A5,A6,A7,A9,A10},hint.A1..A10,err.{count,satang,bp}}` · `pos.bills.{unitAll,dayNote,channelCounts}` · `pos.channel.commissionBlock.{refunded,commissionNet,vatNet,netAfterRefund}` · changed values: `pos.report.overview.comingSoon` (hourly removed) · `pos.report.overview.highDiscountHint` (now `{pct}` = shop A3).
Used from S (unchanged): `pos.report.kinds.{branches,hourly,anomalies}` · `pos.report.hourly.{title,forecast,now,tooLong}` · `pos.report.branches.{title,total}` · `pos.report.anomaly.{title,empty,denied,rules.*}` · `pos.report.print.{button,generatedAt}` · `pos.settings.general.anomaly.{title,enabled}` · `pos.sales.branch.chipLabel`.

## testids
Interactive (inventory rows, wo P2.12U): `pos-reports-pdf` · `pos-reports-tab-*` (branches/hourly/anomalies) · `pos-reports-anomaly-bill-*` · `pos-report-print-back` · `pos-report-print-again` · `pos-settings-anomaly-enabled` · `pos-settings-anomaly-*-*` (rule-field) · `pos-settings-general-save-anomaly` · `pos-sales-unit-all`.
Non-interactive: `pos-reports-hourly-chart` · `pos-reports-hourly-now` · `pos-reports-hourly-footnote` · `pos-reports-anomalies` · `pos-reports-anomaly-group-<rule>` · `pos-reports-anomaly-row-<n>` (n = 0-based row index of the report) · `pos-reports-anomaly-notice` · `pos-reports-anomaly-denied` · `pos-report-print-page|toolbar|frame|title|generated|refusal` · `pos-settings-general-anomaly` · `pos-settings-anomaly-note` · `pos-sales-unitChip-<saleId>` (`-m` on the 390 card) · `pos-sales-channelCounts` · `pos-sales-channelCount-<code>` · `pos-bills-drawer-channel-refund` · `pos-bills-day-note`.

## Decisions / deviations (ruling each touches)
1. **R1 — rendering = iframe `srcdoc`** (not a route response): the page keeps the normal session gate + refusal card, and printing the iframe prints only the A4 document (no app chrome). The S document asks for "IBM Plex Sans Thai", which next/font exposes under a hashed family in the parent only ⇒ `PrintFrame` copies the parent's `@font-face` rules + body font-family into the iframe and paints the paper white; no change to the S HTML bytes the action returns.
2. **R1 — overview PDF** = one document of the S print bodies (daily · hourly when single day · branches when all units and ≥ 2 readable · channels · payments · staff), sliced with `indexOf` (F16 forbids tag regex), landscape when any part is. It is not the "one A4 summary with KPI tiles" of brief §4 (S follow-up "overview print summary = U/CD") — that layout stays a follow-up.
3. **R2 / decision 6 — reading of "multi-unit overview sends only without hourly"**: the overview now always sends an explicit `only`; `hourly` only on single-day ranges (whatever the unit count), `chart` only on multi-day, `branches` only with ≥ 2 readable units ⇒ a multi-day / multi-unit load never computes hourly. If the controller meant "never hourly for ≥ 2 units", it is a one-condition change in `fetchOverview`.
4. **R2 — tooLong copy** = the S key `pos.report.hourly.tooLong` ("รายงานรายชั่วโมงเลือกได้ไม่เกิน 31 วัน"), not a new key with the prompt's wording.
5. **R3 — branches tab only for actors who read ≥ 2 units** (a single-unit actor has nothing to compare; URL access still works).
6. **R4 F5 — deviation taken**: `renderReportPrintHtml` emitted Thai rule labels, "หรือ" and "ขาด/เกิน" under `locale:"en"` ⇒ one marked hunk in `report-print-shared.ts` (`ANOMALY_LABEL_EN` + `enAnomalyRow`, en anomalies rows only; th rows = CSV unchanged; PD1 en checks are title/count only — green).
7. **R5 — flag shown only for real users** (`userId !== null`, as the A3 reader) and hidden when `anomaly.enabled = false` (prop null).
8. **R6 — card rendered only for editors** (owner / `pos.settings.manage`), not as a read-only card for others (thresholds are a manager tool; the visual state is owner-only).
9. **R7 — single-unit "หน้าร้าน N · ออนไลน์ M" unchanged** (still the two extra reads); all-branch mode uses `channelCounts` (STORE ids differ per unit). `?bill=` in all mode resolves the bill's unit server-side (+1 `posSale.findFirst` inside the page scope). The sales-channel filter in all mode lists the STORE row of each unit separately (ids are per unit) — follow-up.
10. **R9 — tab testids**: existing tabs keep `pos-report-kind-<k>`; the three new tabs use `pos-reports-tab-<k>` as ruled (two patterns in one tablist).
11. **R8 — visual**: LOCALE=en runs are 1440 only (harness rule); print states 1440 only. Fixture moves `createdAt/paidAt` of its own bills (hourly peak + 4-week forecast) by a direct `posSale.update` (precedent: qc-pos-p2.12 fixture moves); thresholds lowered through `updatePosGeneralSettings` and restored in cleanup (residue of a killed run = the fixture's exact four values ⇒ restored to defaults).
12. **R1 authz** — `qc-hf-pos-page-authz` +1 static row **RP-1** (test commit e1d6a286, marker `ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12U มติ 1 · CD-3 …)`); red-before = static run on a HEAD archive without the page: 11/12, RP-1 red (`runs/authz-red-static.log`) → green 12/12 static (`runs/authz-green-static.log`).

## Visual fixtures (`ensureP212uFixture` / `cleanupP212u`, per-day keys `posqc-vis-p212u-<n>-<date>`, bills kept like sale-done)
hourly: 2 bills today moved to 09:10/09:40 (when past 10:00 — peak) + 1 bill now + 12 bills moved to the same weekday 1–4 weeks back at 08/09/12 h (forecast) · branches: 1 bill today at the second unit (skipped with a reason when it cannot sell) · anomalies: 2 bills → `voidSale` by the owner (A1) · LINE MAN bill (P2.1U channel) → `refundSale` 1 cup PLATFORM (A2 + refund-aware drawer; the job path gets `&bill=<id>`) · 40 % bill discount (A4) · thresholds A1 2 · A2 1 · A3 0.1 % (staff flag) · A4 20 % via `updatePosGeneralSettings` (owner), restored after the last P2.12U job / finally / signal.

## `--state` list for the controller (wo `p2.12u`, `--states`, th + `LOCALE=en`)
- owner: `reports-hourly,reports-branches-tab,reports-anomalies,reports-anomalies-empty,reports-staff-flag,reports-pdf-button,reports-print-overview,reports-print-channels,settings-general-anomaly,bills-all-branches,bills-drawer-channel-refund`
- cashier: `reports-anomalies,bills-all-branches,bills-drawer-channel-refund`
- Pages default to reports + sales + settings (no `--page`). Print states 1440 only; en = 1440.

## Follow-ups
- CONTROLLER-RUN: real PDF probe of `/pos/reports/print` (Chrome print / `page.pdf` → `pdftotext` Thai shop/kind/total; adopted font) — not machine-checked here (no server).
- Overview one-A4 summary with KPI tiles (brief §4) — still a design follow-up (composite document today).
- Bills single-unit channel split via `channelCounts` (drop the 2 extra reads) · all-branch sales-channel filter shows one STORE per unit.
- `qc-hf-fu` ST1 lists `BillsClient.tsx` and `visual-pos.mts` as never-touch for HF-FU — not in this card's gate set; if the controller re-runs it as a merge gate it pins HF-FU's own diff, not this card.
- S follow-ups unchanged: F4 (A5 PosTableSplit) · G1/G2 (member subtraction / pre-P1.12 bills) · H5 (bills day vs cut-off — footnoted on 12).

## Gates
Logs under `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p212u/runs/` (line 1 = tree/head/dirty). Full set at **94800926** (= code of steps 1–8); after the polish commit **66780c71** the static/ST7 suite, fitness and dry runs were re-run (g2).

| gate | result | log |
|---|---|---|
| typecheck (pos lock, 5632 MB) — run 1 at 0a734092 (steps 1–6) · run 2 at 94800926 | exit 0 · exit 0 | `typecheck-1.log` · `typecheck-2.log` |
| qc-pos-p2.12 unforced | **33/33** | `g1-qc-pos-p2.12.log` |
| qc-pos-p1.17 · p2.11 · p1.16 · p2.1 · p1.12 · p1.3 | 40 · 34 · 28 · 55 · 72 · 128 (all green) | `g1-qc-pos-<suite>.log` |
| qc-pos-p1.18 (ST7 U-phase = 0 Thai literals) | 81/81 (94800926) · 81/81 (66780c71) | `g1-qc-pos-p1.18.log` · `g2-qc-pos-p1.18.log` |
| qc-hf-pos-page-authz | **82/82** (+1 RP-1) | `g1-qc-hf-pos-page-authz.log` · red-before `authz-red-static.log` |
| fitness no-env · env (qc4) · fitness-pos (F15.3 inventory 942 rows) | 50/50 · 50/50 · 8/8 (both heads) | `g1-fitness-*.log` · `g2-fitness-*.log` |
| visual-pos p2.12u --states --dry (iso, CI=1 on --dry only) th/en × owner/cashier | rc 0 ×4 (shots 29 / 9 / 11 / 3) both heads | `g1-dry-*.log` · `g2-dry-*.log` |
No existing pin turned red ⇒ no CONTROLLER-DECISION. No build, no server, no QC5 run (images = CONTROLLER-RUN with the --state list above).

## Fix round 1 (R1 rulings 1–6 + controller vis84 F6/F7 · 15 Oct · base 6b422dfe)
Commits (explicit paths, hunks marked `// POS P2.12U ▸ fix1 … ◂`):
- **772f7f13 F1 (ruling 1, harness)** — `visual-pos.mts --pdf`: reads the print iframe after `document.fonts.ready` (`frame.evaluate("<!doctype html>" + outerHTML)`), `setContent` in a fresh page with `<base href="<origin>/">` (networkidle0 + fonts.ready), then `page.pdf({format:"A4", printBackground:true, preferCSSPageSize:true})`; same file names `<state>-<user>-<locale>.pdf`; status line says `PDF (เอกสาร iframe)`. The parent page is no longer printed.
- **8f7667bc F3 (ruling 2)** — `BillsClient.tsx`: `pos-bills-channel-filter` not rendered in all-branches mode (no dedupe; the unit switch is a full navigation, so no stale `salesChannelId` survives); inventory note updated.
- **c25d6cbb F4 (ruling 3)** — `ReportsClient.tsx`: when the hourly tab is disabled, visible small text `pos.report.hourly.tooLong` under the tablist (`pos-reports-hourly-off`, `--color-muted`, same style as `rangeHint`) + `aria-describedby` on the tab (title kept).
- **85639c6a F2 (ruling 4)** — A3 hint softened: th "(ใช้เกณฑ์เดียวกับป้ายในการ์ดพนักงานโดยประมาณ)", en "(the staff card flag uses the same % as an approximate guide)"; the staff-flag comment in `ReportsOverview.tsx` now states the base difference. No S change.
- **1b7051ab F6 (controller, vis84 390 overflow)** — root cause: the `sr-only` span (position absolute) in the last anomaly header cell had its containing block outside the `overflow-x-auto` box, so it was not clipped and pushed `html` to 583 px; the harness then named the rightmost element (the anomalies tab, which itself sits inside the scrolling strip). Fix: `relative` on the anomaly table scroller and on the shared `Table` scroller (branches/hourly/all kinds), `min-w-0` on the anomalies body, and the kind strip = its own scroller (`relative`, scrollbar hidden via the repo's `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`, buttons stay 44 px). Proof without a server: headless Chromium on a static copy of the structure at 390 → scrollWidth 505 without `relative`, 390 with it (`runs/fix1/srtest.cjs`).
- **55141a92 F7 (controller, vis84 16× 404 on the print page)** — root cause: `PrintFrame.adoptFonts` copied Next's `@font-face` rules whose `src: url(../media/*.woff2)` is relative to the CSS chunk (`/_next/static/chunks/*.css`, 17 faces in the build); inside `srcdoc` they resolved against the page URL (`/app/sys/…/pos/reports/print`) → 404. Fix: every `url()` is made absolute with the stylesheet's `href` (inline sheets: `document.baseURI`); `data:`/absolute URLs untouched. The server HTML has no other relative resources (no `href=`/`src=`/`url(` in `report-print-shared.ts`). Harness: a "Failed to load resource" console line now ends with `@ <url>`, and a failing status line adds the first 4xx response (`· 4xx N: HTTP 404 <path>`).
- **F5 (ruling 5, note only)** — QC-only residue: if a p2.12u run dies by SIGKILL/OOM (SIGINT/TERM/HUP and `finally` restore), thresholds stay at the fixture values A1 2 · A2 1 · A3 0.1 % · A4 20 % enabled until the next **owner** p2.12u run, which recognises the fingerprint and restores **defaults** — a non-default original (or `enabled:false`) on the QC shop is lost. Fixture bills are permanent by design.

Follow-ups added:
- HF-FU2/P2.14 (S): expose a per-staff-row A3 flag (or the staff-controllable discount) so the overview staff card uses A3's base, not Σ `PosSale.discountSatang`.
- Ctrl+P / browser-menu print on the parent print page still prints the app shell — route-response variant (`text/html` + in-document `print()`) = owner/controller decision.
- Per-code sales-channel filter for all-branches bills (S: filter by channel code across units).

Gates (logs `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p212u/runs/fix1/`, line 1 = tree/head/dirty; all at **55141a92**, dirty 0; `summary.txt`):

| gate | result | log |
|---|---|---|
| typecheck — changed-files tsc (non-incremental) OOM at 5632 MB ⇒ 1 incremental `pnpm typecheck` (pos lock) | exit 0 | `tsc-changed.log` (abort) · `typecheck.log` |
| qc-pos-p1.18 (ST7 = 0 Thai literals) | 81/81 | `qc-pos-p1.18.log` |
| qc-pos-p1.16 | 28/28 | `qc-pos-p1.16.log` |
| qc-hf-pos-page-authz | 82/82 | `qc-hf-pos-page-authz.log` |
| fitness no-env · env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 | `fitness-*.log` |
| visual-pos p2.12u --states --dry th/en × owner/cashier (CI=1 on --dry only) | rc 0 ×4 (29 / 9 / 11 / 3 shots) | `dry-*.log` |
An earlier gate run at 85639c6a was stopped before its first result to take F6/F7 (`summary-aborted-85639c6a.txt`). `origin/session/pos` = 3ece536c, unchanged (no merge needed).
Controller re-run: vis85 `--pdf` on `reports-print-overview,reports-print-channels` (expect 0 console errors; PDF from the iframe document) + `reports-anomalies` at 390 (expect no overflow) + `bills-all-branches` (no channel filter in all mode) + reports at a > 31-day range (hourly-off text).
