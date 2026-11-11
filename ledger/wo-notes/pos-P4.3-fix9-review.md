# P4.3 fix9+fix9b — R1 review

## R1 P4.3 fix9+fix9b (ec00fe01)
Reviewer: R lane · tree p11 detached `ec00fe01` · range `336c205e..ec00fe01` (1 src file, 3 class changes) · 2026-10-25T13:17:26Z · static review, no build or serve.

### Verdict: MERGEABLE (no must-fix)

Checks:
1. **Width:** 720 = 15A. `ledger/design-pos/15-taxinvoice-split.body.html:106` has `.tim{…width:720px…}`. `md:max-w-[calc(100vw-32px)]` and `max-h-[92dvh]` are kept (TaxInvoiceDialog.tsx:253). The cap is 992 px at 1024 and 736 px at 768, so 720 fits at every md+ width, including inside RegisterDialog's `md:p-4` (16+16).
2. **No other 560 assumption:** a word-search of src/, scripts/ and ledger/design-pos for `560` finds no tax-invoice or `pos-taxinv` reference. The only hits are unrelated (member table, DataList, account slide-over, chat column, accounting fixtures), and there is no `w-[560` in any script.
3. **No testid, i18n key or walker-row change:** `pos-taxinv-dialog`, `pos-taxinv-branch-hq` and `pos-taxinv-branch-other` are unchanged, and no messages file is touched.
4. **Breakpoint stays md:** below 768 the sheet is still `w-full` with `rounded-t-[16px]`. The two-column grid still switches at `sm` as before. Between 640 and 767 the column is about (W−40−16)/2, so 292 px at 640, which is below EN's 303.4. There the new `flex-wrap` moves the branch input to its own line instead of overflowing under the email field, which is an improvement over before.
5. **Arithmetic:** body `md:px-6` (48) and grid `gap-4` (16) give (720−48−16)/2 = 328. That is ≥ EN 303.4 and ≥ TH 284, with 24.6 px to spare for EN. Even a ~15 px classic scrollbar in the `overflow-y-auto` body leaves 320.5, still one line. The builder's `fix9b-results.txt` agrees: at 1440, 1024 and 768, col=328, wrap=no, overflow 0, EN input ≈ 75 px, TH ≈ 95 px, fieldset height back to 81. At 390 the column is 350 with no wrap.
6. **Marker scans:** both markers are balanced `POS P4.3 fix9/fix9b ▸ … ◂`. The JSX-attribute comment placement is the same as the existing `POS P2.14 ▸ U2 O-6` marker on the HQ button. The builder re-ran qc-pos-p1.13 (33/33), p1.15 (40/40) and p2.14 (60/60) after fix9b (notes, fix9b section).

### Findings
G1 · Info · TaxInvoiceDialog.tsx:432 (`sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`)
Why: `minmax(0,1fr)` lets the branch column shrink below its content. Combined with `flex-wrap`, that is what stops it overlapping the email field. On a 640–700 px sheet (EN) the branch input now wraps onto its own line, at the cost of about 50 px of extra height. That is the intended safety net, not a regression.
Fix: none.
