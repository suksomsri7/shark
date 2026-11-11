# POS P4.3 fix9 — tax-invoice branch row fits in EN (CD-P43-16)

Tree `/root/projects/shark-pos-b` · branch `wip/pos-p4.3-fix9` from `336c205e` · builder S (account A) · product code + notes only.

## Cause
- Row `สาขา · อีเมล` in `src/components/pos/register/TaxInvoiceDialog.tsx` is a 2-column grid (`sm:grid-cols-[1fr_1fr]`). At md+ the dialog is `md:w-[560px]` with `md:px-6` ⇒ content 512 px ⇒ each column **248 px** (1440 and 1024 are identical; 1024 ≥ md).
- The branch segment row is `div.flex.gap-2` = head-office button (`shrink-0`, `whitespace-nowrap`, auto width — P2.14 U2 O-6) + `label.flex-1` holding the "Branch no." radio (`shrink-0`, text `whitespace-nowrap`) and the code input (`min-w-[6ch]` = 50.4 px at 14 px). Nothing in that row can shrink below its content, so the row's min-content width is the real width.
- The grid tracks were **not** the culprit in practice: the fieldset already has `min-w-0`, so the `1fr` column stayed 248 px and the email column started at x=264. The flex row simply overflowed its 248 px column (overflow visible) and the email input (painted later) covered the right end of the branch label, including most of the code input. The walker's click on `pos-taxinv-branch-code` hit its centre (x≈266 in column coordinates) — inside the email box (starts at 264) — so "00000" was typed into the email.
- **Thai overflows too** — by 36 px (EN: 55 px). The TH walker only passes because the TH input centre (≈246) is still left of the email box (264). Evidence: harness numbers below, and the existing TH shot `/root/projects/shark-pos-d/.qc-shots/pos/p1.16/register-taxinvoice-dialog-owner-1440x900.png` (crop: `/root/pos-runs/p43-fix9/measure/th-crop.png`) shows the "สาขาที่ ____" box running ~20 px under the e-Tax email box. Mockup 15A (`ledger/design-pos/15-taxinvoice-split.png`) has the two branch options **inside** the left column with a gap before the email field (its dialog is ~720 px, columns ~333 px).

## Fix (smallest change that removes the overlap in both locales)
`src/components/pos/register/TaxInvoiceDialog.tsx` — 2 class changes, each with a `POS P4.3 fix9 ▸ CD-P43-16 … ◂` marker:
1. Row grid `sm:grid-cols-[1fr_1fr]` → `sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]` — defensive; pixel no-op today (fieldset already `min-w-0`), but the column can no longer be pushed wider than half if the fieldset's min-width ever regresses.
2. Branch segment row `flex gap-2` → `flex flex-wrap gap-2` — the actual fix. When "head office | branch no. ____" does not fit its column, the branch-number segment drops to its own line (full column width, input ≥ 122 px) instead of running under the email field. Where it fits on one line the layout is untouched.

No i18n key changed, no `data-testid` added/removed, no other file touched.

### Deviation from the brief — TH at md+ cannot stay pixel-identical
The brief assumed TH fits ("Thai passes because สาขาที่ is short"). Measured, it does not: TH needs 284 px in a 248 px column, so TH already overlaps the email field by ~20 px at 1440/1024 (see Cause). No CSS that removes the EN overlap can leave that TH overlap in place, and leaving TH overlapping would keep a latent copy of the same bug (a 2-digit layout shift away from the walker typing into the email). With `flex-wrap`, TH at 1440/1024 now also shows the branch-number segment on a second line (fieldset 81 → 131 px tall); TH at 390 and at sm (640–767) is pixel-identical. **Controller ruled (CD-P43-16b): not acceptable — see "fix9b" below (dialog widened to the 15A width; no wrap at md+).**

