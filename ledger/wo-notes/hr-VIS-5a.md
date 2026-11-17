# HR VIS-5a — builder notes (payroll area to mockup 06, layout only)

Branch `wip/hr-vis-5a` (lane 3) · base = merge-base with `session/hr` 09713f430 · oracle `scripts/qc-hr-vis-5a.mts` @ 1e0a6a210 (38 checks, rulings r2).
Commits: step 1 `3399895b5` · step 2 `32b80204c` · step 3 `669eb83e4` · oracle-edit / fix commits listed at the end.

## Pre-build finding (reported, ruled r2)
Base page, rendered through the suite's shim, sections per viewer: OWNER all 8 · branch-limited payroll (STAFF [U1] + hr.payroll.read) = run2 · we · stock · PayrollSection (profiles/attendance/adjust/create/runs) · MANAGER [U1] (no keys) = no-access notice · run2 (minutes) · we · **stock + request form** (`rbac.evaluate()` gives MANAGER every unit-less action ⇒ `canRequestStockCharge`). Ruling r2: manager nav = run + hours + adjust.

## Step 1 — views + move
Files: `src/app/app/sys/[id]/hr/payroll/page.tsx`, `payroll-ui.tsx` (`parts`), `pay-run-view.ts` (new: `PAY_VIEWS`, `payViewOf`), `payroll-run-ui.tsx` (ytd link → `?view=ytd#hr-ytd-card`), messages `hr.payview.*`, inventory row `hr-pay-view-*`, walk matrix states `11v-payroll-view-*`.

| view | sections rendered (moved, not rewritten) | nav gate (existing functions) | O | P | PB | M |
|---|---|---|---|---|---|---|
| run (default) | `PayrollRunSection` · no-access notice (viewer without `canViewPayroll`) · engine-1 shop: PayrollSection create + runs | always | ✓ | ✓ | ✓ | ✓ |
| hours | `WorkEntriesPanel` + PayrollSection `attendance` (payroll viewers) | `canReadWorkEntries ∨ canViewPayroll` | ✓ | ✓ | ✓ | ✓ |
| adjust | PayrollSection `adjust` (payroll viewers) + `StockChargeSection` | `canViewPayroll ∨ canRequestStockCharge ∨ canSeeStockCharges` | ✓ | ✓ | ✓ | ✓ |
| profiles | PayrollSection `profiles` | `canViewPayroll` | ✓ | ✓ | ✓ | – |
| docs | `BankFileSection` · `FilingSection` · `SalaryCertSection` | `canUseBankFiles ∨ canUseFilings ∨ canUseSalaryCerts` | ✓ | per keys | – | – |
| ytd | `OpeningYtdCard` | `canUseFilings` | ✓ | per keys | – | – |
| history | PayrollSection `create` + `runs` (v1 list, exclusions, stranded, slip chips) | `canViewPayroll` ∧ engine 2 (engine-1: run view lists runs; `?view=history` still renders) | ✓ | ✓ | ✓ | – |

- `payViewOf(sp)`: an explicit valid `view` wins. Otherwise the view is inferred from the params: bank*/f*/ty/sc → docs · yty/ymsg/yn → ytd · stock* → adjust · we → hours · anything else → run. The frozen actions' redirects therefore land on the right view without changes.
- Both `we=` redirects of the page now carry `view=hours`. `back2` is unchanged (run).
- Width: run · hours · docs `max-w-[1200px]` · profiles · adjust · ytd · history `max-w-2xl`.
- Page desc is now `hr.payview.desc`.
- PayrollSection `parts?: ("profiles"|"attendance"|"adjust"|"create"|"runs")[]`. Omitting it gives the old output. Reads that feed only hidden parts are skipped: `monthlyAttendance`, `stockConsentByAdjustment`, `giveBackPeriodOf`. The Thai section titles are unchanged (W2 finds them by title; Q5).
- Every section keeps its own gate inside. A view the nav hides still renders whatever the section gates allow.

