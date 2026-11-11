# P2.6U review R1: `wip/pos-p2.6u` e7ed4eac (code fa3a8338, base 671e6fd2)
**Verdict: MERGEABLE-AFTER-FIXES.** Rulings 15–18 are correct, the KDS screen follows 04 closely, there is no money on the KDS, keys and authz are in order and the gates match the logs. Two Medium UI gaps must close first: the cook cannot use the 86 sheet (F1), and 17B offers a print setting that does nothing (F2).

## Findings
- **F1 (Medium) A cook-only user cannot search for anything to 86.** The 86 sheet loads its product list through `registerCatalogAction` (`KdsEightySix.tsx:91`, as ruling 8 asked). That action runs `regScope`, which defaults to `REG_SELL_PERMS = ["pos.sale.create"]` (`register.ts:665, :682`). Input: COOK with only `restaurant.kds.advance` (KDS-read and 86 rights per R15/CD9) opens "แจ้งของหมด". The action is refused, the list stays `[]`, and the sheet shows `eightySix.empty` ("no kitchen items", `:177`). The cook can still release items in the current-86 list, but can never mark a new one. Owner/cashier runs miss this because their seed has `pos.sale.create`. Smallest fix: add a read-only `kdsKitchenProductsAction` in `kds-actions.ts` under NEED `availability`. It lists the unit's MENU rows plus non-MENU rows routed to a station (the same truth as `availabilityFor`), and the sheet uses it in place of `registerCatalogAction`. This also closes deviation (e).
- **F2 (Medium) 17B "print after sale at this device" can be saved but never prints.** The setting is a live, selectable radio (`DeviceSettings.tsx:551`). Nothing at the register reads `kitchenSlip` (deviation 10). Input: the owner picks "พิมพ์หลังขายที่เครื่องนี้" → after a takeaway sale with kitchen lines, no slip prints and there is no hint why. Smallest fix, either:
  - (a) render it like the LAN option, disabled with the PLANNED chip, until it is wired; or
  - (b) wire it: `kdsQueueNoAction` also returns `orderId`; PayDone (`PayDone.tsx:77`) calls `kitchenSlipPayloadAction` + `printKitchenSlips` when `kitchenSlipSettings(cfg).mode === "after-sale"`, filtered by `stationIds`.
- **F3 (Low) `kdsBoardAction(expo)` is used as a station-list reader.** It is used that way in 17B (`DeviceSettings.tsx:103`) and in the 06 drawer (`kitchen-ui.tsx:46`). Each call runs `healMissingTickets` (writes) and the whole board compute. It also needs the KDS read keys, so a manager with only `pos.product.manage` gets an empty station picker. Fix: a read-only `kdsStationsAction` over `R.kitchenStationsForPos` (NEED `read` | `manage`).
- **F4 (Low) The "รอครัว" badge is too broad.** It appears on every NEW card while paused or over the cap (`OrdersScreen.tsx:467` → `OrderCardView.tsx:160`). That includes MANUAL-adapter or `autoAccept:false` channels, which would wait for staff anyway. Fix: AND with the card's channel `autoAccept && adapter ≠ MANUAL`.
- **F5 (Low) The visual fixture pays a cash bill and keeps it.** `visual-pos.mts:4527` `บิลหน้าขาย … (เก็บไว้)`. Ruling 12 says "no fixture pays". Earlier visual WOs keep bills on QC5 too, and ruling 17 prevents a ghost re-heal after routing is restored. Either the controller accepts it, or the fixture voids the bill in `finally`.
- **F6 (Nit)**
  - The 09 meter is drawn bar → text; the mockup is "ครัวกำลังทำ 0/3" then the bar (`OrderCardView.tsx:151`).
  - The authz ORACLE-ADD marker lacks "ผู้คุม".
  - `RegisterMoreEntry` adds a `resize` listener that is not removed on cleanup.

