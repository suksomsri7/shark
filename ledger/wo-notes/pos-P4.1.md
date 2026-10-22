# P4.1 builder — registry fill + 19 debt testids (builder · account B · 22 Oct 2026 10:29–12:09Z UTC)

Tree `/root/projects/shark-pos-b` · branch `wip/pos-p4.1` = `origin/session/pos` 554a74d3 + merge of the oracle 537195ad (3857aa03, no conflicts) · prompt `ledger/pos-briefs/pos-prompt-accountB-P4.1-BUILD.md` · brief `pos-brief-P4.md` §4/§10 + addendum (W29 · W30) · oracle notes `pos-P4.1-oracle.md` · walker notes `wo-notes/pos-P4.2-walker.md` (branch wip/pos-p4.2-walker) · ruling W8 (RESUME 07:3xZ).
UI edits = attribute-only testids (+ optional data-testid forwarding in EmptyState/SubmitButton) · no legacy register file touched (W29) · no DB writes, no build/serve, no QC5, every node command through `scripts/iso.sh`.

## Method
Registry research split by page into 5 read-only research agents (register · settings · tables/kds/orders · sales/shifts/close/reports · products/price-rules/stock/public). Each wrote a patch (`page|testid → fields + why file:line`), validated by a Python mirror of R1/R2/R3/R9/R9b (`p41lib.py`). The builder applied one patch per commit (builder-owned rows protected), re-ran `qc-pos-p4.1 --no-db` after each page group, then did safety/kind/claim fixes centrally. Scratch: `/tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/p41b/` (patches/, p41lib.py, safety.py, builder_rows.py, run-*.log).

Manager rule (W8): walker manager = MANAGER, permissions {}, unitAccess [posqc-btn-unit] while POS links ≥ 3 units. evaluate() gives MANAGER full rights inside its unit ⇒ default roles. Exceptions from code: not rendered for non-owner / needs all linked units (posCanSetTenantPrice, canOnAllLinkedUnits, canEditReceipt, isOwner hide) ⇒ hiddenFor; rendered-but-disabled ⇒ roles + needs; ≥ 2-branch-only controls ⇒ hiddenFor when not rendered, roles + needs when a same-testid span is drawn.

## Commits
| SHA | step |
|---|---|
| 3857aa03 | merge oracle 537195ad |
| 2f127d04 | R5 — 19 debt testids + rows · baselineDebt 0 (5 files) · EmptyState/SubmitButton forward data-testid |
| a308ea50 | R4 public roles (60) · R10 15 refusal rows (kind notice · ui refused) · R6 $mockupGaps |
| 2c4e46c6 | test(pos) ORACLE-EDIT R9b (ruling W8) |
| c01028db | register fill |
| 8272101e | settings fill |
| 1901b5e5 | tables · kds · orders (+ legacy restaurant KDS row) |
| 53f0b030 | sales · shifts · close · reports · reports/print |
| 0ec3b1e1 | products · price-rules · stock · public pages |
| 7b49f1ea | safety + kinds + claims fixes (44 rows) |
| 1b64d7b9 | oracle ids on 6 external rows (P1.10-P1 · P2.12-PD3 · P3-SKEL-LP1) |
| (this) | notes |

