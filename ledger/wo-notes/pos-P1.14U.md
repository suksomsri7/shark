# POS P1.14 U — builder U notes (stock count 05ค + stock shortcuts 16 subset · branch `wip/pos-p1.14u` from `origin/session/pos` b219e61b · tree /root/projects/shark-pos-b)

Started 2026-10-07 ~17:50 UTC (account B). Server P1.14 S is accepted; this WO = thin actions + one additive read + screens. Brief: `ledger/pos-briefs/pos-brief-P1.14U.md`.

## Status
- [x] Actions + meta read (`stock-count-actions.ts`, `stockCountMeta` in `stock-count.ts`)
- [x] Route `/app/sys/[id]/pos/stock` + module tab "สต็อก" (posTabs = childrenFor) + products-header link
- [x] Count screen (05ค) · shortcuts receive/transfer/adjust + history (16 subset)
- [x] Keys `pos.stock.*` th/en · testids `pos-stock-*` · 62 inventory rows
- [x] visual-pos page `stock` + `--states` (dry-run only — controller shoots)
- [x] Gates — table at the end

## Files
| file | what |
|---|---|
| `src/lib/modules/pos/stock-count.ts` | **additive only**: `stockCountMeta(ctx, actor, client?)` + types `StockCountMeta`/`StockCountMetaResult` (reads: scopeOf → 5 permissions via `evaluate` → none = PERMISSION_DENIED → no inventory = NO_INVENTORY → live `InvLocation`s, PRODUCT `InvCategory`s, `listStockCounts({status:"OPEN",limit:1})`, opener `User.name`). Nothing else touched. |
| `src/lib/modules/pos/stock-count-actions.ts` (new, "use server") | `posStockMetaAction` · `posStockCountOpen/Record/Get/List/Confirm/CancelAction` · `posStockReceive/Transfer/AdjustAction` (one per module fn, input passed through, refusal = data, INTERNAL on throw, own session + try/catch each) · plus `posStockItemSearchAction` and `posStockHistoryAction` (below). Coarse gate in `scopeOf`: `canAccessUnit` + `assertCan` of any of `pos.stock.count` / `inventory.movement.receive|transfer|adjust` at the unit (fitness F6.1 needs a proven guard); fine-grained permission stays in stock-count.ts. Prisma via `./db` (F5.1 ratchet). |
| `src/app/app/sys/[id]/pos/stock/page.tsx` | server: POS system + accessible units (`?unit=`) → `stockCountMeta` **server-side** (no action at load) → refusal card (`pos-stock-refusal`, 200) or `StockClient` |
| `.../stock/StockClient.tsx` | header (16): title · subtitle · branch select (>1 unit) · "คลัง:" location select · "เปิดในระบบคลังสินค้า" · sub-tabs ตรวจนับ/รับของเข้า/โอน/ปรับสต็อก/ประวัติ (badge "กำลังนับ" when OPEN) · layout: count = centred `max-w-2xl`; receive/transfer/adjust = main + right column (other two shortcut cards + history) at ≥ xl; history = full list |
| `.../stock/StockCount.tsx` | start card · 05ค count screen · confirm dialog · cancel dialog · result screen |
| `.../stock/StockShortcuts.tsx` | ReceiveCard · TransferCard · AdjustCard · HistoryPanel |
| `.../stock/stock-ui.tsx` | key generator, refusal text (`STOCK_COUNT_MESSAGES[code][locale]`), number formatters, icons, `ItemPicker` (scan/search + camera) |
| `src/lib/modules/pos/tabs.ts` + `src/app/app/layout.tsx` | tab "สต็อก" after "สินค้า/บริการ" in both lists |
| `src/app/app/sys/[id]/pos/products/page.tsx` | header action link "สต็อก / ตรวจนับ" → `/pos/stock` (`pos-products-stock-link`) |
| `src/messages/{th,en}/pos.json` | `pos.stock.*` (138 keys each side, en has no Thai) |
| `scripts/pos-ui-inventory.json` | 62 rows, wo `P1.14U` |
| `scripts/pos-qc-env.mts` · `scripts/visual-pos.mts` | page `stock` + stock states |