Alternatives considered and rejected:
- `label min-w-0` + input `min-w-[5ch] flex-1` (brief option b): saves only 8.4 px + the input's slack; TH needs −36 px, EN −55 px ⇒ the input would have to fall to ~14 px (TH) / below 0 (EN). Not viable.
- Unequal tracks (e.g. `[auto_minmax(0,1fr)]` or ~1.6fr/1fr): keeps one line but squeezes the email column to ~193 px (EN) and makes the email column jump ~1 px when the bold state toggles; the `w-full` input's intrinsic width also leaks into an `auto` track. Bigger visual change than wrap.
- Shorter EN string ("Branch"): EN still 280 px > 248, and TH still overflows.
- Always single column: much taller dialog at 1024×768.

## Measurements (headless chromium, IBM Plex Sans Thai 400/700, CSS copied 1:1 from the classes)
Harness: `/root/pos-runs/p43-fix9/measure/m.html` (numbers) · `m2.html` → `before-after.png` (visual). Harness check vs the real EN screenshot: head-office button 122.1 px (shot 122) · branch label 173.3 px (shot ≈172).

Text at 13.5 px:

| string | regular | bold |
|---|---|---|
| th "สำนักงานใหญ่" | 77.6 | 80.7 |
| en "Head office" | 68.8 | 72.1 |
| th "สาขาที่" | 36.9 | 38.8 |
| en "Branch no." | 64.9 | 67.9 (1.75× TH) |
| input `6ch` @14 px | 50.4 | — |

Branch row (head office selected = default; "branch selected" is within ±1.5 px):

| viewport | column | locale | needed (hq + 8 + label) | before: overflow col / over email | after |
|---|---|---|---|---|---|
| 1440 & 1024 (dialog 560, content 512) | 248 | th | 130.7 + 8 + 145.3 = 284.0 | 36.0 / **20.0** | wraps: row 1 hq 130.7 · row 2 label 248 (input 153) · overlap 0 |
| 1440 & 1024 | 248 | en | 122.1 + 8 + 173.3 = 303.4 | 55.4 / **39.4** | wraps: label 248 (input 125) · overlap 0 |
| 640 (sm, w-full, content 600) | 292 | th | 284.0 | 0 / 0 | identical (one line, label 153.3, input 58.4) |
| 640 | 292 | en | 303.4 | 11.4 / 0 (into the 16 px gap) | wraps: label 292 (input 169) · overlap 0 |
| 390 (1 column, content 350) | 350 | th | 284 | 0 / 0 | identical (label 211.3, input 116.4) |
| 390 | 350 | en | 303 | 0 / 0 | identical (label 219.9, input 97.0) |

EN fits one line from a 304 px column (viewport ≥ 664 px below md); TH from 284 px (≥ 624 px).

## Same-pattern scan (Deliverable 2)
Scope: `src/components/pos/register/*.tsx` + `src/app/app/sys/[id]/pos/**/*.tsx` — 88 `whitespace-nowrap` sites (raw list with resolved th/en strings and EN/TH visible-length ratios: `/root/pos-runs/p43-fix9/measure/scan-raw.txt`), plus every `grid-cols-[…1fr…]` in scope.

Fixed:
- `TaxInvoiceDialog.tsx` branch row (above) — the only `1fr_1fr` pair in scope that holds a nowrap segment; "Branch no." 1.75× (width) / 2.0× (chars) "สาขาที่".