## Step 2 — run screen (mockup 06)
Files: `payroll-run-ui.tsx` · `pay-run-view.ts` (`runFigures`, `workedDaysOf`) · `period-label.ts` (new: `periodLabel`, `dayLabel`; month names read from the message files) · messages · inventory.
- Header: breadcrumb · `h2` "รอบจ่าย {period}" · sub-line (pay date · N people) · excluded note `hr-run2-excluded` (limited viewer) · buttons on the right: sync, rebuild (DRAFT), and a link to `?view=adjust`. The section uses `aria-label`, because heading ids that start with `hr-run2-` are counted as test ids by N1.
- Period chips `hr-run2-row-*`: compact, wrapping, 44 px, at most 12 plus the selected run.
- Stepper `hr-run2-steps` (≥ md): circles with connecting lines. The current step uses the accent colour, and the review step shows "review N". At 390 it is the line "ขั้น 2/5 · ตรวจ".
- Tiles `hr-run2-tiles`, row 1: net (hero, ink), gross (pay-type counts), OT (Σ OT lines; footnote "all additions ฿X"), commission. Row 2: deduct, SSO employee, SSO employer (footnote: shop cost), WHT. OT and commission come from `runFigures`: Σ of stored lines, null ("—") when a row's addition lines ≠ its stored `addSatang` (Q1).
- Table `hr-run2-table`: one `<table>`, no `min-w`, no scroller. Columns: name (link `hr-run2-lines-*` → `?emp=`) · base · worked days (Q2: HrWorkDay `workMin>0` of the run period, visible ids only) · OT · add (stored `addSatang`, code labels below) · deduct (code labels below) · SSO · WHT · net · status (ready / review + first reason).
  - Visibility: `md:table-cell` for base / add / deduct / SSO / status. Days / OT / WHT appear only from `xl` (`2xl` while the drawer is open). At 390 the table shows name (+ status chip) and net.
  - Totals row `hr-run2-totals` = the tile values (already scoped). Base total = Σ stored wage lines, shown only when every row reconciles.