## Deviations
| | verdict |
|---|---|
| (a) `servedToday.last` +`orderId`/`stationId` (optional, additive), `kitchenStateForUnit` and `queueNoForSale` (`kds.ts:390,396`) | **Accept.** Both are pure reads through the facade with no writes; no S type or behaviour changes (T5 pins `count`/`last.no`); p2.6 still pins its 13 exports (extras allowed); 65/65. |
| (b) `setProductStationAction`, `kdsKitchenStateAction`, `kdsQueueNoAction` | **Accept.** `"use server"`, async-only, same NEED table (+`manage`, `sale`), no raw prisma (the catalog writer re-checks); fitness 50/50. |
| (c) "⋯" at the end of the mode bar, md+ only | **Accept.** The 390 register has no mode bar; the mobile entry is via settings → devices link and the legacy banner. |
| (d) Backlog stepper in the 09 rail | **Accept.** That is where the 09 mockup puts it ("พักรับอัตโนมัติเองเมื่อครัวค้างเกิน 8 ใบ"); restaurant settings live in the legacy unit-slug page. |
| (e) 86 search is MENU only | **Reject as-is.** It folds into F1 (Q5 = all routed kitchen products of the unit). |
| (f) Midnight owner note 00:00–02:59 | **Accept.** Matches the F5 ruling; contract unchanged. |
| (g) 17B after-sale not wired | **Reject as-is** → F2 (follow-up is fine only if the option is shown PLANNED). |

## Verified OK
1. **Rulings 15–18.**
   - 15: `kitchenLockRoundInTx` (`kitchen.ts` + facade) is called first in the recall transaction (`kds.ts:444`), then PosSale FOR SHARE and the plain PosOrder read, then `kitchenMoveInTx` (re-lock, no wait). Lock order round → PosSale/items → PosOrder; void and the consumers never take round then PosSale in reverse, so there is no cycle.
   - 16: MenuItem FOR UPDATE at `catalog-legacy.ts:200`, `:353`.
   - 17: `adoptVariantRow` stamps `stationSetAt` (`catalog.ts:1484`); the heal parent branch also checks the row's own stamp.
   - 18: copy and server message updated; `items` param removed; fix2 owner lines moved under the P2.6 heading (`POS-OWNER-PENDING.md:136-138`).
   - Oracle diff: `qc-pos-p2.6` = K14b, A14, K12b (dated). `qc-hf-pos-page-authz` KD-1…10 is the ORACLE-ADD that ruling 1 orders. `pos-qc-env` gains `POS_PAGES` + kds. Nothing else. red0 = 62/65 at 2038f0a3 (src/prisma = 671e6fd2) with exactly those three red.
