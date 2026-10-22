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
Lane-pin reds (file:line): **HF-FU2-ST1** = all 23 P4.1 UI hunks carry no HF-FU2 marker (CloseDayTools.tsx:66 · :91 · close/page.tsx:67 · :71 · :76 · products/page.tsx:65 · :125 · :131 … +15 — the R5 testid hunks of 2f127d04; *corrected in fix1 (R1 F10): earlier text named only CloseDayTools:66/:91*) (re-pin at merge) · **P3.4-ST2** = W21 (`register.ts` outside the P3.4 block, not touched here).
Also: `qc-pos-p2.14 --no-db` 15/15 (K3 · V1 · V2) · `fitness-pos` 8/8 (F15.3a/b) · `qc-pos-p1.18 --no-db` 16/16 · `qc-pos-p4.1 --no-db` **16/16** (14 R + R9b + Z1) · `visual-pos.mts --list` rc 0 (320 states, none renamed) · lint `pos-oracle-check … qc-pos-p4.1 --base 554a74d3` = warn O3 only (CD-P41-B13; `--base 6e32c1e2` green) · commits use --no-verify (the hook would run node in the session cgroup). *Corrected in fix1 (R1 F10):* a fitness record exists only for 2f127d04 (`p41b/fitness-1.log`) and for 7b49f1ea / 1b64d7b9 (pre-submit runs); a308ea50 · 2c4e46c6 · c01028db · 8272101e · 1901b5e5 · 53f0b030 · 0ec3b1e1 (registry/test only) had **no** fitness run — only a `qc-pos-p4.1 --no-db` run each (`p41b/run-*.log`). The final head was covered.
Typecheck (once, final code head 1b64d7b9): `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → **exit 0** (tsc --noEmit · 12:05:55Z start)

## Visual states for the controller
UI hunks touch products (legacy box + module tabs), close, sales, shifts module tabs (attribute only) — reshoot suggestion: `--states --state` of the products/close/sales/shifts default states (owner + cashier). EmptyState/SubmitButton DOM unchanged when no testid is passed.

## fix1 (builder · account B · 22 Oct 2026 12:31–13:0xZ UTC · registry-only round after R1 BLOCKED)
Prompt `ledger/pos-briefs/pos-prompt-accountB-P4.1-FIX1-BUILD.md` · R1 `ledger/wo-notes/pos-P4.1-review.md` (F1–F10). Every class was swept over the whole registry, not only the 102 sampled rows: 5 read-only research agents (register · settings · tables/kds/orders · sales/shifts/close/reports · products/price-rules/stock) traced each row in code and wrote patches + one permission entry per mutation row; the builder merged them per class (`p41-fix1/split.py`), applied them with invariant checks (`apply.py`: roles ≠ ∅ · roles ∩ hiddenFor = ∅ · manager claimed · opener steps = rows on the same page, no self/dup) and ran `qc-pos-p4.1 --no-db` + `fitness`/`fitness-pos` via iso (3G) after **every** commit (logs `p41-fix1/run-*.log`, `fitness-<sha>.log`, `fitness-pos-<sha>.log`). Product code untouched. Scratch: `/tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/p41-fix1/`.

| SHA | class | rows |
|---|---|---|
| 7343808a | F2/F9 safety money (CD-P41-F2) + `$fields.safety` text | 11 |
| 3da4670c | test(pos) ORACLE-EDIT R11 MONEY_ACTIONS (+7) / MONEY_MODELS (+4) — R11 detects 27 → 37 money rows (the 10 price/credit rows; pin-submit is set by ruling, not detected) | – |
| e4dd65d0 | F1 roles vs server · F4/F5 page/tab refusals | 120 (118 + 2 needs-only) |
| 2cc99026 | F6 openers | 67 |
| 4b5cbb61 | F3/F7 targets / viewport-proof states | 63 |
| 71b49fc3 | F8 oracle ids | 183 |
| (this) | notes · F10 corrections above (fitness record per commit · HF-FU2-ST1 = all 23 hunks) | – |
Registry vs d0c0732e: 1,242 rows (unchanged count) · 407 rows changed · fields: oracle 183 · hiddenFor 85 · roles 78 · opener 66 · query 36 · expect 29 · needs 29 · safety 11. Each commit: `qc-pos-p4.1 --no-db` 16/16 · fitness 53/53 · fitness-pos 8/8.

**Per class**
- **F2/F9** — safety money: 564 pos-prod-save · 575 bulk-run · 872 copy-run · 866 purgeDead-confirm · 604/625/626 price-rule active/save/archive · 1215/1219 legacy AccountProduct price form/save · 1143 credit-limit save · 398 pos-mgr-pin-submit (fail-closed; distinct testid for the CreditOverSheet PIN = P4.3).
- **F1** — 192 staff mutation rows traced (table below). Cashier dropped from roles where the server refuses: 15 tables writers (`table.ts:72-76 scope()` restaurant.* keys) · 1101 chat-pay (pos.order.accept) · 921/923 deposit refund (pos.sale.refund) · 275/361 receipt/pay settings save (pos.device.manage all branches) · 1133/1134/1145 credit/order-member switches (OWNER). Unreachable controls → hiddenFor: tables move/merge/QR-rotate (689 722-728 1009 1010) · order reject/cancel/prep sheets (769-776) · kitchen-max (838-840) · copy-between-branches (860 868-874, owner only: ≥ 2 branches) · unit menus ≥ 2 branches (4 · 229 · 542) · register weigh form (103-105, pos.sale.priceOverride) · empty-grid add-product (16) · sales PIN dialogs (399-401) · tax-invoice rows 420-428 (pos.taxinvoice.issue). 915 deposit PIN back = roles [cashier] (only a user without pos.sale.refund sees the pad).
- **F4/F5** — cashier refusal pages → hiddenFor: products 842 86-toggle · 841 station · shifts 1079 close-offline-blocked · settings devices tab 834-837 · staff/API cards · unreachable QR-link/channel-drawer rows (1019-1022 · 530/532/536 · 511). Read-only gates the cashier passes → roles: settings board tab (1104 1109-1117 1119 1122-1125 — disabled switches, needs) · chat rows 1095 (out of hiddenFor) · 1127 1132 1081 1023 1024 478 479 · price-rules module tabs/back 599/600 (rendered above the refusal card). Module tabs of products/stock/shifts/reports/close and pos-report-print-back really render beside the refusal → kept in roles (checked).
- **F6** — `=click`/`=on`/fill where the target is always rendered but disabled: 1171 `pos-device-mode-lan=click` · 308-311 BT mode · 533-535 payout platform · 1118/1126 rule switch before save · 857 tip ledger · 371 381-385 394-398 PIN keys · 39/99 qty-inc before dec · 52 discount reopen · 91 447 847 889 fill before submit · 694 698 699 703 713-718 724 792 799 803 807 838 (steppers · split equal tab · picks · KDS expo) · 564 `pos-prod-price-edit=click` · 127 shift close count+note · 174-191 stock count rows no longer chain `pos-stock-start-submit` (needs "รอบนับ OPEN ของสาขา") · 192/193 stock pickers open the receive tab.
- **F3/F7** — 1129/1131 kanban chips → `/app/sys/[kanbanId]/kanban/b/[boardId]?card=[cardId]` (cardLink, kanban/notify.ts:21-22) · register targets inside the `hidden md:flex` cart panel → own dialog `disappears` (56 59 61 63 65 79 95 101 103 105 106) · 112/114 recall = action + toast · 3 unit switch = menu appears · 4 → `register?unit=` · 316/368 → `settings?tab=devices` · action-name targets → testids (604 1215 1219 1150 1152) · stock rows pinned by `query tab=…` (header/tab bar `hidden md:flex` while counting at 390, StockClient.tsx:117) · 1074 = ui changes · 511/512 anyOf links.
- **F8** — 435 → P1.12-W1 · every bare suite-name oracle replaced by the check that covers the control or emptied (0 bare suite names left; 96 rows carry an oracle, all ids found in a `--list` suite; the 2 external rows without an oracle are still CD-P41-B10). No `db` cites a suite.

**Permission table (CD-P41-F1)** — `python3 /tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/p41-fix1/perm-table.py [--rows]` reads the registry + `patches/perm-*.json` (action · permission key · gate file:line · cashier/manager server verdict · cashier UI) and fails on a persona in roles that the server refuses (or a manager refused without a needs). Output saved as `p41-fix1/perm-table.txt`. At 71b49fc3: **192 staff mutation rows · 192 with an entry · cashier allow 40 / deny 152 · manager allow 153 / all-units 17 / owner-only 21 / deny 1 (872 copy-run → hiddenFor) · VERDICT green.** Cashier-allowed writes: register sale/hold/recall/discard/intents/PIN/approval/deposit/offline sync/slip/receipt send · member quick-register + reward fulfil (delegatedActor, register-member.ts:74-81) · tables split save/cancel + pre-bill · manual order ingest · order confirm-pay · KDS/products 86 (842 server-allowed but the products page refuses the cashier) · shift clock (page refuses the cashier).

**UI gate ≠ server gate (for P4.3)** — cashier out of roles, not in hiddenFor:
- shown **enabled**, server refuses (real mismatch, press ⇒ PERMISSION_DENIED): tables 633 640 643 644 658 661 663 666 674 675 677 680 681 682 (restaurant.* — like B7) · sales 921/923 deposit refund (by design: refusal opens the manager-PIN pad, DepositRefund.tsx:161).
- shown **disabled**, server refuses (UI agrees; listed because the persona sees it): settings 275 361 523 1013-1018 1080 1095 1133 1134 1145 · orders 753 755 759 763-765 1101 · KDS 810 813-816 818 821.

**Could not decide (CD-P41-F*)**
- **CD-P41-F11 (manager · all-branch scope shown enabled)**: 581 recipe BOM · 593 recipe save · 841 station — a tenant-wide product (unitId null) needs every linked branch (catalog.ts:370-386) but the UI enables them for a 1-branch manager · 953 API-key revoke on an all-branch key (api-key-actions.ts:174) · B7 price rules 604/625/626. Manager kept in roles (W8) + a needs; a real press on a tenant-wide product will record wrongExpect — rule: keep as a P4.3 finding, or hiddenFor manager + UI fix.
- **CD-P41-F12 (unreachable refusal notices)**: 1231 1232 (stock card refusals) · 1233-1235 (tables/orders/kds unit refusal) · 1241 (shift X refusal) — roles [cashier] but no QC persona can see them (cashier gets the page refusal or passes the gate); roles cannot be empty. Proposal: `$mockupGaps`-style "unreachable" list or a QC persona with partial rights.
- **CD-P41-F13 (cashier sees disabled openers, unclaimed)**: orders 754 760-762 767 and tables 685 686 1000 1008 — converse of F4/F5 would put cashier in roles + a permission needs; not done because a permission needs would also let an owner/manager regression pass as skipped.
- **CD-P41-F14 (products table hidden < 768)**: 548-550 595-598 858 target `pos-prod-table changes` inside `hidden md:block`; kept (walker uiSnapshot reads hidden DOM, qc-crm-buttons.mts:2184) — or `viewport [desktop, tablet]`.
- **CD-P41-F15 (same-testid static chip for 1-unit users, B3 again)**: 3 pos-reg-unit-switch · 164 pos-stock-unit · 614 pos-price-rule-unit-* — roles + needs kept.
- **CD-P41-F16 (navigate targets with a query)**: `?card=[cardId]` · `register?unit=` · `settings?tab=devices` — the P4.2 walker URL match must accept a query pattern (existing precedent `/r/[token]?lang=th`).
- **CD-P41-F17 (PIN screens only a rights-less persona reaches)**: 380-389 discount-over · 393-398 manager-PIN override · 399-401 sales PIN dialogs · 915 deposit PIN back — owner/manager claims end as skippedNeeds; 1107 board-create is the reverse (server lets the manager, UI owner-only).

**Gates at b59eae17 (fix1 code+notes head)** — `qc-pos-p4.1 --no-db` 16/16 · `fitness-pos` 8/8 · fitness 53/53 · `qc-pos-p2.14 --no-db` 15/15 · `qc-pos-p1.18 --no-db` 16/16 · `pos-oracle-check … qc-pos-p4.1 --base 6e32c1e2` VERDICT green (red 0 · warn 0) · `perm-table.py` VERDICT green. Pre-submit once (same command as the BUILD prompt, systemd-run, `/root/pos-runs/presubmit-shark-pos-b-20261022T125737Z`):

```
PRESUBMIT-TABLE head=b59eae17 tree=/root/projects/shark-pos-b
suite                        exit pass/total     s  failed
wo-qc-pos-p4.1-run1          0    16/16         19  
wo-qc-pos-p4.1-run2          0    16/16         21  
wo-qc-pos-p4.1-nodb          0    16/16         17  
qc-pos-p1.1                  0    180/180      185  
qc-pos-p1.3                  0    128/128      153  
qc-pos-p1.6                  0    48/48         45  
qc-pos-p1.18                 0    81/81         47  
qc-pos-p2.14                 0    60/60         81  
qc-pos-p3.5                  0    55/55         47  
qc-pos-p3.4                  1    50/51         86  P3.4-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3.9                  0    48/48         45  
qc-pos-p3.6                  0    52/52         65  
qc-pos-p3-skel               0    41/41         33  
qc-hf-fu                     0    29/29        116  
qc-pos-p5.2                  0    34/34         76  
qc-hf-tx                     0    22/22         28  
qc-hf-fu2                    1    30/31         25  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
fitness-noenv                0    53/53         16  
fitness-qc4                  0    53/53         15  
fitness-pos                  0    8/8           10  
gen-check                    0    -              2  
PRESUBMIT head=b59eae17 green=19 red=2 expected-lane-pin=2 unexpected-red=- · wo: qc-pos-p4.1-run1=16/16 · qc-pos-p4.1-run2=16/16 · qc-pos-p4.1-nodb=16/16 · VERDICT red (2: qc-pos-p3.4 qc-hf-fu2)
```
Reds: **HF-FU2-ST1** = lane pin (the 23 P4.1 UI hunks of 2f127d04 lack the HF-FU2 marker; fix1 adds none) · **P3.4-ST2** = the old branch base: wip/pos-p4.1 sits on session/pos 554a74d3 (+ oracle 537195ad); the W21 close is on origin/session/pos 8950ccb0, which is not an ancestor of this branch — expected to go green at merge. No unexpected red.
