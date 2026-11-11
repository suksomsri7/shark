# P4.3 triage — walker phase A (read-only analyst · 23 Oct 2026 · written 23:0xZ)

Inputs: `/root/pos-runs/walker-A-20261023T084816Z/` (cell-*.log · oracle.log · SUMMARY.txt · summaries/summary-*.json) · screenshots `/root/projects/shark-pos-d/.qc-shots/pos/buttons/<page>/<testid>-<cell>-desktop.png` · walker code on tree d @89631a81 (`scripts/qc-pos-buttons.mts` = **w:** · `scripts/pos-buttons-fixtures.mts` = **fx:** · registry `scripts/pos-ui-inventory.json`, hash 7edf45641e6e26ef).
Product lines are cited at the controller tip `session/pos` **aee86d08** (brief said cf5cbfa8; cf5cbfa8..aee86d08 = 3 ledger/test commits, no `src/`). `git diff 89631a81 HEAD -- src` = 75 files (P5.1/P5.2), but **none of the cited files changed** (RegisterScreen · PayDone · LockScreen · HeldBillsDrawer · BillsClient · StockCount · PriceRulesClient · price-rule.ts · proxy.ts · chat-link.ts · ReceiptSettings · ApiKeysCard · ChatSettingsCard · ProductsClient/ProductPanel). Only drift that matters: `KdsScreen.tsx:277-291` onPause now calls `kdsKitchenPauseAction` (P5.2 D11) instead of `kitchenPauseAction`; DeviceSettings.tsx moved (card testid :313 → :340).
Nothing was built, served, committed or written to a DB; no helper was run.

## 0. Counts (dead + wrongExpect + hiddenLeak rows · 128 total)

| cell | rows | R | H | P | A |
|---|---|---|---|---|---|
| owner-desktop | 42 (19 dead · 23 wE) | 8 | 33 | 1 | 0 |
| manager-desktop | 55 (4 dead · 50 wE · 1 hL) | 8 | 47 | 0 | 0 |
| cashier-desktop | 31 (3 dead · 28 wE) | 5 | 26 | 0 | 0 |
| public desktop/mobile | 0 | – | – | – | – |

Gate reds (qc-pos-p4.2 8/12): **W1** = A (phase A ran 5 of 19 cells by plan) · **W4** = the 128 rows above · **W5** console = P1 camera (owner 5 · manager 5 · cashier 3) + P2 RSC error (cashier 2) + H15 fake logo URL (owner 2) · **W6** = R10 (2 external rows without an oracle id).
Sub-class totals: H1 33 · H4 33 · H3 20 · H5 5 · H2 3 · H6/H7/H8 2 each · H9–H14 1 each · R1 R2 R3 R5 R6 3 each · R4 R9 2 each · R7 R8 1 each · P4 1.

## 1. R — registry/verify defects (exact edit text in §7)

