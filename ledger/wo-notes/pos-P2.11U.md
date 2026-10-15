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

