# POS P1.17U R4 — parity with mockup 08 (reports overview = dashboard) · builder notes

Builder · account B lane 2 · worktree `/root/projects/shark-pos-c` · branch `wip/pos-p1.17u-r4` from `origin/session/pos` a300db53.
Brief `ledger/pos-briefs/pos-brief-P1.17U-R4-PARITY.md`. Server untouched (`reports.ts` / `report-actions.ts` read-only · no new action).

## Status
- done: overview dashboard + keys + page default + inventory rows (17de4550) · chart label fix (56694a98) · all gates green on 56694a98 (below)
- next: CONTROLLER-RUN — build · visual-pos `p1.17u` with `REPORT_QUERY=kind=overview&from=2026-10-04&to=2026-10-04` owner/cashier 1440/1024/390 + `LOCALE=en` · side by side with 08-reports.png

## What changed
- `page.tsx`: default view = `kind=overview` (no kind / unknown kind / `?kind=overview`); overview default range = today..today (BKK), table kinds keep "last 7 days"; wrapper `max-w-4xl` → `max-w-7xl` (dashboard width, same as CRM v2 home).
- `ReportsClient.tsx`: header row like 08 for every kind — h2 title ("ภาพรวมการขาย" on overview, "รายงานขาย" otherwise) · date-range box (calendar icon + from – to, same testids `pos-report-from/to`) · branch box (shop icon + select `pos-report-unit`) · info line `pos-report-ov-info` "ข้อมูลถึง HH:mm · เทียบกับ <prev range>" (overview only) · "ส่งออก CSV" (`pos-report-csv`, upload icon, right; overview exports `daily`). Kind tabs = overview first + the 7 (tables/ReportBody unchanged from R3). `rangeHint` line kept for table kinds only.
- `ReportsOverview.tsx` (new, client): mockup 08 top → bottom
  1. KPI row (5 cards, `grid-cols-1 sm:2 xl:5`): ยอดขายสุทธิ (+▲/▼ % vs previous range, "—" if prev = 0) · บิล (+▲/▼ n บิล) · เฉลี่ยต่อบิล ("เมื่อวาน/ช่วงก่อน ฿x") · กำไรขั้นต้น `grossMarginBp` ("มีต้นทุน x% ของยอด" = costedRevenue/revenue, else "— ยังไม่มีต้นทุน") · บิลยกเลิก (count + "ยอด ฿x"). "เทียบเมื่อวาน" wording only when the range is today alone; otherwise "เทียบช่วงก่อน". Muted line `overview.comingSoon` under the row.
  2. Chart "ยอดขายรายวัน" (`pos-report-ov-chart`): y-axis 0 / ½ / top (top = range max rounded up to 1·2·2.5·5×10ⁿ baht — scale only), dashed grid, grey bars (token mix ink 17 % on surface), last day black, value on the max bar and the last bar, x label every day ≤ 14 (month on first/1st), else first/middle/last; bars ≤ 64px centred; > 14 bars scroll inside the card on phones. Legend ยอดจริง · วันนี้ (วันสุดท้ายของช่วง when `to` ≠ today).
  3. "เปรียบเทียบสาขา" (`pos-report-ov-branches`) only when the page lists ≥ 2 permitted units: selected unit first + "(ที่เลือก)" + highlighted row, ≤ 8 units ("แสดง x จาก y สาขา" when capped), columns สาขา · ยอด · บิล · เฉลี่ย · กำไร; last row "รวมทุกสาขา" = all-units totals (server scope, may include archived units).
  4. "สินค้าขายดี" top 5 (`reportProducts` limit 5) with กำไร% from the matching `reportMargin` row by `key` ("—" uncosted) · "ดูทั้งหมด" → `kind=products`.
  5. "วิธีชำระ": label · bar amount/totalPaid · % · amount; "ทิป ฿x" only when > 0.
  6. "พนักงาน" top 5 rows: avatar initial (skips leading Thai vowels, as 08) · ชื่อ (`unknownSeller` for null) · บิล · ยอด · ส่วนลดที่ให้ · ยกเลิก · หมายเหตุ = "ส่วนลดสูงผิดปกติ" chip only if discount > 15 % of net (title = on-screen hint) · "ดูทั้งหมด" → `kind=staff`. Staff card is full width (the AI card next to it in 08 is left out).
  - Each card loads and refuses on its own (text from `report.errors.*` + retry `pos-report-ov-retry` that reloads the overview); stale responses dropped (sequence ref).
- Left out (no data, not faked): hourly (P2.12) · channels (P2.11) · members KPI (P1.12) · AI assistant (P3) · PDF (P2) · 08's footnotes under branch/payment cards (they are AI/derived prose).
- Calls per overview load (all parallel): 6 (daily · daily prev range · margin limit 50 · products limit 5 · payments · staff) + 2 per unit (daily + margin limit 1, ≤ 8 units, only when ≥ 2 units) + 2 (all-units daily + margin) only when a single unit is selected. Brief §2 says "2 + 2 + 2×units": KPI/products/payments/staff need 6 base calls with the existing actions — see open question 1.

## Keys added (`src/messages/{th,en}/pos.json`, `report.overview.*`, append-only)
`tab · title · dateRange · exportCsv · upToDate · compare · vsPrev · vsYesterday · billsUnit · prevAvg · yesterdayAvg · costed · noCost · voidTotal · kpi.{net,bills,avg,margin,voids} · comingSoon · chartTitle · legendActual · legendToday · legendLast · branches · selected · allBranches · branchesCap · topProducts · payMethods · pctOfTotal · tip · staff · seeAll · highDiscount · highDiscountHint · cols.{branch,sales,bills,avg,margin,product,qty,name,discount,voids,note}`

## Inventory (`scripts/pos-ui-inventory.json`)
+3 rows (wo P1.17U-R4, owner, hiddenFor cashier): `pos-report-ov-retry`, `pos-report-ov-products-all`, `pos-report-ov-staff-all`. `pos-report-kind-overview` is covered by the existing `pos-report-kind-*` row (note updated); CSV row note says overview exports daily. Card testids (non-interactive): `pos-report-overview`, `pos-report-ov-kpis`, `pos-report-ov-kpi-{net,bills,avg,margin,voids}`, `pos-report-ov-coming-soon`, `pos-report-ov-chart`, `pos-report-ov-chart-plot`, `pos-report-ov-branches`, `pos-report-ov-branch-row`, `pos-report-ov-branch-total`, `pos-report-ov-products`, `pos-report-ov-product-row`, `pos-report-ov-payments`, `pos-report-ov-pay-row`, `pos-report-ov-pay-tip`, `pos-report-ov-staff`, `pos-report-ov-staff-row`, `pos-report-ov-high-discount`, `pos-report-ov-error`, `pos-report-ov-info`, `pos-report-header`.

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