Checked and left alone (reason):
- `TaxInvoiceDialog.tsx:243` `seg()` person/company tabs (`flex-1 whitespace-nowrap`): EN shorter ("Individual"/"Company" vs "บุคคลธรรมดา"/"นิติบุคคล"); container `self-start` sizes to content — no overflow.
- `TaxInvoiceDialog.tsx` tax-ID row ("Look up in DBD" vs "ค้นจากกรมพัฒน์ (DBD)"): EN shorter, row stacks below sm.
- `TaxInvoiceDialog.tsx:264` amount chip: number only.
- Other `1fr` grids in scope (`ManagerPinPad [1fr_auto]`, `OfflineRegisterParts [1fr_auto]/[auto_1fr]`, `CartPanel [auto_1fr]`, `ProductPanel [110px_1fr]`, `ReconcileView`, `StockShortcuts`, `ShiftsClient` ×9, `StockClient`): none holds a nowrap text segment next to a sibling field; most already use `minmax(0,…)`.
- Chips `shrink-0 whitespace-nowrap` beside a `min-w-0 flex-1` text that absorbs the space (EN/TH ≥ 1.4 or close): `ChannelsPanel.tsx:249` "Not connected" 1.62 · `ApiKeysCard.tsx:99` status (row `flex-wrap`) · `IntegrationCredsCard.tsx:175` (row `flex-wrap`, title `min-w-0 flex-1`) · `SlipSettingsCard.tsx:50` 1.38 · `StaffSettings.tsx:374` 1.17 · `SharkSettings.tsx:391–392` e-Tax "Waiting for provider" 2.0 (row `flex-wrap justify-between`, whole block wraps by design P1.18U V2) · `RegisterTopContext.tsx:229` status 1.00–1.17 (spacer `flex-1` absorbs).
- `shark-ui.tsx:206` offline state chip (1.50–1.72): `w-fit` inside `flex-col`, not a 1fr/flex-1 segment; longest EN "Only the shop owner can turn this on or off" measured 236.5 px incl. padding/border at 11.5 px; not the defect pattern, so left alone (available width at 390 not measured in-app — worth a glance on the next owner-mobile-en cell).
- Table cells (`ReportsClient.tsx:362/366/633`, `BillsClient.tsx:1345`, report/branch-compare headers): inside horizontally scrolling tables, not grid/flex-1 segments.
- `HeldBillsDrawer.tsx:73` money (nowrap number beside `min-w-0 flex-1 break-words` title) · `RegisterStatusBar.tsx:23` (status bar, no 1fr/flex-1 segment; EN 1440 shot clean) · remaining sites are numbers/dates/times/codes with no i18n text.
- Outside scope, noted only: `CompanyChip.tsx` (display text), `ReceiptSettings.tsx:417` branch-no label is `min-w-0 flex-1` without nowrap.

## Tests (2026-10-25, tree b at the fix, uncommitted working tree)
Logs: `/root/pos-runs/p43-fix9/tests/*.log`.

Static (via `env -C /root/projects/shark-pos-b ISO_MEM=3G bash scripts/iso.sh …`, no qc4.sh), 12:58Z–12:59Z:
- `p4.1-nodb`:
```
JSON_SUMMARY {"suite":"qc-pos-p4.1","mode":"no-db","total":16,"passed":16,"failed":[],"skipped":false,"registered":16,"pin":"6e32c1e2","probes":{"P4.1-R1":true,"P4.1-R2":true,"P4.1-R3":true,"P4.1-R4":true,"P4.1-R5":true,"P4.1-R6":true,"P4.1-R7":true,"P4.1-R8":true,"P4.1-R9":true,"P4.1-R9b":true,"P4.1-R10":true,"P4.1-R11":true,"P4.1-R12":true,"P4.1-R13":true,"P4.1-R14":true,"P4.1-Z1":true}}
### rc=0 2026-10-25T12:58:54Z
```
- `fitness-noenv`:
```
JSON_SUMMARY {"total":53,"passed":53,"findings":[]}
### rc=0 2026-10-25T12:59:11Z
```
- `fitness-pos`:
```
JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
### rc=0 2026-10-25T12:59:20Z
```
- `visual-dry-th` (summary head; plan truncated here):
```
JSON_SUMMARY {"wo":"all","user":"owner","tenant":"coffee","dry":true,"locale":"th","states":true,"pages":15,"viewports":3,"shots":221
### rc=0 2026-10-25T12:59:21Z
```
- `visual-dry-en` (summary head; plan truncated here):
```
JSON_SUMMARY {"wo":"all","user":"owner","tenant":"coffee","dry":true,"locale":"en","states":true,"pages":15,"viewports":2,"shots":141
### rc=0 2026-10-25T12:59:21Z
```

