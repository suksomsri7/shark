# POS spec — P2.11U multi-branch UI (06 · 08 · 16 · 17A · 12)

Builder U · account B · 15 Oct 2026 · branch `wip/pos-p2.11u` · contract = `ledger/wo-notes/pos-P2.11.md` §"P2.11U contract" + prompt `pos-prompt-accountB-P2.11U.md` rulings 1–13.
No server behaviour change: every write goes through the P2.11 S exports; the only new server code is the thin `"use server"` wrapper `updatePosReceiptUnitSettingsAction` (17A) and two read-only page reads (06 dead-row count, 16 inventory map).

## 06 สินค้าและเมนู (`/pos/products`)
| element | testid | behaviour |
|---|---|---|
| branch filter "สาขา: …" | `pos-prod-unitFilter` (was `pos-prod-branch`) | URL `?unit=` (history.replaceState). OWNER/all-branch: first option "ทุกสาขา" (default). Branch mode: own units only, default = first, no "ทุกสาขา". |
| column "ราคา <branch>" | `pos-prod-cell-<productId>-unit` (button) · 390 `pos-prod-cbranch-<productId>` (text in card) | STORE price at the unit by the resolver order (STORE,u) > (STORE,*) > (*,u) > base. Own row (unit = selected) = bold + chip "สาขา"; inherited = muted + chip "ราคากลาง"; not sold = "ไม่ขาย". Branch-only product of another unit = "ไม่ขายที่สาขานี้". Tap = drawer on "ราคาตามช่องทาง" scrolled to that branch group. |
| copy button | `pos-prod-copy-open` | shown when the actor can set prices and sees ≥ 2 units |
| compare button | `pos-prod-compare-open` | always (≥ 1 unit) |
| drawer group "ทุกสาขา" | `pos-prod-drawer-group-all` | P2.2U cells kept: view `pos-prod-cell-<code>`, edit `pos-prod-price-<code>` / `pos-prod-notsold-<code>` / `pos-prod-usebase-<code>` / `pos-prod-price-err-<code>`. Branch mode: read-only + hint `pos-prod-drawer-managerHint` "ราคากลางแก้ได้เฉพาะเจ้าของ/ผู้ดูแลทุกสาขา". |
| drawer group per unit | `pos-prod-drawer-group-<unitId>` | codes = STORE + live channel codes at the unit. View `pos-prod-drawer-cell-<unitId>-<code>` (own bold, inherited muted). Edit: input `pos-prod-drawer-cell-<unitId>-<code>` (placeholder = inherited value; empty = inherit; typed = own row (code, unit)), `pos-prod-drawer-notsold-<unitId>-<code>`, `pos-prod-drawer-clear-<unitId>-<code>` ("ใช้ราคาที่สืบทอด" = remove row), `pos-prod-drawer-err-<unitId>-<code>`. |
| save | `pos-prod-save` | one `setChannelPricesAction` with the full row set (rows the drawer cannot see — other units, retired codes/units — are resent unchanged; the server keeps them). Refusal: `reason` first (`pos.price.errors.priceRowDead` · `bulkTooMany {max}`), then code; PERMISSION_DENIED = page toast, drawer stays open; any `field` = red frame round the groups (`pos-prod-drawer-groups`). |
| dead-row note | `pos-prod-deadNote` | "ราคาของช่องทาง/สาขาที่เลิกใช้แล้ว N แถว เก็บไว้ไม่แก้" — N = stored rows of the product whose code is not live in this POS (not builtin and no non-archived SalesChannel with that code) or whose unit is not a live linked unit (server count in `products-data.ts`, all units incl. units the actor cannot see). |
| purge | `pos-prod-purgeDead` → `pos-prod-purgeDead-confirm` / `-cancel` | only with product-wide scope (posCanSetTenantPrice, or setPrice at every live POS unit); confirm → `setChannelPricesAction({…, rows: current set, purgeDead: true})` → toast "ล้างแถวที่เลิกใช้แล้ว". |
| copy dialog | `pos-prod-copy-dialog` · `pos-prod-copy-from` · `-to` · `-overwrite` · `-onlyFiltered` · `-run` · `-cancel` · `-close` · `-summary` · `-from-error` · `-to-error` · `-error` | from ≠ to (to defaults to the filter's unit); overwrite default off; "เฉพาะสินค้าที่กรองอยู่" on = `productIds` of the visible list, off = no `productIds`; result toast "คัดลอกแล้ว {written} · ข้าม {skipped}" + page refresh; `field` fromUnitId/toUnitId (+ PRICE_ROW_DEAD = "สาขานี้เลิกใช้แล้ว") under the select; PERMISSION_DENIED = toast. |
| compare view | `pos-prod-compare` · `pos-prod-compare-cell-<productId>-<unitId>-<code>` · `pos-prod-compare-unit-<unitId>` · `pos-prod-compare-code-<code>` · `-close` · `-error` | title "ขายที่ N สาขา"; one `unitPriceMatrixAction` per open / unit-chip change (code chips filter client-side); ≤ 500 visible products; bold = set price, muted = BASE, "—" = PRICE_NOT_SET, "ไม่ขาย" = CHANNEL_NOT_SOLD; sticky product column, horizontal scroll at 390. |

Branch mode (MANAGER or STAFF with `pos.product.setPrice` at ≥ 1 unit but not `posCanSetTenantPrice`): filter locked, "ทุกสาขา" group read-only, copy/compare limited to own units, no purge, the collapsed legacy block (warehouse sale price + services) is neither rendered nor read. No price-able unit = the existing refusal card (`pos-products-refusal`, returned before any product/service read — `qc-hf-pos-page-authz` P-7).

## 08 รายงาน (`/pos/reports`)
- Overview section `channels` (card `pos-rep-channels`, rows `pos-rep-channels-row-<code>`, footnote `pos-rep-channels-footnote`, empty `pos-rep-channels-empty`) between "สินค้าขายดี" and "วิธีชำระ" (xl = 3 columns, < xl stacked). Bar width = server `sharePct` (share of net after commission); percent 1 decimal; amount = `netSatang` in the row title (hover) and inline below md.
- Kind tab `pos-report-kind-channels`: table channel · บิล · ยอดสุทธิ (gross − refund) · ค่าคอมมิชชัน (commission + commission VAT) · กำไรขั้นต้น (server `netSatang`) · % + totals row + footnote; CSV = the existing button (`posReportCsvAction` kind `channels`). P1.17 branch select unchanged.

## 17A ใบเสร็จและภาษี (`/pos/settings?tab=receipt`)
- Card `pos-set-receipt-branch` "ข้อมูลสาขาบนใบเสร็จ" — only for receipt editors who are OWNER or `unitAccess "*"` (taxBranchNo is OWNER/"*" in the writer).
- `pos-set-receipt-unit` (live POS units) · `pos-set-receipt-branchNo` (5 digits, inline `-error`) · `pos-set-receipt-address` (≤ 200) · `pos-set-receipt-phone` (≤ 30) · `pos-set-receipt-<field>-inherit` "ใช้ค่ากลาง" (null) · `pos-set-receipt-unit-save` → `updatePosReceiptUnitSettingsAction({systemId, unitId, patch})` with changed keys only; refusal by `field` under the field (`unitId` under the select, `patch`/codes = `pos-set-receipt-unit-refusal`); success `pos-set-receipt-unit-saved`.
- Placeholders = inherited values (book branch code / "00000"; system header → book for address/phone). Current values come from `receiptUnitOverride(sys.settings, unitId)` on the page (server); the preview applies `receiptUnitOverride` to the selected unit's draft (ABB header "สาขา <no>", address/phone, branch name).

## 16 สต็อก (`/pos/stock`)
- `pos-stock-sharedNote` under the header: "คลังร่วมกับสาขา <names> — สต็อกเป็นก้อนเดียวกัน" when the selected unit sits in a `posUnitInventoryMap` group with `shared: true` (map read once on the page; names = live POS units). Per-location stock inside a shared inventory = P2.12.

## 12 บิลวันนี้ (`/pos/sales`)
- Actors who see > 1 unit: chip `pos-sales-unitChip-<saleId>` (390 card `pos-sales-unitChip-<saleId>-m`) with the unit name beside `receiptNo`. The list is read per unit (`billsPageDataAction` takes `unitId`), so the chip = the requested unit; no DTO change.

## Visual states (`scripts/visual-pos.mts p2.11u --states`, owner + manager, 1440×900 · 1024×768 · 390×844, th + en)
`products-branch-filter` · `products-branch-copy` (owner) · `products-branch-compare` · `products-dead-row-note` · `products-manager-branch` (manager) · `reports-channels` · `settings-receipt-branch` (owner) · `stock-shared-inventory` · `bills-all-branches` (owner).

## Messages (th + en, same keys)
`pos.products.branch.*` (colPrice, chipOwn, chipInherited, notSold, cellTip, readOnly, managerHint, inherit, dead.*, copy.*, compare.*) · `pos.report.channels.*` · `pos.settings.receipt.byUnit.*` · `pos.stock.sharedInventory.note` · `pos.sales.branch.chipLabel` · `pos.report.overview.comingSoon` (no longer lists channels).
