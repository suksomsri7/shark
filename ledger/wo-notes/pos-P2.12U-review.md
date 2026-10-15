# P2.12U — review file (controller tree)

## R1 (Opus read-only · tree c @6b422dfe · 15 Oct 20:12Z) — verbatim
# P2.12U R1 review — head 6b422dfe (base 1c29ca9e) · tree shark-pos-c · read-only, code only

**Verdict: MERGEABLE-AFTER-FIXES.** Two small fixes, F1 (harness only) and F3 (one condition). Nothing blocks users. F2 is a Medium follow-up on the S side.

## Findings
- **F1 Medium: the `--pdf` probe tests the wrong print path.** File: `scripts/visual-pos.mts:7945`. The user path is fine: `PrintFrame.tsx:61/69` calls `print()` on the iframe's own window, so Chrome prints only the A4 document. That keeps its `@page` and the repeated `thead`, shows no app chrome, and paginates natively. The probe instead runs `page.pdf()` on the parent page. The parent has no print CSS (`app-shell/**` has no `print:hidden`; only the toolbar hides, `PrintFrame.tsx:81`). So the parent PDF holds the fixed topbar/drawer, and the iframe prints as one monolithic box: a long table (products 200 rows, the overview composite) is clipped or cut mid-row, with no repeated header and the iframe's `@page` ignored. Ctrl+P / browser-menu print takes the same parent path. The probe would give a false red on long documents or false confidence on short ones. Smallest fix (harness only): in the probe, read the frame's HTML after fonts load (`frame.evaluate(() => "<!doctype html>" + document.documentElement.outerHTML)`), `setContent` it in a fresh page with `<base href=origin>`, then call `pdf({preferCSSPageSize:true})`. No route response is needed for the clicked/auto path. A route response (`text/html` + in-document `print()`) only matters if Ctrl+P must also be clean: follow-up/owner decision.
- **F2 Medium (follow-up, S): the staff flag's discount base is not A3's.** File: `ReportsOverview.tsx:802`. It compares the staff row's `discountSatang` (Σ `PosSale.discountSatang` = bill discount **+ coupon + member**, line discounts **excluded**, `reports.ts:728`) against A3's bp. A3 itself uses `staffDiscOf` = line + bill − coupon − member (`reports.ts:1403,1473`), per unit+seller. Example: a cashier whose bills carry 25 % member/coupon discount gets "ส่วนลดสูงผิดปกติ" on the overview, while the anomalies tab A3 is empty. Line discounts go the other way (A3 hit, no flag). The A3 hint "ใช้กับป้ายในการ์ดพนักงานด้วย" (th.json:2201) overstates this. Ruling 5 is met by the letter (bp server-side, compare only). Smallest true fix = S exposes a per-staff-row A3 flag or staff discount; in U now, soften the hint/comment.
- **F3 Low (fix now): channel filter in all-branches mode.** File: `BillsClient.tsx:1111-1116`. `salesChannels` is keyed by per-unit id (`bills.ts:338-344`), so all mode lists "หน้าร้าน" (and each platform) once per branch with identical labels. Choosing the first one silently filters to one branch's store bills. Deduping by code is **wrong**: the server filters by id, so it would still show one branch. Smallest fix: hide (or disable) `pos-bills-channel-filter` when `allMode`. The `channelCounts` chips already give the per-code split. A code filter = S follow-up.
- **F4 Low: disabled hourly tab has no visible text.** File: `ReportsClient.tsx:805`. The "range too long" text appears only as a `title` tooltip, so touch (iPad/390) never shows it. The selected-tab case is fine (card message via `rangeError`). Smallest fix: when off, show `hourly.tooLong` as visible small text (or an `aria-describedby` hint) under the tablist.
- **F5 Low: residue if the run is killed.** File: `visual-pos.mts:6015,6032`. SIGINT/TERM/HUP plus `finally` restore the thresholds. A SIGKILL/OOM leaves A1 2 · A2 1 · A3 0.1 % · A4 20 % enabled until the next **owner** p2.12u run. That run sees the fingerprint and restores **defaults**, so a non-default original or `enabled:false` is lost. Fixture bills are permanent by design (12 forecast bills per run day, moved by `posSale.update` while their stock/journal stay dated today). QC-only; note it in the ledger.