| id | row (page#testid) | cells | walker detail | screenshot | registry now | product evidence | fix |
|---|---|---|---|---|---|---|---|
| R1 | register#pos-reg-bill-type | o m c | ไม่เห็น pos-reg-billtype | register/pos-reg-bill-type-*.png | ui target pos-reg-billtype, needs tables | unit without tables shows the old "coming soon" toast (note in the row itself) | add `anyOf` toast pos-reg-toast (needs H3 to see a 4 s toast) |
| R2 | register#pos-lock-submit | o m c | server refused: pos-lock-message "Incorrect PIN" | register/pos-lock-submit-*.png | mutation db AuditLog pin_verified · opener keys 1-2-3-4 · needs says the PIN is unknown | wrong PIN is the expected outcome (row's own needs) | add `anyOf` inline-error pos-lock-message (non-money ⇒ anyOf rescues, w:1330-1337) |
| R3 | register#pos-reg-held-discard-* | o m c | no AuditLog write | register/pos-reg-held-discard-x-*.png | opener cart-bar-held · held-bills | two-tap: 1st tap only sets confirmId (HeldBillsDrawer.tsx:96-99) | append `pos-reg-held-discard-*=click` so the row press is the 2nd tap |
| R4 | stock#pos-stock-qty-* | o m | no write request | stock/pos-stock-qty-x-*.png (input focused, empty) | opener pos-stock-tab-count | same testid is a "นับ" button until clicked, then the input (StockCount.tsx:576 input / :596 button); walker clicked the button only | append `pos-stock-qty-*=click` |
| R5 | sales#pos-bills-date-next | o m c | dead · disabled at press | sales/pos-bills-date-next-*.png (still 23 Oct) | opener pos-bills-date-prev=click | next disabled when date ≥ today (BillsClient.tsx:1086); prev click did not stick in 3/3 cells (row 226 pos-bills-date had just set the date back to today; root cause in the walker not proven) | replace opener by explicit past date `pos-bills-date=2026-10-01` (native-setter path, proven by row 226 ok) |
| R6 | sales#pos-bills-page-* | o m c | dead | sales/pos-bills-page-x-*.png (4 bills, 1 page) | ui changes target pos-bills-list, needs >10 bills | only page "1" exists and it is current (aria-current, BillsClient.tsx:1412) | expect `state: selected` on target pos-bills-page-* |
| R7 | settings#pos-device-card-* | o | dead | settings/pos-device-card-x-owner-desktop.png (1 card, already selected) | ui changes target pos-device-panel | only one device at owner time, auto-selected, aria-pressed (DeviceSettings.tsx:342) | expect `state: selected` on target pos-device-card-* |
| R8 | settings#pos-settings-api-create-submit | m | no write · pos-settings-api-create-error "เลือกสาขา…อย่างน้อย 1" | settings/pos-settings-api-create-submit-manager-desktop.png | opener has no unit tick (needs explains why) | manager scope defaults to pick (ApiKeysCard.tsx:227,241) | append optional step `pos-settings-api-unit-*=on?` (CD-P42-R11; owner has no list ⇒ step skipped) |
| R9 | settings#pos-channel-creds-webhook-copy | o m | opener pos-channel-connect-lineman not found | settings/pos-channel-creds-webhook-copy-*.png | opener nav-channels → connect-lineman → open-lineman | preset connect button only while LINE MAN is not created (ChannelsPanel.tsx:225-245); LINE MAN existed (chip visible in price-rule channels) | drop the connect step (it also creates a channel = side effect) + needs "LINE MAN exists" |
| R10 | shifts#pos-print-drawer-open · tables#pos-tbl-qr-sheet-print | o m (c) | W6: external without an oracle id | – | oracle "" | drawer kick bytes covered by P1.10-E2; window.print sheet has no check | drawer → oracle `P1.10-E2`; QR sheet → new P4.3 static row (§3 P-row list) and cite it |

## 2. H — harness/fixture gaps (exact walker/fixture text in §7)

| id | rows (cells) | evidence (detail · screenshot) | root cause (code) | fix |
|---|---|---|---|---|
| **H1** typing = scanner burst on /register (33) | custom-name (o m) · paydlg-received (o m c) · paydlg-reference (o m c) · hold-label (o m c) · taxinv-taxid (o m c) · taxinv-name/-address/-branch-code/-email (o) · taxinv-form (m) · taxinv-submit (o m c) · member-register-name (o) · member-register-birthdate (o m c) · coupon-input (o m) · coupon-apply (o m) · slip-ref (o m c) | owner = dead (no value change), manager/cashier = wE (same root; "alive" only through background requests). register/pos-reg-custom-name-owner-desktop.png: field empty + toast "ยังไม่รับการสแกน — ปิดหน้าต่างที่เปิดอยู่ก่อน"; register/pos-taxinv-form-manager-desktop.png: e-mail left "qc", form refused | w:562-563 types at 5 ms/char then Tab immediately · RegisterScreen.tsx:2577-2629 capture-phase scanner listener: gaps ≤ SCAN_MAX_GAP_MS 30 (scan-shared.ts:8) + Tab terminator = scan ⇒ field restored (:2606) + toast (:2628). Product behaves as designed (P1.4 B1/B2/R2) | type with delay ≥ 45 ms and pause 60 ms before Tab |
| **H2** scrim clicked at centre (3) | register#pos-reg-scrim (o dead · m c wE "pos-reg-note-dialog ยังเห็นอยู่") | register/pos-reg-scrim-manager-desktop.png (note dialog still open) | clickEl (w:455-476) clicks the element centre = the dialog box (child) ⇒ `e.target !== e.currentTarget` (RegisterDialog.tsx:68-71) | click scrim/backdrop rows at offset (4,4) |
| **H3** result target sampled too late (20) | paydlg-form · paydlg-confirm (o m c) · held-recall-* (o m c) · held-confirm-hold (o m c) · ord-man-submit (o m) · kds-86-release-* (o m) · prod-save (m) · ord-start · ord-ready · ord-handover (m) | the write happened (moneyPresses: paydlg-form/-confirm + ord-man-submit = new PosSale+PosPayment in posqc-btn-unit; db check passed) but "ไม่เห็น <toast/done> หลังกด". orders/pos-ord-start-manager-desktop.png: order moved to PREPARING, toast gone | w:1284 `settle(page, 8000)` + db poll ≤ 5 s run **before** the resultTarget check (w:1319-1323); toasts auto-hide after 4 s (RegisterScreen.tsx:401 · OrdersScreen.tsx:140 · KdsScreen.tsx:92 · ProductsClient.tsx:67), PayDone auto-advances after 5 s when change = 0 (PayDone.tsx:39,214-224) | start a visibility watcher for resultTarget/target/anyOf VIS targets right after the press |
| **H4** disabled control pressed (33) | manager: settings logo-url · name · phone · address · footer · show-points · qr-ereceipt · show-cashier · general-receipt-en · staff-hr-switch · account-switch · staff-gate-clock-* · chat-row-* · device-mode-lan · device-kitchen-lan · paydlg-method-giftcard/-deposit/-storecredit · slip-send; cashier: show-points · qr-ereceipt · show-cashier · general-receipt-en · general-oversell-block · card-etax-apply · paydlg-method-× 3 · slip-send; owner: chat-row-* · device-mode-lan · device-kitchen-lan · slip-send | each row has `needs` saying "เห็นแต่ปิดใช้"/"เจ้าของเท่านั้น"/"not enabled"/"needs a file"/"needs a print agent"; the same rows in other cells ended "skip needs · คอนโทรลมีแต่ disabled" (e.g. cashier logo-url). settings/pos-settings-logo-url-manager-desktop.png: keystrokes landed in another focused field (device number shows "qc-btn-gbmrj2s"); register/pos-slip-send-cashier-desktop.png: Send slip greyed | the disabled→needs rule only runs after a *dead* verdict (w:1183); background requests (`reqCount > reqBefore`, w:1174) make a disabled press look alive, then the expectation fails. Typing into a disabled input sends keys to whatever has focus (unsafe) | gate before the press: disabled + needs ⇒ skip needs; disabled without needs ⇒ dead |
| **H5** search text left on the page (5) | products/price-rules#pos-price-rule-product-* (o m dead) · register#pos-reg-company-row-* (o m c "ไม่เห็น pos-reg-company-chip") | products-price-rules/pos-price-rule-product-x-owner-desktop.png: product search holds "20" ⇒ empty pick list (PriceRulesClient.tsx:304-307); register/pos-reg-company-row-x-owner-desktop.png: company search holds "ลาเต้" ⇒ "No company found" | w:1390 keeps page state after any non-mutation field row; fillValueFor checks money words (w:501) before search (w:502) ⇒ "…product-search" contains "price" ⇒ "20" | mark the page dirty after search-like rows; check search before money words |
| **H6** personas created per cell (2) | register#pos-staff-card (o dead) · register#pos-staff-switch (o dead · disabled) | register/pos-staff-card-owner-desktop.png: only the owner in "ใครกำลังใช้เครื่องนี้" | fx:926 creates only the current cell's persona; lock list = tenant members who can sell at the unit (staff-pin.ts:595-602); switch disabled when staff.length < 2 (LockScreen.tsx:616) | ensure both btn personas in every staff cell |
| **H7** stock scan needs Enter + real code (2) | stock#pos-stock-scan (o m "ไม่มีคำขอเขียน") | stock/pos-stock-scan-owner-desktop.png: count #1 OPEN, input "qc-btn-gbmrj1d" | only Enter records (StockCount.tsx:510-513); walker presses Tab and types qc-btn-… | value = btn SKU `PQC-CF-LATTE`, submit with Enter |
| **H8** walker closed its own shift (2) | sales#pos-bills-refund-confirm (o m "คืนเงินสดต้องเปิดกะบนเครื่องนี้ก่อน") | owner moneyPresses: shifts#pos-shift-close-submit (page 2/36) before sales (page 10/36); orders screenshot header "ยังไม่เปิดกะ" | shift-close is not a side-effect tail row (fx:351-359) | move shift-close-submit to the tail + reopen the shift in resetSideEffects |
| **H9** success panel uses role=alert (1) | settings#pos-settings-api-create-submit (o "เซิร์ฟเวอร์ตอบปฏิเสธ: alert: คัดลอกเก็บไว้ตอนนี้…") | the key **was** created (the one-time key panel is shown) | ApiKeysCard.tsx:281-284 one-time warning `role="alert"` inside pos-settings-api-raw; alertsNow (w:578-580) treats every new alert as a refusal | ignore alerts inside pos-settings-api-raw (+ R: resultTarget pos-settings-api-raw) |
| **H10** PREFILL fills optional link fields (1) | orders#pos-ord-man-submit (c "ไม่พบผู้ติดต่อนี้ในร้าน") | known P4.1 r3 F3 (803) | prefill types qc-btn-… into pos-ord-man-conv/-party (ManualOrderEntry.tsx:324,328) ⇒ assertCustomerLinks | skip those two in PREFILL |
| **H11** kitchen pause not restored (1) | kds#pos-kds-pause (m "ไม่เห็น pos-kds-paused-banner") | owner row ok (paused, banner seen); manager screenshot kds/pos-kds-pause-manager-desktop.png: toggle off after press = manager un-paused | pause is not a side-effect row; needs "ครัวยังไม่ได้พัก" | tail row + reset kitchenPaused=false; at tip the toggle calls kdsKitchenPauseAction (P5.2 D11) |
| **H12** wildcard hits another element (1 hiddenLeak) | products#pos-prod-price-* (m hiddenLeak) | products/pos-prod-price-x-manager-desktop.png | list price cell `<span data-testid="pos-prod-price-${p.id}">` (ProductsClient.tsx:184, everyone) matches the pattern of the editor input `pos-prod-price-${code}` (ProductPanel.tsx:356, all-units editor only; 1-unit manager gets pos-prod-drawer-cell-*) | for input/textarea/select rows accept only INPUT/TEXTAREA/SELECT matches |
| **H13** container tab clicked at centre (1) | products#pos-products-module-tabs (c dead) | products/pos-products-module-tabs-cashier-desktop.png | testid on the flex strip (module-tabs.tsx:16); the cashier has fewer tabs ⇒ centre is empty strip | containers with links inside: click the first non-current a[href] |
| **H14** missing approval-policy fixture (1) | register#pos-discount-over-request (c "This shop has no discount approval flow — use a manager PIN instead") | row needs lists "กติกาอนุมัติ POS_DISCOUNT_OVER (ApprovalPolicy)" | correct product refusal | phase-B fixture ApprovalPolicy POS_DISCOUNT_OVER on the QC tenant |
| H15 (W5 only) | console owner settings#pos-settings-logo-url / -name: ERR_NAME_NOT_RESOLVED + 404 | walker logo value `https://qc-btn-….example.com` (w:493) | – | drop console "Failed to load resource" whose location host ends with `.example.com` |
| H16 (precision, 0 rows) | AppSystem db rows "ok" | writtenSince matches **any** tenant AppSystem with updatedAt ≥ press (fx:1032-1035) — weak for 26 settings rows | – | verify `settings.pos.<key>` JSON before/after (snapshot already in _qcP42Before) |
| H17 (observation) | th cells partly rendered in EN | register/pos-reg-paydlg-confirm-owner-desktop.png · register/pos-taxinv-form-manager-desktop.png | resetLocale (w:651-656) resets cookies only | check in phase B whether the locale switch persists per user |

## 3. P — product bugs (ranked)

| # | sev | bug | evidence | file:line (tip aee86d08 = walker head, no drift) | proposed fix | oracle |
|---|---|---|---|---|---|---|
| P1 | **High** | Camera scanning cannot work anywhere: every app response sends `Permissions-Policy: camera=()` | console "Permissions policy violation: camera is not allowed in this document" on register#pos-reg-scan-camera · pos-reg-scan-sheet-close · pos-member-scan · stock#pos-stock-scan-camera · pos-stock-*-search-camera, all 3 staff cells (W5) | `src/proxy.ts:54` (applySecurity, WO-0043) vs `ScanCameraDialog.tsx:82` getUserMedia | `camera=(self)` (keep microphone/geolocation off), at least for /app/sys/*/pos/* — proxy is platform code ⇒ controller/owner ruling | new P4.3 row: response header of /app/sys/<id>/pos/register allows camera for self + W5 camera-clean in phase B |
| P2 | Medium-Low | Cashier gets accounting links that open pages throwing ForbiddenError (RSC render error) | cashier W5: "An error occurred in the Server Components render" on sales#pos-bills-accounting-link and settings#pos-settings-account-link (rows "ok" because URL matched) | `BillsClient.tsx:1657` · `ReceiptSettings.tsx:671` → account `guard.ts:15` / `access.ts:57-61` (settings page needs account.settings.manage) | render each link only when the viewer holds the account permission (flag from page.tsx); then registry: cashier → hiddenFor on both rows | new P4.3 static row (link gated by flag) + walker W5 |
| P3 | Medium (known B7) | 1-unit manager cannot save/toggle/archive price rules | walker corroborates only: manager "กด pos-price-rule-add แล้วยังไม่เห็น pos-price-rule-unit-*" (chips hidden); save/active/archive rows were skipped (needs: category / existing rule) ⇒ not counted in §0 | `PriceRulesClient.tsx:493` (chips only if units>1) + `:46` emptyForm unitIds [] → `price-rule.ts:90-94` canWriteUnits uses all linked units ⇒ PERMISSION_DENIED | non-all-unit actor: default unitIds = own linked units (client) or server maps [] to the actor's units | new P4.3 row: manager creates a rule with unitIds [] ⇒ ok, scoped to own unit; phase B fixture "active rule on btn unit + category" |
| P4 | Low | `setPosChatSettings` raw UPDATE does not bump `updatedAt` (the 6 sibling AppSystem writers do) | owner settings#pos-settings-chat-save wE "ไม่พบการเขียนของ AppSystem"; settings/pos-settings-chat-save-owner-desktop.png (sheet closed = saved) | `chat-link.ts:79-86` (compare settings-general.ts:126, credit-settings.ts:50) | add `, "updatedAt" = now()` | walker row (P3.7U) — or R: db "AuditLog pos.settings.updated" |
| – | fixed at tip | old KDS pause path (kitchenPauseAction) on POS-linked units | P5.2 D11 | KdsScreen.tsx:277-291 | – | phase B re-press |

## 4. A — acceptable

| item | rule |
|---|---|
| W1: 14 of 19 cells have no summary | phase A = 5 cells by plan (owner/manager/cashier desktop + public desktop/mobile); phase B covers the rest |
| 0 dead/wE rows | – (every row has an R/H/P cause) |
| needs families that are not cheap: all-units manager persona (62 rows), load-failure retry (22), HR OFF_SCHEDULE (11), posSecretKeyConfigured (6) | CD-P41-F13/F17 personas · owner decision before adding a 4th persona or fault injection |

## 5. Skips (545 / 546 / 387 / 41 / 50)

| cell | needs | external | needs-persona | idle-expected | dead-known | needs-fixture | disabled-expected | no-role-claim | static | hidden-input | file-upload |
|---|---|---|---|---|---|---|---|---|---|---|---|
| owner 545 | 471 | 28 | 19 | 12 | 7 | 5 | – | – | – | 2 | 1 |
| manager 546 | 473 | 28 | 19 | 11 | 7 | 5 | – | – | 2 | – | 1 |
| cashier 387 | 301 | 23 | 6 | 7 | 7 | 3 | 17 | 20 | 2 | – | 1 |
| public-desktop 41 | 18 | 2 | – | 1 | – | 20 | – | – | – | – | – |
| public-mobile 50 | 23 | 2 | – | 1 | – | 24 | – | – | – | – | – |

`needs` by page (all 5 cells): register 389 · tables 294 · settings 137 · sales 108 · orders 93 · products 58 · shifts 54 · kds 42 · stock 36 · /r 29 · reports 21 · price-rules 13 · /q 12. After H4 about 33 more rows land in `needs`.

**Top-10 cheap `needs` fixtures for phase B** (rows unlocked = owner+manager+cashier desktop in phase A; other cells scale the same; all on posqc-btn-unit / QC tenant, restored after the cell):
1. **Tables**: 2 RestaurantTable ACTIVE + registerTableMode visible + 1 TableSession OPEN with 1 sent unpaid item qty 2 + 1 BOOKED reservation today — ≈317 (114/114/89) + R1 main path.
2. **Deposit**: settings.pos.deposit.enabled + 1 OPEN POS_DEPOSIT with fixed customer/receipt no — ≈99.
3. **Orders**: CUSTOM channel enabled + 1 order each ACCEPTED / PREPARING / READY(paid) — ≈89.
4. **Offline**: settings.pos.offline.enabled + page.setOfflineMode for offline rows + 1 queued and 1 REJECTED offline bill — ≈85 (needs a small walker change).
5. **Catalog**: 1 product with option group + variant + recipe — ≈58.
6. **KDS**: KdsStation pre-seeded (instead of tail row 822) + 1 sent ticket — ≈42.
7. **Member**: member with points + store credit SC + 1 active coupon — ≈48.
8. **Tax invoice**: latest bill REQUESTED + 1 public bill AVAILABLE — ≈37.
9. **Shift states**: 1 FORCE_CLOSED shift without recount + a device without an open shift — ≈31.
10. **Gift card** enabled + 1 active card — ≈27.
Small and cheap too: 2nd InvLocation (18) · stock count OPEN (16) · PromptPay ID + slip UPLOADED by another user (22) · ApprovalPolicy POS_DISCOUNT_OVER (4 + H14) · tip enabled (6) · >10 bills today (6) · active price rule on btn + 1 category (P3/B7 + price-rule save rows).

## 6. Notes
- After R1–R10 + H1–H14 every one of the 128 rows should end ok or skip(needs) in phase B; P1/P2 stay red in W5 until fixed; P3 needs its fixture to show red.
- owner `pos-shift-close-submit` ok (money) is the cause of H8, not a wrong ok. Owner AppSystem-verified money rows are weakly verified (H16). No `ok` money row writes outside posqc-btn-unit (W7 green).
- 207 archived price rules have piled up on the QC tenant from earlier runs (screenshot price-rules) — harmless; consider cleanup.

## 7. Exact fix text (builder applies as-is)

### Registry (`scripts/pos-ui-inventory.json`, rows by page#testid)
- **R1** `/app/sys/[id]/pos/register#pos-reg-bill-type` → in `expect` add `"anyOf": [{"type": "toast", "target": "pos-reg-toast"}]`.
- **R2** `…/register#pos-lock-submit` → in `expect` add `"anyOf": [{"type": "inline-error", "target": "pos-lock-message"}]`.
- **R3** `…/register#pos-reg-held-discard-*` → `"opener": ["pos-reg-cart-bar-held", "pos-reg-held-bills", "pos-reg-held-discard-*=click"]`.
- **R4** `…/stock#pos-stock-qty-*` → `"opener": ["pos-stock-tab-count", "pos-stock-qty-*=click"]`.
- **R5** `…/sales#pos-bills-date-next` → `"opener": ["pos-bills-date=2026-10-01"]`.
- **R6** `…/sales#pos-bills-page-*` → `"expect": {"type": "ui", "target": "pos-bills-page-*", "state": "selected", "note": "ปุ่มเลขหน้า · หน้าปัจจุบัน aria-current=page (BillsClient.tsx:1412)"}` (needs unchanged).
- **R7** `…/settings#pos-device-card-*` → `"expect": {"type": "ui", "target": "pos-device-card-*", "state": "selected", "note": "การ์ดเครื่อง aria-pressed (DeviceSettings.tsx:342) · เครื่องเดียว = เลือกอยู่แล้ว"}`.
- **R8** `…/settings#pos-settings-api-create-submit` → `"opener": ["pos-settings-nav-shark", "pos-settings-api-*create", "pos-settings-api-name=QC key", "pos-settings-api-unit-*=on?"]` and in `expect` add `"resultTarget": "pos-settings-api-raw"`.
- **R9** `…/settings#pos-channel-creds-webhook-copy` → `"opener": ["pos-settings-nav-channels", "pos-channel-open-lineman"]`, `"needs": "ช่องทาง LINE MAN สร้างแล้ว (ปุ่ม preset connect ChannelsPanel.tsx:240 มีเฉพาะตอนยังไม่สร้าง — สร้างโดยแถว pos-channel-creds-webhook ช่วงท้าย/fixture)"`.
- **R10** `…/shifts#pos-print-drawer-open` → `"oracle": "P1.10-E2"`; `…/tables#pos-tbl-qr-sheet-print` → `"oracle": "<new P4.3 id>"` once the builder adds a static check "pos-tbl-qr-sheet-print only calls window.print (no fetch/action)".
- After P2 is fixed: `…/sales#pos-bills-accounting-link` and `…/settings#pos-settings-account-link` → roles `["owner","manager"]`, hiddenFor `["cashier"]`.

### Walker (`scripts/qc-pos-buttons.mts`, line numbers @89631a81)
- **H1** w:562-563 → `await page.keyboard.type(differ(fillValueFor(testid, eff), meta.value), { delay: 45 }); // > SCAN_MAX_GAP_MS 30 (scan-shared.ts:8) — RegisterScreen.tsx:2577-2629` · `await sleep(60);` · `await page.keyboard.press(ENTER_SUBMIT.has(testid) ? "Enter" : "Tab");` (with H7 `const ENTER_SUBMIT = new Set(["pos-stock-scan"]);`).
- **H7** fillValueFor (w:482) first line → `if (t === "pos-stock-scan") return "PQC-CF-LATTE";`.
- **H5** fillValueFor: move w:502 (`search|query|-q$|find` → "ลาเต้") above w:501 (money words). w:1390 → `else if (isField && ex.type !== "mutation" && !isSearchLike(it.row.testid, tag.split(":")[1] ?? "")) {`.
- **H4** after the F13 block (w:1098-1101) insert: `if (await isDisabled(el)) { if (it.needs) rec(it, { class: "skip", reason: "needs", detail: "คอนโทรล disabled ก่อนกด (needs)" }); else rec(it, { class: "dead", detail: "disabled ก่อนกด (ไม่มี needs)", shot: await failShot(page, it) }); continue; }`.
- **H2** at the press (`} else await clickEl(page, el);` in the act block ~w:1163) → `} else if (/-(scrim|backdrop|overlay)$/.test(it.row.testid)) await el.click({ offset: { x: 4, y: 4 } }); else await clickEl(page, el);`.
- **H3** right after `if (it.moneyUnit) PRESSED_ONCE.add(it.key);` start a watcher: `const watchT = [...new Set([ex.resultTarget, ex.target, ...alts.filter((a) => ["modal", "toast", "inline-error"].includes(a.type)).map((a) => a.target)].filter((x): x is string => !!x && looksLikeTestid(x)))]; const seen = new Set<string>(); let watching = true; const watcher = (async () => { while (watching) { for (const x of watchT) if (!seen.has(x) && (await findVisible(page, x, [], 0))) seen.add(x); await sleep(150); } })();` · at w:1261 use `const hit = visTids.find((x) => seen.has(x)) ?? (await anyVisible(visTids, 6000));` · at w:1320 use `if (ok && !deferred && rt && !seen.has(rt) && !(await findVisible(page, rt, [], 6000)))` · stop with `watching = false; await watcher;` before `rec(...)` of the row.
- **H9** alertsNow (w:579) filter → add `&& !e.closest('[data-testid="pos-settings-api-raw"]')`.
- **H10** prefill(), after the isSearchLike skip → `if (s.row.testid === "pos-ord-man-conv" || s.row.testid === "pos-ord-man-party") continue; // ลิงก์ลูกค้าไม่บังคับ — assertCustomerLinks order.ts:721-731`.
- **H12** absent/press lookup: when `["input","textarea","select"].includes(it.row.kind)` accept only `INPUT|TEXTAREA|SELECT` elements in findVisible for that row (ProductsClient.tsx:184 span vs ProductPanel.tsx:356 input).
- **H13** clickEl: if `pressInfo(el).what` ends with "มีคอนโทรลข้างใน", click `el.$('a[href]:not([aria-current="page"]), button:not([disabled])')` instead of the centre.
- **H15** console collector: ignore `Failed to load resource` when `msg.location()?.url` host ends with `.example.com`.
- **H16** (optional) db `AppSystem(POS).settings.pos.<k>`: compare `settings.pos.<k>` with the `_qcP42Before` snapshot instead of updatedAt.

### Fixtures (`scripts/pos-buttons-fixtures.mts`)
- **H6** fx:926 → `if (user !== "public") for (const k of ["manager", "cashier"] as const) await ensurePersona(c, k);`.
- **H8** SIDE_EFFECT_KEYS (fx:351) add `` [`${STAFF}shifts#pos-shift-close-submit`]: "ปิดกะของเครื่องตัวกด → เปิดกะคืน (ensureDeviceShift)" `` and make resetSideEffects call ensureDeviceShift for it.
- **H11** SIDE_EFFECT_KEYS add `` [`${STAFF}kds#pos-kds-pause`]: "พักครัวค้าง → kitchenPaused=false ของ posqc-btn-unit" `` + reset in resetSideEffects.
- **H14** ensureFixtures: ApprovalPolicy POS_DISCOUNT_OVER for the QC tenant (removed in cleanupFixtures).

## 8. Final report (≤ 30 lines)
1. 128 failing rows (owner 42 · manager 55 · cashier 31; public 0). Class per cell: owner R8 H33 P1 · manager R8 H47 · cashier R5 H26 · A 0 rows (A = W1, 14 cells not run by plan).
2. Two walker issues explain 66 rows: H1 fast typing is read as a barcode scan on /register (33) and H4 disabled controls are pressed and look alive through background requests (33). H3 (20 rows) checks toasts/PayDone after an 8 s settle; the writes did happen.
3. P list (ranked):
   - P1 **High**: `src/proxy.ts:54` sends `Permissions-Policy camera=()` on every page, so camera scan (register/member/stock) is blocked in real browsers. Fix: `camera=(self)`, owner/controller ruling (platform file).
   - P2 Med-Low: cashier sees accounting links (`BillsClient.tsx:1657`, `ReceiptSettings.tsx:671`) that open ForbiddenError RSC error pages.
   - P3 Medium (B7): `PriceRulesClient.tsx:493/:46` → `price-rule.ts:90-94`. Walker only corroborates it (the manager's unit chips are absent; save was not pressed); needs the phase-B rule/category fixture.
   - P4 Low: `chat-link.ts:79-86` does not bump AppSystem.updatedAt (siblings do).
4. R fixes before phase B: R1 bill-type anyOf toast · R2 lock-submit anyOf inline-error · R3 held-discard opener +`=click` · R4 stock-qty opener +`=click` · R5 date-next opener `pos-bills-date=2026-10-01` · R6 bills-page / R7 device-card `state: selected` · R8 api-create `pos-settings-api-unit-*=on?` + resultTarget · R9 webhook-copy opener drops connect · R10 oracle P1.10-E2 + a new QR-print id (exact JSON in §7).
5. H fixes before phase B: H1 type delay 45 ms + 60 ms before Tab · H4 disabled gate before press · H3 early result watcher · H5 dirty after search rows + search before money words · H2 scrim corner click · H6 both personas per cell · H7 stock scan Enter + SKU · H8/H11 shift-close and kds-pause as tail rows with restore · H9 ignore the raw-key alert · H10 PREFILL skips conv/party · H12 kind filter · H13 container tabs · H14 ApprovalPolicy fixture · H15 example.com console noise (exact text in §7).
6. Top fixtures for phase B: tables (≈317 rows) · deposit (≈99) · orders (≈89) · offline (≈85) · options/recipe product (≈58) · KDS station (≈42) · member/coupon (≈48) · tax-invoice request (≈37) · shift states (≈31) · gift card (≈27).
