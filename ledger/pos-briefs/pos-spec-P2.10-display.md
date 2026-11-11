# POS spec — P2.10 customer display (จอลูกค้า · จอที่ 2 · mockup 11 panel A 1280×800)

Builder · account B · 15 Oct 2026 · branch `wip/pos-p2.10` (base `session/pos` 84ffb48b + oracle e9eeb83f) · contract = `ledger/wo-notes/pos-P2.10-oracle.md` names table + brief `pos-brief-P2.10.md` §10 rulings 1–13.
Server: single writer `src/lib/modules/pos/display.ts` · thin `"use server"` `display-actions.ts` (session) · `/d` actions (no session) in `src/app/(store)/d/actions.ts` · pure DTO/validator `display-shared.ts`.

## Pairing (DeviceSettings 17B → `/d`)
1. Settings › เครื่องและเครื่องพิมพ์ › selected ACTIVE device › block "จอลูกค้า" → `pos-settings-display-enable` = `enableCustomerDisplayAction({systemId, unitId, deviceId})` → 8-char Crockford code (TTL 10 min) shown big + QR of `<origin>/d?c=<code>` + countdown (client-only after mount).
2. Tablet opens `/d` (bookmark) → form `pos-display-pair` (code prefilled from `?c=`) → `pairDisplayAction(code)` → server `pairCustomerDisplay` (10/min/IP via `core/rate-limit-db`) → sets httpOnly cookie `pos_display` (Secure · SameSite=Lax · Path=/d · 400 d). The token never reaches page JavaScript.
3. "ขอรหัสใหม่" while paired keeps the old token valid until the new code is redeemed (ruling 13.7). "ยกเลิกการจับคู่" (`pos-settings-display-revoke` → confirm dialog) = REVOKED ⇒ next poll `DISPLAY_NOT_PAIRED` ⇒ the page deletes the cookie and shows the form. Device revoke ⇒ same.

## Settings block (`pos-settings-display`)
| element | testid | behaviour |
|---|---|---|
| status | `pos-settings-display-status` (`data-paired`, `data-online`) | ยังไม่ได้จับคู่ · รอจับคู่ · ออนไลน์ (lastPolledAt ≤ 120 s) · ออฟไลน์ + "จออ่านล่าสุด HH:MM" (Bangkok) |
| enable / new code | `pos-settings-display-enable` | label "เปิดจอลูกค้า" (no row) / "ขอรหัสใหม่" (row exists) |
| code panel | `pos-settings-display-code` · `-code-text` · `-countdown` · `-qr` | code `XXXX XXXX`, "หมดอายุใน m:ss", QR → `/d?c=`; hidden once paired; expired = note "รหัสหมดอายุแล้ว"; locked (5 fails) = note `statusLocked` |
| unpair | `pos-settings-display-revoke` → `-revoke-dialog` · `-revoke-cancel` · `-revoke-confirm` | `revokeCustomerDisplayAction` |
| show points | `pos-settings-display-show-points` (switch) | `updateCustomerDisplaySettingsAction({showPoints})` — off hides balance and points earned (ruling 13.3) |
| idle text | `pos-settings-display-idle-text` | ≤ 80, saved on blur/Enter, empty = default "ยินดีต้อนรับ" |
| language | `pos-settings-display-locale` | "" = same as receipt (`settings.pos.receiptLocale`) · th · en |
Polls `customerDisplayStatusAction` every 5 s while a code is pending, 30 s otherwise. Errors = `pos.display.errors.*` (`pos-settings-display-error`).

## Display page `/d` (`DisplayScreen`, `data-testid="pos-display"`, `data-phase=pair|idle|cart|paying|done`)
- Transport (ruling 1): `readDisplayAction({sinceVer})` every `nextPollMs` (1 s cart/paying/done · 3 s idle), paused while hidden (visibilitychange), immediate read on return; `changed:false` when the derived version (seq · effective phase after the 120 s stale / 20 s done expiry · intent status · settings) is unchanged. Wake Lock requested while paired (best effort). `pos-display-fullscreen` (hidden in full screen / unsupported). Offline badge `pos-display-offline` on read failure.
- Layout = mockup 11A: left 60 % (`md:` row; < md stacked) — shop header (`pos-display-shop`: logo or initial tile · shop name from the receipt header chain `receiptShopHeaderOf` · "branch · device name"), greeting `pos-display-greeting` ("สวัสดีคุณ<first name>" + "tier · N แต้ม" when showPoints), lines `pos-display-line` (qty×, name, detail · "ลด ฿x · label", gross bold + red −discount), `pos-display-more`, totals `pos-display-totals` (รวม · ส่วนลดรายการ · ส่วนลดท้ายบิล · คูปอง CODE · member lines · ค่าบริการ), stamp strip `pos-display-stamp` (name + "ดวงที่ f/s · อีก n ดวงรับรางวัล"; near (≤ 2 left) = accent "ใกล้ได้รางวัล!"; dots when slots ≤ 12). Right pane (surface-2) = pay card `pos-display-paycard`: ยอดสุทธิ big, `pos-display-paid` "ชำระแล้ว ฿x · คงเหลือ ฿y", PROMPTPAY → `pos-display-pay-qr` (server QR: own-device PENDING intent or static unit PromptPay at the round amount) + "สแกนเพื่อจ่ายด้วย PromptPay" + "หรือแตะบัตรที่เครื่อง"; PAID → `pos-display-qr-paid`; CARD → Beam QR when an own intent exists, else `pos-display-card`; CASH → `pos-display-cash` (รับ / ทอน); OTHER → "กำลังชำระเงิน". Done → `pos-display-done` (✓, "ขอบคุณคุณ…", change, points earned when showPoints, `pos-display-receipt-qr` when `qrEReceipt` and the sale is on this device's shift ≤ 15 min, receipt no.). Idle → `pos-display-idle` (header + idle text).
- 1280×800 = `xl:` sizes from the mockup CSS; 1024×768 = base sizes. Tokens only; all text from `pos.display.screen.*` in the display's locale; money `displayBaht` / `displayGroup` (no locale-dependent SSR output, HF-418).
- Old browsers (ruling 7): inline unlayered `@supports not (color: color-mix(in srgb, red, red))` shows `pos-display-unsupported` (plain HTML, th + en) and hides `#pos-display-app`.

## Register side
`use-display-publish.ts` (called once from `RegisterScreen.tsx`; PayDialog gets `onDisplayPay`) builds `DisplayState` from lineModels + fresh quote + coupon + member (first name, tier, points) + wallet stamps[0] + quote.stampsToAdd + pay view + done layer (receiptNo, saleId, change, pointsExpected). Phase: done layer > pay open + pay view > lines > idle. Not sent while the quote is stale; debounce 300 ms, ≥ 1 s apart, keepalive 60 s for non-idle; `paired:false` stops until 5 min / tab visible again. `seq` = 100 ms ticks since 2026-01-01 (monotonic across reloads, int4).

## Visual states (`scripts/visual-pos.mts p2.10 --states`, owner, th + LOCALE=en)
display 1280×800 + 1024×768 (en = 1280): `display-pair` · `display-idle` · `display-cart` · `display-member-stamps` · `display-paying-promptpay` · `display-paying-cash` · `display-paying-card` · `display-done` · `display-stale` · `display-unsupported` · `display-live` (1280 only, live register tab → display) · settings 1440/1024/390: `settings-display-unpaired` · `settings-display-code` · `settings-display-online`.