## Counts before → after (qc-pos-p4.1 --no-db)
Start (3857aa03, 1,208 rows): 7/15 · red R1 R2 R4 R5 R6 R10 R11 R12 · R1 214 · R2 155/205 · R4 60 · R5 19 · R6 1 · R10 15 · R11 23 · R12 11 external + 3 counter. R9b (added 2c4e46c6) red-before 1,093/1,182 staff rows.
| step | R1 | R2 | R9b | R11 | R12 ext / ctr | other |
|---|---|---|---|---|---|---|
| debt (2f127d04) | 214 | 155/207 | – | 23 | 11 / 3 | R5 19→0 ✅ |
| public/refusal/mockup (a308ea50) | 214 | 155 | 1,093 | 23 | 11 / 3 | R4 60→0 · R10 15→0 · R6 1→0 ✅ |
| register | 179 | 130 | 782 | 12 | 9 / 3 | |
| settings | 164 | 86 | 520 | 12 | 8 / 3 | |
| tables/kds/orders | 146 | 44 | 302 | 9 | 5 / 3 | |
| sales/shifts/close/reports | 96 | 32 | 145 | 1 | 1 / 1 | |
| products/price-rules/stock/public | 0 | 0 | 0 | 1 | 1 / 1 | |
| adjust (7b49f1ea) | 0 | 0 | 0 | 0 | 0 / 0 | **16/16** |
Final registry 1,242 rows (1,182 staff + 60 public): opener 952 · needs 815 · viewport 51 · safety 58 (external 27 · money 16 · counter 15) · manager roles 1,072 / hiddenFor 110.

## The 19 debt testids (file:line at head)
- `src/app/app/sys/[id]/pos/products/page.tsx` (12): 65 pos-products-module-tabs · 125 pos-products-legacy-services-connect · 131 -services-add · 148 -services-edit · 157 -items-connect · 163 -items-add · 172 -need-account · 187 -price-form · 189 -price-system (hidden) · 190 -price-item (hidden) · 209 -price-input · 212 -price-save
- `close/page.tsx` (3): 67 pos-close-module-tabs · 71 pos-close-date-form · 76 pos-close-date-view
- `close/CloseDayTools.tsx` (2): 66 pos-close-counted · 91 pos-close-csv
- `sales/page.tsx:59` pos-bills-module-tabs · `shifts/page.tsx:84` pos-shift-module-tabs
- forwarding: `src/components/ui/EmptyState.tsx` (to the action Link) · `src/components/ui/SubmitButton.tsx` (to the button) — optional prop, absent = same DOM (pattern of ModuleTabs P1.17 U).

## $mockupGaps
- 08-reports · inputs · gap 1 — mockup has date + branch pickers; the branch picker = pos-report-unit (select), the date pickers are pos-report-from/-to registered as kind filter (R6 buttons bucket). No control missing.

