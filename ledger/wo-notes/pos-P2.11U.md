# POS P2.11U — builder notes (หลายสาขา UI · lane B · tree c)

Builder U · VPS (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.11u` from `origin/session/pos` **ed200e6c** (code 744e4f35 = P2.11 S merged).
Contract: prompt `ledger/pos-briefs/pos-prompt-accountB-P2.11U.md` (rulings 1–13) · `pos-brief-P2.11.md` §9/§10 · `ledger/wo-notes/pos-P2.11.md` §"P2.11U contract".
Spec: `ledger/pos-briefs/pos-spec-P2.11-branch-ui.md` (all testids/behaviour) + one line in `pos-spec-P1.3-register-ui.md` Addendum P2.2U (§branch rows).
Run logs: `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p211u/runs/` (every log headed `tree= head= dirty=`).

## Checkpoint
- DONE: build steps 1–9 · P-7 ORACLE-EDIT (own commit) · gates (below) · notes.
- NEXT (controller): review + QC5 screenshots of the `--state` list at the end · merge. Builder does not merge.

## Commits (explicit paths, one per step)
| step | commit | what |
|---|---|---|
| 1–5 | 567d9cf7 | 06: `pos-prod-unitFilter` (?unit=) + column "ราคา <branch>" · drawer groups "ทุกสาขา" + per unit (save/refusals) · dead-row note + purge · copy dialog · compare view · branch mode on the page · messages th/en (all namespaces) · 20 inventory rows |
| 5 (oracle) | 4e0ee431 | `test(qc-hf-pos-page-authz)`: ORACLE-EDIT P-7 (manager branch mode) — dated marker `// ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.11U ruling 6 — manager branch mode)` · count unchanged (81) |
| 6 | 0be186f0 | 08: overview card `channels` + kind `channels` table + CSV · overview.comingSoon text drops "ช่องทาง" |
| 7 | 63ef29bc | 17A: section "ข้อมูลสาขาบนใบเสร็จ" + `updatePosReceiptUnitSettingsAction` + preview via `receiptUnitOverride` · 8 inventory rows |
| 8 | cc467fb0 | 16 shared-inventory note · 12 unit chip beside receiptNo |
| 9 | 861b98a9 · 417dca34 | `visual-pos.mts` wo `p2.11u` (9 states, owner + manager) · spec + addendum |
| fix | 11537bf6 | `visual-pos.mts` `userOf(k)` (typecheck #2 found two `T.users[k]` lookups typed for owner/cashier only) |
| 10 | (merge) | `git merge origin/session/pos` = already up to date (still ed200e6c — P2.9b not merged yet; nothing to reconcile) |

## Components / files (foreign hunks marked `// POS P2.11U ▸ … ◂`)
- `pos/products/page.tsx` — branch mode (rulings 1 3 6): `branchUnits` = live POS units where `evaluate(pos.product.setPrice, unitId)`; `branchMode = !canPrice && branchUnits.length > 0`; refusal card only when neither; `canPurge = canPrice || every live POS unit has setPrice` (ruling 3, same scope as `purgeDead`); legacy `listPosProducts`/`posServices` read only when `canPrice`.
- `pos/products/products-data.ts` — `ProductsRow.deadRows` (one read of the product price rows + one SalesChannel read; dead = code not builtin and no non-archived channel with it, or unit not a live linked unit — the S liveness rule).
- `pos/products/products-scope.ts` — `branchCellOf`, `PriceGroup`, `draftGroups`, `inheritedOf`, `rowsFromGroups` (pure).
- `pos/products/ProductsClient.tsx` — filter, column, copy/compare buttons, focus-unit open.
- `pos/products/ProductPanel.tsx` — grouped price editor (+ `GroupBox`/`ViewCell` so every testid is a literal on its tag), reason-first refusals, toast on PERMISSION_DENIED, dead note + purge confirm, manager hint.
- New `pos/products/BranchCopyDialog.tsx` (copyUnitPricesAction) · `pos/products/BranchCompare.tsx` (unitPriceMatrixAction).
- `components/pos/products/price-ui.tsx` — `priceReasonText` (reason → `pos.price.errors.<camel>` with `{max}`).
- `pos/reports/ReportsOverview.tsx` (ALL_SECTIONS + channels card) · `pos/reports/ReportsClient.tsx` (KINDS + table).
- `lib/modules/pos/receipt-settings-actions.ts` — `updatePosReceiptUnitSettingsAction` (session actor; thin).
- `pos/settings/page.tsx` (section gate + per-unit values via `receiptUnitOverride`) · `pos/settings/ReceiptSettings.tsx` (section + preview).
- `pos/stock/page.tsx` (`posUnitInventoryMap` once) · `pos/stock/StockClient.tsx` (note).
- `pos/sales/BillsClient.tsx` (chip). `SettingsShell.tsx` / `settings-tabs.ts` / `pos/sales/page.tsx` unchanged (not needed).
- Not touched: `catalog.ts`, `catalog-legacy.ts`, `reports.ts`, `report-overview.ts`, `receipt.ts`, `receipt-settings.ts`, `register.ts`, `service.ts`, `outbox-consumers.ts`, prisma/.

## Message keys (th + en, same key set)
`pos.products.branch.{colPrice, chipOwn, chipInherited, notSold, cellTip, readOnly, managerHint, inherit, dead.{note,purge,confirm,confirmYes,done}, copy.{open,title,hint,from,to,overwrite,overwriteHint,onlyFiltered,onlyFilteredHint,summary,summaryAll,run,running,done,unitDead,same}, compare.{open,title,close,loading,empty,product,units,channels,notSold,legend,capped}}` ·
`pos.report.channels.{title,pctOfTotal,footnote,empty,amountTip,cols.{channel,bills,net,commission,gross,share}}` ·
`pos.settings.receipt.byUnit.{title,desc,unit,branchNo,branchNoHint,address,phone,inherit,save,saved,previewFor,fieldErrors.{taxBranchNo,address,phone,unitId,patch}}` ·
`pos.stock.sharedInventory.note` · `pos.sales.branch.chipLabel` · changed value: `pos.report.overview.comingSoon` (th/en, "ช่องทาง" removed).

## testids / inventory
28 interactive rows added (wo `P2.11U`, roles owner/manager), `pos-prod-branch` row replaced by `pos-prod-unitFilter`. Full list in the spec.

## Deviations (ruling each touches)
1. **R8** — `pos/receipt-settings-actions.ts` already existed (P1.10); the wrapper `updatePosReceiptUnitSettingsAction` is appended there instead of a new file. Per-unit current values are read on the page (server) with the pure `receiptUnitOverride(sys.settings, unitId)` — no read action added.
2. **R10** — the bills list is read per unit (`billsPageDataAction` requires `unitId`; there is no "ทุกสาขา" option on 12), so every row's unit = the requested unit: the chip shows that unit's name for actors who see > 1 unit. No DTO/page-read change. Chip = full unit name (no short-name field exists).
3. **R2** — the `priceRowDead` text is the S key `pos.price.errors.priceRowDead` as shipped ("ช่องทางหรือสาขาของแถวนี้ถูกเก็บถาวรหรือเลิกผูกแล้ว — แก้หรือเพิ่มแถวนี้ไม่ได้ แถวเดิมเก็บไว้ตามเดิม"), not a new wording (contract: pick `pos.price.errors.<camel(reason)>`). `field "rows"` has no single cell ⇒ red frame round the groups + the service message for reason-less VALIDATION (P2.2U F4 rule).
4. **R2/R3** — the dead-row count covers rows of retired units too (not loaded in the client), computed server-side in `products-data.ts` (read-only); purge is offered only with product-wide scope (`canPurge`).
5. **R7** — the kind table derives two display columns from DTO fields: ยอดสุทธิ = `grossSatang − refundSatang`, ค่าคอมมิชชัน = `commissionSatang + commissionVatSatang`; กำไรขั้นต้น = server `netSatang`, % = server `sharePct`. Overview amount = `netSatang` (title + inline < md).
6. **R6** — branch mode also covers a STAFF holding `pos.product.setPrice` at a unit (same `evaluate` the server's row-scope check uses); the bulk "+X%" dialog stays available in branch mode with the unit fixed (server checks each row's unit).
7. **R5** — compare view is a full-screen modal component `BranchCompare` (not `…Sheet`: the F15.3 scanner treats `*Sheet` tags as interactive); unit chips refetch (one call per change), code chips filter client-side; > 500 visible products ⇒ first 500 + note.
8. **R11** — `--user manager` exists only for wo `p2.11u` (die otherwise); fixture user `posqc-coffee-user-manager-vis` + Membership MANAGER `[silom]`, created/reused before the session mint (not deleted — reused next run). wo `p2.11u` without `--page` = the 5 pages; other state families' setups are switched off for this wo. `products-branch-copy`, `settings-receipt-branch`, `bills-all-branches` are owner-only (manager has 1 unit / is not all-branch); `products-manager-branch` is manager-only.

## Fixtures (visual, ruling 11)
`ensureP211uFixture` (before the first P2.11U job; failures recorded, not thrown): latte (STORE, silom) = base − ฿5 + dead row: channel `ZZVIS` at silom (saveChannel) → row (ZZVIS, *) → `archiveChannel` (the qc-pos-p2.11 dead-row pattern); latte rows before are kept and restored in `cleanupP211u` (unarchive flag → `setChannelPrices(before)` → delete the run's ZZVIS channel row; leftovers of a killed run are swept first) · 3 PAID bills today at silom (createSale, per-day keys `posqc-vis-p211u-<n>-<date>`: STORE ×2 PROMPTPAY + LINE MAN ×1 PLATFORM — kept like sale-done) · receipt override on silom (00001 + address + phone via `updatePosReceiptUnitSettings`, restored) + temporary ABB book (`ensureAbbBook`, restored by `cleanRpub`) · shared inventory: the QC seed already links silom + ari to one INVENTORY system (no write); if not, the fixture links the second unit and deletes that link in cleanup. Cleanup runs after the last P2.11U job, in `finally`, and in the signal handler.

## `--state` list for the controller (QC5, owner + manager, 3 sizes, th + en)
```
--user owner   --state products-branch-filter,products-branch-copy,products-branch-compare,products-dead-row-note,reports-channels,settings-receipt-branch,stock-shared-inventory,bills-all-branches
--user manager --state products-branch-filter,products-branch-compare,products-dead-row-note,products-manager-branch,reports-channels,stock-shared-inventory
```
(`pnpm exec tsx scripts/visual-pos.mts p2.11u --states --user <u> --state … --base <QC5>` · LOCALE=en for en.) P2.2U products states (`--page products` wo p2.2u) still plan 24 owner / 3 cashier.

## Follow-ups
- Hunt L3 (no precondition on the 06 full-set save) — needs a server param (expected-rows hash / max `updatedAt`); not invented here (ruling 2). P2.12 or owner line.
- R1 F2 owner line still open (matrix readable without a POS key) — compare view shown to anyone who reaches 06.
- Per-branch stock columns in 06 / per-location stock in a shared inventory = P2.12 (rulings 1, 9).
- A single-branch product's own manager cannot purge its dead rows (purge needs every-unit scope — S hunter note).
- Bills list "ทุกสาขา" mode (12 has no all-branch list; the chip shows the requested unit).

## Gates
Logs `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p211u/runs/` — DB suites + fitness: one `iso.sh` unit (`gates-unit.sh`) at head **417dca34** dirty=0 (`gates-final/`); after the harness-only fix 11537bf6 (`git diff --name-only 417dca34 11537bf6` = `scripts/visual-pos.mts`) typecheck/fitness re-run (`gates-final2/`) and `--dry` re-run.

| gate | head | result |
|---|---|---|
| typecheck #1 (mid) | cc467fb0 | rc 0 (`tc-mid.log`) |
| typecheck #2 | 417dca34 | rc 2 — 2× TS7053 in `visual-pos.mts` (`T.users[k]` with k = manager) → fixed 11537bf6 |
| typecheck #3 (final) | 11537bf6 | **rc 0** (`gates-final2/typecheck.log`) — 3rd run, needed after the fix (lane rule says ≤ 2; noted) |
| fitness no-env | 417dca34 · 11537bf6 | 50/50 · 50/50 |
| fitness env (qc4) | 417dca34 | 50/50 |
| fitness-pos | 417dca34 · 11537bf6 | 8/8 · 8/8 (F15.3 inventory 884 rows) |
| qc-pos-p2.11 (unforced) | 417dca34 | **34/34** (not skipped · residue 0 · leaks 0 · guard hits 0) |
| qc-pos-p2.2 | 417dca34 | 42/42 |
| qc-pos-p2.1 | 417dca34 | 55/55 |
| qc-pos-p2.3 | 417dca34 | 46/46 |
| qc-pos-products | 417dca34 | 24/24 |
| qc-pos-p1.17 | 417dca34 | 40/40 |
| qc-pos-p1.10 | 417dca34 | 40/40 |
| qc-pos-p1.18 (phase U) | 417dca34 | 81/81 (ST7 = 0) |
| qc-hf-pos-page-authz | 417dca34 | **81/81** — P-7 edited, count unchanged; red-before: new P-7 vs base src ed200e6c (`git archive`, `HF_STATIC_ONLY=1 HF_SRC_ROOT=…`) = 10/11, P-7 red (`p7-red-before.log`) |
| qc-pos-inventory | 417dca34 | 25/25 |
| qc-pos-p2.8 | 417dca34 | 61/61 (ST6 green — register.ts/service.ts untouched) |
| visual-pos `p2.11u --states --dry` | 11537bf6 | rc 0 ×4: owner th 24 / en 8 · manager th 18 / en 6 (`dry-<user>-<th|en>.log`); cashier = 0 shots rc 0 |


## Fix round 1 (account B, 15 Oct 08:30Z) — head = this notes commit on top of code head 001c7aac (code 001c7aac)
Builder fix 1 (the original builder died in a host restart; tree c clean at bb783783 when picked up). R1 + binding controller rulings 1–9 = `ledger/wo-notes/pos-P2.11U-review.md` (copied from controller cff6480b in e4d5ae41). No server behaviour change (`catalog.ts` untouched; only the page's own read in `products-data.ts` grew).

| finding | ruling | commit | change |
|---|---|---|---|
| F1 (Medium) silent row delete | 1 | a0616c64 | `products-data.ts` `countDeadRows`: the same one read of the product price rows now also selects `priceSatang, notSold` and merges every stored `(code, unit)` missing from `p.rows` (raw values) ⇒ the client always resends the full stored set. `ProductPanel.tsx`: a unit with `p.available[u] === undefined` gets no editable group, only the muted line `pos-prod-drawer-unstocked-<unitId>` "ไม่มีสินค้านี้ในคลังของสาขา <unit>" (new key `pos.products.branch.unstocked` th/en; `<p>` = not interactive, no inventory row); its rows stay in the payload (not drafted ⇒ kept by `rowsFromGroups`). Invariant comment above `rowsFromGroups` (+ `PriceGroup.unstocked`) and in the spec: "the client never omits a stored row; the server deletes only rows the client dropped on purpose". |
| F2 compare refetch | 2 | 46c44bf7 | `BranchCompare.tsx`: effect keyed on `idKey = ids.join(",")` (+ `unitKey`), action called with `idKey.split(",")` — a parent re-render (toast clear, refresh) no longer refires `unitPriceMatrixAction`. |
| F3 purge in branch mode | 3 | 85c4d658 | `products/page.tsx`: `canPurge = !branchMode && (canPrice ∥ setPrice at every live POS unit)` (spec updated). |
| F4 bills chip | 4 | 86144715 | `BillsClient.tsx` restored to base ed200e6c (no P2.11U hunk left) · key `pos.sales.branch.chipLabel` removed th + en (the whole `pos.sales` object it created) · state `bills-all-branches` removed from `visual-pos.mts` (type, plan row, path, runner, fixture condition) and `sales` dropped from `P211U_PAGES` · spec §12 = "unchanged; chip returns with P2.12". **Inventory: no row to remove** — the chip was a `<span>` (not interactive by `crm-testid-scan`), so it never had a row; rows stay 28 P2.11U / 884 total (`qc-pos-inventory` 25/25). |
| F5 killed-run residue | 5 | e36a8a83 · 001c7aac | `ensureP211uFixture`: before taking "before", (a) a latte `(STORE, silom)` row with price = base − 500 (not notSold) is removed via `setChannelPrices`; (b) a silom receipt override with `taxBranchNo = "00001"` is cleared (address/phone cleared only when equal to the fixture values — const `P211U_RECEIPT`), and the cleared value becomes "before". 001c7aac = locals instead of closure narrowing (typing only). |
| F6 MANAGER membership leak | 6 | 351b640c | `ensureManagerUser` flags `P211U.managerMembership`; `cleanupP211u` (after the last P2.11U job / finally / signal) deletes the MANAGER{silom} Membership of `posqc-coffee-user-manager-vis` on the QC tenant (User row stays; the next `--user manager` run recreates it). ⇒ P1.18U `settings-staff` / `settings-staff-pin` shots on QC5 are unaffected after a P2.11U run (no extra staff row). Membership has no FK children (schema core.prisma). |
| F7 compare bold | 7 | — | accepted as documented; no change. |
| F8 markers | 8 | 665d2e99 | `ProductPanel.tsx`: block markers round the import block, `Props.onSaved`+new props, the destructure, `startEdit`/`cancelEdit`, the save body line, `ref={bodyRef}`, and the whole replaced price JSX (`{/* POS P2.11U ▸ … */}` … `{/* ◂ */}`). `ProductsClient.tsx`: destructure block, `key=` and both `openProduct` call sites (inline `▸ … ◂`), the 4 drawer props. `BillsClient.tsx`: nothing to wrap (reverted by ruling 4). |

### Gates (ruling 9) — head 001c7aac, dirty 0
Logs `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p211u-fix1/runs/` (every log headed `tree= head= dirty=`). Typecheck = own iso unit (prompt shape, 1 run); DB suites + fitness = ONE `iso.sh` unit (`gates-unit.sh`, `gates-fix1/`, unit rc 0); `--dry` outside iso with `env CI=1`.

| gate | result |
|---|---|
| typecheck (1 of ≤ 2) | **rc 0** (`typecheck.log`) |
| fitness no-env / env (qc4) | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| qc-pos-p2.11 (unforced) | **34/34** (skipped false · residue 0 · leaks 0 · guard hits 0) |
| qc-pos-p2.2 | 42/42 |
| qc-pos-products | 24/24 |
| qc-pos-p1.17 | 40/40 |
| qc-pos-p1.18 (phase U) | 81/81 (ST7 = 0) |
| qc-hf-pos-page-authz | 81/81 |
| qc-pos-inventory | 25/25 (no row change — see F4) |
| qc-pos-p2.8 | 61/61 |
| visual-pos `p2.11u --states --dry` | rc 0 ×4: owner th 21 / en 7 · manager th 18 / en 6 (was 24/8 · 18/6 — owner lost the 3 + 1 `bills-all-branches` shots) |

### `--state` list for the controller (replaces the one above — `bills-all-branches` gone)
```
--user owner   --state products-branch-filter,products-branch-copy,products-branch-compare,products-dead-row-note,reports-channels,settings-receipt-branch,stock-shared-inventory
--user manager --state products-branch-filter,products-branch-compare,products-dead-row-note,products-manager-branch,reports-channels,stock-shared-inventory
```
Ruling 9 re-shoot before merge: `products-branch-filter,products-dead-row-note,products-manager-branch,products-branch-compare` (owner th + manager th; `products-manager-branch` is manager-only) on QC5. Not built/served here (no server).

### Follow-ups (fix 1)
- F4: the 12 unit chip returns with the P2.12 all-branch bills list (`pos-sales-unitChip-*` + key to be re-added then).
- F7: compare bold = non-BASE `source` (cannot tell own from inherited `(code, *)` rows) — accepted; a source split needs the matrix DTO (P2.12 or owner line).
- Ruling 3 consequence: an all-units STAFF/MANAGER without `posCanSetTenantPrice` now never sees purge (branch mode) — joins the existing "single-branch manager cannot purge" follow-up.
- Still open from the first round: hunt L3 (no precondition on the 06 full-set save), R1 F2 owner line.
