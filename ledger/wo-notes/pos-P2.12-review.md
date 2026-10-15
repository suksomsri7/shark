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

## Money hunter (light · Opus read-only · tree c @42e3ce17 · 15 Oct 17:57Z) — verbatim
# P2.12 S money hunter (light, read-only) · head 42e3ce17 · tree c
**Verdict: FINDINGS.** 1 Med, 1 Med-, 3 Low. No leak across units or tenants and no deposit double count; the findings are in numbers the owner acts on. R1 F1–F5 are not repeated.

## Findings
- **H1 (Med) A3/A4 measure the wrong discount** · `reports.ts:1384–1407`
  - `PosSale.discountSatang` = bill + coupon + member discount (`service.ts:894,994`). Line discounts are already inside `subtotal` (`service.ts:782–784`).
  - Input (a): ฿200 bill, both items at a 100 % line discount → subtotal 0 → `subtotalSatang <= 0` skip → no A4. A 60 % line discount → no A4 either. A3 never sees line discounts, so comps given per item are invisible.
  - Input (b): a member's 50 % voucher or tier discount → an A4 row naming the cashier.
  - Fix: staff discount = Σ line `discountSatang` (add `_sum` to the existing A6 `groupBy`) + bill discount − member/coupon part, compared against the total before line discounts. Or ask the owner to rule.
  - Missing check: AN3/AN4 only use `billDiscount` (qc :953–956). Add a line-discount bill and a member-discount bill.
- **H2 (Med-) Row cap drops whole rules silently** · `reports.ts:1481`
  - Rows are sorted by rule, then cut by `slice(0, r.limit)`. The CSV cuts at 1000 (`:1698`), the print at 1000 (`report-actions.ts:183`).
  - Input: 31 days × 3 units of daily staff-meal comps (A4) gives more than 200 A1–A7 rows. The screen (default limit 200) then shows no A8/A9 cash-shortage rows; CSV and print lose them past 1000.
  - Nothing says rows were dropped: `byRule` exists only in totals, and the print footer (`report-print-shared.ts:176`) gives just the row count.
  - Fix: apply the limit per rule (or rank A8/A9 first), and add a notice in CSV/print when `rowCount > rows.length`.
  - Missing check: a fixture with more than `limit` A4 rows still shows A8, or shows the notice.
- **H3 (Low) Print header says "ทุกสาขา" for scoped actors** · `report-actions.ts:191`
  - Input: MANAGER{A} prints with no `unitId` → the header reads "ทุกสาขา / All branches", but the numbers are A only.
  - Fix: when `unitId` is omitted and the scope is not every unit, `unitLabel` = the scope's unit names joined (`s.unitName`).
  - Missing check: PD3 run as MANAGER{A} asserting `unitLabel`.
- **H4 (Low) A8 value has no sign** · `reports.ts:1451`
  - Input: one shift ฿150 short and one ฿150 over both export as "150.00", so the owner cannot tell missing cash from surplus.
  - Fix: keep `value` (the contract); add the sign or "ขาด/เกิน" to the CSV/print cell, taken from whichever side won the max.
  - Missing check: AN8 asserts the CSV cell for an over shift.
- **H5 (Low) Bills `channelCounts` never matches the channels report under a cut-off** · `bills.ts:272`
  - The bills day is the Bangkok calendar day on `paidAt ?? createdAt` (`bills.ts:97`). Reports use `createdAt` plus the cut-off. Deposit receipts also count as STORE (CD-9).
  - Input: cut-off 240 and a STORE bill at 02:00 on D+1 → the channels report puts it on D, the bills page on D+1.
  - Fix: U footnote, or a follow-up to make the bills day cut-off-aware. Missing check: CH3 with a cut-off ≠ 0.

## Probed OK
1. **Channels = daily.** Gross − refunds and billCount match (PAID+REFUNDED, deposits out). A sale that uses a deposit counts once, a voided bill is out of both, and gift card vs cash makes no difference. A refund on day 2 lands on day 2 in channels, daily, branches and hourly. Cut-off 240 at 02:00 → day D in every reader.
2. **Branches.** MANAGER{A}: the total row and `overShortSatang` are A only. Archived C is in the OWNER total and drops out without access. Sales but no closed shift → row present; only uncounted force-closed shifts → no row, so Σ rows = totals.
3. **Hourly.** Cut-off 270: 04:29 on D+1 folds into D's "04", 04:31 is D+1's "04". A sale exactly at the cut-off is included (`gte`). The fixed ÷4 forecast is ruled (CD-8); a 2-week-old shop reads half, so U may footnote it.
4. **Anomalies.** A1 is deduped per audit row, and a bill can be voided only once (`service.ts:1407`). A3 skips net ≤ 0, so there is no division. A6 does not count WEIGHED lines. A9 groups per unit per the rule table. A10 is unit-level (`userId` null). Thresholds: the writer refuses out-of-range values; the clamp applies only to stored JSON, so a typo is refused, not hidden.
5. **PDPA / access.**
   - `view` without the anomaly key → PERMISSION_DENIED on the reader, CSV and print; a forged kind → VALIDATION.
   - MANAGER{A} asking for B → NOT_FOUND, same as a unit that does not exist.
   - A deleted user → `userName` null, with no email fallback. Print goes through `esc()`, and the CSV has the formula guard.
