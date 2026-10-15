# POS P2.12 S — builder notes (DONE · gates green) (channels fix · branches · hourly · anomalies + thresholds · print model · all-branch bills)

Builder · account B · 15 Oct 2026 · tree `/root/projects/shark-pos-c` (lane B) · branch `wip/pos-p2.12` = `origin/session/pos` 6f5b5fa5 (= e6546359 + ledger) + merge of `wip/pos-p2.12-oracle` d6cb9006.
Contract: `ledger/pos-briefs/pos-brief-P2.12.md` §10 rulings 1–11 + `ledger/wo-notes/pos-P2.12-oracle.md` (names table, per-rule table, CD-1..10). Oracle not edited.

## Red-before at the builder base
Forced run on 38692ecb (base + oracle merge, before any code): **3/30** (ST1 Z1 Z2) — identical to `P2.12-red.txt` (no append needed). Log `runs/red-base.log`.

## Commits (one per step; steps 3–5 share reports.ts ⇒ one commit)
| step | commit | files |
|---|---|---|
| 1 merge oracle | 38692ecb | ledger + `scripts/qc-pos-p2.12.mts` |
| 2 CH1–CH3 | 1d27c482 | `reports.ts` (`notDeposit` generic + `channelRowsOf`) · `bills.ts` · `bills-shared.ts` |
| 3–5 BR HR AN | 78bd760a | `reports.ts` · `report-overview.ts` · `settings-shared.ts` · `settings-general.ts` · `core/permissions.ts` (1 line) |
| 6 PD | 2c8f5918 | new `report-print-shared.ts` · `report-actions.ts` |
| 7 BL | 9707b616 | `bills.ts` · `bills-shared.ts` |
| 8 messages + owner lines | fe2ac845 | `messages/{th,en}/pos.json` · `POS-OWNER-PENDING.md` (rulings 3 + 4, append-only) |
All hunks marked `// POS P2.12 ▸ … ◂`. No hunk in lane-A files, `prisma/`, `package.json`, any `qc-*.mts`. No migration · no outbox event · no dependency.

## Per ruling
- **R1 CH1** `reportChannels` filters `notDeposit` (deposit receipt ฿500 no longer in STORE; a6 paid by the deposit counted once). Aggregation moved to pure `channelRowsOf` (shared with branches).
- **CH2** `billDetail.channel` gains `refundSatang · commissionNetSatang · commissionVatNetSatang · netSatang` from the stored REFUND docs' `channelCommission*` columns, only inside the existing `pos.report.view` gate.
- **CH3** `summary.channelCounts` = PAID+REFUNDED rows per `saleChannelResolver` code (same population as `billCount`).
- **R2 PD** `report-print-shared.ts`: `buildReportPrint(report, {locale, generatedAt, shopName, unitLabel})` → model (th headers = `CSV_HEADERS[kind]`, rows = `reportCsvRows(report)` = CSV body cell for cell); `renderReportPrintHtml(model)` → full HTML document, `@page A4` (landscape when > 9 columns), header row repeats, rows don't split, every text escaped, no `<script>`, no clock (BKK stamp by integer arithmetic from `model.generatedAt`; raw ISO also in `<meta name="generated-at">` so any change of generatedAt changes the bytes). `posReportPrintAction` = same session/permission path as `posReportAction`, limit 1000, `generatedAt` = request time, shop = tenant name, unit = unit name or ทุกสาขา/All branches (`reportPrintNames`, read-only).
- **R3 AN** rules A1–A10 exactly per the notes' per-rule table; thresholds `settings.pos.reports.anomaly` read only through `posAnomalyThresholds` (clamp / default / ignore unknown / `enabled` non-boolean ⇒ true); writer = `updatePosGeneralSettings({anomaly})` (partial merge, refused fields `anomaly` · `anomaly.enabled` · `anomaly.<key>` · `anomaly.rules` · `anomaly.rules.<rule>` · `anomaly.rules.A#.<field>`, nothing written on refusal, same values ⇒ no audit, `dayCutoffMinutes` and `anomaly` share `settings.pos.reports` and never overwrite each other). `PosGeneralSettings.anomaly` added.
- **R4** permission `pos.report.anomaly` (Thai label) · `ANOMALY_PERMISSION`; `reportAnomalies` = `prepare(pos.report.view)` then per-unit filter on the anomaly key (none left ⇒ PERMISSION_DENIED) — reader, CSV and print all go through it. Names = `User.name` only (no email fallback, PDPA).
- **R5 BR/HR** `reportBranches`: 1 `loadSales` + payments per chunk + 1 shift read for the whole scope, per-unit numbers from `dailyTotalsOf` / `channelRowsOf` / payment nets / Σ shift over-short (PAR with the per-unit readers). `reportHourly`: one `loadSales` from `from − 28 d` to the end, 24 business-day hours, forecast = ⌊(Σ+2)/4⌋, > 31 days VALIDATION; overview section `hourly` (per-section refusal).
- **R6 BL** `billsPageData({unitId:"*"})` → `receiptReadScope` (all ⇒ no unit filter inside tenant+system, archived included; else `unitId IN scope.unitIds`); rows gain `unitId`+`unitName` only in this mode; single-unit path keeps its key set.
- **R7/R10** owner lines appended (ruling 3 thresholds to confirm, ruling 4 new key).
- **R9** reports.ts still read-only; every new posSale query inline-filters unitId + createdAt; AuditLog/PosOrder reads carry tenantId + time; PosShift/Recount reads carry tenantId + openedAt / id IN / shiftId IN. Query count per reader is constant (chunked IN lists only).

