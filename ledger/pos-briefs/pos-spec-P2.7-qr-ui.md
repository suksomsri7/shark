# POS P2.7U — spec: QR สั่ง / สั่งล่วงหน้าจ่ายก่อน (UI half)

Builder U · 16 Oct 2026 · base `session/pos` 92b7149d (P2.7 S merged) · tree b · branch `wip/pos-p2.7u` · contract = `wo-notes/pos-P2.7.md` "U-card contract" + brief `pos-brief-P2.7.md` §3 §5 §10 rulings 11 15 16.
No mockup exists for the public pages (ruling 15): visual language = `/r/<token>` public receipt (one column, receipt-header source, large tap targets); staff frames = 09 / 03 / 10 wording quoted in the brief.
Money is never computed in the UI: menu prices, cart lines/totals/service charge (`quote*CartAction`), table bill (`tableBillAction` = register table bill), order total/pay amount (`orderStatus`), 09 card totals and QR round totals (server `qrTableRoundsAction`). Times = server ISO, formatted on the device after mount (HF-418).

## 1. Routes
| route | who | content |
|---|---|---|
| `/q/t/[qrToken]` | anyone with the table sticker (capability token) | `QrTableApp` (menu · cart · send round · ordered + kitchen status · call staff / request bill · bill + PromptPay + notify) |
| `/q/[linkToken]` | anyone with the shop's pre-order link | `QrPreorderApp` (menu · cart · pickup details + PDPA · place → status) |
| `/q/o/[orderToken]` | the customer who placed the order | `QrOrderStatusApp` (pay QR + countdown + claim / Beam auto · paid · accepted · preparing · ready · handed · expired (19ค) · rejected · cancelled · receipt link) |
| `/app/sys/[id]/pos/orders` | as P2.8U | + rail "หน้าร้าน QR N" · QR round cards · "รอชำระ N" · PREPAID / claim chips · late-money + expired banners |
| `/app/sys/[id]/pos/tables` | as P2.4U | + panel "QR ของโต๊ะ" dialog · "พิมพ์ QR ทุกโต๊ะ" A4 sheet |
| `/app/sys/[id]/pos/settings?tab=channels` | as P2.1U | + QR_TABLE / QR_ORDER drawer block |
All public pages: `force-dynamic`, noindex, no session import, token shape → `notFound()`, unknown/rotated/other-door token → one generic card (`pos-qr-invalid`, `qr.errors.tokenInvalid`), th/en via `?lang` (cookie `lang` fallback) + `pos-qr-lang-th|en`, 0 Thai literals in `(store)/q/**` + `components/pos/qr/**` (ST7). Client islands import values only from `*-shared` (actions arrive as props).

## 2. Public table page (`QrTableApp`)
- Frame: receipt-header source (`QrTableView.shop` additive: shop name · logo · branch) + table badge `pos-qr-table-name`; max 1024 wide.
- < 1024: segmented tabs `pos-qr-tab-menu | rounds | bill` (bill only with a session) + floating cart bar `pos-qr-cart-bar` → bottom panel `pos-qr-cart-sheet`. ≥ 1024: menu left, right column = cart · ordered · bill (no tabs).
- Menu: category chips `pos-qr-cat-*` · rows `pos-qr-item` (image · name th/en · channel price) · 86/inactive = greyed + "หมด" `pos-qr-item-soldout` · `+` `pos-qr-item-add-<id>` (no options = add 1; options = panel `pos-qr-opt-sheet`: groups with rule text, radio/checkbox choices `pos-qr-choice-*`, sold-out choices disabled, note, qty, `pos-qr-opt-add` disabled until required groups are complete).
- Cart: lines with −/+ (`pos-qr-cart-qty-<i>-minus|plus`, 0 = remove) · line totals + subtotal + service charge + total from `quoteTableCartAction` (debounced 250 ms; refusal with `lineIndex` = red line + message) · `pos-qr-send` → `placeTableRoundAction({lines, expectedSessionId: view.session?.id ?? null, guestToken})` (guest token per device in localStorage `shark.pos.qr.guest`).
- After send: banner `pos-qr-sent`, tab → ordered, immediate poll + bill read. `SESSION_CHANGED` / `QR_CLOSED` = message in the cart + poll.
- Ordered (`pos-qr-rounds`): rounds newest first, per item kitchen chip `pos-qr-round-status` (NEW/COOKING/READY/SERVED/CANCELLED) + "ครัวทำเสร็จ d/t" · buttons `pos-qr-call-staff`, `pos-qr-request-bill` only with a session (fix3 nit a).
- Bill (`pos-qr-bill`): lines · service charge · total (`tableBillAction`) · split open ⇒ `pos-qr-pay-hidden` · else PromptPay QR `pos-qr-bill-qr` of the POS total + `pos-qr-notify-paid` → `pos-qr-notified`.
- Closed door: `pos-qr-closed` (`data-reason` = CHANNEL_OFF · CHANNEL_PAUSED · KITCHEN_PAUSED · KITCHEN_CLOSED · PAYMENT_NOT_READY) · menu read-only (no add buttons, no cart).
- Poll: `tablePollAction(token, sinceVer)` every 8 s while visible (Page Visibility), immediate on tab return; changed ⇒ new view + bill read.