QC4 (`env -C /root/projects/shark-pos-b ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts`), 12:59:33Z → 13:03:32Z. `qc-pos-p1.13` = the full-tax-invoice suite (P1.13 "ใบกำกับเต็มรูปจากจอชำระ", forced in `pos-gates.json`) — run in addition to p1.15:
- `qc-pos-p2.14`:
```
JSON_SUMMARY {"suite":"qc-pos-p2.14","total":60,"passed":60,"failed":[],"skippedChecks":[],"skipped":false,"forced":false,"missing":[],"hasP27U":true,"crashed":false,"guardHits":0,"residue":0}
### rc=0 2026-10-25T13:01:00Z
```
- `qc-pos-p1.13`:
```
JSON_SUMMARY {"suite":"qc-pos-p1.13","total":33,"passed":33,"failed":[],"skipped":false,"forced":false,"missing":[],"guardHits":0,"residue":0,"leaks":[],"drift":[]}
### rc=0 2026-10-25T13:01:34Z
```
- `qc-pos-p1.15`:
```
JSON_SUMMARY {"suite":"qc-pos-p1.15","total":40,"passed":40,"failed":[],"skipped":false,"forced":false,"missing":[],"guardHits":0,"a5":{"drift":[],"fpDrift":[],"tempLeft":[]}}
### rc=0 2026-10-25T13:02:12Z
```
- `qc-pos-p2.13`:
```
JSON_SUMMARY {"suite":"qc-pos-p2.13","total":54,"passed":54,"failed":[],"skippedChecks":[],"skipped":false,"forced":false,"missing":[],"st5Pins":true,"mergeBase":"4016a3527a2d5675eb3dd1f5150fb380d7fcf9c1","guardHits":0,"residue":0}
### rc=0 2026-10-25T13:03:32Z
```

