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

## Fix round 1 (controller rulings 15 Oct 17:57Z · R1 F1–F3 + hunter H1–H4 + ORACLE-ADD)

Builder · account B · tree c · branch `wip/pos-p2.12` 42e3ce17 → fix commits below. `origin/session/pos` = 3e4b1bb1 (already merged at caa4139c) — fetched before and after the gates, not moved ⇒ no merge, no re-run. All code hunks marked `// POS P2.12 ▸ fix1 … ◂`; no hunk in lane-A files, `prisma/`, `package.json`, messages, or any other `qc-*.mts`.

### Commits
| step | commit | files |
|---|---|---|
| ruling 7 ORACLE-ADD (test first) | 99aee674 | `scripts/qc-pos-p2.12.mts` (AN13 · AN14 · PD4 · AN12 +1 assert · fixture: COUPON system on B + 12 owner bills at B moved to TD−7/TD−6 · `sell()` + `couponCode`) — marker `// ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1)` · 30 → 33 |
| red-before | a64570b8 | `ledger/wo-notes/P2.12-red.txt` §fix1 |
| ruling 1 (R1 F1 F2 F3) | 5ee2ba92 | `reports.ts` · `report-print-shared.ts` · `settings-general.ts` |
| ruling 2 (H1) | c671d11f | `reports.ts` |
| ruling 3 (H2) | 492c8ab8 | `reports.ts` · `report-print-shared.ts` |
| ruling 4 (H3) | b5b48254 | `reports.ts` · `report-actions.ts` |
| ruling 5 (H4) | 3f91c695 | `reports.ts` |
| ruling 6 follow-ups | 3762f893 | this file |

### Red-before (ruling 7)
Unforced on QC4 at 99aee674 (code = 42e3ce17): **29/33** — red = AN12 (`totals.unitNames` undefined) · AN13 (no A4 row for the 100 % line-discount bill, A4 row for the coupon-only bill, A3 O/B value 4286 ≠ 7143) · AN14 (limit 10 ⇒ A1 3 · A2 2 · A3 3 · A4 2 rows, A5–A10 gone, no notice) · PD4 (MANAGER{A} header "สาขา ทุกสาขา", A8 cells "100.00"). The 29 existing checks stayed green; residue 0. Log `runs/fix1/red-fix1.log`.

### Per ruling (files / hunks)
- **1 · F1** `reports.ts`: `AnomalyTotals.unitNames` (envelope: `s.unitName` of the units in the returned rows; `{}` when disabled) · CSV cell 3 = `unitNames[unitId] ?? unitId` · header "รหัสสาขา" → **"สาขา"** · `report-print-shared.ts` EN header "Branch ID" → **"Branch"**. Row keys unchanged.
- **1 · F2** `reports.ts` exports `REPORT_TOTAL_ROW_KINDS` (daily products staff payments margin shifts tax branches hourly — every kind whose CSV always ends with the "รวม" row; channels/anomalies have none) · print model `totalRow: boolean` = kind ∈ set ∧ rows ≠ [] · en "Total" relabel and the bold `tr.total` apply to the last row only when `totalRow` — no cell-text compare left (`TOTAL_TH` removed). Applied to all total-row kinds, not only branches/hourly, so daily etc. keep their bold total.
- **1 · F3** `settings-general.ts` `updatePosGeneralSettings`: after the raw-JSON `changed` test, compute `after` first and return without `mergePosKeys` + without audit when `canon(generalAuditView(before,c)) === canon(generalAuditView(after,c))` (e.g. writing a default, `{A1:{}}`). Applies to every general key (same rule: no visible change ⇒ no write).
- **2 · H1** `reportAnomalies`: the A6 `groupBy` becomes `by [saleId, priceSource]` over `CUSTOM ∪ discountSatang > 0` lines with `_count` + `_sum.discountSatang` (CUSTOM count unchanged; Σ line discount per bill). Non-staff part of `PosSale.discountSatang` (= bill + coupon + member, `service.ts` createSale) read only for paid bills with `discountSatang > 0`, per chunk: **`CouponRedemption.discountSatang`** (status ≠ RELEASED, `saleId` or `refType "PosSale"/refId`, deduped by id) + **Σ `PosSale.memberBenefits.lines[].discountSatang`** (kind ≠ COUPON; new `posSale` read carries tenant/system/unitId IN/createdAt range/id IN). Staff discount = Σ line discount + max(0, discountSatang − coupon − member). **A3** numerator = staff discount (base unchanged = staff-style net, AN3 numbers unchanged). **A4** = staff discount × 10000 ≥ (subtotal + Σ line discount) × bp, value = round(staff × 10000 / base). Rule labels / threshold text unchanged.
- **3 · H2** `capPerRule(rows, limit)`: rows (already sorted rule-first) grouped per rule; seats handed out round-robin in rule order until `limit` ⇒ ≤ ⌈limit/R⌉ per rule in the even pass, seats a short rule cannot use go to the next rules in rule order; result ≤ limit, original order kept; limit ≥ R ⇒ no rule disappears; unchanged when rows ≤ limit. `reportRowsNotice(report, locale)` (anomalies, `rowCount > rows.length`) = "แสดง N จาก M แถว" / "Showing N of M rows"; CSV body = `csvTableRows` + one single-cell notice line; `reportTableRows` (new export) = table rows without the notice; print model rows = `reportTableRows`, `notice` field, HTML `<p class="notice">` after the table.
- **4 · H3** `reportPrintNames(ctx, client?, scope?: {actor, kind})`: no `unitId` ⇒ tenant units (id asc) filtered like `scopeOf` (OWNER/"*" = all, else `unitAccess`) ∩ `pos.report.view` (+ `pos.report.anomaly` for anomalies); 0 < scoped < all ⇒ names joined ", ", else null ("ทุกสาขา"/"All branches"). `posReportPrintAction` passes `{actor, kind}`. +1 `businessUnit.findMany` on the print path only.
- **5 · H4** A8 keeps the signed winner per shift (|Z over/short| ≥ |recount variance| ⇒ Z side, else recount); `AnomalyTotals.a8SignedSatang: Record<PosShift id, signed satang>` for returned A8 rows; CSV/print A8 value cell = `ขาด −150.00` (U+2212) / `เกิน +150.00`; row `value` stays absolute.

