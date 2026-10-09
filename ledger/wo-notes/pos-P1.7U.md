# POS P1.7U — builder notes (pay dialog PromptPay/Beam panel of 02 · card via Beam · 17A "วิธีรับเงิน" tab · visual)

Builder · VPS tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.7u` from `origin/session/pos` ff4e559f · 9 Oct 2026 · lane 1.
Contract: `ledger/wo-notes/pos-P1.7.md` "Contract for P1.7U" + "Fix round 1" · prompt `ledger/pos-briefs/pos-prompt-accountB-P1.7U.md` rulings 1–8. Server half untouched except ruling 6 (additive).

## Commits
1. 449fffd9 — step 1: `PayIntentPanel.tsx` (`usePayIntent` hook + panel) · `InterimPayDialog.tsx` intent mode · messages · inventory `pos-pay-intent-*` · `fitness-pos.mts` `UNIVERSAL_TOKENS += "Beam"` (F15.4: the product name "Beam" as a Thai value, like "PromptPay").
2. 16d4f906 — step 2: register page props (`payIntent`) · `RegisterScreen` cart key + ruling 5 guard.
3. 27a51dd7 — `test(pos)`: ORACLE-EDIT S1-U (31 → 32 checks) + oracle notes count. **Fail-before** (positive control): forced run on 27a51dd7 = exit 1 · 31/32 · only S1-U red (`MISSING:updatePosIntentSettings`) · residue 0.
4. c4ec8328 — step 3: `updatePosIntentSettings` + `updatePosIntentSettingsAction` + `PaymentSettings.tsx` tab + tab registry `payments` live + inventory `pos-settings-pay-*`. Forced oracle after it: exit 0 · 32/32 · residue 0.
5. e034e215 — step 4: `visual-pos.mts` states.
6. 5d7ed29f — merge `origin/session/pos` (only ledger commits 358895a8, 1d9b97c8 at that time — P1.11U / P1.15U not yet in `session/pos`).

## Screens
- **Pay dialog (02 right column)** — `PayIntentPanel` replaces the old static QR card when the page sends `payIntent` (always on the v2 register):
  - PROMPTPAY (or CARD when `beamCard`) for the current round ⇒ `createPaymentIntentAction` (debounced 450 ms after the amount settles; immediate after a cancel/regenerate). Panel = QR (`PromptPayQr`, 150 px) · "PromptPay · ยอดรอบนี้" / "บัตรเครดิต/เดบิต · Beam" · amount · status line · countdown "หมดอายุใน m:ss".
  - `PROMPTPAY_STATIC`: "ให้ลูกค้าสแกน แล้วกดยืนยันเมื่อเห็นเงินเข้า" + button "ยืนยันเองเมื่อเห็นเงินเข้า". `PROMPTPAY_BEAM`: radio-style accent line "รอเงินเข้า… ยืนยันอัตโนมัติผ่าน Beam" + the manual button. `CARD_BEAM`: "รอผลจาก Beam…" + "เปิดลิงก์" (QR = hosted card URL), no manual button.
  - Poll `paymentIntentStatusAction` every 2 s while PENDING; stops on PAID/EXPIRED/CANCELLED/CONSUMED.
  - PAID ⇒ chip "✓ เงินเข้าแล้ว · via Beam" / "· ยืนยันเอง" (+ "เงินเข้าหลัง QR หมดอายุ" when `lateWebhook`); amount input, numpad, quick amounts disabled; another method tile ⇒ notice "เงินเข้าแล้ว ใช้กับบิลนี้ หรือคืนเงินเอง". Full round PAID ⇒ "ยืนยันรับเงิน" enabled and the final pay row carries `reference = intent.id`. Partial round PAID ⇒ "แยกจ่าย …" enabled; the split row gets `reference = intent.id`, shows "เงินเข้าแล้ว · …", and its ✕ only shows the locked notice (cannot be removed). Next round starts on cash (no second QR is created by itself).
  - Amount/method change with a PENDING intent ⇒ `cancelPaymentIntentAction` then a new intent. EXPIRED ⇒ "QR หมดอายุ" + "สร้าง QR ใหม่" (key suffix `_r<n>`); CANCELLED ⇒ same with "รายการรับเงินนี้ถูกยกเลิก — สร้าง QR ใหม่". A reused key whose intent is EXPIRED/CANCELLED moves to the next `_r<n>` automatically.
  - Refusals via `intentRefusalMessageKey` (namespace `pos`) + "ลองอีกครั้ง". `PROMPTPAY_NOT_CONFIGURED` ⇒ "ร้านยังไม่ได้ตั้งพร้อมเพย์" + link. `CARD_UNAVAILABLE` ⇒ the dialog switches to the P1.6 EDC path for the rest of the dialog. Card tile subtitle = "Beam" when Beam card is on, else "EDC · ใส่เลขอ้างอิง" with the reference input (no intent).
  - Ruling 5: `discountOverCap` (quote refusal `DISCOUNT_EXCEEDS_LIMIT`, or a local `priceCart` with the page cap `limits.maxDiscountBp` refuses it) ⇒ no intent is created; the panel shows "ขออนุมัติส่วนลดก่อนสร้าง QR".
  - Submit unchanged except `reference` on intent rows; `INTENT_*` / `AMOUNT_MISMATCH` submit refusals use the existing `refusalMessageKey` card on the dialog.
- **17A "วิธีรับเงิน"** (`?tab=payments`, `PaymentSettings.tsx`, cards like ReceiptSettings): "พร้อมเพย์" (PaymentProfile `promptpayId` read-only, masked for read-only users, link "ตั้งค่าที่ช่องรับเงินของร้าน →" `/app/settings/payment`, QR lifetime 5–60) · "Beam" (switch "รับเงินผ่าน Beam" + hint "ต้องมีคีย์ Beam ในระบบ…", chip "ยังไม่ตั้งคีย์"/"มีคีย์แล้ว" from server `beamEnabled()` boolean; switch disabled when no keys and currently off) · "การยืนยันเอง" (switch `manualConfirmRequiresManager`). Save = `updatePosIntentSettingsAction` with only the changed keys. Read-only (cashier) = disabled fields + "เฉพาะผู้จัดการแก้ได้".

## Server hunk (ruling 6 — additive)
- `payment-settings.ts` +84 lines: `updatePosIntentSettings(ctx, actor, patch)` — sibling of `updatePosPaymentSettings` (untouched); same writer path (tx + `SELECT … FOR UPDATE` on the AppSystem row + rebuild `settings.pos` with only `payment` replaced; unknown keys inside `pos.payment` kept). Permission `pos.device.manage` shop-level + every linked unit (F9, `canManageAllLinkedUnits`). Validation: only keys `beam{enabled:boolean}`, `qrExpiryMinutes` int 5..60, `manualConfirmRequiresManager:boolean`; anything else ⇒ VALIDATION (`field`). Returns `parsePosIntentSettings` of the written JSON.
- `payment-intent-actions.ts` +29: `updatePosIntentSettingsAction({systemId, patch})` (`requireTenant`, `assertCan pos.device.manage`, refusals as data, `unstable_rethrow`).
- `payment-intent-shared.ts` +10: `PosIntentSettingsPatch` / `PosIntentSettingsRefusal` / `PosIntentSettingsResult`.
- `receipt-settings.ts`: `canManageAllLinkedUnits` exported (1 word).
- Not touched: `payment-intent.ts`, `register.ts`, `beam.ts`, schema/migrations.

## Keys / testids
- Messages th+en: `pos.register.pay.intent.*` (26 keys) · `pos.settings.payments.*` (19 keys).
- Testids: `pos-pay-intent` (`data-kind`, `data-status`), `-wait`, `-countdown`, `-paid` (`data-via`), `-expired`, `-error` (`data-code`), `-loading`, `-approval`, `-not-configured`, `-locked`; interactive `pos-pay-intent-manual|regenerate|retry|open-link|setup-link` · settings `pos-settings-payments`, `pos-settings-pay-promptpay|beam-chip|error|…-card`; interactive `pos-settings-pay-save|expiry|beam|manual|link`. Inventory rows: 10 (5 register, 5 settings).

## Deviations from 02/17A and the rulings (with the reason)
1. Intent key separator `_` instead of `:` (ruling 1 / CD3): the server key is `[A-Za-z0-9_-]{8,100}` and oracle C2 asserts `:` ⇒ VALIDATION. Key = `<cart key>_<METHOD>_<amountSatang>[_r<n>]`.
2. Manual button for `PROMPTPAY_BEAM`: disabled unless the user has `pos.shift.manage`, regardless of `manualConfirmRequiresManager` — server Fix round 1 F3 always requires it for BEAM; STATIC follows the setting (ruling 1).
3. PayDone "via Beam" (ruling 4): omitted — `RegisterSubmitOk` carries no payment notes ("read from the sale result if present, else omit"). Follow-up: add `payments[].note` to the submit result (register.ts, out of scope).
4. PromptPay link goes to `/app/settings/payment` (where `PaymentProfile.promptpayId` is edited — the ID the server reads per ruling B), labelled "ตั้งค่าที่ช่องรับเงินของร้าน →" instead of "ตั้งค่าที่ระบบบัญชี →" (that page is not in the accounting system; the P1.7 S message "บัญชี → โปรไฟล์ธุรกิจ" has the same inaccuracy — follow-up wording fix).
5. "Every non-cash row PAID" (ruling 2) = every row that came from an intent; TRANSFER / EDC card rows keep the P1.6 cashier confirmation (no intent exists for them).
6. Closing the pay dialog does not cancel a PENDING intent (the customer may be paying); it expires on its own, and reopening with the same cart/method/amount returns the same intent (`reused`). A PAID intent therefore survives a closed dialog and is picked up again.
7. QR component: `PromptPayQr` (the one the dialog already used; it renders any payload, incl. the Beam card URL). No receipt QR component existed on this base.
8. Transfer tile subtitle stays "กรอกเลขอ้างอิง" (mockup "แนบสลิป" = slip upload, out of scope).
9. A due change while the dialog is open (PRICE_CHANGED) still clears split rows (P1.6 rule 4) incl. PAID-intent rows; the PAID intent is recovered by re-picking the same method/amount (same key). Rare path; noted.

## Visual (CONTROLLER-RUN; `--dry` only here)
- register `--states`: `paydlg-promptpay-qr` (3 sizes) · `paydlg-promptpay-paid` (desktop/mobile; manual confirm through the UI = `confirmPaymentIntentManualAction`, then after the shot "ยืนยันรับเงิน" = one real sale consuming the intent) · `paydlg-card-edc` (3 sizes, asserts no intent panel). settings `--states`: `settings-payments` (3 sizes).
- Coffee tenant PromptPay: `savePaymentProfile` only when missing/invalid; restored in finally/signal. Intents of this run's device still PENDING ⇒ `cancelPaymentIntent` (service behind `cancelPaymentIntentAction`; a script has no session) in finally/signal; PAID left unconsumed is reported in `summary.intentState`. No raw SQL on intents.

## Follow-ups (owner)
- Beam keys (`BEAM_MERCHANT_ID/API_KEY/WEBHOOK_SECRET`) + a `returnUrl` for card charges — until then 17A shows "ยังไม่ตั้งคีย์" and cards use EDC. Beam PromptPay is still untested against the real API (P1.7 S note).
- Submit result with payment notes (for "via Beam" on PayDone) · per-branch PromptPay IDs (P1.18) · card MDR / Beam refunds / "เงินเข้าไม่มีบิล" report (P1.7 S follow-ups).

## Gates (final code = head of `wip/pos-p1.7u`)
Code = 5d7ed29f + visual type fix (same push). DB suites: `bash scripts/iso.sh [env QC_FORCE=1] bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` (QC4 `ep-frosty-lab`).
| gate | result |
|---|---|
| typecheck (`iso … flock /tmp/pos-gate.lock pnpm typecheck`) | #1 exit 0 (steps 1–2) · #2 exit 0 (step 3) · #3 exit 2 (visual-pos.mts `ppBefore` nullable type) → fixed · #4 exit 0 (final) |
| `qc-pos-p1.7` fail-before (27a51dd7, forced) | exit 1 · 31/32 · S1-U red only · residue 0 (positive control) |
| `qc-pos-p1.7` QC_FORCE=1 ×2 | exit 0 · 32/32 · residue 0 (both) |
| `qc-pos-p1.7` unforced | exit 0 · 32/32 · residue 0 |
| `qc-pos-p1.6` | exit 0 · 48/48 |
| `qc-pos-p1.3` | exit 0 · 128/128 |
| `qc-pos-p1.10` | exit 0 · 40/40 |
| `qc-pos-p1.15` | exit 0 · 36/36 · residue 0 |
| `qc-pos-p1.16` | exit 0 · 28/28 · residue 0 |
| `qc-pos-account` | exit 0 · 16/16 |
| `qc-hf-pos-page-authz` | exit 0 · 56/56 |
| `qc-nav-functions` | exit 0 · 11/11 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` / `qc4.sh pnpm fitness` | exit 0 · 41/41 / exit 0 · 41/41 |
| `scripts/fitness-pos.mts` | exit 0 · 8/8 |
| visual `--page register --states --dry` owner / cashier | exit 0 · 45 shots each |
| visual `--page settings --states --dry` owner / cashier | exit 0 · 16 shots each |
Not run here: real visual (needs a server) — CONTROLLER-RUN; `next build`.

