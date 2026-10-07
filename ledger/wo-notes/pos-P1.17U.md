# POS P1.17 U — reports UI (builder notes)

Builder U · account B lane 2 · worktree `/root/projects/shark-pos-c` · branch `wip/pos-p1.17u` from `origin/session/pos` 17e8cf8f.
Brief `ledger/pos-briefs/pos-brief-P1.17U.md`. Server = P1.17 S (accepted 12813b8a) — `reports.ts` / `report-actions.ts` **untouched** (no new action needed; page bootstrap is done in the server page).

## Status
- done: 1 route `/pos/reports` (page + ReportsClient) · keys · tab · inventory rows (84c936cf) · 2 dashboard card (7fce78ed) · 3 visual-pos page (c394b45c) · 4 gates (below)
- next: CONTROLLER-RUN — build · visual-pos `p1.17u` owner/cashier 1440/1024/390 + `LOCALE=en` · parity vs mockup 08 (partial) · reviewer

## Screens built
- `src/app/app/sys/[id]/pos/reports/page.tsx` (server): requireTenant → AppSystem POS → posMembership → posUnits ∩ canAccessUnit (none = notFound, same as shifts) → units with `pos.report.view` (`evaluate` per unit). None = refusal card `pos-report-refusal` (200, no redirect). URL `?kind=&from=&to=&unit=` read here; bad values = defaults (kind daily · last 7 days ending today BKK via `bkkBusinessDate` · unit = all). Wrapper `max-w-4xl` (UI_STANDARD report page).
- `ReportsClient.tsx`: kind tabs (7, order daily·products·staff·payments·margin·shifts·tax, scroll-x) · from/to `<input type=date>` · unit select (allUnits + permitted units) · CSV button · one card with the table + totals row (`tfoot`) · empty / loading / refusal (`pos-report-error` + retry) states. URL kept in sync with `history.replaceState` (Next 16 doc: integrates with router). Client-side range check (format · order · > 92 days) = inline error, server not called; server refusals shown by code → `report.errors.*` (INTERNAL/unknown → `errors.unknown`), never the server's Thai `message`. Stale responses dropped (sequence ref).
  - Columns follow R5–R10 order; money = `MoneyText decimals`; counts plain; `marginBp` → `x.xx%` or `—`; `costSatang` null → `noCost`; estimated cost > 0 → `estimated` tag; `userId` null → `unknownSeller`; shift status via `pos.shift.status*`; pay labels via `pos.shift.method.*` (fallback server label). Refund columns omitted (P1.8).
  - Extra lines: products "showing N of M rows" when the 200-row default limit cuts; payments "sales + tips = total received"; margin box (costed / uncosted revenue, net ex VAT, net margin ex VAT); shifts counts (short/over/forced/open); shift recount variance shown under over/short.
  - Daily: pure CSS bar chart of `netSalesSatang` (1–92 bars, x labels first/middle/last, max on top).
  - Tables scroll horizontally inside their own `overflow-x-auto` box (min-width per kind); every wrapper `min-w-0` so html/body/main do not overflow at 390.
  - CSV: `posReportCsvAction` → `new Blob([body], {type: contentType})` → `<a download=filename>`; BOM comes from the server, nothing added.
- `src/app/app/sys/[id]/page.tsx` (system home, POS): "ยอดวันนี้" body = `PosTodayCard` from a **direct** `posDashboardCard({tenantId, systemId}, actor)` call (actor from the session, same shape as report-actions). Net sales large · ▲/▼ delta % (ink up / danger down, `—` when `deltaBp` null) + yesterday amount · bills · avg bill · open shifts · voids · top product (name · ×qty · sales, or "no sales yet") · tip only when > 0. Actions: "รายงาน →" (only if `pos.report.view` on some accessible POS unit — same test as the page) + "ปิดวัน →" kept. Card permission stays `pos.sale.create` (reports.ts CARD_PERMISSION). If the card refuses/throws, the old `closeDaySummary` line is shown (keeps hf-pos-page-authz O-2 static string and gives a fallback).

## Other files
- `src/lib/modules/pos/tabs.ts` + `src/app/app/layout.tsx` `childrenFor("POS")`: `{ href: ${s}/pos/reports, label: "รายงาน" }` after "ปิดวัน" (identical).
- `src/components/module-tabs.tsx`: optional `data-testid` prop forwarded to the tab strip (additive; needed because F15.3a counts a ModuleTabs without testid in a NEW POS file as new debt — new files must have debt 0).
- `scripts/pos-ui-inventory.json`: +7 rows (page `/app/sys/[id]/pos/reports`, wo P1.17U, oracle empty): `pos-report-module-tabs`, `pos-report-kind-*`, `pos-report-from`, `pos-report-to`, `pos-report-unit`, `pos-report-csv` (download), `pos-report-retry`. Cashier rows hiddenFor (no `pos.report.view` in QC cashier permissions).
- `scripts/pos-qc-env.mts` `POS_PAGES` + `reports`; `scripts/visual-pos.mts` `PAGE_EXPECT.reports = {owner:200, cashier:200}` and, for wo `p1.17*`, env `REPORT_QUERY` (e.g. `kind=daily&from=2026-10-01&to=2026-10-07`, charset `[A-Za-z0-9=&_.-]`) appended to the reports path. Dry run checked (`--dry`, 15 shots for cashier, path with query).