## Screens built
**ตรวจนับ (05ค).** No OPEN count → card "เริ่มตรวจนับ": scope radio ทั้งหมด/เลือกหมวด (category chips, 1–50) · location select · blind toggle · note ≤200 · "เริ่มนับ" → open (key per submit, reused on retry). `COUNT_ALREADY_OPEN` → enters that count (countId of the refusal).
OPEN count → back chevron · "ตรวจนับ #n" · pill "นับแล้ว x/y" · ⋯ menu (opener or can.confirm) → "ยกเลิกการนับ" · sub-line "<ทั้งหมด | หมวด…> · <location> · เริ่ม HH:MM โดย<name>" (name = meta `openedByName`, or the session user when they are the opener; unknown → "เริ่ม HH:MM") · progress bar · field "สแกนหรือค้นหา" (typing filters lines client-side by name/sku/barcode; Enter = `record {code, mode:ADD, qty:1}`, a scale label (parsed client-side with the POS system's `weighedBarcodeSettings`) sends no qty so grams come from the label) + camera button (register's `ScanCameraDialog`) · chips ทั้งหมด/ยังไม่นับ/มีผลต่าง (third hidden when `withVariance === null`) · rows: name bold, "sku · unitLabel" or "sku · ยังไม่นับ", "ระบบ N" (expectedAtCount, else snapshotQty; hidden in blind), qty box 44 px (blue 2 px border on focus; uncounted = outline "นับ" button that turns into the input), variance "−1" red / "+2" ink / ✓ / nothing · weighed rows show "1,250 g" · per-row refusal under the row, typed value kept · footer note · sticky bar "พักไว้ก่อน" + black "ยืนยันผลต่าง N รายการ" (0 → "ยืนยันผลนับ (ไม่มีผลต่าง)"); without `can.confirm` → disabled "ส่งให้ผู้จัดการยืนยัน" + permission line.
Record: blur/Enter = `record {itemId, qty, mode:SET}`; key kept per item while the same qty is pending (retry = same key); `duplicated` = success; the returned line replaces the row, then one `get` refreshes the summary. Requests go through one client-side queue (results never reorder); a `get` requested while one is running is coalesced into one more pass. `get` also runs when the tab becomes visible. No polling.
Confirm dialog: counted x/y · lines with variance · net variance (Σ varianceQty of loaded lines) · uncounted radio ข้าม (SKIP, default) / นับเป็น 0 (ZERO) when uncounted > 0 · "ยืนยัน" → result screen "ยืนยันตรวจนับ #n แล้ว · ปรับ N รายการ · มูลค่าผลต่าง ฿x" + "เริ่มนับใหม่" / "กลับ". Cancel dialog: reason 1–200 → start card.
**รับของเข้า** (free receive only): picker → queued rows (qty box · cost/unit ฿ placeholder = current average · total · lot · expiry date · note · remove); same item again = +1; "รับเข้าคลัง" sends one `receive` per row sequentially (own key per row, kept on refusal), done rows disappear, refusals stay under the row; "ล้างรายการ"; "รวม n รายการ · มูลค่า ฿x"; link "รับตามใบสั่งซื้อทำที่ระบบคลังสินค้า →".
**โอนระหว่างคลัง/ตำแหน่ง**: from/to selects (from = header location) · picker · rows "name × qty" · "โอน" (one `transfer` per row) · "ย้ายทันทีภายในคลังเดียวกัน" · one location → card text + disabled.
**ปรับสต็อก**: picker → item box (name · sku · location · "onHand → onHand+delta", total across locations) · −/+ and signed delta (≠0) · reason select (ของเสีย/หมดอายุ · แตก/เสียหาย · นับผิด · ใช้ภายใน · อื่น ๆ) + free text (stored "<label> · <text>" ≤200) · location select · "ไม่ลงบัญชีอัตโนมัติ" · "บันทึกการปรับ".
**ประวัติล่าสุด / ประวัติ**: one action `posStockHistoryAction` → the unit's counts (`listStockCounts`, needs pos.stock.count) + latest movements of the unit's inventory (`inventory.recentMovements`, read-only, needs a movement permission; the count's own ADJUST rows (refType PosStockCount) are dropped and shown as the count row) merged newest first; OPEN count row → "นับต่อ"; "ดูทั้งหมด" → inventory system. Reloaded after every successful shortcut.

## Keys added (`pos.stock.*`, th + en)
title · desc · subtitle · unit · location · defaultLocation · openInventory · productsLink · loading · saving · searching · retry · close · remove · badQty · scanCamera · scopeAll · scopeCategory · onHandShort · tabs.{count,receive,transfer,adjust,history,countOpen} · start.{title,scope,scopeAll,scopeCategory,noCategories,blind,blindHint,note,notePlaceholder,submit} · count.{title,back,menu,cancel,countedPill,started,startedBy,scanPlaceholder,filter,chipAll,chipUncounted,chipVariance,system,notCounted,countBtn,qtyFor,badQty,scanned,empty,addBackNote,pause,confirmN,confirmNone,sendToManager,needAdjust} · confirm.{title,counted,withVariance,net,uncounted,skip,zero,note,submit} · cancel.{title,body,reason,submit} · done.{title,body,newCount,back} · receive.{title,byLine,searchPlaceholder,defaultOnly,colItem,colQty,colCost,colTotal,colLot,lotPlaceholder,expiry,notePlaceholder,empty,badCost,expiryNeedsLot,submit,clear,total,poLink} · transfer.{title,from,to,single,sameLocation,searchPlaceholder,qtyFor,submit,hint} · adjust.{title,searchPlaceholder,totalHint,delta,deltaPlaceholder,minus,plus,reason,reasons.{spoiled,damaged,miscount,internal,other},textPlaceholder,noGl,badDelta,reasonTooLong,saved,submit} · history.{title,all,receive,out,transfer,adjust,count,adjusted,status.{OPEN,CONFIRMED,CANCELLED},resume,empty,scopeNote}

## Testids / inventory rows (page `/app/sys/[id]/pos/stock`, wo P1.14U)
module-tabs · unit · location · open-inventory · tab-* · start-scope-* · start-cat-* · start-location · start-blind · start-note · start-submit · count-back · count-menu · count-cancel · scan · scan-camera · chip-* · qty-* · count-retry · count-pause · count-confirm · confirm-uncounted-* · confirm-close · confirm-submit · cancel-reason · cancel-close · cancel-submit · done-back · done-new · *-search · *-search-camera · *-search-hit-* · receive-picker · transfer*-picker · adjust*-picker · receive-{qty,cost,lot,expiry,note,mnote,remove}-* · receive-submit · receive-clear · receive-po-link · transfer*-{from,to,submit} · transfer*-{qty,remove}-* · adjust*-{clear,minus,plus,delta,reason,text,location,submit} · history-all · history-resume · history-retry (all `pos-stock-` prefixed) + `pos-products-stock-link` on the products page. Non-interactive anchors: pos-stock-root, -refusal, -start, -count (data-count-id), -lines, -line-*, -var-*, -line-error-*, -scan-result, -confirm-dialog, -cancel-dialog, -done, -receive-card, -receive-rows, -receive-row-*, -transfer*-card, -adjust*-card, -adjust*-item, -history, -history-move-*, -history-count-*. `-c` suffix = the compact cards in the right column (xl).

## visual-pos (dry-run only)
`--page stock --states` (or wo `p1.14*`), coffee tenant: `stock-default` · `stock-count-open` (first run opens an ALL count at the default location through the UI, then SET 3 on the first uncounted line with a code and a scan (barcode or SKU) of the second) · `stock-count-confirm` · `stock-receive` (2 queued rows, not submitted) · `stock-adjust` (item + −2, not saved) × 1440/1024/390 → `.qc-shots/pos/<wo>/stock-<state>-<user>-<w>x<h>.png`. Cashier: every state = refusal card (expected 200). Finally/signal: `cancelStockCount` (owner actor, reason "visual-pos") of the count this run opened (opened by the QC owner after run start); a pre-existing OPEN count is used but not cancelled (`summary.stockCount`). Nothing else written. `p1.3`/`--states` runs over all pages are unchanged (stock = 3 plain shots there).

## Deviations from 05ค / 16 (with the ruling)
1. **No PO receive**: supplier select, "อ้างใบสั่งซื้อ" box, "สั่ง" column, "บันทึกเป็นบิลซื้อ…", invoice image, VAT/net box and "ใบสั่งซื้อที่รอรับ" card removed; free receive + link to the inventory system instead — owner Q1 / brief §4. "บันทึกร่าง" → "ล้างรายการ" (no server-side draft exists).
2. **Transfer**: "โอนระหว่างสาขา (ด่วน)" → "โอนระหว่างคลัง/ตำแหน่ง", no "รอรับที่ปลายทาง" pill, hint "ย้ายทันทีภายในคลังเดียวกัน" instead of "ปลายทางกด รับแล้ว…" — R16 / P2.12 / brief §4.
3. **Adjust**: "ผลต่างลงบัญชีเป็นค่าใช้จ่าย…" → "ไม่ลงบัญชีอัตโนมัติ"; no photo button; +/− delta row added (brief §4) — owner Q2.
4. **Tab strip**: "ตรวจนับ" tab added first; tab "โอน" (not "โอนระหว่างสาขา"); badge "กำลังนับ" on ตรวจนับ only (no "1 ร่าง"/"1 รอรับ" — no drafts, no pending transfers) — brief §2.
5. **History rows**: count rows show status (and "ปรับ n รายการ" only for counts confirmed on this page) — `listStockCounts` returns no variance numbers, so mockup "ผลต่าง 2 รายการ −฿96" cannot be shown without one `get` per count (would break "one action per screen load"). See Q2.
6. **Back chevron / "พักไว้ก่อน"** go to `?tab=history` (OPEN row there has "นับต่อ"), not `/pos/stock`: on a phone `/pos/stock` defaults to the count tab, which would reopen the same screen (loop). Brief §3 says "back chevron (to /pos/stock)" — Q1.
7. **Header location vs receive**: `posReceiveStock` has no `locationId` (server receives at the default location), so the receive card title always names the default location and shows "รับของเข้าที่ “<default>” เสมอ — ย้ายไปที่เก็บอื่นด้วยแท็บโอน" when another location is selected. Server as built wins (brief hard rule).
8. **App chrome on mobile**: 05ค is a full-screen phone frame; the page keeps the app shell + PageHeader + module tabs above the count screen. The stock header and sub-tab strip are hidden below `md` while the count screen is open.
9. **Receive rows at 390**: table columns become stacked fields (qty · cost / lot · expiry / note / remove).

## Server conflicts found (followed the server)
- Receive has no location input (see 7).
- `listStockCounts` has no per-count variance/adjusted numbers (see 5).
- Brief §1 meta shape has no opener name → added `openedByName` (additive field in the same read).

## Open questions for the controller
1. Back chevron target: keep `?tab=history` or change to `/pos/stock` (and make the phone default the start/overview card instead of the open count)?
2. History "ผลต่าง n รายการ · −฿x" for confirmed counts: needs an additive field in `listStockCounts` (e.g. adjustedLines + varianceValueSatang stored at confirm) — server card, not this one.
3. `qc-hf-pos-page-authz` does not enumerate pages (it has per-page static checks); the new route is not added there. The page uses `canAccessUnit` + `stockCountMeta` (PERMISSION_DENIED card). Add a static check `K-*` in a later oracle card if wanted.
4. `posStockHistoryAction` shows `inventory.recentMovements` of the whole inventory system — when several branches share one inventory, movements of the other branches appear too (same as the inventory system's own list). OK, or filter to `refType PosUnit / refId unitId` + this unit's sales?
5. `posStockItemSearchAction` gates on a movement permission (receive/transfer/adjust) — a count-only user never needs it (the count screen filters loaded lines). OK?
6. Item search reads `InvItem` directly in the actions file (via `./db`) instead of an inventory/catalog read — fine as a POS-side read, or move into `stock-count.ts` next server card?

## Gate results — head 388ec312 (all code) · 18:18–18:23 UTC · the notes commit on top is ledger-only
| command | result |
|---|---|
| `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` | exit 0 (`--listFilesOnly` confirms the stock files and scripts/*.mts are in the program) |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | rc 0 · 41/41 |
| `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm fitness` | rc 0 · 41/41 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` | rc 0 · 8/8 (F15.3a: 209 interactive testids · 209 rows) |
| `qc-pos-p1.14` forced ×2 + unforced (`bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.14.mts`) | rc 0 · 30/30 · 30/30 · 30/30 · a5 drift none · cleanup line each run |
| forced `qc-pos-p1.3` · `p1.2` · `p1.6` · `p1.9` · `p1.17` | rc 0 · 128/128 · 55/55 · 48/48 · 53/53 · 40/40 |
| forced `qc-hf-pos-page-authz` | rc 0 · 56/56 (route not added — Q3) |
| forced `qc-pos-inventory` · `qc-inventory` | rc 0 · 25/25 · 12/12 |
| `visual-pos.mts p1.14u --page stock --states --dry --user owner|cashier` | rc 0 · rc 0 (15 shots each) |
| `--no-db` p1.14 · p1.17 · p1.2 · p1.4 · p1.5 · p1.9 · p1.9b | 7/7 · 7/7 · 12/12 · 13/13 · 5/5 · 13/13 · 8/8 |

Found + fixed on the way: pre-commit fitness F5.1 (raw prisma → `./db`) and F6.1 (coarse `assertCan` gate); `qc-pos-p1.6` R2 static rule (each POS action body needs its own catch) failed on 64b378c4 → fixed in 388ec312.

## R2 (controller review of the p11 shots · 35 shots 200, no overflow/console)
Rulings on the open questions: (1) back/pause → `?tab=history` accepted · (2) variance on history rows = server follow-up (`listStockCounts` needs adjustedLines/varianceValueSatang) · (3) authz suite not page-enumerating — accepted · (4) history shows the whole shared inventory — accepted, card now says "ประวัติของคลังนี้ (ทุกสาขาที่ใช้คลังร่วม)" (`pos-stock-history-scope`, both compact and full) · (5) item search gated on movement permissions — correct · (6) move item search into `stock-count.ts` = follow-up.
Fixes:
- R1 receive table at 1440: one fixed grid for header and rows `minmax(0,1fr) 80px 120px 100px 200px 44px` (name+sku+note · received · cost/unit · total · lot over expiry · remove). Root cause of the overlap: the name cell was `flex-col items-start`, so its lines shrank to content width and never truncated → now a stretched column with `overflow-hidden` + `truncate`. 390 keeps the stacked fields.
- R2 cost/unit pre-filled with the item's current average cost (`costSatang` already returned by `posStockItemSearchAction`), editable; "รวม" = qty × cost and the footer "รวม N รายการ · มูลค่า ฿x" are real numbers; `costSatang` is sent only while the field holds a value (cleared = omitted → server keeps the average).
- R3 count screen at 390: the add-back note moved into the sticky bottom bar above the buttons (`pos-stock-count-addback`), so the bar can no longer cover it.
Follow-ups (later cards): full-screen count mode on mobile (hide page header + module tabs — needs the app layout) · native `<input type=date>` for expiry (shows mm/dd/yyyy in the Chromium shots).
R2 gates — code head 79aa3d59 · ~20:30–20:40 UTC: typecheck (pos-gate lock) exit 0 · `qc-pos-p1.14` forced 30/30 · forced 30/30 · unforced 30/30 (cleanup line each run, a5 drift none) · `qc-pos-p1.3` forced 128/128 · fitness-pos 8/8 · `pnpm fitness` no env 41/41 · QC4 41/41 · visual-pos `--page stock --states --dry` owner rc 0 / cashier rc 0 (15 shots each). No build, no shots (controller).