## Fix round 1 (reviewer MERGEABLE-AFTER-FIXES on 52b0713b · controller rulings F1–F5) — commit 5125193d (+ merge 0e55892a, ledger only)
- **F1**: intent key = `<cart>_s<row index>_<METHOD>_<amount>[_r<n>]` (row index = number of split rows already taken). A `reused:true` intent whose id is already on another row ⇒ next round, retried once; a second hit ⇒ "สร้าง QR ไม่สำเร็จหลายครั้ง — กดลองใหม่". A reused PAID intent is never shown as paid for a new row.
- **F2**: the cancel helper returns its result. `INTENT_PAID` ⇒ stop, re-read status (`paymentIntentStatusAction`), the intent becomes the current PAID/locked one, the dialog restores its method/amount and shows "เงินเข้าแล้ว ใช้กับบิลนี้ หรือคืนเงินเอง"; no new intent is created over it. Same path when the target becomes null (method switched to cash/transfer). The PENDING intent stays on screen until its cancel is answered.
- **F3a**: unmounting the dialog (close) cancels the current intent unless it is PAID (a late Beam payment ⇒ server `refund_needed` instead of an orphan). Replaces deviation 6 above.
- **F3b**: while the current intent is PAID or any row has `via`, Esc / ✕ / back show the locked notice instead of closing. A due change (PRICE_CHANGED) keeps `via` rows, moves a current PAID intent into a row, and re-plans only the unpaid remainder (replaces deviation 9). If the new due is below the paid total ⇒ "เงินเข้าเกินยอด ฿X — คืนเงินเอง" (`pos-pay-intent-overpaid`) and confirm is blocked. **Deviation:** in that over-paid state closing is allowed (otherwise the cashier is stuck with no way to confirm or leave; the PAID intents stay PAID for the manual refund).
- **F4**: `register/page.tsx` → `registerSellerLimits(actor, unit, await registerDiscountCaps({tenantId, systemId}))`.
- **F5**: `IDEMPOTENCY_CONFLICT` bumps the round · rounds exhausted ⇒ real error + "ลองอีกครั้ง" · polling stops on any non-INTERNAL refusal (DEVICE_REVOKED etc.) and shows it · unused `pay.intent.cardHint` removed (th+en; added `overPaid`, `roundsExhausted`) · visual: a PAID-unused intent left after the run ⇒ cleanup not ok ⇒ rc 1; PromptPay restore goes through `savePaymentProfile` when the old value is valid, else delete (no old row) / raw update (old value invalid — the updater refuses it), noted in `summary.intentState`.
- **Follow-up (P1.15U):** after P1.15U merges, the ruling-5 over-cap guard must also accept an approved held cart / manager-PIN path (today it blocks any cart whose local price check or quote says DISCOUNT_EXCEEDS_LIMIT).