## Keys added (`src/messages/{th,en}/pos.json`, inside `report`, append-only)
`desc · unit · kindsLabel · loading · downloading · retry · generatedAt · chartTitle · rowLimit · errors.{validation,rangeOrder,rangeTooLong,notFound,permissionDenied,unknown} · cols.{date,bills,gross,discount,serviceCharge,netSales,vat,netExVat,tip,voids,voidTotal,avgBill,product,qty,weight,lines,fullPrice,lineDiscount,sales,staff,method,payments,amount,tendered,change,revenue,cost,estimatedCost,uncosted,margin,marginPct,shiftNo,zNo,unit,device,status,openedBy,openedAt,closedAt,expectedCash,countedCash,overShort,recount,firstReceipt,lastReceipt,taxGross,taxBase,vatable,nonVat,voidReceipts} · summary.{salesPlusTip,costedRevenue,uncostedRevenue,netExVat,netMargin,shiftCounts} · card.{reports,noSales,yesterday}`.

## Actions used
`posReportAction`, `posReportCsvAction` (client). Dashboard: `posDashboardCard` direct (server), not the action. No new action.

## Commands + exit codes
| command | result |
|---|---|
| `pnpm exec tsx scripts/qc-nav-functions.mts` (static) base 17e8cf8f | 10/11 · S5 red `POS: ขาด /pos/shifts` (pre-existing) |
| same after tab | 10/11 · same single gap; POS 6/7 (`/pos/reports` covered) |
| `HF_STATIC_ONLY=1 … qc-hf-pos-page-authz.mts` after card | 8/8 static (O-1, O-2 green) |
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` | 8/8 exit 0 (first commit attempt: F15.3a red → inventory rows + ModuleTabs testid + retry testid) |
| typecheck (`env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`) | exit 0 (11:15→11:23 UTC) |
| `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | 41/41 exit 0 |
| `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` | 41/41 exit 0 |
| `… qc4.sh … with-gate-lock.sh pnpm exec tsx scripts/fitness-pos.mts` | 8/8 exit 0 |
| `qc-pos-p1.17` unforced | 35/35 exit 0 |
| `qc-hf-pos-page-authz` unforced | 56/56 exit 0 |
| `qc-pos-p1.9` unforced | 53/53 exit 0 |
| `qc-pos-p1.3` unforced | 128/128 exit 0 |
| forced (`bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx …`) `qc-pos-p1.17` | 35/35 exit 0 (Z1/Z2 QC4 restored) |
| forced `qc-hf-pos-page-authz` | 56/56 exit 0 |
| forced `qc-pos-p1.9` | 53/53 exit 0 |
| forced `qc-pos-p1.3` | 128/128 exit 0 |

Residue: every suite printed its own cleanup ("ลบแล้ว …"); p1.17 Z1/Z2 green; no `.qc-shots`, no untracked files. `git diff --name-only origin/session/pos...HEAD` = 12 files, none under `src/components/pos/register/**`, `src/lib/modules/pos/register*.ts`, `reports.ts`, `report-actions.ts`, `prisma/`.

## Open questions (CONTROLLER)
1. `scripts/qc-pos-catalog.mts` named in the brief does not exist. Tab parity is checked by `qc-nav-functions.mts` S5 (static, run: same single pre-existing red `/pos/shifts` missing from `childrenFor("POS")` / `posTabs` — not added here, out of scope) and `qc-hr-roster.mts` NM-2 (DB suite, not run). Add "กะ" to the tabs in a later card?
2. The new register's own tab strip (`pos-reg-tab-*`, inventory note) still shows "รายงาน" as a coming-soon span "until P1.17". Wiring it to `/pos/reports` is a register-file change (P1.6U lane / controller).
3. `src/components/module-tabs.tsx` got an optional `data-testid` prop (shared component, additive) — needed for F15.3a in a new POS file.
4. Report page unit select lists POS-linked units with `pos.report.view`; "all units" = server scope (all tenant units the actor may read, incl. archived/unlinked, R13). Same as the brief, noted in case the controller wants the select to say so.