2. Deviations: see the table above.
3. **No money:** grep of `kds/**`, the page and `kds-actions` for satang/price/amount/baht/฿ finds nothing. The only "total" is a line count. Slips come from the S payload, which carries no money.
4. **Screen 04 against the mockup** (code read; real shots are the controller's on QC5):
   - Station tabs with a filled pill on the active tab, plus Expo. Avg/target, pause switch (legacy `kitchenPauseAction`), print button. Grid `1fr 2fr 1fr` gap 26, with COOKING split into 2 sub-columns at xl.
   - Cards:
     - Header "#no · source" or a channel chip; rush chip; mm:ss timer.
     - Late = black header + red "เลยเป้า N นาที" + solid "เสร็จ"; warn footer.
     - Lines: note bold, options muted, done lines struck through, cancel chip.
     - Ready = ink border + "เสิร์ฟแล้ว".
   - Served strip with recall under READY. Bottom bar with pending and 86. Paused banner. Toasts through `kdsRefusalMessageKey` (TICKET_VOIDED key present).
   - Timing: 6 s poll paused while hidden; timers recomputed each second from `serverNow`; no clock text before mount. Order comes from the server (filter only).
   - Cashier: start, line, done, served, rush, recall and pause are all disabled with tooltips.
   - `'use client'` imports are only shared/pure modules plus `*-actions`.
   - 1024 = 3 columns; 390 = station select + segments + a collapsed 86 button.
5. **Small edits:**
   - 19ฉ tile "หมด · ครัวแจ้ง HH:MM" for KDS/MANUAL marks only.
   - 06: station select (non-MENU), 86 chip and MANUAL toggle.
   - 09: meter, detail line, held badge, stepper.
   - PayDone "คิว N": up to 3 tries × 1 s.
   - 17B: keys written via the existing printer action; p1.10 40/40.
   - KDS page gate `posKdsView` = S NEED.read; no `POS_NAV_KEYS` entry; authz 81 = 71 + KD-1…KD-10.
6. **Keys:** th/en have the same 2927-leaf set; the en "Thai" hits are pre-existing `฿` (U+0E3F) strings; KDS TSX has Thai only in comments; p1.18 81 (ST7 0).
7. **Visual harness:** `p2.6u` states cover every new or changed surface (kds × 8, register-tile-86, orders-kitchen-meter, products-drawer-station, settings-device-kitchen-slip) for owner + cashier, th + en, at 3 devices. Fixture cleanup is in `finally`/signals. `--dry` is rc 0 in all 13 dry logs. Kept bill = F5.
8. **Boundaries:** no change to `prisma/`, `pos-sale-contract.json`, `service.ts`, `register.ts`, `restaurant/order.ts` or `restaurant/kds.ts`. `restaurant/**` gains only the facade export, the ruling 15 wrapper and the 2-line legacy banner. p1.6 not re-run (createSale untouched).
9. **Gates:** headers are tree c at `head=8e8fc7b6 dirty=0`, or fa3a8338 for typecheck/fitness (8e8fc7b6 = notes only). typecheck rc 0 · fitness 50/50 ±env · fitness-pos 8 · p2.6 65 ×3 residue 0 · authz 81 · p2.8 61 · p2.4 50 · p1.3 128 · p1.10 40 · p1.12 72 · p1.16 28 · p1.18 81 · p1.1 180 · products 24 · restaurant 6/6/19/11 · visual dry rc 0.
10. **Merge hygiene:** fa3a8338 merges bfb65f75 and adds ledger only (code diff against 277414f4 is empty); step commits as listed in the notes.

## Follow-ups
- **P2.6U fix1:** F1, F2 (+F3, F4).
- **P2.7:** QR 86 events (the S owner line).
- **P2.11:** held-NEW sweeper; audible alert; per-station kitchen-progress split for the 09 bullet; previous-bizDate tickets (ORACLE-EDIT T5).
- **Owner:** a cook account needs no sale keys once F1 lands. Until F2 is wired, kitchen slips print only from the KDS button.

## Controller rulings — fix round 1 (account B, 14 Oct 16:1xZ)
1. **F1 → fix**: new read-only `kdsKitchenProductsAction` in `kds-actions.ts` under NEED `availability` (unit's MENU rows + non-MENU rows routed to a station = the `availabilityFor` truth, with current mark/stock state); `KdsEightySix.tsx` uses it instead of `registerCatalogAction`. Closes deviation (e) (Q5 scope = all routed kitchen products). ORACLE-ADD in `qc-hf-pos-page-authz` if that suite covers actions (KD-11: COOK with only `restaurant.kds.advance` gets the list; a user with no KDS key is refused) — else a `qc-pos-p2.6` check (A15) with a dated marker.
2. **F2 → wire it (option b)**: `kdsQueueNoAction` also returns `orderId`; `PayDone` calls `kitchenSlipPayloadAction` + `printKitchenSlips` when `kitchenSlipSettings(cfg).mode === "after-sale"`, filtered by `stationIds`; one print per sale (guard against re-render), failure = toast only, never blocks PayDone. Deviation (g) rejected as-is. If wiring turns out > 40 lines, fall back to option (a) (PLANNED chip, disabled) and say so.
3. **F3 → fix**: read-only `kdsStationsAction` over `R.kitchenStationsForPos` (NEED `read` | `manage`); 17B and the 06 drawer use it (no heal, no board compute from a settings page).
4. **F4 → fix**: "รอครัว" badge only when the card's channel has `autoAccept && adapter !== "MANUAL"`.
5. **F5**: fixture voids its cash bill in `finally` if ≤ 10 lines (cleanup consumer cancels the tickets); else keep and note "kept bill" in the state list (earlier WOs do).
6. **F6 nits → fix** (meter text-then-bar per mockup 09; authz marker "ผู้คุม"; remove the `resize` listener on cleanup).
7. Gates after fix1 (builder): typecheck · fitness ±env · fitness-pos · `qc-pos-p2.6` 65 (or 66 with A15) forced ×2 · `qc-hf-pos-page-authz` (81 or 82) · `qc-pos-p1.18` (ST7 0) · `qc-pos-p1.10` 40 · `visual-pos p2.6u --dry` all pages. Other DB suites stay valid if the diff touches no server file beyond `kds-actions.ts`/`kds.ts` readers — list the diff files to prove it; if `kds.ts` changes, re-run p2.6 unforced too. Then **R2 (hunks)** + controller re-shoot of the touched states on QC5 (kds-86-sheet owner/cashier, orders-kitchen-meter, settings-device-kitchen-slip, products-drawer-station) after vis69 is reviewed; money/stock hunter on the U `kds.ts`/`kds-actions.ts` hunks at merge.

## Controller V findings (account B, 14 Oct 16:1xZ · vis69 fa3a8338 on QC5 · owner th 1440/390 vs mockup 04)
Parity overall good: tabs with filled count badge, avg/target, pause switch, print, 3 columns (COOKING 2 sub-columns), card header `#n · โต๊ะ` / `#n [chip]`, late card black header + red "เลยเป้า", struck-through done lines, READY card with "เสิร์ฟแล้ว", served strip, bottom bar (backlog · 86 · แจ้งของหมด), paused banner, expo, 86 sheet, products drawer "ครัว" section, register tile "หมด · ครัวแจ้ง HH:MM", 09 meter + stepper.
- **V1 (header)**: the device/shift chip right of the clock renders as a lone "ι" (1440 and 390). Mockup: `กะ #12 · เคาน์เตอร์ 1`. When no shift/device is bound, hide the chip or show the device name; never a stray glyph.
- **V2 (mobile 390)**: the top row (back · branch · clock · chip) sits in a ≈300 px tall band with huge vertical padding before the station select. Make it one compact row (≤ 56 px) like the desktop header.
- **V3 (harness, 390)**: `kds-served-recall` fails — `pos-kds-recall` not visible on 390; `kds-refusal-toast` fails — no visible `pos-kds-ticket-*` because the default segment is "ใหม่" and the target ticket is elsewhere. Make the served strip reachable on mobile (under the "พร้อมเสิร์ฟ" segment or the bottom sheet) and have the harness switch segment before acting. All 390 states must pass.
- **V4 (fixture)**: the fixture skipped the register bill (`submit SHIFT_REQUIRED`), so no takeaway register ticket ("ซื้อกลับ · รอหน้าร้าน · คิว N") appears in `kds-mixed`. The fixture must open a shift for the register bill (the register-page fixture already does) and close/void in `finally` (ruling 5).
- **V5 (86 sheet)**: with an empty query the list says "ไม่พบเมนูของสาขานี้". With the new `kdsKitchenProductsAction` (F1) show the unit's routed kitchen products by default (86'd first, then by name) and filter as the user types; "no results" only for a non-matching query.
- **V6 (17B ใบครัว control)**: the segmented control breaks — "พิมพ์หลังขายที่เครื่องนี้" wraps to 3 lines, and the LAN option's "เร็ว ๆ นี้" chip renders as vertical text. Shorten labels (e.g. "ไม่พิมพ์ · หลังขายที่เครื่องนี้ · เครื่องพิมพ์ครัว LAN") or stack the options vertically as radio rows with the PLANNED chip inline.
- **V7 (card footer)**: "เสร็จ 1/2 · เจ้าของร้านกาแฟ (P…" — the name truncates mid-word; mockup shows a short name ("ต้น"). Use the user's nickname/first name (≤ 12 chars) with ellipsis.
- **V8 (09 stepper)**: "ไม่พักรับอัตโนมัติตามคิวครัว" shows a value box that looks like a second minus button ("–  −  +"). Show the value as text ("ปิด" / "N ใบ") in the middle box, visually distinct from the buttons.
- **V9 (nit)**: "#4  · โต๊ะ M2" has a double space before the separator; mockup "#16 · โต๊ะ A2".
- **V10 (nit)**: card "···" menu is not in the mockup — accepted (rush/line-done need a home) but keep it 44 px and out of the footer text's way.
Rulings: V1–V9 join fix round 1 (UI/harness only). After fix1 the controller re-shoots the full `p2.6u` state list (kds ×8 owner/cashier th + owner en incl. 390, register-tile-86, orders-kitchen-meter, products-drawer-station, settings-device-kitchen-slip).

## R2 (account B, 14 Oct 16:3xZ) — head f67790a7 / code a14dcb61 — **MERGEABLE** (full report `pos-P2.6U-review-R2.md`)
F1–F6 + V1–V9 closed as ruled; server diff = readers only (`roundOfSale`, `kdsKitchenProducts`, `kdsStations`); oracle = A15 only; gates match logs (head=fb115dd0). Low/Nit: **G1** fixture cleanup guard ignores the shift/bill on a failed first pass (OPEN shift + PAID bill could remain on QC5) · **G2** after-sale print silent when the round is not there within 3 polls · **G3** initial regex skips only Thai leading vowels; dry logs lack headers; en dry plan 1440-only. Note: the builder's "code head 1df0a6c2" does not exist — real code head a14dcb61 (chain69 failed at checkout; restarted as chain70 at f67790a7).

## Controller rulings — fix round 2 (account B, 14 Oct 16:3xZ)
1. G1 → fix (guard + idempotent void/close on retry) · G3 → fix (non-letter skip, dry-log headers, en 390 plan) · G2 → optional status line if ≤ 10 lines. Harness/UI only; gates typecheck · fitness ±env · fitness-pos · visual --dry th+en incl. 390 · p1.18 if keys changed. No R3 needed if the diff is harness/UI only (controller reads the diff).
2. Merge path after fix2 + vis71 reviewed + hunter clean: merge upstream (`origin/session/pos`, ledger-only expected) → merge gates on tree c (p2.6 66 · p1.1 · p1.3 · p1.18 · authz · p2.8 · p2.4 · p1.10 · p1.12 · p1.16 · restaurant ×4 · products · hf-tx · fitness ±env · fitness-pos · typecheck) → merge → **28/55** + TG.
3. **Hunter (merge-time, `pos-P2.6-hunt.md` §P2.6U)**: FINDINGS Low only — **N1** after-sale slip never prints when the round is created later by heal (= G2 → status line now mandatory) · **N2** variant re-link stamps `stationSetAt` even when the effective station is unchanged ⇒ lost ticket (fix: stamp only on an effective-station change; ORACLE-ADD K12c, K12b stays green). Both folded into fix round 2 (N2 = one server condition in `catalog.ts`; p2.6 → 67 forced ×2 + unforced). Walked clean: no cross-unit/tenant leak in the new readers; recall lock order cycle-free vs void/cancel consumers and legacy; print path read-only, no money; no new cook-only stock writes (pre-existing S note: `setAvailability({available:true, resetCounter:true})` lets a COOK refill a counter → owner line). Controller reads the fix2 diff; a short R3 only on the `catalog.ts` hunk.

## Controller visual check 2 (account B, 14 Oct 16:5xZ · vis71 f67790a7 on QC5, all 13 runs rc 0 incl. 390)
V1 ✓ (chip shows the initial "จ") · V2 ✓ (56 px top row) · V3 ✓ (390 recall toast "เรียกใบ #86 กลับมาแล้ว") · V4 ✓ (takeaway ticket "#87 · ซื้อกลับ" in READY) · V5 ✓ (86 sheet lists kitchen items by default, 86'd first) · V6 ✓ (vertical radio rows, PLANNED chip inline) · V7 ✓ (first word ≤ 12 + "…") · V8 ✓ ("ปิด") · V9 ✓ ("#84 · โต๊ะ E2"). Parity with mockup 04 accepted. No reshoot needed after fix round 2 unless a visible state changes (G2 status line is not in the state list — accepted).

## R3 (account B, 14 Oct 17:0xZ) — head d3396aab / code 8db5cda5 — **MERGEABLE** (full report `pos-P2.6U-review-R3.md`)
Stamp rule correct; no re-link path exists (`adoptVariantRow` refuses rows with a parent; only creation writes `parentId`) so K12c is a regression guard (red2 67/67 explained); G1 guard retry-safe; G3a `\p{L}` minus Thai leading vowels; N1 accepted — Low note: a sale with no kitchen lines on an after-sale device shows the "no kitchen ticket" line (false alarm) → **P2.11 follow-up** (skip when no line maps to a station). Server diff = `catalog.ts` only. Gates match (head=f74ca51d).

## Controller rulings — merge (account B, 14 Oct 17:0xZ)
Merge locally 4449123f → gates77 on tree c → push → p2.8 re-run if ST6 red (register.ts untouched by U ⇒ expected green) → **28/55** + TG. Follow-ups P2.11: N1 false alarm · held-NEW sweeper · audible alert · per-station 09 split · previous-bizDate tickets (ORACLE-EDIT T5). Owner: cook account needs no sale keys; `setAvailability({resetCounter:true})` by a COOK refills a counter (gate behind `pos.product.manage`?).