## Verified OK
- **R1:** server page, `force-dynamic`, noindex, same gate as reports (`print/page.tsx:66-71,101`), refusal card by code (93-98,114,120), `?unit=` ∈ allowed. srcdoc = the action's `html` unchanged; fonts adopted, then `print()` once (`printed` ref). PDF link beside CSV on every tab + overview with kind/from/to/unit/locale, disabled on `rangeError`. RP-1 is in its own commit e1d6a286 with a dated ORACLE-ADD marker, static checks gate-before-read (81 → 82).
- **R2:** hourly bars + dashed forecast + "now" only when `singleDay && to === today`, after mount (HF-418). Daily chart on multi-day; hourly tab table + total + CSV; footnotes. `only` (Overview:357): hourly only when `from===to`, so a ≥ 2-branch actor on a multi-day range never triggers the hourly reader. Confirmed.
- **R3:** branches table; total via the `Table` `total` prop (tfoot, not text matching); tab only for ≥ 2 units; CSV.
- **R4:** groups A1→A10 with `t()` labels; money/bp/count formatting; A8 word from `a8SignedSatang`; `unitNames`; empty; denied card on PERMISSION_DENIED; tab hidden when `!canAnomaly`; row-cap notice when `rowCount > rows.length`. F5 hunk: pure, maps columns 1/7/8 for en anomalies only, th = CSV, deterministic.
- **R5:** `HIGH_DISCOUNT_BP` deleted; bp from `posAnomalyThresholds` passed by the page; `null` when disabled (base caveat F2).
- **R6:** switch + per-rule fields; `POS_ANOMALY_LIMITS` checked client-side; refusal mapped by `anomaly.rules.A#.<f>` path; existing general action; card only when `canEdit.general`; names note.
- **R7:** "ทุกสาขา" only inside `units.length > 1` + server re-check; chip from `unitName`; `channelCounts` chips; drawer uses the row's unit; refund lines only when the server sends them; H5 note.
- **R8:** 11 states / owner 11 · cashier 3; fixtures via module functions; `--pdf` off by default; `--dry` branch.
- **R9:** testids present; inventory 942; spec present.
- **Keys and hygiene:** th/en key sets equal, no new Thai in en. ST7: no Thai literal in changed TSX outside comments. No forbidden file touched; foreign hunks marked; client imports = shared/pure + actions/types.

## Builder decisions
- **R1 (iframe):** right for the clicked/auto path. Keep it; fix the probe (F1).
- **R1 (overview = S sections joined):** acceptable interim versus brief §4. The numbers are S bytes; the one-A4 KPI summary stays a follow-up.
- **R2 (`only` reading):** acceptable as ruled.
- **F5:** correct and minimal.
- **Channel-filter follow-up:** yes, misleading enough to fix now. Hide it in all mode (F3), not dedupe.

## Controller rulings — fix round 1 (15 Oct 20:12Z · binding)
R1 = MERGEABLE-AFTER-FIXES. Builder decisions (iframe print path · overview = S sections · `only` reading · F5 hunk) accepted.
1. **F1 = fix (harness)**: the `--pdf` probe prints the iframe document, not the parent: read the frame's HTML after fonts load (`frame.evaluate(() => "<!doctype html>" + document.documentElement.outerHTML)`), `setContent` in a fresh page with `<base href=origin>`, then `page.pdf({format:"A4", printBackground:true, preferCSSPageSize:true})`; keep the output names. Ctrl+P on the parent = follow-up line (route response variant) — not now.
2. **F3 = fix**: hide `pos-bills-channel-filter` in all-branches mode (do not dedupe); per-code filter = S follow-up line.
3. **F4 = fix**: when the hourly tab is disabled, show `hourly.tooLong` as visible small text under the tablist (not only `title`).
4. **F2 = follow-up (S)**: overview staff flag compares Σ `PosSale.discountSatang` (bill + coupon + member, no line discounts) against A3's bp while A3 uses the staff-controllable discount; now: soften the A3 hint text so it does not claim the card uses the same base ("ใช้เกณฑ์เดียวกับป้ายในการ์ดพนักงานโดยประมาณ"), and add a follow-up line for HF-FU2/P2.14 (S exposes a per-staff A3 flag). No S change in this U card.
5. **F5 = ledger note** (QC-only residue on SIGKILL: thresholds restored to defaults by the next owner run) — builder adds one line to the notes; no code.
6. **Gates after fix 1**: typecheck (changed-files tsc or 1 incremental run) · `qc-pos-p1.18` 81 (ST7) · `qc-pos-p1.16` 28 · `qc-hf-pos-page-authz` 82 · fitness ±env · fitness-pos · `--states --dry` th + en (owner + cashier). Push → controller re-runs the probe (vis85 `--pdf` on the two print states) + judges vis84 images → R1 re-verify (3 hunks) → merge.

## Controller image review — vis84 @6b422dfe (QC5 · 15 Oct 20:23Z)
- cashier 3/3 OK; owner th 11 states: 8 OK (hourly chart, branches tab, anomalies 1440/1024 rule groups "A1 ยกเลิกบิลบ่อย · เกณฑ์ ≥ 2 หรือ ≥ ฿1,000.00 …", empty state, staff flag, PDF button "พิมพ์ / PDF", settings anomaly card, bills all-branches chips, drawer refund block); print pages render the S sections (daily · hourly 24 rows + forecast · channels · payments · staff) with totals.
- **F6 (added to fix 1)**: 390 `reports-anomalies` — report-kind tab strip overflows the document (`pos-reports-tab-anomalies` right=1471) and anomaly tables cut at the card edge → scroll containers.
- **F7 (added to fix 1)**: print pages log 16 console 404s each (th + en) — resources inside the srcdoc resolving relative to `about:srcdoc` (suspected) → absolute URLs / `<base href>`; harness to print the failing URL.
- PDF probe this run = parent path (R1 F1) ⇒ not used as evidence; re-run after the probe fix (vis85).
