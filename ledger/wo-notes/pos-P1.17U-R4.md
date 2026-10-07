# POS P1.17U R4 — parity with mockup 08 (reports overview = dashboard) · builder notes

Builder · account B lane 2 · worktree `/root/projects/shark-pos-c` · branch `wip/pos-p1.17u-r4` from `origin/session/pos` a300db53.
Brief `ledger/pos-briefs/pos-brief-P1.17U-R4-PARITY.md` + controller verdicts R5/R6. `reports.ts` untouched (read-only). R6 adds one server action (`posReportOverviewAction`, controller-allowed) + `src/lib/modules/pos/report-overview.ts`.

## Status
- done: overview dashboard + keys + page default + inventory rows (17de4550) · chart label fix (56694a98) · all gates green on 56694a98 (below)
- R5 (controller verdict on R4 Q1–Q3): products call removed — top 5 + margin % from the `reportMargin` rows (limit 5; same keys/order/revenue as products) · daily chart = always the last 14 days ending at `to` (+1 daily call, reused when from = to−13), 14 slots (missing day = 0 bar), `to` bar black, value on max + last bar, line `overview.chartRange` "14 วันล่าสุด ถึง <date>" under the chart · keys: +`chartRange`, `legendLast` → "วันสุดท้าย"/"Last day" · same-time-window comparison accepted as whole-day (follow-up below)
- R6 (reviewer MERGEABLE-AFTER-FIXES + visual V1–V4): see §R6 below
- next: CONTROLLER-RUN — build + shoot 1440/1024/390/EN again (`REPORT_QUERY=kind=overview&from=2026-10-04&to=2026-10-04`, + a range and EN)

## What changed
- `page.tsx`: default view = `kind=overview` (no kind / unknown kind / `?kind=overview`); overview default range = today..today (BKK), table kinds keep "last 7 days"; wrapper `max-w-4xl` → `max-w-7xl` (dashboard width, same as CRM v2 home).
- `ReportsClient.tsx`: header row like 08 for every kind — h2 title ("ภาพรวมการขาย" on overview, "รายงานขาย" otherwise) · date-range box (calendar icon + from – to, same testids `pos-report-from/to`) · branch box (shop icon + select `pos-report-unit`) · info line `pos-report-ov-info` "ข้อมูลถึง HH:mm · เทียบกับ <prev range>" (overview only) · "ส่งออก CSV" (`pos-report-csv`, upload icon, right; overview exports `daily`). Kind tabs = overview first + the 7 (tables/ReportBody unchanged from R3). `rangeHint` line kept for table kinds only.
- `ReportsOverview.tsx` (new, client): mockup 08 top → bottom
  1. KPI row (5 cards, R6: `grid-cols-1 sm:2 lg:3 xl:5`, value `text-2xl xl:text-[28px]`, no truncate): ยอดขายสุทธิ (+▲/▼ % vs previous range, "—" if prev = 0) · บิล (+▲/▼ n บิล) · เฉลี่ยต่อบิล ("เมื่อวาน/ช่วงก่อน ฿x") · กำไรขั้นต้น `grossMarginBp` ("มีต้นทุน x% ของยอด" = costedRevenue/revenue, else "— ยังไม่มีต้นทุน") · บิลยกเลิก (count + "ยอด ฿x"). "เทียบเมื่อวาน" only when the range is today alone; otherwise "เทียบช่วงก่อน". Muted line `overview.comingSoon` under the row.
  2. Chart "ยอดขายรายวัน" (`pos-report-ov-chart`): y-axis 0 / ½ / top (top = range max rounded up to 1·2·2.5·5×10ⁿ baht — scale only), dashed grid, grey bars (token mix ink 17 % on surface), last day black, value on the max bar and the last bar, x label every day ≤ 14 (month on first/1st), else first/middle/last; bars ≤ 64px centred; > 14 bars scroll inside the card on phones. Legend ยอดจริง · วันนี้ (วันสุดท้ายของช่วง when `to` ≠ today).
  3. "เปรียบเทียบสาขา" (`pos-report-ov-branches`) only when the page lists ≥ 2 permitted units: selected unit first + "(ที่เลือก)" + highlighted row, ≤ 8 units ("แสดง x จาก y สาขา" when capped), columns สาขา · ยอด · บิล · เฉลี่ย · กำไร; last row "รวมทุกสาขา" = all-units totals (server scope, may include archived units).
  4. "สินค้าขายดี" top 5 — R5: rows of `reportMargin` (limit 5; same keys/order/revenue as `reportProducts`, proven by OV1) with their own margin % ("—" uncosted) · "ดูทั้งหมด" → `kind=products`.
  5. "วิธีชำระ": label · bar amount/totalPaid · % · amount; "ทิป ฿x" only when > 0.
  6. "พนักงาน" top 5 rows: avatar initial (skips leading Thai vowels, as 08) · ชื่อ (`unknownSeller` for null) · บิล · ยอด · ส่วนลดที่ให้ · ยกเลิก · หมายเหตุ = "ส่วนลดสูงผิดปกติ" chip only if discount > 15 % of net (title = on-screen hint) · "ดูทั้งหมด" → `kind=staff`. Staff card is full width (the AI card next to it in 08 is left out).
  - R6: one `posReportOverviewAction` call per load (debounced 300 ms on date/branch change, first load immediate, stale results dropped by sequence); each section refuses on its own; card retry `pos-report-ov-retry-<card>` reloads only that card's section(s) (`only: [...]`) and replaces just those.
