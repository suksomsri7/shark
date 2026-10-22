# Spec — P3.7U แชท UI (การ์ด CHAT · ลิงก์ชำระในแชท · UI-13 · PayDone ชิป LINE อัตโนมัติ)

Lane U of P3.7. Server contract = P3.7 S (`chat-link-actions.ts` · `chat-link-shared.ts` · `registerMemberBenefitsAction` · `getOrderAction`). No new server file (CD-P37U-1). Rulings CD-P37U-1…10 (prompt `pos-prompt-accountB-P3.7U-BUILD.md`, confirmed by controller B on 21 Oct).

## 1. การ์ด "แชท" แท็บการเชื่อมต่อ SHARK (ภาพ 10 · CD-P37U-2/3)
- **Where:** card `pos-settings-card-chat` (shark tab). The tab list stays at 8 tabs. The header knob is unchanged: LINKED means LINE is connected. The knob is read-only and shows `manageAt`.
- **Rows** (`ChatSettingsCard.tsx` › `ChatSettingsRows`): the 4 switches `receiptAuto refundNotice orderStatus autoReply` sit under the facts. Labels come from `cards.CHAT.switches.*`.
  - For the OWNER, each row is a `button role=switch` (`pos-settings-chat-row-<key>`). One tap sends `setPosChatSettingsAction({systemId, patch:{[k]: !v}})`. All rows are disabled while the call runs. The new state comes only from the result. A refusal shows as `pos-settings-chat-error` (PERMISSION_DENIED → `cards.CHAT.ownerOnly`, otherwise `settingsRefusalMessageKey`).
  - Everyone else sees a `span role=switch aria-disabled` (same testid) and `pos-settings-chat-owner-only`.
  - If the card is not LINKED, a switch that is off cannot be turned on. The button is disabled with title `cards.CHAT.off`. A switch that is already on can still be turned off. The existing card footer (`offPrefix · CHAT.off` + enable/manage link) is unchanged.
- **W15:** `pos-settings-chat-quota` (`cards.CHAT.quota`) always shows. When all 4 switches are off, a dashed note `pos-settings-chat-all-off` (`cards.CHAT.allOff`) shows. Initial values come from the page server (`posChatSettings(sys.settings)`, a pure read). Nothing is written on load.
- **Sheet** (OWNER only, `pos-settings-chat-open` → `pos-settings-chat-sheet`):
  - Fields: checkboxes `pos-settings-chat-kind-<accepted|ready|cancelled|paid>` (labels `orders.event.*`) and number input `pos-settings-chat-pause` (1–72).
  - Save (`pos-settings-chat-save`) sends only the changed keys. statusKinds go in canonical order. Out-of-range hours are sent as typed so that the writer decides. If nothing changed, the sheet just closes.
  - A refusal with `field` shows under that field (`pos-settings-chat-error`). Cancel is `pos-settings-chat-cancel` (`shark.cancel`).
- **No bot preview (CD-P37U-9):** reply texts are server tables. This is an owner-ack line.

## 2. จอ 09 — ลิงก์ชำระในแชท (CD-P37U-4/5/8)
- **Block** `pos-ord-chatpay` (`OrderChatBits.tsx` › `ChatPayBlock`) sits on the panel of CHAT orders whose payout is not PLATFORM.
  - The button `pos-ord-chatpay-send` (`chatPay.send`) shows when status is NEW and paymentState is UNPAID or PAY_ON_PICKUP. It does not depend on the chat switches (CD-P5).
  - It is disabled with a title and the line `pos-ord-chatpay-reason` in this order:
    1. `!(perms.accept ∧ perms.create)` → `chatPay.needPerm`
    2. `chatConversationId null` → `chatPay.errors.noChatLink`
    3. `promptpayId null` (from the orders page server) → `chatPay.errors.promptpayNotConfigured`
- **Results** (`pos-ord-chatpay-result`, with `data-sent` / `data-duplicated`):
  - duplicated → `chatPay.duplicated`
  - sent → `chatPay.sent` · `chatPay.payBy {time}` (time = `prepay.payBy` after reload, drawn client-side)
  - not sent → `chatPay.notSent` + `pos-ord-chatpay-copy` (copies `statusUrl` to the clipboard; label changes `copy` → `copied`)
  - refusal → `messageKey` (namespace `pos`), otherwise `refusalMessageKey(code)`
  - After every result the order reloads (`reloadAll`). There is no retry and no auto-resend (ruling 2).
- **Card chip:** CHAT ∧ NEW ∧ PENDING_PAYMENT orders live in the awaiting list (`AwaitingPayList`, P2.7U S1), not in the NEW column. So the chip `pos-ord-card-chatpay-<ref>` sits on that card: `chatPay.requested {amount}` · `chatPay.payBy {time}` (client-only). It is derived from order state, since POS has no delivery reader. "แจ้งในแชทแล้ว" shows only on the panel right after a `sent:true` result.
- **Timeline:** `payment_requested` → `orders.event.payment_requested`.
- **Privacy (CD-P37U-8):** no LINE display name, externalUserId, conversation id or chat-room link appears anywhere. The panel shows the channel name and the member name/tier only.

## 3. UI-13 — สมาชิกบนแผงออเดอร์ (CD-P37U-6)
- When `d.memberId` is set, the panel calls `registerMemberBenefitsAction({systemId, unitId, deviceId?, memberId, cart:{lines:[]}})` once per open (keyed `orderId:memberId`).
- It shows `pos-ord-member-tier` = `detail.memberTier {name, tier}`, or just the name when there is no tier. No phone, points or vouchers are shown.
- On a refusal, and while loading, it falls back to `detail.isMember`.

## 4. PayDone (02b · CD-P37U-7)
- The register page server passes `chatReceiptAuto = posChatSettings(sys.settings).receiptAuto` through RegisterScreen to PayDone.
- The chip `pos-reg-done-line-auto` = `chat.notify.receipt` shows when `chatReceiptAuto ∧ memberAttached`. It is a state label, not "ส่งแล้ว": the outbox drains later and the member may have no LINE.
- The manual LINE button `pos-receipt-send-paydone-line` stays (staff resend = P1.11).

## 5. Messages added (th+en · `src/messages/{th,en}/pos.json`)
- `settings.cards.CHAT.{allOff, sheetOpen, sheetTitle, save, saveFailed}`
- `orders.chatPay.{requested, copy, copied, needPerm}`
- `orders.event.payment_requested`
- `orders.detail.memberTier`

## 6. Visual states (`visual-pos.mts p3.7u --states`)
See `wo-notes/pos-P3.7U.md` §`--state` list. Fixtures follow CD-P37U-10 (no reseed · fresh context per state · LINE CONNECTED = 0 guard · settings.pos.chat jsonb with restore · temp CHAT system + WEBCHAT room · module ingestOrder · door A pressed for real only in `orders-detail-chat-sent`).
