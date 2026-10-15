# P2.12 S — review file (controller tree)

## R1 (Opus read-only · tree c @42e3ce17 · 15 Oct 17:49Z) — verbatim
# P2.12 S — reviewer R1 · head 42e3ce17 (tree c) · read-only

**Verdict: MERGEABLE-AFTER-FIXES.** Nothing breaks money or access: deposits are excluded, both permission keys are enforced, and PAR holds (traced against daily/payments/channels/shifts). The fix round = F1 (asked for by the controller) + F2/F3 (small). F4/F5 = follow-ups.
Code read: `git show` of 1d27c482 · 78bd760a · 2c8f5918 · 9707b616 · fe2ac845, plus head files. Merge caa4139c^2→caa4139c touches only the P2.12 files. Spot-checked gate logs `p212/runs/g2-*` (30/30 · 34/34 at caa4139c) and typecheck-2 (exit 0).

## Findings
- **F1 (Low · controller ask, decision 4)** `reports.ts:1520,1661`: the anomaly CSV/print column "รหัสสาขา" holds a raw cuid. Input: owner exports anomalies for "ทุกสาขา" → the column shows `cmg…` instead of the branch name. Smallest fix: `AnomalyTotals.unitNames: Record<unitId,string>`, built from `s.unitName` for units that appear in the rows (in the `envelope` at :1481). The cell becomes `x.totals.unitNames[r.unitId] ?? r.unitId`. Header changes to "สาขา", EN_HEADERS "Branch". The print model follows on its own (`reportCsvRows`). Oracle safe: AN12 checks only `totals.rowCount/byRule` (qc :1522); PD1/AN CSV compare against `CSV_HEADERS`/`reportCsvRows`, not literals. Row contract unchanged.
- **F2 (Low)** `report-print-shared.ts:99,137`: the total row is found by `r[0] === "รวม"`. Branches' first cell is the unit name (`reports.ts:1645`). Input: a branch named "รวม" → its row prints bold as a total, and the en print renames it "Total" (data changed). Fix: `ReportPrintModel.totalRow: boolean`, true for branches/hourly when the last row is the total (the kind decides). Never compare cell text.
- **F3 (Low)** `settings-general.ts:262,306`: "same values ⇒ no audit" compares the stored JSON, not the reader's view. Input: on a fresh system, PATCH `{anomaly:{rules:{A1:{count:3}}}}` (= default) or `{anomaly:{rules:{A1:{}}}}` → the key gets written and a `pos.settings.updated` audit appears with before == after. Fix: also skip when `canon(generalAuditView(before,c)) === canon(generalAuditView(after,c))` (or drop empty rule objects before merging).
- **F4 (Low · follow-up, oracle-defined)** `reports.ts:1316`: the audit read filters `targetType:"PosSale"`. Table-split PIN discount overrides (`table-split.ts:438–443`, `pos.discount.override` targetType `PosTableSplit`) are listed as an A5 source in brief ⚠️5 but are never counted. Input: a manager PIN-approves 3 split-plan discounts in one day → no A5 hit. Fix later (HF-FU2/owner): add `PosTableSplit` targets, resolved to a unit with one chunked read.
- **F5 (Low · U/follow-up)** en print of `anomalies` has Thai rule labels (`ANOMALY_RULE_LABEL_TH`) and "หรือ" in the threshold cell (`reports.ts` anomalyThresholdText). This follows decision 7 (rows = th CSV), so it is not a defect in S. U should decide.

## Verified OK (per ruling)
- **R1/CH1**: `reportChannels` wraps its read in `notDeposit` (:1095) and aggregates in `channelRowsOf`, so it now applies the same deposit exclusion as daily/staff. Branches: `dailyTotalsOf` already applies `notDeposit` (:535), and the channel half of `branchNumbersOf` applies it too (:1137). Hourly (:1230) and anomalies (:1311, so A2/A3/A4/A6) exclude deposits. Cash/platform per branch include deposit cash, same as `reportPayments` (CD-7). REFUND docs reduce on their own createdAt day/hour everywhere.
- **CH2**: `bills.ts:488` takes `refund/commission*Net/net` from the stored REFUND docs' `channelCommission*` columns, with no recompute. It sits inside `seeCommission` = `pos.report.view` at the unit (:479). **CH3** `:272`: counted over the same `rows` PAID+REFUNDED population as `billCount`. Existing summary fields are untouched.
- **R5/BR**: per-unit numbers come from `dailyTotalsOf` + `channelRowsOf` + payment nets (same sign rule as `reportPayments`) + Σ non-OPEN `overShortSatang` (= the `reportShifts` totals) ⇒ PAR. Totals = `branchNumbersOf(all sales, Σpay, all shifts)`. Units with no row add 0 to every field, so Σ rows = totals (avg aside). Archived units are included (`scopeOf` has no status filter). MANAGER{A} sees A only via `prepare`.
- **HR**: h = BKK hour since the midnight of the business date. The fold at :1238 maps only h = first+24 (non-whole-hour cut-off) onto `first`. The same fold is used for `hist`, so each doc lands in exactly one row: no double count, no drop. Forecast = ⌊(Σ+2)/4⌋ with a fixed divisor of 4 (missing weeks = 0, CD-8). Range > 31 days ⇒ VALIDATION (:1228). Overview `part("hourly")` refuses per section (overview :173).
- **R3/AN**: rules match the per-rule table:
  - A1: actor + `after.requestedByUserId`, deduped per person (:1366); the source matches `bills.ts:649` and the consumer's `requestedByUserId`.
  - A5: one event per `(targetId, DISCOUNT|after.action)` ⇒ a PIN discount counts once (:1419).
  - A6: CUSTOM lines only.
  - A8: max of the two absolute values (:1451).
  - A3: strict `>` against the staff-style net; A4: exact integer compare.
  - Audit/sale/shift/order reads all carry tenantId + time (or id IN). Audit rows join to `systemId + s.unitIds` through PosSale.
  - Thresholds reader clamps / falls back to the default / ignores unknown keys. The writer refuses with field paths down to `anomaly.rules.A#.<field>` and keeps `dayCutoffMinutes` sibling-safe.
  - Names are `User.name` only (:1278); a null name → `userName:null` and CSV "" (no email fallback).