- Money cells keep the old expressions, now in one place (`cellsOf`). The tile array lines are unchanged and the totals row reuses them, so there is no new `*Satang` arithmetic in tsx (S5).
- Drawer `hr-run2-drawer` (`?emp=` only if it is a row of the viewer's own preview): earnings / deductions lines (label · day · minutes · requested · amount), totals of each group, SSO and WHT of the row, net, flags. Links: attendance month, slip, additions/deductions view. Placement: side column at ≥1280, after the table below that.
- Review `hr-run2-review` is one `<details>` (collapsed). It holds `hr-run2-warn` and the review items grouped by code, plus `hr-run2-ytd-link` → `?view=ytd#hr-ytd-card`.
- Bar `hr-run2-bar`: approve / pay (+ PayFields) / reverse. At 390 it is sticky at the bottom only in DRAFT (approve). Doc links `hr-run2-doclink-{bank,pnd1,sso110}` follow in normal flow, only for APPROVED/PAID runs and only where the docs gates pass.
- Accounting callout `hr-run2-jv`: wording only, no amounts (Q3).

## Step 3 — states, labels, 13b
- Runs list: every engine (v1 too). `pick` falls back to the newest REVERSED run of the period.
- Create shows only when the period has no live run (a count of non-REVERSED runs of the period).
- `hr-run2-banner`: DRAFT "review N" · APPROVED · PAID (pay date) · REVERSED (danger, read-only, stepper hidden, no actions, create shown) · engine-1 run ("classic payroll" + link `?view=history`; none of rebuild / approve / pay / reverse / branch confirm / doc links / JV; sync stays).
- Labels: `hr.run2.title` "รอบจ่ายเงินเดือน" / "Pay run" · `runs` without engine wording · chips, heading, create and the PayFields date hint use `periodLabel`.
- 13b (`reports-ui.tsx`, screen only): the status cell of payroll-month uses `hr.run2.st_*`, the engine column is filtered out on screen (DTO/CSV unchanged, B2), and the `net` th/td are `sticky right-0`.

## Test ids
Added: `hr-pay-view-*` (page.tsx), `hr-run2-banner`, `-drawer`, `-excluded`, `-totals`, `-bar`, `-doclink-*`, `-jv` (all in payroll-run-ui.tsx). Moved/changed: `hr-run2-lines-*` (`<details>` → link, inventory `kind: link`), `hr-run2-review` (`<details>`), `hr-run2-sync` and `hr-run2-rebuild` (header), `hr-run2-steps` (hidden below md). Nothing removed. The id `hr-run2-engine-title` (settings card heading) was dropped in favour of `aria-label`.

## ORACLE-EDIT list (commit `702ba0bac`, every hunk marked `ORACLE-EDIT (HR VIS-5a · controller)`)
| file | check | acceptance |
|---|---|---|
| `scripts/qc-hr-h3.6.mts` | S1.6 frozen | `VIS5A_ALLOW` = payroll-ui · payroll-run-ui · reports-ui, in base only, every hunk adds `HR VIS-5a` |
| `scripts/qc-hr-h3.9.mts` | S1.5 frozen | same |
| `scripts/qc-hr-h4.3-lib.mts` | S1.6 hrFrozen + other oracles | `VIS5A_ALLOW` = the 3 product files + qc-hr-h3.6 / h3.9 / priv-2 + qc-hr-vis-5a(.mts, -lib.mts); every hunk adds `HR VIS-5a` (the new oracle files carry it in line 1) |
| `scripts/qc-hr-priv-2.mts` | S4 oracle edits · S5 allowed files / marked hunks | S4: `VIS5A_ORACLES` (h3.6 · h3.9 · h4.3-lib · vis-5a · vis-5a-lib); S5: `VIS5A_SRC` (page · pay-run-view · period-label · payroll-ui · payroll-run-ui · reports-ui) accepted when every hunk adds `HR VIS-5a` + `◂` — this also covers the "removes-other" moved `HR H3.4` / `HR PRIV-2` lines; their privacy content is pinned verbatim by qc-hr-vis-5a S4 |

Not edited: h3.3, h3.7, h3.8, money-2, hf-sso, h4.6 S14, h3.1, h3.4(-lib), h3.4-ytd(-lib) stayed green as they are. `hr-run2-*` ids stay in payroll-run-ui.tsx (h3.4-lib S1.9).

## Open item — qc-hr-vis-5a N1 (oracle question)
N1 `codeRows` requires a `/hr/payroll` inventory row for every `hr-run2-*` string in payroll-run-ui.tsx. That includes `hr-run2-engine` and `hr-run2-engine-save` of `PayrollEngineCard`, which renders on **/hr/settings**. The inventory already has those two rows, under the settings page. K3 forbids moving the card out of payroll-run-ui.tsx. Adding payroll-page rows for them would be false, because the walker would then expect them on /hr/payroll. I left N1 red (37/38): it needs a controller ORACLE-EDIT, e.g. N1 ignores ids that have an inventory row on another page.

## Re-shoot list (controller walk · `walk-hr.mts --only`) — above the fold
Walker states: `11a-payroll-open` (O P PB M MB S), `11b-payroll-bank` (now lands on ?view=docs via payViewOf), `x1-payroll-approved`, `x2-payroll-paid`, `x3-payroll-reversed`, `x4-payroll-v1-paid`, `13b-report-payroll`, the new `11v-payroll-view-{hours,adjust,profiles,docs,ytd,history}`, plus one drawer state by hand: `?view=run&period={period.DRAFT}&run={run.DRAFT}&emp={emp.namfon}#hr-run2-drawer` (O).
- **1440, DRAFT (11a O):** module tabs, the payroll sub-nav (7 tabs), breadcrumb + "รอบจ่าย <ก.ย. 2569>" + sub-line, sync / rebuild / add-deduct on the right, period chips, banner "ร่าง · ต้องตรวจ N", stepper with step 2 in accent, both tile rows (hero net black), table header. Page height without the drawer ≲ 2,300 px (14 people, rows ~56 px, review collapsed).
- **1024:** title, stepper, tile row 1 (tiles are 4 columns from `lg`). Table without days / OT / WHT and without a horizontal scroller.
- **390:** title, banner, the "ขั้น 2/5 · ตรวจ" line, net tile full width, then 2-column tiles. Table = name (+ status chip) and net. The approve bar is sticky at the bottom in DRAFT, and all controls are ≥ 44 px. Expected height ≲ 3,000 px (needs a picture; the chips can wrap up to 12).
- **x1 APPROVED / x2 PAID:** no create form · banner (approved / paid + pay date) · doc links bank / ภงด.1 / สปส.1-10 (owner) in the bar row · x2 PB: in-scope rows only + `hr-run2-excluded` note in the header.
- **x3 REVERSED:** red banner (role=note) · no stepper · table read-only · create form shown · no bar.
- **x4 v1:** banner "รุ่นเดิม …" + link to ?view=history · table · title with the v1 period · only sync in the header.
- **13b:** status cells in words, no engine column, net pinned right inside the declared scroller.
- **Manager (11a M/MB):** nav run · hours · adjust; the run view shows the no-access notice + minutes list + branch confirm, no ฿.
- **Drawer (≥1280):** side column 400 px beside the table; days / OT / WHT columns only from 2xl while it is open. Below 1280 the drawer sits under the table.

## Could not verify without pictures
Above-the-fold positions and page heights · the sticky bar at 390 (`max-md:contents` wrapper + sticky child) · that the 1024 / 1280 tables fit without clipping (`overflow-hidden` on the rounded table frame would clip rather than scroll if a long name or code label is too wide) · stepper connector look · selected-row tint (`--color-accent-soft` + inset bar) · chip wrapping at 390 · EN-THAI in moved legacy sections (Q5, expected) · `PAY_SCOPE_EXCLUDED_TEXT` is Thai on en (frozen constant in scope.ts).

## Runs (lane 3 DB, iso.sh + qc-hr.sh + gate lock, QC_H06_BASE as ordered)
- seed-hr-qc 34/34.
- qc-hr-vis-5a: forced ×3 → **37/38** each (N1 only, see open item) · unforced 37/38 · RESIDUE none every run.
- Green: h3.1 58/58 · h3.3 51/51 · h3.4 85/85 · h3.4-ytd 44/44 · h3.5 53/53 · h3.6 62/62* · h3.7 68/68 · h3.8 78/78 · h3.9 60/60* · h4.2 57/57 · h4.3 45/45* · h4.6 69/69 · h4.8 48/48 · h1.3 63/63 · h2.4 68/68 · h0.6 55/55 · set-1 25/25 · money-2 57/57 · priv-2 47/47* · hf-sso 41/41 · qc-hf-hr-privacy 194/194 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hr-payadjust 27/27 · qc-audit-trail 21/21 · qc-hr 9/9 · qc-pages 31/31. (* = after the ORACLE-EDITs. Before them, h3.6 S1.6, h3.9 S1.5, h4.3 S1.6 and priv-2 S4/S5 failed as the brief expected.)
- qc-nav-functions: 10/11. S5 fails only on HOTEL / BOOKING accordion completeness (not HR; untouched here). The HR lines are clean.
- fitness 54/54 and fitness-hr 9/9, both with env and with `env -u DATABASE_URL -u DIRECT_URL`.
- Clean typecheck (`rm -rf .next/types tsconfig.tsbuildinfo`, ISO_MEM=14000M, started at MemAvailable 14.7 GB) → exit 0.
- Process note: one earlier typecheck was started by mistake at MemAvailable 8.5 GB. I stopped it (its iso unit) after ~7 min, before it finished.

## Ruling r3 (add vs OT) — commit `93895540d`
- `pay-run-view.ts`: per row `addNoOtSatang` = stored `addSatang` − Σ stored OT lines. When a row does not reconcile, it stays the stored `addSatang` and that row's OT cell shows "—". The totals are `addNoOtSatang` = Σ rows and `otRowsSatang` = Σ row OT cells. All of this is server-side; the tsx only displays the values.
- Table: there are two "เพิ่ม" header/cell pairs.
  - `hidden xl:table-cell` (or `2xl` while the drawer is open): additions excluding OT, beside the OT column. The code labels drop OT.
  - `hidden md:table-cell xl:hidden` (or `2xl:hidden`): the stored additions total, with the hint `hr.run2.addInclOt` ("รวม OT" / "incl. OT") when the person has OT.
  - The totals row follows the same pattern. A row without OT shows the same value in both variants.
- Re-shoot: 11a O at 1440 and 1024 — check that the add/OT cells read as in the mockup (≥1280: add excludes OT) and that the hint sits under the stored total at 1024.
- Runs after r3: listed in the controller report.
- N1 was fixed by the oracle author (55478f5d1). The Thai excluded-staff note on the English page is deferred to VIS-5e.

## Picture round 1 (controller list on e9edb3338) — commit `60ed7fa29`
### Investigations
- **I1 (PB reverse control):** checked with a scratch probe outside the repo (own tenant, lane-3 wrapper; the oracle's shim renders the page and the probe calls `reverseRunV2Action` in the same request scope). BASE 09713f430 was rendered through `TSX_TSCONFIG_PATH` → a base worktree in /tmp; it showed no sub-nav, which confirms it was the base code.
  - BASE: `hr-run2-reverse` was rendered for PB on a v2 PAID run. The action refused: read-only PB got "ไม่พบรอบจ่ายนี้ หรือคุณไม่มีสิทธิ์ดู" (key check); PB holding every payroll key got "รอบจ่ายเงินเดือนครอบคลุมทุกสาขา — ต้องเป็นผู้ดูแลทุกสาขาจึงทำรายการได้" (`assertRunAllBranches`). The run stayed PAID.
  - HEAD before the fix: same as base. After the fix: reverse not rendered for either PB. An all-branch STAFF with keys still sees it.
  - Fix: create / rebuild / approve / pay / reverse are rendered only when `isAllBranches(hrScopeOf(...))`, the same check as `assertRunAllBranches`.
- **I2 (history "1 คน: ต้องตรวจ" vs run "10"):** they count different things.
  - History (legacy v1 list) counts rows whose snapshot carries the `PARTIAL_MONTH` flag. That is เจ, mid-month, and its text says "ยังไม่คิดตามสัดส่วน".
  - The run view counts review items from `previewPayrollRunV2`: 10 × `YTD_OPENING`, opening YTD missing.
  - For a v2 run the history text is wrong in substance: the v2 engine does prorate (the `PRORATION` line "÷30" shows under เจ's additions). This is legacy copy outside this ticket; proposed for VIS-5e.
- **I3:**
  - "มิ้นท์ −฿150" twice = the same stock charge seen twice: once as the pending pay adjustment it created (tagged "เบิกของ/ค่าเสียหาย · หนังสือยินยอม …") in the additions/deductions list, and once in the stock-charge section's own list. The base page stacked both sections too, so the split did not create it.
  - Hours view second block = the legacy `PayrollSection` attendance part. It always shows this month and the previous month (`monthlyAttendance(now)`), not the `?period`. The brief's §3 table put it in hours. Pre-existing; not changed.
### Fixes
- **F1:** the row status is a badge + a short reason (`hr.run2.rs_*`, e.g. "ยังไม่กรอกยอดยกมา" + "+N" when there is more than one). The full texts are in the "ต้องตรวจ N รายการ" block (grouped) and in the drawer.
- **F2:** `draft` = DRAFT ∧ v2. Locked runs show the run state chip in rows and in the totals, and no review sub-label on the stepper.
  - Sync is hidden when the page period has an APPROVED/PAID run. That is the same condition as `frozenRun` (work-entries) and the attendance-pay sync check.
  - Rebuild / approve / branch confirm stay DRAFT-only.
- **F3:** REVERSED: banner and run first. The create form sits in its own block at the end ("สร้างรอบจ่ายใหม่ของงวด …" + note). The banner copy now says "ด้านล่าง". With no run, the create form stays near the top.
- **F4:** the engine-1 banner is an info banner (accent border + accent-soft background + bold title) in the same `rounded-2xl border p-3` family as the status and danger banners.
  - The gross tile label reads "ยอดก่อนภาษี/ประกันสังคม (ค่าจ้างฐาน + เพิ่ม − หัก)".
  - OT/commission "—" now carry "รอบนี้ไม่แยกรายการเพิ่มตามประเภท · รายการเพิ่มทั้งหมด ฿X".
- **F5:** when a run exists but the preview is refused (a MANAGER of every branch — `previewPayrollRunV2` `mgr && allUnits`), the page shows a banner "งวดนี้มีรอบจ่ายแล้ว (ร่าง) — รายละเอียด…ไม่เปิดให้บัญชีของคุณ" instead of "ยังไม่มีรอบ".
  - Branch managers get a minutes table: name · days · worked · unpaid leave · holiday work. It uses the same `<table>` (`tableOf`, one `<table>` in source).
  - The test ids moved to the frames: `hr-run2-table` / `hr-run2-minutes`.
- **F6:** at 390 the action bar is no longer sticky. It is in flow, right after header / chips / banner / step line (`max-md:-order-*`), so nothing is ever covered.
  - Tiles are `min-w-0` with wrapping labels; en `tile_deduct` became "Deductions (late, absence, advance, claims)". This removes the 400 px page.
- **F7:** `whitespace-nowrap` on every money cell, on tile values (text-lg below sm), drawer amounts, "รวม N คน" and the status chips.
- **F8:** the page wrapper is always `max-w-[1200px]`. Only the view content of adjust / profiles / ytd / history is wrapped in `max-w-2xl`, so the sub-nav stays on one row at 1440.
- **F9:** `PayrollSection` gets `locale` from the page. Adjust list, exclusions, stranded, run rows, confirm titles and slip chips use `periodLabel`. The 13b title uses `periodLabel` / `dayLabel`.
  - **Not done:** "งวด 2026-06" in the hours panel (`work-entries-ui.tsx`) and the docs periods (`bank-files/**`, `filings/**`). Those files are outside VIS5A_ALLOW / frozen by S1 — this needs your ruling.
- **F10:** walk states `11d-payroll-drawer` (O 1440 th+en), `11d-payroll-drawer-390` (O 390 th), `11d-payroll-drawer-pb` (PB 1440 th), `11d-payroll-drawer-click` (O 1440 th, clicks `[data-testid^="hr-run2-lines-"]`). The trigger `hr-run2-lines-*` is an inventory row `kind: link`.
### Runs (after 60ed7fa29)
- qc-hr-vis-5a: forced ×4 → 39/39 each; unforced → 39/39; RESIDUE none every run.
- h3.4 85/85 · h3.4-ytd 44/44 · h3.6 62/62 · h3.7 68/68 · h3.8 78/78 · priv-2 47/47 · qc-hf-hr-privacy 194/194.
- fitness 54/54 and fitness-hr 9/9 in both modes.
- Clean typecheck exit 0 (MemAvailable 15.7 GB at start).
### Re-shoot (picture round 2)
- **11a O 1440 th:** rows about 56 px with a short reason; totals on one line; sub-nav on one row.
- **11a O 1024 th:** SSO tile on one line; add column shows the stored total + "รวม OT" where there is OT.
- **11a O 390 th/en:** order is header → chips → banner → step line → approve button (in flow, not covering) → tiles. en width 390, no horizontal scroll; deduct label wraps.
- **11a M 1440:** banner "งวดนี้มีรอบจ่ายแล้ว (ร่าง) …"; no "ยังไม่มีรอบ" text.
- **11a MB 1440:** minutes table.
- **x1 / x2 O:** rows show "อนุมัติแล้ว" / "จ่ายแล้ว"; no sync button.
- **x2 PB:** no reverse button and no doc-link buttons beyond the docs gate.
- **x3 O:** red banner → tiles → table → "สร้างรอบจ่ายใหม่ของงวด ก.ค. 2569" block at the bottom; sync visible (period not frozen).
- **x4 O:** blue info banner with a bold title; gross tile label with the formula; OT note "ไม่แยกประเภท".
- **11v adjust / profiles / ytd / history:** sub-nav on one row; Thai period labels in the legacy lists.
- **13b:** title "… · ก.ย. 2569".
- **New:** `11d-payroll-drawer*` states.

## Picture round 2 (on 3c91c6068) — commit `5a3aba2bd`
- **P1:** the "ต้องตรวจ N รายการ" box renders only for a v2 DRAFT.
  - The header sync renders only with no run or a draft.
  - After a reversal, sync moves into the "สร้างรอบจ่ายใหม่ของงวด …" block. The action allows it there because the period is not frozen.
  - Approved, paid and v1 runs have no sync anywhere (frozen period).
- **P2:**
  - Cells are `px-2` below xl and `px-3` from xl.
  - The code labels under add/deduct use `whitespace-normal`. At 1024 one long label ("เข้า/ออกกลางเดือน (÷30)") was widening the add column and pushing the status column out of the card.
  - The short reason shows only from 1280 with the drawer closed. With the drawer open and at 1024 only the badge shows.
  - Money stays nowrap. The table frame keeps `overflow-hidden`; with these widths the 1024 and drawer-open layouts fit (the controller confirms with pictures).
- **P3:** consent dates in the adjust list use `dayLabel` ("14 พ.ย. 2569"). ISO left in files outside this ticket (→ VIS-5e or a ruling):
  - `stock-charge-ui.tsx` — `t("period", { period: c.periodKey })` at :168 and :222.
  - `RunRowActions.tsx` — dialog titles "อนุมัติ/ดึงข้อมูลใหม่/ลบรอบร่างงวด 2026-…" at :60, :70, :81.
  - `work-entries-ui.tsx` — hours panel "งวด {period}".
  - `bank-files/**` and `filings/**` — docs periods, ปีภาษี ค.ศ.
  - Native month pickers ("November 2026", "September 2026") belong to VIS-5e.
- **P4:** rows at 1440 with the reason are about 69 px: badge 28 px + reason line + padding. The mockup rows with a reason are about 70 px. Rows without a reason, and all rows at 1024 or with the drawer open, are shorter.
- **P5:** the action row renders only when it holds a control or a document link. The branch-limited viewer on a PAID run gets no gap.
- **P6:** both are legacy list content in `payroll-ui.tsx`'s runs part, unchanged by the split → VIS-5e.
  - The "พนักงาน" slip chip comes from `nameByEmp.get(...) ?? "พนักงาน"`, a name map built only from the current in-scope employee list. A person missing from that list (e.g. ended) gets the fallback.
  - "โบว์ · ต้องตรวจ" comes from the legacy `PARTIAL_MONTH` flag on the slip chip of any run.
- **OT seed (for the walk):** no seeded v2 run has an OT line. The only seeded OT, น้ำฝน +฿600 (6 h), sits in period ต.ค. 2569 = the engine-1 PAID run (x4), so it shows only as a stored addition.
  - To show the r3 rule, add an APPROVED pay adjustment kind OT for น้ำฝน (`emp.namfon`, monthly ฿16,000) in `{period.DRAFT}` (มิ.ย. 2569) before the DRAFT v2 run is built. Alternatively write the DRAFT run's snapshot with an `{code:"OT", ref, day:null, minutes:null, amountSatang:60000}` line and raise that item's `addSatang` / gross / net and the run totals by the same 60000.
  - One person with OT plus the others without is what T1 checks.
- **Runs:**
  - qc-hr-vis-5a forced ×3 → 39/39 each (one run before the commit, same code); unforced 39/39; RESIDUE none.
  - h3.4 85/85 · h3.6 62/62 · h3.8 78/78 · priv-2 47/47.
  - fitness 54/54 and fitness-hr 9/9 in both modes.
  - Clean typecheck exit 0, started at 24.2 GB free.