- Left out (no data, not faked): hourly (P2.12) · channels (P2.11) · members KPI (P1.12) · AI assistant (P3) · PDF (P2) · 08's footnotes under branch/payment cards (they are AI/derived prose).
- Calls per overview load — R6: **1 server action from the client** (`posReportOverviewAction`). Server side, in parallel: daily · prev range · margin (limit 5) · payments · staff · chart (14 days to `to`; reuses daily when the range is exactly those days) + per branch (≤ 8, only when ≥ 2 visible) daily + margin (limit 1) + all-branches daily + margin (reused from the main calls when no branch is selected). R4 was 6 + 2×units client calls, R5 5 + 1 + 2×units — all serialized by Next's client dispatcher (reviewer F1).

## R6 (reviewer MERGEABLE-AFTER-FIXES F1–F7 + controller visual V1–V4)
- F1 server: `src/lib/modules/pos/report-overview.ts` `reportOverview(ctx, actor, {from, to, only?}, client?)` — runs the existing report functions with `Promise.all` (no new numbers; scope/permission/range checks stay inside each function = same as `posReportAction`). Each section returns `{ok:true, data} | {ok:false, code}`; a throw in one section = `INTERNAL` for that section only. Whole-call `VALIDATION` only for a malformed range / `from > to` / unknown or empty `only`. Branch list = POS-linked, non-archived units the actor can access with `pos.report.view` (same set as the page's branch select), selected first, ≤ 8. `report-actions.ts` + `posReportOverviewAction({systemId, unitId?, from, to, only?})` (same session → ctx/actor + `assertCan(REPORT_PERMISSION)` + catch/`unstable_rethrow` as the other actions; marked `// POS P1.17U R6 ▸ … ◂`).
- F1 oracle (controller-ordered edit of `scripts/qc-pos-p1.17.mts`): +ST7 (static: action calls `reportOverview` + catch + REPORT_PERMISSION; module read-only, no VAT math) · OV1 (owner overview = each original report: daily/prev/payments/staff/chart whole report, margin totals, top-5 margin rows = top-5 products rows, branch rows = per-unit totals, all-branches row) · OV2 (cashier — sale-only / no rights / real QC cashier membership — every section PERMISSION_DENIED with `ok:true` overall; u1-only staff → daily = u1, no branch rows; u1-only + unitId u2 → NOT_FOUND per section; owner + u2 → u2 first, total = all) · OV3 (93-day range → 5 sections VALIDATION while the 14-day chart is ok; `only:[payments]`; VALIDATION cases). Suite 35 → 39 checks.
- F2 retry per card = `only` of that card's sections (kpis → daily/prev/margin · chart · branches · products → margin · payments · staff); a whole-call refusal retries the whole call.
- F3 refused branch row / total row: refusal text in the first cell (danger, small) + "ลองใหม่" button under the table (`pos-report-ov-retry-branch-rows`).
- F4 KPI value `text-2xl xl:text-[28px] tabular-nums break-words` (no truncate) · grid `sm:2 lg:3 xl:5`.
- F5 x-axis: < sm only first/middle/last labels (others `hidden sm:inline`).
- F6 testids `pos-report-ov-error-<card>` / `pos-report-ov-retry-<card>` (unique per card) + inventory row pattern.
- V1/V2 chart: no scroll box for ≤ 14 bars (labels not clipped); first label/value left-aligned, last right-aligned, others centred.
- V3 branch table: `px-3`, 13px on phones, `min-w-[340px]`, chart:branches flex ratio 1.65 → 1.5 so the 5 columns fit at 1440 (th/en).
- V4 header: CSV button sits on the title row at every width (`order` + `ml-auto`); ≥ xl title · filters · status · CSV in one row with the status text `truncate` (`title` = full text); < xl filters + status drop to the next row.

## Keys added (`src/messages/{th,en}/pos.json`, `report.overview.*`, append-only)
`tab · title · dateRange · exportCsv · upToDate · compare · vsPrev · vsYesterday · billsUnit · prevAvg · yesterdayAvg · costed · noCost · voidTotal · kpi.{net,bills,avg,margin,voids} · comingSoon · chartTitle · legendActual · legendToday · legendLast · branches · selected · allBranches · branchesCap · topProducts · payMethods · pctOfTotal · tip · staff · seeAll · highDiscount · highDiscountHint · cols.{branch,sales,bills,avg,margin,product,qty,name,discount,voids,note}`

## Inventory (`scripts/pos-ui-inventory.json`)
+4 rows (wo P1.17U-R4, owner, hiddenFor cashier): `pos-report-ov-retry-*` (R6: was `pos-report-ov-retry`), `pos-report-ov-retry-branch-rows` (R6), `pos-report-ov-products-all`, `pos-report-ov-staff-all`. `pos-report-kind-overview` is covered by the existing `pos-report-kind-*` row (note updated); CSV row note says overview exports daily.

## Commands + exit codes
| command | result |
|---|---|
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` (first) | exit 1 — F15.3a: testid written via prop (`data-testid={testId}`) + CardHead/SeeAll counted as untestid controls → see-all buttons inlined with literal testids |
| same after fix | 8/8 exit 0 |
| `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | 41/41 exit 0 |
| `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` | 41/41 exit 0 |
| `qc-pos-p1.17` unforced (`bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx …`) 14:31 UTC | 35/35 exit 0 |
| `qc-hf-pos-page-authz` unforced | 56/56 exit 0 |
| `qc-pos-p1.9` unforced | 53/53 exit 0 |
| `qc-pos-p1.3` unforced | 128/128 exit 0 |
| forced (`bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh …`) `qc-pos-p1.17` | 35/35 exit 0 (Z1/Z2 QC4 restored) |
| forced `qc-hf-pos-page-authz` | 56/56 exit 0 |
| forced `qc-pos-p1.9` | 53/53 exit 0 |
| forced `qc-pos-p1.3` | 128/128 exit 0 (ended 14:51 UTC) |
| typecheck via `with-gate-lock.sh` (14:19 and 15:32 UTC) | never started — queued behind `/tmp/shark-gate.lock` (held by the CRM session since 12:38); first wrapper killed by the tool time limit, second stopped by me (own unit) on coordinator order. No result taken from either. |
| re-run after quota reset, HEAD 56694a98: `qc-pos-p1.17` unforced / forced / forced | 35/35 · 35/35 · 35/35, exit 0 ×3 (15:32–15:33 UTC) |
| re-run: `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` / `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` | 41/41 exit 0 · 41/41 exit 0 |
| re-run: `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` | 8/8 exit 0 (F15.3a / F15.3b green) |
| typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` (coordinator order: POS lock) | `tsc --noEmit` exit 0 (15:33:32 → 15:34:27 UTC) |

Residue: each suite printed its own cleanup ("ลบแล้ว …"); p1.17 Z1/Z2 green; no `.qc-shots`, no untracked files besides this note. `git diff --name-only origin/session/pos...HEAD` = 6 files, none under `src/components/pos/register/**`, `src/lib/modules/pos/register*.ts`, `reports.ts`, `report-actions.ts`, `prisma/`.

## Open questions (CONTROLLER)
1. Call budget: brief §2 says "at most 2 + 2 + (2 × units≤8)". The 6 cards need 6 base calls with the existing actions (daily, daily prev, margin, products, payments, staff), + 2 per unit, + 2 for the all-units total row when one unit is selected. Dropping the products call is possible (margin rows have the same keys/order/revenue) if the budget is strict.
2. The default view (today only) gives the daily chart a single bar — the controller's QC shot `from=2026-10-04&to=2026-10-04` will look sparse next to 08's 14 hourly bars. Option: the chart always shows the last 14 days ending at `to` (+1 daily call). Not done (brief says the chart shows the range).
3. Deltas compare with the whole previous day/range, not "the same time window" as 08 says ("ช่วงเวลาเดียวกัน") — the info line therefore says only "เทียบกับ <date>". Same-time comparison would need a server change (from/to times).
4. Staff card is full width (08 puts the AI card next to it); products + payments share a row (channels card left out).
5. `/tmp/shark-gate.lock` stuck since 12:38 UTC (CRM session) — not touched.

## R5 gates (after the verdict)
| command | result |
|---|---|
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` | 8/8 exit 0 |
| `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | 41/41 exit 0 |
| `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` | 41/41 exit 0 |
| `qc-pos-p1.17` unforced / forced / forced (QC4 wrappers) | 35/35 · 35/35 · 35/35, exit 0 ×3 (15:50 UTC) |
| typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` on 944b5098 | `tsc --noEmit` exit 0 (queued 15:37:57, waited for the lock held by p11 `next start -p 3225`, finished 16:11:53 UTC) |

## Follow-ups
- F2 (R5 V5, accepted): native date inputs follow the browser locale format.
- F1 (controller verdict R4 Q3): KPI deltas compare with the whole previous day/range; mockup 08 says "same time window" (ช่วงเวลาเดียวกัน). A same-time comparison needs `from`/`to` with times in `reports.ts` (server change) — later card.

## R6 gates (head a121f758)
| command | result |
|---|---|
| `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.17.mts` (pre-commit trial) | 39/39 exit 0 |
| typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` | `tsc --noEmit` exit 0 (16:34:13 → 16:34:45 UTC) |
| `qc-pos-p1.17` unforced / forced / forced | 39/39 · 39/39 · 39/39, exit 0 ×3 (Z1/Z2 green each run) |
| `qc-hf-pos-page-authz` unforced / forced | 56/56 · 56/56, exit 0 |
| `pnpm fitness` no DB / QC4 | 41/41 · 41/41, exit 0 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` | 8/8 exit 0 (first R6 run: F15.3a red — `pos-report-ov-retry-branch-rows` needed its own row; added) |