### U-card contract deltas
- `AnomalyTotals` = `{rowCount, byRule, unitNames: Record<unitId, name>, a8SignedSatang: Record<shiftId, signedSatang>}` — screen shows `unitNames[row.unitId]` and can colour A8 by the sign; rows unchanged (AN12 key set).
- `ReportPrintModel` += `totalRow: boolean` (bold/relabel the last row only when true) · `notice: string | null` (render under the table; rows never contain it).
- CSV of a truncated anomalies report ends with one single-cell line "แสดง N จาก M แถว"; `reportCsvRows` includes it, `reportTableRows` does not; `reportRowsNotice(report, "en")` for an en screen.
- Anomalies CSV/print header col 3 = "สาขา" / "Branch" (name, not id). A8 value cell = "ขาด −x" / "เกิน +x" (th words also in the en print — F5).
- Row cap: `limit` is per-rule fair (screen default 200, CSV/print 1000) — "first N rows" no longer means "first rules".
- Print header for a scoped actor without `unitId` = their unit names joined ", " (MANAGER{A} ⇒ A's name).

### Gates (logs `runs/fix1/`, line 1 = tree/head/dirty · code head 3f91c695)
| gate | result | log |
|---|---|---|
| qc-pos-p2.12 forced ×2 | 33/33 · 33/33 | `gA-qc-pos-p2.12-forced.log` · `…-forced-r2.log` |
| qc-pos-p2.12 unforced | 33/33 (also try1 33/33) | `gA-qc-pos-p2.12.log` · `try1.log` |
| qc-pos-p1.17 · p2.11 · p1.18 · p1.16 | 40 · 34 · 81 · 28 (all green) | `gA-qc-pos-<suite>.log` |
| qc-pos-p1.1 · p1.3 | 180 · 128 (all green) | `gA-…` |
| typecheck (pos lock 5632 MB) | exit 0 | `typecheck-1.log` |
| fitness no-env · env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 | `fitness-1-{noenv,env,pos}.log` |
No existing pin turned red ⇒ no CONTROLLER-DECISION.

### Follow-ups (ruling 6 · not fixed in S)
- **H5 (bills day vs cut-off)** — `billsPageData` groups by the Bangkok calendar day of `paidAt ?? createdAt` (`bills.ts:97`), reports use `createdAt` + the cut-off; deposit receipts count as STORE on the bills page (CD-9). Under a cut-off ≠ 0, `summary.channelCounts` never equals the channels report for the same date. U footnotes it on screen 12; making the bills day cut-off-aware = follow-up (HF-FU2 / owner). Missing check: CH3 with a cut-off ≠ 0.
- **R1 F4 (A5 ignores table-split overrides)** — `reportAnomalies` reads audits with `targetType:"PosSale"` only; `pos.discount.override` written by `table-split.ts:438–443` has `targetType:"PosTableSplit"`, so manager-PIN split-plan discounts never count toward A5. Follow-up (HF-FU2 / owner): add `PosTableSplit` targets resolved to a unit with one chunked read.
- **R1 F5 (en print labels)** — en print of `anomalies` keeps Thai rule labels (`ANOMALY_RULE_LABEL_TH`), the Thai threshold joiner "หรือ" and (fix1 H4) the Thai sign words "ขาด/เกิน" in the A8 cell, because rows = th CSV (decision 7). U-card decision.
- **Overview print summary** (brief §4 "overview prints as one A4") — not a `ReportKind` ⇒ U / CONTROLLER-DECISION.
- **Row-cap notice on screen** — CSV + print carry the notice since fix1 H2; the screen's own "showing N of M" stays with U (`totals.rowCount` vs `rows.length`).