6. **Bills `"*"`.** Scope = `receiptReadScope` per unit, rescoped on every page. Archived channels keep their code. Refund docs cannot be VOIDED, so the drawer block is safe.

## Controller rulings — fix round 1 (15 Oct 17:57Z · binding) = R1 F1–F3 + hunter H1–H4 + ORACLE-ADD
1. **R1 F1 / F2 / F3 = fix** as ruled above (unitNames · `totalRow` flag by kind · no write/audit when the audit view is unchanged).
2. **H1 = fix (Med)**: A3/A4 measure the **staff-controllable discount** = Σ line `discountSatang` (from the existing A6 `groupBy` with `_sum`) + bill discount − coupon part − member part (the parts the register stores separately — name the columns); base = gross before line discounts (Σ line gross). A member/coupon-only bill ⇒ no A4 row; a 100 % line-discount bill ⇒ A4 hit. Rule labels/threshold text unchanged.
3. **H2 = fix (Med-)**: apply the row limit **per rule** (each rule keeps up to ⌈limit / rules-with-rows⌉, remainder filled by rule order) so no rule disappears; CSV + print show a notice line when `totals.rowCount > rows.length` ("แสดง N จาก M แถว").
4. **H3 = fix (Low)**: `unitLabel` = joined `s.unitName` when `unitId` is omitted and the scope is not every unit of the system.
5. **H4 = fix (Low)**: A8 CSV/print cell shows the sign/word ("ขาด −150.00" / "เกิน +150.00") from the winning side; `value` in the row contract stays absolute.
6. **H5 = follow-up line** (bills day vs cut-off; U footnote) + R1 F4 (PosTableSplit overrides) + F5 (en print labels) in the notes' follow-ups.
7. **ORACLE-ADD (test-first, own `test(...)` commit, marker `// ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1)`)**: `qc-pos-p2.12` **AN13** = line-discount bill (100 %) ⇒ A4 hit and A3 counts it; member/coupon-only discount bill ⇒ no A4 row (red-before = H1); **AN14** = fixture with > limit A4 rows ⇒ A8 row still present and the CSV carries the notice line (red-before = H2); **PD4** = MANAGER{A} print without `unitId` ⇒ `unitLabel` is unit A's name, and the A8 CSV cell carries the sign word (red-before = H3/H4); plus AN12 extended by one assert for `totals.unitNames` (F1). Suite = 30 + 3 = 33. Record red-before at 42e3ce17 in `P2.12-red.txt` §fix1.
8. **Gates after fix 1**: `qc-pos-p2.12` 33/33 forced ×2 + unforced · `qc-pos-p1.17` 40 · `qc-pos-p2.11` 34 · `qc-pos-p1.18` 81 · `qc-pos-p1.16` 28 · `qc-pos-p1.1` 180 · `qc-pos-p1.3` 128 · typecheck 0 · fitness ±env. Then fetch `origin/session/pos` (f37d605b already merged; if it moved, merge) → push → R2 (hunks) → merge → merge gates (§6 regression set) → push → 39/55.

## R2 (re-verify fix round 1 · Opus read-only · tree c @b5beeae0 · 15 Oct 18:42Z) — verbatim summary
**Verdict: MERGEABLE.** Rulings 1–5 implemented as ruled; ORACLE-ADD test-only with real red-before (29/33). G1 Low (AN13 asserts only the coupon half; member subtraction unasserted → add a tier-discount bill in the next ORACLE-ADD, HF-FU2/U) · G2 Low (pre-P1.12 bills: `memberBenefits` null but `discountSatang` holds the member part ⇒ counted as staff discount for old ranges → fallback to `tierDiscountSatang` later or U footnote) · nit `?? ""` at reports.ts:1566. Verified: F1 unitNames :1566/:1771 headers "สาขา"/"Branch"; F2 `REPORT_TOTAL_ROW_KINDS` = 9 kinds each ending in an unconditional total row; print `totalRow` :90/:142; F3 skip write+audit :311, real change audits once :316; H1 sources (`CouponRedemption.discountSatang` via coupon.redeem; `memberBenefits.lines` excl. COUPON = memberDiscount), clamp ≥ 0, A4 base Σ unitPrice×qty, A6 unchanged; H2 `capPerRule` round-robin :1284, notice :1644/:1652/print :104/:182; H3 `reportPrintNames` :1821 (scope ∩ view), OWNER/all ⇒ "ทุกสาขา"; H4 sign :1533, `a8SignedSatang` keyed by PosShift id; hygiene clean (reports.ts, report-print-shared.ts, report-actions.ts, settings-general.ts, qc-pos-p2.12.mts only). Builder choices 1–3 accepted (U: never send limit < 10).
**Controller:** merge. G1/G2 → follow-up lines (notes already carry F4/F5/H5).