- **R4**: key added in the POS block with the Thai label (`permissions.ts:142`). Session gate = `pos.report.view` (report-actions `scopeOf`). The reader then keeps only units with `pos.report.anomaly` (:1300); none left ⇒ PERMISSION_DENIED. CSV (`REPORT_FN`) and print (`KIND_FN`) go through the same reader. MANAGER/OWNER pass via `evaluate`. Note: a STAFF holding `pos.*` also passes (existing wildcard rule).
- **R2/PD**: the only import is `./reports` (CSV_HEADERS, reportCsvRows). No clock/random/env (`Date.parse` only). `generatedAt` is passed in; the action sets it at request time (:173). Every interpolation goes through `esc()` (shop, unit, product/member/reason cells, title, meta). No `<script>`. Output is byte-deterministic.
- **R6/BL**: `"*"` scope uses `receiptReadScope`: allUnits ⇒ tenant + system only, otherwise `unitId IN unitIds` (:199). `unitName` comes from one query for the page's units (:304), so no N+1. Single-unit rows keep their keys. Page cap and the full-day row load are unchanged.
- **R9/hygiene**: no hunks in lane-A, `prisma/`, `package.json` or any `qc-*.mts` (P2.12 commits; the scripts/prisma diffs are P2.10's merge). `reports.ts` has no writes. `sellerResolver` (:673) runs the same 2 chunked queries as the old staff path. th/en key sets are equal, and the new en strings contain no Thai. The two new owner lines plus P2.10's line are all kept, append-only.
- **Merge caa4139c**: flattened key sets — head is missing 0 keys vs 9e72513f and 0 vs fe2ac845 (th and en). Every head value equals at least one parent, and there are no head-only keys.
- **Query count** (prepare = appSystem + unit(s), chunked IN reads):
  - channels: prepare + 1 sale + 1 salesChannel
  - branches: prepare + loadSales + payments×chunks + 1 shift
  - hourly: prepare + 1 loadSales (from−28 d … end)
  - anomalies: prepare + loadSales + sellerResolver chunks + 1 audit + target chunks + line groupBy chunks + 1 shift + recount chunks + 1 order + user chunks
  - bills "*": +1 businessUnit
  - print: reader + 2 (tenant, unit)
  - Constant per call.
  - `loadSales` +3 columns (`channelCode` and the 2 commission ints): about 20 B/row on every reader. Negligible; no index impact.

## Decisions 2/3/4/6
- **2 Accept.** A force-closed, never-counted shift would add an all-zero row. PAR with `reportShifts` holds because uncounted shifts add 0 there too. This fits ruling 7's intent ("activity in range").
- **3 Accept.** Correct and lossless. The "00" row then covers two half-hours (00:30–01:00 and the next day's 00:00–00:30); U could footnote this.
- **4 Fix as F1.** Contract add only; no row change.
- **6 Accept.** Wasted cost: the multi-unit overview (no `only`) now computes hourly over range+28 d without showing it. U should send `only` (or show hourly only for single-day ranges).

## Follow-ups
F4 · F5 · overview print summary (brief §4: "overview prints as one A4") is not a `ReportKind` ⇒ U/CD · print row-cap notice (`totals.rowCount` > rows) ⇒ U.

## Controller rulings after R1 (15 Oct 17:49Z · binding) — hunter first, then one fix round
R1 = MERGEABLE-AFTER-FIXES. Money/access verified; fixes are small. Order: money hunter (light) runs now on 42e3ce17; the fix round then covers R1 F1–F3 + any hunter item.
1. **F1 = fix** (decision 4): `AnomalyTotals.unitNames: Record<unitId,string>` built in the envelope from `s.unitName` for units in rows; CSV/print cell = `unitNames[r.unitId] ?? r.unitId`; header "สาขา" / "Branch". Row contract unchanged; AN12/PD checks stay green (they compare via `CSV_HEADERS`/`reportCsvRows`).
2. **F2 = fix**: `ReportPrintModel.totalRow: boolean` decided by the kind (branches/hourly last row), never by cell text "รวม".
3. **F3 = fix**: settings writer skips the write + audit when the reader's view before == after (canonical compare of `generalAuditView`), or drops empty rule objects before merging.
4. **F4 = follow-up line** (HF-FU2/owner): A5 ignores `PosTableSplit` discount overrides. **F5 = U-card decision** (en print rule labels). Decisions 2/3/6 accepted (U footnotes the folded hour; U sends `only` to skip hourly on multi-unit overview).
5. Builder also appends the three follow-ups to the notes (overview print summary = U/CD, row-cap notice = U).
