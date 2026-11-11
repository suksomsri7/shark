# POS P2.6U — spec: จอครัว (screen 04) + small edits (19ฉ · 06 · 09 · 02b · 17B)

Builder U · 14 Oct 2026 · base `session/pos` 482e353e (code 671e6fd2 = P2.6 S) · prompt `pos-prompt-accountB-P2.6U.md` rulings 1–18 · S contract `wo-notes/pos-P2.6.md` §"P2.6U contract".
No money on the KDS: tickets/slips carry none. Ticket order = server order (`sortColumn` in `kds.ts`); the client only filters by state. Clock text is drawn after mount (HF-418).

## 1. Route and frame
| route | who | content |
|---|---|---|
| `/app/sys/[id]/pos/kds?unit=&station=` | POS of the tenant + register v2 on; no accessible linked unit = 404; `posKdsView` refused (no `restaurant.kds.advance` / `pos.sale.read` / `pos.sale.create` at the unit = `kds.ts` NEED.read, or another unit asked) = refusal card `pos-kds-refusal` (HTTP 200, before any read) | `KdsScreen` |
Frame: icon rail (`NavRail.isRailPath` matches `/pos/kds` for v2 systems) · no POS module tabs · not in `POS_NAV_KEYS`. Entry links: register mode bar "⋯" → `pos-reg-more-kds` · settings devices `pos-device-kds-link` · legacy `/app/u/[unitSlug]/restaurant/kds` banner `pos-kds-legacy-open` (only when the unit's POS has register v2 on; legacy page otherwise unchanged).
Page-authz rows KD-1 (static) … KD-10 (`qc-hf-pos-page-authz`).

## 2. KdsScreen (`src/components/pos/kds/KdsScreen.tsx`)
- Top bar `KdsTopBar` (portal into `#app-topbar-slot` md+, inline row otherwise): `pos-kds-back` (‹ → `/app/sys/[id]`) · tenant name · unit chip `pos-kds-unit` (menu `pos-kds-unit-option-<id>` when > 1 unit) · device chip `pos-kds-device` "จอครัว · <device>" (`heartbeatAction` of this browser's device code; unregistered/refused = "จอครัว") · clock `pos-kds-clock` (server-synced, after mount) · shift chip `pos-kds-shift` "กะ #N · <device>" only when `registerStatusAction` returns an open shift for this device · avatar initial.
- Header row: station tabs `pos-kds-tab-<stationId>` (name/nameEn by locale + `openCount` pill; active = bold + accent underline + filled pill) + `pos-kds-tab-expo` · avg `pos-kds-avg` "เวลาเฉลี่ย **N นาที** · เป้า T" · switch `pos-kds-pause` "หยุดรับออเดอร์ครัว" (legacy `kitchenPauseAction(unitSlug, fd)` · `restaurant.kitchen.pause`; disabled + tooltip otherwise) · `pos-kds-print` "พิมพ์ใบครัว". 390: `pos-kds-station-select` + segmented `pos-kds-seg-new|cooking|ready`.
- Paused ⇒ `pos-kds-paused-banner` "ครัวหยุดรับออเดอร์ · ออนไลน์และ QR ถูกพักไว้" (+ note). 00:00–02:59 (Bangkok) ⇒ muted `pos-kds-midnight` (F5 is not in the contract — owner text).
- Columns `pos-kds-col-new|cooking|ready`: 1440 = `1fr 2fr 1fr` gap 26 (กำลังทำ = 2 sub-columns) · 1024 = 3 equal columns · 390 = one column via the segmented control. Headers: name + count pill + hint (lg+).
- Empty unit (0 stations) ⇒ `pos-kds-empty-unit` + `pos-kds-setup-link` (`/app/u/<slug>/restaurant/setup`). Empty station ⇒ `pos-kds-empty-station` in ใหม่.
- Poll: `kdsBoardAction` every `KDS_POLL_MS` (6 s) while visible (Page Visibility), immediately on tab return and after every action. No sound (P2.11).
- Refusals: `kdsRefusalMessageKey(code)` → toast `pos-kds-toast` (`data-tone=danger`); `TICKET_NOT_FOUND` / `changed:0` ⇒ silent reload.

## 3. Ticket card (`KdsTicketCard` · `pos-kds-ticket-<orderId>` · `data-state/late/warn/rush`)
Header "#no · <source>" (TABLE "โต๊ะ X" · QR "QR โต๊ะ X" · REGISTER "ซื้อกลับ" · LEGACY label/"หน้าร้าน" · ONLINE = channel chip) + rush chip `pos-kds-rush-chip-<orderId>` + time `pos-kds-timer-<orderId>` (mm:ss from `ticketTimer` re-ticked every second; READY = "พร้อม N นาที"). Late = black header/white text + red "เลยเป้า N นาที" + solid "เสร็จ"; warn = "เหลือ N นาทีก่อนเลยเป้า". Lines `pos-kds-line-<itemId>`: qty · name 15 px · bold note · muted options; done = struck through; cancelled = muted + "ยกเลิก" chip. Footer: context (REGISTER "รอหน้าร้าน · คิว N" · TABLE "<staff> รับที่โต๊ะ" · QR "ลูกค้าสั่งเองผ่าน QR" · ONLINE externalRef · "เสร็จ d/t") + `pos-kds-more-<orderId>` + `pos-kds-done` / READY `pos-kds-served`.
Actions: NEW card tap `pos-kds-start-<orderId>` = `kdsStartAction` · line tap (COOKING) = `kdsLineDoneAction` · เสร็จ = `kdsTicketDoneAction` · เสิร์ฟแล้ว = `kdsServedAction` · menu (⋯ / long-press 550 ms / right click) `pos-kds-menu-<orderId>`: `pos-kds-rush` (`kdsRushAction` · `restaurant.order.rush`) · `pos-kds-print-this` · `pos-kds-select`. Advance buttons need `restaurant.kds.advance` (disabled + tooltip otherwise — the QC cashier is read-only).

## 4. Served strip · Expo · printing
- `pos-kds-recall` (dashed, under พร้อมเสิร์ฟ and on Expo): "เสิร์ฟแล้ววันนี้ N ใบ · ล่าสุด #no · label · hh:mm — แตะเพื่อเรียกใบกลับมาแก้" → `kdsRecallAction` of `servedToday.last` (`orderId`/`stationId` added to the contract — additive) · `restaurant.kds.recall` only.
- Expo `pos-kds-expo`: READY tickets of all stations grouped by round `pos-kds-expo-<orderId>` (station chips) · `pos-kds-served` per group = `kdsServedAction` per station, sequential, stop at the first refusal.
- Print: header button = selected ticket else every NEW ticket of the station; `kitchenSlipPayloadAction` (copy = printed before in this session or not NEW) → `kds-print.ts`: printer mode browser ⇒ `renderKitchenSlipHtml` → `printHtml` (one document, page breaks) · escpos-usb/bt ⇒ `renderKitchenSlipEscPos` + canvas raster → pairing of this device → `writeUsb`/`writeBluetooth` (the receipt path of `printReceipt`). Device config from `heartbeatAction`; none = browser 80 mm.

## 5. Bottom bar + 86 panel (`KdsEightySix.tsx`)
md+ `pos-kds-bottom`: "ค้างทำวันนี้:" `pos-kds-pending` (top 4 + "…") · "ของหมด (86):" `pos-kds-86-list` + "— แจ้งหน้าขายและช่องทางออนไลน์แล้ว" · `pos-kds-86`. 390: `pos-kds-86-mobile` "ค้าง N · หมด M ›".
Panel `pos-kds-86-sheet` (right 420, backdrop `pos-kds-86-backdrop`, close `pos-kds-86-close`): current 86 `pos-kds-86-out-<productId>` (source · hh:mm) + `pos-kds-86-release-<productId>` · note `pos-kds-86-note` · search `pos-kds-86-search` over this unit's MENU rows from `registerCatalogAction` (client filter) · `pos-kds-86-toggle-<productId>` → `setAvailabilityAction({source:"KDS", note?})`.

## 6. Small edits
- 19ฉ register tile: UNAVAILABLE + `soldOutMark` KDS/MANUAL ⇒ "หมด · ครัวแจ้ง HH:MM" (`pos-reg-tile-86`); other sold-out keeps "หมด".
- 06 products: drawer "ทั่วไป" tab → `pos-prod-kitchen`: station `pos-prod-station` (non-MENU; `setProductStationAction` → `catalog.updateProduct({stationId})`, `pos.product.manage`) · 86 at the selected unit `pos-prod-86-chip` + `pos-prod-86-toggle` (`setAvailabilityAction` MANUAL). Table status column: selected unit unavailable ⇒ `pos-prod-86-<id>` "หมด · 86 แล้ว".
- 09 orders: card meter `pos-ord-kitchen-meter` "ครัวกำลังทำ d/t" (ACCEPTED/PREPARING/READY with a round · `kitchenProgressAction` with each list poll) · NEW card badge `pos-ord-kitchen-held` "รอครัว" when paused or any station backlog ≥ max (`kdsKitchenStateAction`) · panel: on-accept line `pos-ord-on-accept-kitchen` (unit has stations) + `pos-ord-detail-kitchen` "ส่งเข้าครัวแล้ว N รายการ · เสร็จ d" · rail stepper `pos-ord-kitchen-max` (`-minus` / `-plus` / `-off` → `kdsSetAutoAcceptMaxAction`, `restaurant.kitchen.pause`).
- 02b PayDone: `pos-reg-done-queue` "คิว N" — `kdsQueueNoAction` ≤ 3 tries × 1 s after the sale (register only; table checkout passes no unit).
- 17B device form `pos-device-kitchen`: `pos-device-kitchen-off` / `-after` (printerConfig `kitchenSlip`) / `-lan` (PLANNED P3.11) · stations `pos-device-kitchen-station-<id>` (`kitchenStationIds`; all ticked = `[]` = every station) — writer `updateDeviceAction` (whole config).

## 7. Visual states (`visual-pos.mts p2.6u --states`, coffee tenant · silom)
kds: `kds-empty-unit` [owner] · `kds-empty-station` · `kds-mixed` · `kds-expo` · `kds-paused-banner` · `kds-86-sheet` · `kds-served-recall` · `kds-refusal-toast` [owner] · register `register-tile-86` · orders `orders-kitchen-meter` · products `products-drawer-station` [owner] · settings `settings-device-kitchen-slip` [owner]. Fixture and cleanup: see `wo-notes/pos-P2.6U.md`.