| gate (fix round 1, code 5125193d / 0e55892a) | result |
|---|---|
| typecheck | exit 0 |
| `qc-pos-p1.7` QC_FORCE=1 ×2 / unforced | exit 0 · 32/32 · residue 0 (all three) |
| `qc-pos-p1.6` | exit 0 · 48/48 |
| `qc-pos-p1.3` | run 1 exit 1 · 127/128 (S9.1 coffee-tenant row drift: +1 PosSale/PosPayment/pointLedger from lane 2's P1.11U visual on :3227 running at the same time, outside the POS lock) · run 2 same drift (+1 sale) · run 3 (no visual running) exit 0 · 128/128 |
| `qc-pos-p1.10` | run 1 exit 1 · 39/40 (Z2 PosReceiptCounter fingerprint drift — same concurrent visual sale) · run 2 exit 0 · 40/40 |
| `qc-pos-p1.15` | exit 0 · 36/36 · residue 0 |
| `qc-pos-p1.16` | exit 0 · 28/28 · residue 0 |
| `qc-pos-account` · `qc-hf-pos-page-authz` · `qc-nav-functions` | exit 0 · 16/16 · 56/56 · 11/11 |
| `pnpm fitness` without env / with qc4 | exit 0 · 41/41 / exit 0 · 41/41 |
| `fitness-pos` | exit 0 · 8/8 |
| visual `--dry` register / settings × owner, cashier | exit 0 · 45 / 16 shots |

## Fix round 2 (re-review MERGEABLE at 3e69da35 · N1/N3/N4 before merge)
- **N1**: `tryClose` is async: blocked while `pi.confirming` (manual confirm in flight) or while a close is already running; with a PENDING intent it calls the hook's new `cancelCurrent()` and waits — `INTENT_PAID` ⇒ adopt + lock (same path as F2, method/amount restored, locked notice) and the dialog stays open; any other outcome closes (the unmount cancel retries if the first one failed).
- **N3**: a terminal submit refusal on the dialog (`DEVICE_REVOKED`, `SHIFT_CLOSED`, `SHIFT_REQUIRED`, `INTENT_CONSUMED`, `INTENT_EXPIRED`) allows closing even with money in, and shows "บิลนี้บันทึกไม่ได้แล้ว แต่เงินเข้าแล้ว — คืนเงินลูกค้าเอง" (`pos-pay-intent-refund`, key `pay.intent.refundYourself` th/en).
- **N4**: inventory row `pos-pay-intent-overpaid` (display line, registered with kind `form` + expect `inline-error` → confirm disabled — the inventory has no kind for a non-interactive line; noted in the row).
- Nothing else touched; visual not re-run (controller building 3e69da35 in this tree).
- **Follow-up (owner/controller):** report "เงินเข้าไม่มีบิล" — PAID intents never consumed (incl. paid rows per cart key that survive a dialog reopen / a terminal refusal / an over-paid close) so the manager can refund or attach them.

| gate (fix round 2) | result |
|---|---|
| typecheck | exit 0 |
| `qc-pos-p1.7` QC_FORCE=1 | exit 0 · 32/32 · residue 0 |
| `fitness-pos` | exit 0 · 8/8 (also `pnpm fitness` 41/41 pre-commit) |
- **Addendum (QR panel compact, separate commit):** vis37 `register-paydlg-promptpay-qr-owner-1440x900` clipped the `00/0/⌫` row and hid the quick amounts. Now, only while the intent panel is shown (PromptPay/Beam card, incl. the paid state; cash/EDC unchanged): QR 146 px in a 170 px box, text column beside it (gap 8 · amount 26 px · status · button/chip · expiry line inside the column) ⇒ panel ≈ 200–205 px like 02; right column gap 12 + py 14; keypad gap 10, keys 46 px (52 px at xl). Budget: 1440×900 dialog 760 − header 72 − footer 76 = 612 ≥ ~607; 1024×768 dialog 736 − 148 = 588 ≥ ~583. Keys stay ≥ 44 px. Re-shoot = controller.