## Deviations / decisions taken (no oracle impact)
1. `BillsSummary` is written on **one line with comma separators** — the oracle's ST3 regex is `\{[^;]*\}` (a `;`-separated literal can never match). Do not let a formatter turn the commas into `;`.
2. **Branch row presence** = unit has any document in range **or a closed shift with a counted over/short** (`overShortSatang` not null). A force-closed, never-counted shift alone does not create a row (fixture: archived C has such a shift today and must not appear — CD-7 "closed shift" read as "counted close").
3. **Hourly with a non-whole-hour cut-off** (e.g. 00:30): the last partial clock hour of the business day (hour first+24) folds into the first row (same clock label). Whole-hour cut-offs (0…360 step 60) are unaffected.
4. **Anomaly CSV/print column "รหัสสาขา" = unitId** — the row contract (CD-4, AN12) has no unit name and the print model must equal the CSV from the report alone. U maps ids to names on screen. Follow-up candidate if the owner wants names in the CSV: add `totals.unitNames` (contract change ⇒ CONTROLLER-DECISION).
5. A2/A6/A3 skip rows without a user (USER refType needs one). Rows sliced to `limit` (default 200; CSV/print 1000); `totals.rowCount/byRule` count all rows (products precedent).
6. `reportStaff` seller resolution lifted into `sellerResolver` (same two queries, same rules) so A3/A4/A6 attribute sellers exactly like the staff report. `loadSales` selects 3 more columns (`channelCode`, `channelCommission*`) for branch commissions.
7. en print model: headers English (same count), rows identical to th except the total row label "Total".
8. Overview without `only` now also computes `hourly` (one extra reader per load; > 31 days ⇒ that section VALIDATION only). Today's client sends no `only` when it sees ≥ 2 units (⇒ hourly is computed but not shown yet) and its own `ALL_SECTIONS` list (no hourly) for a single unit; U adds the section to its list.