## 3. Public pre-order page (`QrPreorderApp`)
- Pickup ASAP only ("รับเองที่ร้าน · เตรียมประมาณ N นาที", ruling 7). Same menu/options/cart components (`quotePreorderCartAction`, no service charge).
- < 1024: menu → cart panel → `pos-qr-to-checkout` → checkout step; ≥ 1024: cart + checkout in the right column.
- Checkout `pos-qr-checkout`: `pos-qr-co-name` (≤ 100, required) · `pos-qr-co-phone` (`normalizeThaiPhone`; invalid = `pos-qr-co-phone-error`) · PDPA line `pos-qr-pdpa` · `pos-qr-co-note` · total from the quote · `pos-qr-place` → `placePreorderAction` with one idempotency key per (cart, name, phone) → `/q/o/<orderToken>?lang=`.
- Closed (incl. PAYMENT_NOT_READY) = banner + read-only menu.

## 4. Public status page (`QrOrderStatusApp`)
Phase (`data-phase`) from `orderPhaseOf(view)`: pay · claimed · paid · accepted · preparing · ready · handed · expired · rejected · cancelled. Step bar pay → accepted → preparing → ready.
- pay/claimed: amount `pos-qr-order-amount` + QR of the order intent `pos-qr-order-qr` (one amount, one expiry) + countdown `pos-qr-order-countdown` to `pay.expiresAt` (red < 60 s; at 0 = immediate poll → server expires once) · static = `pos-qr-claim` (event only) → `pos-qr-order-claimed` · Beam = `pos-qr-order-auto`.
- paid: "ได้รับเงินแล้ว — รอร้านรับออเดอร์" + "จ่ายแล้ว · พร้อมเพย์ ฿x". accepted/preparing: `pos-qr-order-eta` "พร้อมรับประมาณ hh:mm". ready: big code `pos-qr-order-ready`. handed: thanks.
- expired (19ค copy): title "PromptPay ยังไม่ได้รับเงิน" + `pos-qr-order-expired` with ลองใหม่ (`pos-qr-order-again` → the unit's ACTIVE link, additive `orderAgainToken`) · เลือกวิธีอื่น (order/pay at the shop) · ยืนยันเอง (show this page/code to staff for a manual check).
- rejected/cancelled: `pos-qr-order-closed` + `pos-qr-order-refund` when `refundPending`.
- receipt link `pos-qr-order-receipt` once the sale exists. Lines + total + "ผู้รับ {name} · 08x-xxx-x678" (masked).
- Poll `orderStatusAction(token, sinceVer)` every 5 s while visible; stops on handed/expired/rejected/cancelled.

## 5. 09 orders
- Rail `pos-ord-ch-qr-table` "หน้าร้าน QR N" (rounds placed by guests today, `qrTableRoundsAction` read-only: RestaurantOrder DINE_IN `placedByUserId null`) replaces the PLANNED chip; selecting it shows QR round cards only. "สั่งออนไลน์ (QR)" = normal channel row `pos-ord-ch-QR_ORDER` (icon qr). "ทุกช่องทาง N" = orders + QR rounds.
- QR round card `pos-ord-qr-round-<id>` (link → `/pos/tables?unit=&open=<session>`): "QR โต๊ะ" chip · "B2 · #18" · time · "N รายการ · ฿x" · "ครัวกำลังทำ d/t" meter · "เก็บเงินรวมกับบิลโต๊ะ"; column = preparing (not all done) / ready (all done, not all served) / done row `pos-ord-qr-done-<id>` (all served).
- "รอชำระ N" `pos-ord-awaiting` (top of the new column, muted, not in the new count): `pos-ord-await-card-<ref>` · countdown `pos-ord-await-left-<ref>` to `prepay.payBy` · claim chip `pos-ord-claim-<ref>` "ลูกค้าแจ้งโอนแล้ว · ตรวจยอด" + `pos-ord-await-confirm-<ref>` "ยืนยันรับเงิน" (`confirmPaymentIntentManualAction(prepay.intentId)`; disabled when the shop requires a manager and the user lacks it) · `pos-ord-await-cancel-<ref>` = reject sheet.
- PREPAID chip `pos-ord-prepaid-<ref>` "จ่ายแล้ว · พร้อมเพย์ ฿x" (PREPAID, and PAID orders that came from a prepay). Panel: pending note `pos-ord-pending-note` + `pos-ord-confirm-pay`; accept disabled while PENDING_PAYMENT; on-accept line for PREPAID; timeline labels expired / customer_paid_claim / late_payment.
- Banners: late money `pos-ord-late-<ref>` (additive `OrderCard.prepay.latePaid` from the `late_payment` event) "เงินเข้าหลังหมดเวลา ฿x · ref pi_… — ออเดอร์ … ถูกปิดแล้ว" + `pos-ord-late-open-<ref>`; expired today `pos-ord-expired-banner`.
- Mode-tab badge = `counts.byColumn.new` (server: PENDING_PAYMENT excluded, PREPAID counted) — unchanged code.

## 6. 03 tables
- Panel head `pos-tbl-panel-qr` → `pos-tbl-qr-dialog`: QR `pos-tbl-qr-image` of `<origin>/q/t/<qrToken>` · URL · `pos-tbl-qr-copy` · `pos-tbl-qr-print` (sheet with this table) · `pos-tbl-qr-rotate` → inline confirm `pos-tbl-qr-rotate-box` (`-cancel` / `-confirm` → `rotateTableQrAction`, `restaurant.table.rotateQr`; no key = disabled + explanation).
- Floor toolbar `pos-tbl-print-qr` → `pos-tbl-qr-sheet` (A4 portrait, 3 columns, dashed cut lines; cell = shop name · "โต๊ะ X" · QR · hint · branch) · print CSS `@page A4` + visibility isolation · `pos-tbl-qr-sheet-print` = `window.print()`.

## 7. Settings › channels
`pos-channel-qr` block inside the builtin drawer of QR_TABLE / QR_ORDER: active switch `pos-channel-qr-active` (saveChannel {id, name, active}) · QR_ORDER: auto-accept `pos-channel-qr-auto` + prep `pos-channel-qr-prep` · pause 15/30/60 `pos-channel-qr-pause-*` / `pos-channel-qr-reopen` (setChannelOrderSettings, P2.8) · QR_ORDER link block `pos-channel-qr-link` (none = `pos-channel-qr-link-create`; link = QR + URL + `pos-channel-qr-link-copy` + `pos-channel-qr-link-rotate` → confirm) · QR_TABLE → `pos-channel-qr-tables` · menu visibility = `pos-channel-qr-products` (P2.2 channel price rows "ไม่ขายในช่องทางนี้").

## 8. States × viewports (visual `p2.7` · `P27_PLAN`)
| page | state | 390 | 1024 | 1440 | th | en | fixture |
|---|---|---|---|---|---|---|---|
| qr-public | table-menu | ✓ | ✓ | | ✓ | ✓ | tables zone `posqc-vis-p27` · QR_TABLE active |
| qr-public | table-cart | ✓ | ✓ | | ✓ | ✓ | add 2 items (UI) |
| qr-public | table-sent | ✓ | ✓ | | ✓ | ✓ | send a round (UI · real guest round, cleaned) |
| qr-public | table-rounds | ✓ | ✓ | | ✓ | ✓ | table with guest session + items COOKING/READY/SERVED |
| qr-public | table-bill | ✓ | ✓ | | ✓ | ✓ | same table · PromptPay ID |
| qr-public | table-notified | ✓ | ✓ | | ✓ | ✓ | tap notify (PAY_PROMPTPAY request, cleaned) |
| qr-public | table-payhidden | ✓ | ✓ | | ✓ | ✓ | table with an open split plan |
| qr-public | table-closed | ✓ | ✓ | | ✓ | ✓ | QR_TABLE paused 30 min (restored) |
| qr-public | table-bad-token | ✓ | ✓ | | ✓ | ✓ | well-formed unknown token |
| qr-public | pre-menu · pre-cart · pre-checkout | ✓ | ✓ | | ✓ | ✓ | QR_ORDER link (create if none) |
| qr-public | pre-pay · pre-claimed | ✓ | ✓ | | ✓ | ✓ | placePreorder (static PromptPay) · claimPaid |
| qr-public | pre-paid · pre-accepted · pre-ready | ✓ | ✓ | | ✓ | ✓ | confirm intent manually (owner) → PREPAID → accept → ready |
| qr-public | pre-expired · pre-rejected | ✓ | ✓ | | ✓ | ✓ | payBy moved to the past + lazy expiry · rejectOrder |
| qr-public | pre-closed | ✓ | ✓ | | ✓ | ✓ | QR_ORDER paused (restored) |
| orders | orders-qr-rows · orders-awaiting · orders-prepaid · orders-claim · orders-late-banner | ✓ | ✓ | ✓ | ✓ | ✓ (1440) | same fixtures |
| tables | tables-qr-dialog · tables-qr-print | ✓ | ✓ | ✓ | ✓ | ✓ (1440) | P2.7 fixture tables |
| settings | settings-channel-qr-table · settings-channel-qr-order | ✓ | ✓ | ✓ | ✓ | ✓ (1440) | builtin drawers |