## Open questions (CD-P41-B*)
- **CD-P41-B1 (shared components)**: closing EmptyState/SubmitButton debt needs the call-site testid to reach the DOM, so `src/components/ui/EmptyState.tsx` and `SubmitButton.tsx` gained an optional `data-testid` prop (absent = identical DOM) — same pattern as ModuleTabs (P1.17 U). This is the only non-attribute UI hunk; please rule it acceptable under "attribute-only".
- **CD-P41-B2 (hidden inputs)**: two of the 19 debt elements are `<input type="hidden">` (products legacy price form). Rows exist (kind input · ui unchanged · needs "ช่องซ่อน type=hidden"). Proposal for P4.2: the walker skips `input[type=hidden]` like `file-upload` (or F15.3 stops counting hidden inputs — fitness ORACLE-EDIT).
- **CD-P41-B3 (same-testid spans for single-unit users)**: `pos-reg-unit-switch` (RegisterTopContext.tsx:73-80), `pos-kds-unit` (KdsTopBar.tsx:42-46) and `pos-prod-unitFilter` (branch mode, ProductsClient.tsx:327-334) render a non-pressable element with the same testid for a 1-unit user ⇒ walker manager/cashier cells will record dead. Rows = roles + needs "ผู้ใช้เข้าถึง ≥ 2 สาขา" (W8). Proposal P4.3: distinct testid for the static chip.
- **CD-P41-B4 (walker capabilities the registry cannot express — P4.2)**: after-money phase for PayDone/deposit-done rows (needs today) · two-press controls (held discard, staff PIN next, stock qty "นับ" button) · Enter-only submit (pos-stock-scan) · `aria-checked`/`aria-current` as idle (radio patterns, bills page buttons) · inline-error rows whose error needs an invalid fill (receipt branch/address/phone, anomaly fields) · first-card openers (tables/orders have no per-state testids — `data-state` selection proposed).
- **CD-P41-B5 (fixture coverage)**: posqc-btn-unit has no tables, KDS stations, online channels/orders, credit accounts or board ⇒ 815 rows carry needs and will skip. P4.2 fixture seeding (QC5 only) decides how many of them become presses.
- **CD-P41-B6 (dead / legacy rows — drop?)**: `pos-settings-card-state-offline` (never rendered: page always passes offlineLive) · `pos-kds-legacy-open` (legacy KDS page redirects before the banner) · `pos-reg-member-remove` (CartPanel fallback never used) · `pos-pay-button` / `pos-member-select` / `pos-catalog-item` on register (testids exist only in legacy register-ui.tsx, W29) · `pos-sales-unit-all` (an `<option>`; reachable as opener step `pos-bills-unit=*`). Kept with needs/notes; deleting rows is a controller call.
- **CD-P41-B7 (real bug → P4.3)**: a one-branch manager cannot save/toggle/archive an all-branches price rule: branch chips hidden when `data.units.length ≤ 1` (PriceRulesClient.tsx:493) ⇒ `unitIds []` ⇒ `canWriteUnits` (price-rule.ts:90-94) checks every linked unit ⇒ PERMISSION_DENIED while the button is enabled.
- **CD-P41-B8 (testid collision → P4.3)**: pattern `pos-prod-price-*` (drawer input, ProductPanel.tsx:356) also matches the table/card price span `pos-prod-price-<productId>` (ProductsClient.tsx:184) ⇒ false hiddenLeak for the manager. Proposal: rename the span (`pos-prod-baseprice-*`).
- **CD-P41-B9 (expect.type changes made on code evidence — please review)**: ui→mutation + money: pos-shift-open/close/recount-submit (PosShift/PosShiftRecount writes; close would otherwise end the walker's own shift early) · navigate→mutation + money: `/q` pos-qr-place (creates PosOrder + PaymentIntent on a public page — walker money-unit check will flag it outside posqc-btn; intended fail-closed) · ui→toast + external: KDS print rows · mutation→ui: coupon/points apply, offline confirm/pay (no server write) · inline-error→ui: 12 rows (error only after a server refusal) · navigate→ui: pos-close-date · toast→modal: pos-reg-scan-camera. Kind → notice: 21 display-only rows (offline banners/queues, stock pickers, request-changed, KDS 86 sheet div).
- **CD-P41-B10 (external rows without an oracle id)**: 2 of 27 external rows cite no DB check (pos-print-drawer-open · pos-tbl-qr-sheet-print — no suite covers drawer kick / QR sheet print) ⇒ P4.2 W6 red on them until a stub check exists. The other print rows cite P1.10-P1 / P2.12-PD3 / P3-SKEL-LP1.
- **CD-P41-B11 (registry completeness per page, not caught by F15.3 which is per file)**: `/q/[linkToken]` has no menu/cart rows (QrMenuBoard/QrCartBody shared with /q/t) · the sales-page instance of TaxInvoiceDialog (issue-later) has no sales rows for its fields (pos-taxinv-taxid …). Proposal: add in P4.3 or a P4.1b sweep.
- **CD-P41-B12 (judgement calls)**: commission sync (HrPayAdjustment) = safety money · pos-taxinv-submit (register, ui) = counter because the same dialog issues the full tax invoice on /pos/sales · refusal cards that no QC persona can reach (wrong unit / partial permission) = roles [cashier] + needs, hiddenFor owner+manager · public rows: hiddenFor cleared (R4 = ["public"] only; W8/R9b not applied to public pages — the walker never runs staff users there).
- **CD-P41-B13 (lint)**: `pos-oracle-check … --base 554a74d3` = warn O3 (PIN default 6e32c1e2 ≠ base) — by design CD-P41-O12 (R5 compares pre-P4.1 counts); with `--base 6e32c1e2` VERDICT green.

## Gates
`bash scripts/pos-pre-submit.sh /root/projects/shark-pos-b --wo qc-pos-p4.1 --set core --also qc-pos-p2.14,qc-pos-p1.18,qc-pos-p5.2,qc-pos-p3-skel,qc-pos-p3.6,qc-pos-p3.9,qc-pos-p3.4,qc-pos-p3.5` (run via `systemd-run` so it survives the session) — 2 runs:
- run 1 @7b49f1ea (`/root/pos-runs/presubmit-shark-pos-b-20261022T111158Z`): green 18 · red 3 = p3.4 ST2 + hf-fu2 ST1 (lane pins) + **p3.9 Z2** (fingerprint outside the temp tenant: AuditLog 3866→3862 — other lanes (CRM c3.3 · HR h0.3) were writing QC4 at the same time; this card writes no DB) → green in run 2.
- run 2 @1b64d7b9 (final code head · `/root/pos-runs/presubmit-shark-pos-b-20261022T113526Z`):

```
PRESUBMIT-TABLE head=1b64d7b9 tree=/root/projects/shark-pos-b
suite                        exit pass/total     s  failed
wo-qc-pos-p4.1-run1          0    16/16        167
wo-qc-pos-p4.1-run2          0    16/16        162
wo-qc-pos-p4.1-nodb          0    16/16         63
qc-pos-p1.1                  0    180/180      220
qc-pos-p1.3                  0    128/128      220
qc-pos-p1.6                  0    48/48         75
qc-pos-p1.18                 0    81/81        160
qc-pos-p2.14                 0    60/60        104
qc-pos-p3.5                  0    55/55         74
qc-pos-p3.4                  1    50/51         99  P3.4-ST2  ⟵ lane pin (expected)
qc-pos-p3.9                  0    48/48         49
qc-pos-p3.6                  0    52/52         64
qc-pos-p3-skel               0    41/41         41
qc-hf-fu                     0    29/29        124
qc-pos-p5.2                  0    34/34         83
qc-hf-tx                     0    22/22         29
qc-hf-fu2                    1    30/31         26  HF-FU2-ST1  ⟵ lane pin (expected)
fitness-noenv                0    53/53         19
fitness-qc4                  0    53/53         18
fitness-pos                  0    8/8           10
gen-check                    0    -              2
PRESUBMIT head=1b64d7b9 green=19 red=2 expected-lane-pin=2 unexpected-red=- · wo: qc-pos-p4.1-run1=16/16 · qc-pos-p4.1-run2=16/16 · qc-pos-p4.1-nodb=16/16 · VERDICT red (2: qc-pos-p3.4 qc-hf-fu2)
```
Lane-pin reds (file:line): **HF-FU2-ST1** = this card's hunks `src/app/app/sys/[id]/pos/close/CloseDayTools.tsx:66` and `:91` carry no HF-FU2 marker (re-pin at merge) · **P3.4-ST2** = W21 (`register.ts` outside the P3.4 block, not touched here).
Also: `qc-pos-p2.14 --no-db` 15/15 (K3 · V1 · V2) · `fitness-pos` 8/8 (F15.3a/b) · `qc-pos-p1.18 --no-db` 16/16 · `qc-pos-p4.1 --no-db` **16/16** (14 R + R9b + Z1) · `visual-pos.mts --list` rc 0 (320 states, none renamed) · lint `pos-oracle-check … qc-pos-p4.1 --base 554a74d3` = warn O3 only (CD-P41-B13; `--base 6e32c1e2` green) · fitness 53/53 run via iso before each commit (commits use --no-verify so the hook does not run node in the session cgroup).
Typecheck (once, final code head 1b64d7b9): `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → **exit 0** (tsc --noEmit · 12:05:55Z start)

## Visual states for the controller
UI hunks touch products (legacy box + module tabs), close, sales, shifts module tabs (attribute only) — reshoot suggestion: `--states --state` of the products/close/sales/shifts default states (owner + cashier). EmptyState/SubmitButton DOM unchanged when no testid is passed.