## U-card contract (what P2.12U consumes)
- **Print page** `pos/reports/print?kind=&from=&to=&unit=&locale=` → `posReportPrintAction({systemId, unitId?, kind, from, to, locale?})` ⇒ `{ok:true, html, title, generatedAt}` | `{ok:false, code: VALIDATION|NOT_FOUND|PERMISSION_DENIED|INTERNAL, message}`. `html` is a complete document (render via iframe `srcdoc` or a route response; add `window.print()` client-side). Types `ReportPrintModel`, `ReportPrintOptions` in `report-print-shared.ts` (server import — it value-imports reports.ts).
- **Hourly** `Report<"hourly">`: rows ×24 `{hour, label, billCount, netSalesSatang, forecastSatang}` (hour 4…27 at cut-off 240, label "04"…"03"), totals `{billCount, netSalesSatang, forecastSatang}`; `overview.hourly: OverviewPart<…>`; `HOURLY_MAX_DAYS = 31`.
- **Branches** `Report<"branches">`: `BranchRow {unitId, name, billCount, netSalesSatang, avgBillSatang, refundCount, refundTotalSatang, voidCount, voidTotalSatang, cashSatang, platformSatang, commissionSatang, commissionVatSatang, overShortSatang}`, totals = same 12 numbers for the whole scope.
- **Anomalies** `Report<"anomalies">`: `AnomalyRow {rule, unitId, businessDate|null, userId|null, userName|null, refType USER|PosSale|PosShift|UNIT, refId|null, value, threshold, count}` (value: satang for A1 A2 A8 A9 · bp for A3 A4 · count otherwise), totals `{rowCount, byRule}`; refusal PERMISSION_DENIED without both keys (show the refusal card `pos.report.anomaly.denied`); `ANOMALY_RULE_LABEL_TH`.
- **Thresholds card** `PosGeneralSettings.anomaly = {enabled, rules:{A1:{count,satang}, A2:{count,satang}, A3:{bp}, A4:{bp}, A5..A7:{count}, A8:{satang}, A9:{count}, A10:{count}}}`; patch `{anomaly:{enabled?, rules?:{A#:{field}}}}`; limits `POS_ANOMALY_LIMITS` (count 1–1000 · satang 1–100,000,000 · bp 1–10,000), defaults `POS_ANOMALY_DEFAULTS`; refusal `field` paths above. Staff flag (CD-10): page reads `posAnomalyThresholds(system.settings).rules.A3.bp` server-side.
- **Bills 12**: `billsPageData({unitId: BILLS_ALL_UNITS /* "*" */, …})` rows `+unitId +unitName`; `summary.channelCounts: Record<code, number>` (both modes); drawer `bill.channel.{refundSatang, commissionNetSatang, commissionVatNetSatang, netSatang}` only with `pos.report.view`.
- **Messages** (th Thai / en ASCII): `pos.report.kinds.{branches,hourly,anomalies}` · `pos.report.hourly.{title,forecast,now,tooLong}` · `pos.report.branches.{title,total}` · `pos.report.anomaly.{title,empty,denied,rules.A1…A10}` · `pos.report.print.{button,generatedAt}` (`{time}`) · `pos.settings.general.anomaly.{title,enabled}` · `pos.sales.branch.chipLabel` (`{name}`).

## Gates (logs under `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p212/runs/`, line 1 = tree/head/dirty)
Pre-merge head 09d22f83 (code = fe2ac845) unless noted · post-merge head caa4139c = + `origin/session/pos` 3e4b1bb1 (P2.10 customer display; conflicts only in `messages/{th,en}/pos.json` (3-way key merge, both sides kept, 0 leaf conflicts) and `POS-OWNER-PENDING.md` (both appends kept); `prisma generate` after the merge).

| gate | result | log |
|---|---|---|
| qc-pos-p2.12 forced ×2 (fe2ac845) | 30/30 · 30/30 | `g1-qc-pos-p2.12-forced.log` · `…-forced-r2.log` |
| qc-pos-p2.12 unforced | 30/30 (also run1 30/30) | `g1-qc-pos-p2.12.log` · `p212-run1.log` |
| qc-pos-p1.17 | 40/40 (ST1 ST5 ST6 CSV2 OV green) | `g1-qc-pos-p1.17.log` |
| qc-pos-p2.11 | 34/34 (ST1/ST3/ST4/RP green) | `g1-qc-pos-p2.11.log` |
| qc-pos-p1.18 · p1.16 · p2.1 · p2.9b · p1.8 | 81 · 28 · 55 · 53 · 49 (all green) | `g1-qc-pos-<suite>.log` |
| qc-pos-closeday · p1.1 · p1.3 · qc-hf-pos-page-authz · p2.8 | 22 · 180 · 128 · 81 · 61 (all green) | `g1-…` |
| typecheck (pos lock 5632 MB) | exit 0 (fe2ac845) · exit 0 (caa4139c) | `typecheck-1.log` · `typecheck-2.log` |
| fitness no-env · env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 (both heads) | `fitness-*.log` · `fitness2-*.log` |
| **post-merge** qc-pos-p2.12 · qc-pos-p2.11 | **30/30 · 34/34** | `g2-qc-pos-p2.12.log` · `g2-qc-pos-p2.11.log` |
No existing pin turned red ⇒ no CONTROLLER-DECISION needed.

## Not done here (by scope)
U card (08/12 screens, print page, tabs, threshold card, chip, refund-aware drawer UI, `qc-hf-pos-page-authz` print row = ORACLE-EDIT in U) · real PDF probe (CONTROLLER-RUN) · hunter at merge (channel/branch sums vs bills, anomaly scope filter, deposit exclusion).