Strict typecheck exactly as `scripts/pos-gates.json` commands.typecheck (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`):
```
### 2026-10-25T13:03:55Z typecheck (avail 9526 MB)

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-b
> tsc --noEmit

### rc=0 2026-10-25T13:04:49Z
```

Not done (by rule): no build, no serve, no real-app screenshot — the fixed layout is proven by the harness only; the next walker/visual run should re-shoot `register-taxinvoice-dialog-owner-1440x900(-en)` and cell owner-desktop-en (`pos-taxinv-branch-code` live, `pos-taxinv-form` closes). Visual baselines for TH 1440/1024 of this dialog will change (second line in the branch field) — see Deviation.

---

# fix9b — dialog at mockup 15A width (CD-P43-16b)

Ruling CD-P43-16b: the 560 px dialog never matched 15A; Thai on two lines is not acceptable ⇒ widen the dialog to the 15A width, keep `minmax(0,1fr)` + `flex-wrap` as the safety net.

## Width source (read, not guessed)
`ledger/design-pos/15-taxinvoice-split.body.html` line 106, the 15A modal rule:
`.tim{position:absolute;left:50%;transform:translateX(-50%);top:36px;width:720px;…}` (body padding `.tim .b{padding:20px 28px}`, branch/email grid `.g2f{grid-template-columns:1fr 1fr;gap:14px}`). ⇒ **720 px**.

## Change
`TaxInvoiceDialog.tsx` container: `md:w-[560px]` → `md:w-[720px]` (keeps `md:max-w-[calc(100vw-32px)]`, `max-h-[92dvh]`), marker `POS P4.3 fix9b ▸ CD-P43-16b … ◂`; the fix9 flex-wrap marker text updated (safety net wording). Nothing else.
- Breakpoint kept at **md**, not sm: below md the dialog is the bottom sheet (`RegisterDialog`: `items-end` until `md:items-center md:p-4`, sheet `w-full rounded-t-[16px]`, grab bar `md:hidden`). A 720 cap at sm would change nothing for 640–720 px viewports (sheet already full width, 600 px content at 640) and would only narrow the sheet at 721–767; mobile/390 behaviour is therefore untouched, as the ruling requires.

## Arithmetic
- md+ content = 720 − 2×24 (`md:px-6`) = 672 · column = (672 − 16 gap) / 2 = **328 px** ≥ EN 303.4 (margin 24.6) ≥ TH 284.0 (margin 44.0).
- Smallest width that would fit both (for reference): column ≥ 303.4 ⇒ content ≥ 2×303.4 + 16 = 622.8 ⇒ dialog ≥ 670.8 px. 15A's 720 is above that, so the mockup width is used as-is.
- Viewport fit: `md:max-w-[calc(100vw-32px)]` ⇒ at 768: min(720, 736) = 720 ✓ · at 1024: 720 ≤ 992 ✓ (dialog x 152–872, centred on the viewport by the fixed overlay; the 56 px icon rail stays uncovered) · at 1440: 720 (x 360–1080) = 15A.

## Rest of the dialog vs 560 (checked in source)
No fixed widths inside the dialog: header (title + chip + close, flex), kind tab strip (`self-start`, content width), tax-ID row (`flex-col sm:flex-row`, input `flex-1`, DBD button `shrink-0`), DBD result card (`min-w-0 flex-1 break-words` text + `shrink-0` button), name input / address textarea (`w-full`), branch/email grid (minmax tracks), info / request-changed / error paragraphs (flow text), footer (`sm:flex-row`, spacer `flex-1`, buttons). Every block is fluid, so widening only removes line breaks: no block gets taller, the branch fieldset goes back to 81 px (fix9 had 131 at md+), and e.g. the EN info line and the EN error line (two lines each in the 560 shot) have more room. Height cap `max-h-[92dvh]` (706.6 px at 768 tall) and the `overflow-y-auto` body are unchanged ⇒ at 1024×768 the dialog is no taller than before and still fits.

## Harness (static, headless chromium — `/root/pos-runs/p43-fix9/measure/m4.html`, results `fix9b-results.txt`, PNG `fix9b-before-after.png`)
Model: md+ content = min(W, vw−32) − 48; below md content = vw − 40; 2 columns from 640. "before" = 336c205e (560, no wrap); "fix9" = 9a0322e5 (560 + wrap); "fix9b" = 720 + wrap + minmax. Head office selected (branch-selected within ±1.5 px, same wrap/overlap result — full 60 rows in the results file).

| vw | locale | before: col · overflow / under email | fix9: col · wrap | fix9b: col · wrap · input · overlap |
|---|---|---|---|---|
| 1440 | th | 248 · 36.0 / 20.0 | 248 · YES | **328 · no · 94.4 · 0** |
| 1440 | en | 248 · 55.4 / 39.4 | 248 · YES | **328 · no · 75.0 · 0** |
| 1024 | th | 248 · 36.0 / 20.0 | 248 · YES | **328 · no · 94.4 · 0** |
| 1024 | en | 248 · 55.4 / 39.4 | 248 · YES | **328 · no · 75.0 · 0** |
| 768 | th | 248 · 36.0 / 20.0 | 248 · YES | 328 · no · 94.4 · 0 |
| 768 | en | 248 · 55.4 / 39.4 | 248 · YES | 328 · no · 75.0 · 0 |
| 640 (sheet) | th | 292 · 0 / 0 | 292 · no | 292 · no · 58.4 · 0 (unchanged) |
| 640 (sheet) | en | 292 · 11.4 / 0 (gap only) | 292 · YES | 292 · YES (safety net) · 169.1 · 0 |
| 390 | th | 350 (1 col) · 0 | no | no · 116.4 (unchanged) |
| 390 | en | 350 (1 col) · 0 | no | no · 97.0 (unchanged) |

At 1440/1024 neither language wraps (ruling met). Residual: EN in the bottom sheet between 640 and ~662 px wide wraps (column 292 < 303.4; one line from vw ≥ 663) — no overlap, safety net only; TH is one line from vw ≥ 624.

## Tests (fix9b working tree) — logs `/root/pos-runs/p43-fix9/tests-9b/`
Static (`env -C /root/projects/shark-pos-b ISO_MEM=3G bash scripts/iso.sh …`):
- `p4.1-nodb`:
```
JSON_SUMMARY {"suite":"qc-pos-p4.1","mode":"no-db","total":16,"passed":16,"failed":[],"skipped":false,"registered":16,"pin":"6e32c1e2","probes":{"P4.1-R1":true,"P4.1-R2":true,"P4.1-R3":true,"P4.1-R4":true,"P4.1-R5":true,"P4.1-R6":true,"P4.1-R7":true,"P4.1-R8":true,"P4.1-R9":true,"P4.1-R9b":true,"P4.1-R10":true,"P4.1-R11":true,"P4.1-R12":true,"P4.1-R13":true,"P4.1-R14":true,"P4.1-Z1":true}}
### rc=0 2026-10-25T13:09:29Z
```
- `fitness-noenv`:
```
JSON_SUMMARY {"total":53,"passed":53,"findings":[]}
### rc=0 2026-10-25T13:09:43Z
```
- `fitness-pos`:
```
JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
### rc=0 2026-10-25T13:09:52Z
```
- `visual-dry-th` (summary head; plan truncated here):
```
JSON_SUMMARY {"wo":"all","user":"owner","tenant":"coffee","dry":true,"locale":"th","states":true,"pages":15,"viewports":3,"shots":221
### rc=0 2026-10-25T13:09:53Z
```
- `visual-dry-en` (summary head; plan truncated here):
```
JSON_SUMMARY {"wo":"all","user":"owner","tenant":"coffee","dry":true,"locale":"en","states":true,"pages":15,"viewports":2,"shots":141
### rc=0 2026-10-25T13:09:54Z
```

QC4 (`env -C /root/projects/shark-pos-b ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts`):
- `qc-pos-p1.13`:
```
### 2026-10-25T13:10:01Z qc-pos-p1.13
JSON_SUMMARY {"suite":"qc-pos-p1.13","total":33,"passed":33,"failed":[],"skipped":false,"forced":false,"missing":[],"guardHits":0,"residue":0,"leaks":[],"drift":[]}
### rc=0 2026-10-25T13:10:42Z
```
- `qc-pos-p1.15`:
```
### 2026-10-25T13:10:42Z qc-pos-p1.15
JSON_SUMMARY {"suite":"qc-pos-p1.15","total":40,"passed":40,"failed":[],"skipped":false,"forced":false,"missing":[],"guardHits":0,"a5":{"drift":[],"fpDrift":[],"tempLeft":[]}}
### rc=0 2026-10-25T13:11:20Z
```
- `qc-pos-p2.14`:
```
### 2026-10-25T13:11:20Z qc-pos-p2.14
JSON_SUMMARY {"suite":"qc-pos-p2.14","total":60,"passed":60,"failed":[],"skippedChecks":[],"skipped":false,"forced":false,"missing":[],"hasP27U":true,"crashed":false,"guardHits":0,"residue":0}
### rc=0 2026-10-25T13:12:36Z
```

Strict typecheck (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`):
```
### 2026-10-25T13:12:47Z typecheck (avail 9515 MB)

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-b
> tsc --noEmit

### rc=0 2026-10-25T13:13:10Z
```

Not done (by rule): no build/serve, no real-app shot. Next visual/walker run: re-shoot `register-taxinvoice-dialog-*` (1440/1024 th+en — dialog now 720 wide, expected to match 15A) and cell owner-desktop-en (`pos-taxinv-branch-code` live, `pos-taxinv-form` closes). Note: the fix9 commit's own TH-wrap baseline never shipped; compare against 15A.
