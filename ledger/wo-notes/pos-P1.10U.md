# POS P1.10 U — builder notes (17A receipt & tax · 17B devices & printers · print module · PayDone print)

Builder · VPS tree `/root/projects/shark-pos-c` (own node_modules) · branch `wip/pos-p1.10u` from `origin/session/pos` 611f54c7 · 8 Oct 2026.
Contract: `ledger/pos-briefs/pos-brief-P1.10U.md` §1–§7 (CD1–CD5) · server frozen except the one additive composed read `receiptSettingsPageDataAction`. No schema / migration / `.env` / build / server.

## Steps (commit + push of `wip/pos-p1.10u` after each · typecheck exit 0 before every push)
1. 883376a3 — `/pos/settings` shell: `src/components/pos/settings/SettingsShell.tsx` + registry `settings-tabs.ts` (`POS_SETTINGS_TABS`, `posSettingsTabOf`, `posSettingsHref`) · page `src/app/app/sys/[id]/pos/settings/page.tsx` · tab "ตั้งค่า" last in `posTabs` + `childrenFor("POS")` · messages.
2. 3ebda612 — 17A `ReceiptSettings.tsx` + `receiptSettingsPageDataAction` (`receipt-settings-actions.ts`) + `src/components/pos/print/sample-payload.ts` (pure) + live preview iframe.
3. 8ea8e227 — 17B `DeviceSettings.tsx` + `print/pairing.ts` (localStorage per deviceCode).
4. 397cb135 — print module `src/components/pos/print/` + `scripts/qc-pos-p1.10u-print.mts`.
5. c864a48d — PayDone print buttons + autoPrint · revoked banner · status-bar device/printer chip · register mode tab "ตั้งค่า" → `/pos/settings` · bills reprint via `printReceipt` · shifts "เปิดลิ้นชัก".
6. 56e80a44 — `visual-pos.mts` settings page + `--states` · `pos-qc-env.mts` `POS_PAGES` + `"settings"`.

## Screens built
- `/app/sys/[id]/pos/settings?tab=receipt|devices&unit=` — left menu from the registry (2 live tabs; 6 muted "รอบถัดไป" spans, no link). Unit select when > 1 unit. Read: `pos.sale.create` or `pos.device.manage` at the unit (neither = refusal card, HTTP 200). Receipt edit: `pos.device.manage` (service enforces F9 all-units rule; refusal shown via key). Devices tab: `pos.device.manage` at the unit, else refusal card.
- 17A: header (logo https URL + preview · name · phone · address with "ใช้จากระบบบัญชี: …" placeholders) · footer (text · showPoints · qrEReceipt disabled + P1.11 hint · showCashier) · numbers (per-device posRegNo inline edit via `updateDeviceAction` · real number formats read-only · monthly reset read-only check · e-Tax chip "รอผู้ให้บริการ") · live preview `renderReceiptHtml(samplePayload, {paper:"80", locale})` in `iframe srcdoc` (height fitted on load) · tax card (VAT / tax id · branch / POS ABB switch / link to `/app/sys/<accountSystemId>/account/settings` or "ยังไม่ผูกระบบบัญชี") · buttons "พิมพ์ตัวอย่าง" (copy:true, receiptNo "ตัวอย่าง", this device's config via heartbeat) and "บันทึก".
- 17B: register-this-device (dialog with name; disabled when this code exists; limit → inline note) · device cards (name · posRegNo · "เครื่อง …code" · "เครื่องนี้" · online/last seen · open shift · printer chip (mode + paper, ✓ when paired here) · drawer chip; REVOKED muted + chip) · right panel (name · posRegNo · paper 58/80 · mode Bluetooth/USB/เบราว์เซอร์ · pairing line + "เลือกเครื่องพิมพ์" (this browser's device only) · Thai text raster/tis620 · autoPrint · drawerKick · copies 1↔2 · test print · revoke + confirm dialog) · bottom strip text. Every config change sends the FULL `printerConfig`.
- Print module (`src/components/pos/print/`): `printReceipt(payload, cfg, {copy?, locale, deviceCode?})` never throws → `{ok, via}` | `{ok:false, code: NO_DEVICE|PERMISSION|UNSUPPORTED|WRITE_FAILED, message(th), via}` · `usb.ts` (requestDevice filter = printer class 7 + common receipt-printer vendors; silent reconnect via `getDevices()` + stored vendor/product/serial; claims the interface with a bulk OUT endpoint; `transferOut` ≤ 16 KB) · `bluetooth.ts` (services `000018f0-…`, `49535343-fe7d-…`, `ffe0`, `ff00`; ≤ 20-byte writes, `writeValueWithoutResponse` when available) · `browser.ts` (hidden iframe + `print()`) · `escpos.ts` (`encodeEscPos` + raster splice; `DRAWER_PULSE` = `ESC p 0 25 250`) · `raster.ts` (pure: `slotWidthDots`, `packMono`, `gsv0`, `spliceRaster` last-slot-first) · `canvas-raster.ts` (Sarabun/system Thai font, 24 px / 48 px big, width = cols × 12 dots) · `chunk.ts` · `pairing.ts` · `device-printer.ts` (heartbeat → config, defaults when unregistered) · `PrinterPairDialog.tsx` · `PrintStatus.tsx`.
- PayDone (02b): "พิมพ์ใบเสร็จ" (`receiptPayloadAction`; UI renders whatever `payload.copy` says — 30-min rule) · "พิมพ์สำเนา" (`reprintReceiptAction`) · autoPrint once per `saleId` (module-level set) when `autoPrint` and a USB/BT printer is paired here · refusal → inline `PrintStatus` (พิมพ์ซ้ำ / พิมพ์ผ่านระบบแทน) and the 5-s auto-next pauses.
- Register: heartbeat on every status refresh → `device` (name + printerConfig) · `registerStatus.deviceStatus === "REVOKED"` → persistent red banner `pos-reg-device-revoked` + pay locked · status bar (≥1280): device chip (name, or link "ยังไม่ลงทะเบียนเครื่อง" → `/pos/settings?tab=devices`) + printer state (browser N mm / USB-BT ready / not connected). DEVICE_REVOKED refusals from submit/hold/recall/openShift already map to `errors.deviceRevoked` ("… — ติดต่อผู้จัดการ").
- Bills page (CD4): reprint → `thisDevicePrinter` + `printReceipt`; UNSUPPORTED/NO_DEVICE on USB/BT falls back to browser printing automatically (keeps P1.16 behaviour); other refusals → `pos.print.errors.*` in the drawer.
- Shifts page: "เปิดลิ้นชัก" in the "เครื่องนี้" card only when this device's `drawerKick` is on and a USB/BT printer is paired here → `kickDrawer` (pulse alone). Not audited (hardware action · CD4).

## Server change (the one allowed)
`receiptSettingsPageDataAction({systemId, unitId?})` in `receipt-settings-actions.ts` — read permission identical to `posReceiptSettingsAction`; composes `posReceiptSettings` + `account.posAccountSystemId` → `accountSettings` (orgName, taxId, branchCode, address, phone, logoUrl) + `account.vatConfigOf` (same reads as `receipt.ts`) + `listDevices` for `unitId` (only when the caller can access the unit and has `pos.device.manage`; otherwise `[]`). Returns `{ok, settings, book|null, devices}`; `book` additionally carries `accountSystemId` and `logoUrl` (for the link / placeholder). Type is inline (a "use server" file exports only async functions); the client derives it with `Awaited<ReturnType<…>>`.

## Keys (th + en, `src/messages/{th,en}/pos.json`)
`pos.settings.*` (desc, menuTitle, unit, soon, readOnly, refusal, devicesRefusal, save/saving/saved, loading, loadFailed, retry, tabs.*, errors.*, receipt.* incl. fieldErrors.* and sample.*) · `pos.device.*` (added: tabTitle … nameRequired, errors.*) · `pos.print.*` (receipt, copy, printing, sent, retry, useBrowser, errors.{NO_DEVICE,PERMISSION,UNSUPPORTED,WRITE_FAILED}, pair.*, drawer.*, test.*) · `pos.register.status.{device, deviceNone, deviceRevoked, printerBrowser}`. F15.4 green.

## Testids + inventory
`pos-settings-*` (module-tabs, nav-*, unit, retry, print-sample, save, logo-url, name, phone, address, footer, show-points, qr-ereceipt, show-cashier, device-regno-*, account-link) · `pos-device-*` (retry, register(+name/cancel/confirm), card-*, name, regno, paper-58/80, mode-bt/usb/browser, thai-text, auto-print, drawer-kick, copies, test-print, revoke(+cancel/confirm), pair) · `pos-print-*` (pair-find/unpair/close, retry, browser, receipt, copy, drawer-open) · `pos-reg-status-device-link`. 47 rows added to `scripts/pos-ui-inventory.json`; F15.3a/b green (no new untestid debt).

## Deviations from 17A / 17B / 02 (ruling for each)
| # | mockup | built | ruling |
|---|---|---|---|
| 1 | 17A logo "เปลี่ยนรูป" upload | https URL field + preview | brief §2 (upload = P1.18/media) |
| 2 | menu footer "ตั้งค่าเป็นรายสาขา — สาขาหัวหิน …" | omitted | brief §1 — settings are per POS system; no per-unit override exists |
| 3 | 17A/17B register-style mode bar (หน้าขาย · โต๊ะ · … · ตั้งค่า) on top | app `ModuleTabs` (posTabs) like every POS back-office page | consistency with P1.9U/P1.14U/P1.16/P1.17U pages; register's own mode tab "ตั้งค่า" now links here |
| 4 | QR ใบเสร็จออนไลน์ toggle live | rendered disabled (stored value) + "P1.11" hint; preview prints no QR | brief §2 (`qrEReceiptUrl` is null until P1.11) |
| 5 | numbering `R{YY}{MM}-{000000}` editable / `CN{YY}{MM}-{000000}` + reset checkbox | read-only real formats `{YYYY}{MM}-{NNNN}` (service.ts) and `CN{YYYY}{MM}-{NNNN}` (refund.ts) + read-only checked "รีเซ็ตเลขรันรายเดือน" + live example `<BKK YYYYMM>-0001` | brief §2 — show what the server formats |
| 6 | e-Tax "สมัคร" button | chip "รอผู้ให้บริการ" only | brief §2 |
| 7 | tax card 2 rows | + row "ใบกำกับภาษีอย่างย่อจากหน้าขาย เปิด/ปิด" (VAT books) | extra read-only fact from `vatConfigOf`; explains why the preview is ABB or receipt |
| 8 | preview right column at all widths | side-by-side ≥ 1280; stacked below the cards at 1024 / 390 | room; no overflow |
| 9 | 17B `transport` field (brief wording) | `printerConfig.mode` = `escpos-bt` / `escpos-usb` / `browser` | CD5 — follow the parser |
| 10 | platform line "แท็บเล็ต Android" | "เครื่อง …<code tail>" (+ "เครื่องนี้") | brief §3 — server stores no platform |
| 11 | shift line "กะ #12 · น้ำฝน · เปิด 09:02" | "กะ #N · เปิด HH:MM" | brief §3 — no opener name in the contract |
| 12 | chips จอลูกค้า · ใบครัวพิมพ์ที่ row · battery "แบตเครื่อง 100%" · "ไม่มีเครื่องพิมพ์" | omitted; printer chip shows the mode (browser printing is the parser default, there is no "none") | brief §3 / CD5 |
| 13 | panel shows only POS001 chip | + editable ชื่อเครื่อง / เลขเครื่อง POS fields | brief §3 |
| 14 | — | + "ภาษาไทยบนเครื่องพิมพ์" raster/TIS-620 select (USB/BT only) | CD3 (tis620 opt-in per device; key exists in the parser) |
| 15 | bottom strip "… แล้วสแกน QR ของร้าน" | text "… แล้วกดลงทะเบียน", no QR | brief §3 (QR = P1.18) |
| 16 | 02b "พิมพ์ซ้ำ · ส่งทาง LINE · แสดง QR ใบเสร็จ" | "พิมพ์ใบเสร็จ" + "พิมพ์สำเนา"; LINE / QR omitted | brief §5; LINE/QR = P1.11 |
| 17 | autoPrint refusal "toast with พิมพ์ซ้ำ" | inline refusal box inside PayDone with พิมพ์ซ้ำ / พิมพ์ผ่านระบบแทน; countdown pauses | the success dialog auto-closes after 5 s — a toast would vanish with it; same content |
| 18 | receipt preview of 11B | our renderer's HTML (P1.10 accepted) at 80 mm | renderer is frozen |

## Browser support matrix
| browser | USB (WebUSB) | Bluetooth (Web Bluetooth) | browser print |
|---|---|---|---|
| Chrome / Edge desktop (Windows · macOS · Linux · ChromeOS) | ✓ (Windows: a printer already bound to an OS driver may refuse `claimInterface` → WRITE_FAILED → use browser printing or a WinUSB driver; Linux may need a udev rule) | ✓ | ✓ |
| Chrome Android | ✓ (USB-OTG) | ✓ | ✓ |
| iOS / iPadOS Safari (and every iOS browser) | ✗ → UNSUPPORTED → "เบราว์เซอร์นี้พิมพ์ตรงไม่ได้ ใช้พิมพ์ผ่านระบบแทน" | ✗ → same | ✓ only path |
| Firefox · Safari macOS | ✗ | ✗ | ✓ |
Bluetooth reconnect after reload works only where `navigator.bluetooth.getDevices()` is enabled; otherwise the paired object lives for the tab session and a reload needs "เลือกเครื่องพิมพ์" again (NO_DEVICE until then). Browser printing prints one copy (copies = 2 is ESC/POS only) and cannot open the drawer.

## Follow-ups / open questions
- (FU-c) `canEditReceipt` on the page is tenant-level (`pos.device.manage` without unit) while the service enforces F9 (manage on every linked unit) — a MANAGER missing one unit sees an enabled Save and gets `errors.permissionDenied`. Align the page check with `canManageAllLinkedUnits` when P1.18 touches settings permissions.
- (FU-c) Bluetooth raster speed (20-byte writes) — measure on real hardware before tuning.
- (FU-c) Visual seed registers 2 devices against the default limit of 3 ACTIVE per unit — a QC unit that already holds 2+ ACTIVE non-QC devices makes `seedSettingsOnce` fail with DEVICE_LIMIT (all settings-* states then fail with that reason).
- (FU-c) P1.10 F7 "ส่วนลดท้ายบิล" label (points/voucher/gift-card under one line) stays a controller follow-up.
- USB vendor list in the picker filter is heuristic; extend when real printers are tested. Real-hardware print tests (USB/BT, raster quality, TIS-620 code page per brand) are not possible here — CONTROLLER/owner test.
- Bluetooth MTU: fixed 20-byte writes (the web cannot read the negotiated MTU) — a long raster receipt takes a few seconds.
- Receipt-settings "พิมพ์ตัวอย่าง" uses this browser's device config; unregistered = browser 80 mm.
- Bills page with ESC/POS config but no pairing silently falls back to browser printing (kept P1.16 UX) — say so in the toast if the owner prefers.
- Visual run (`--page settings --states` with a server) = CONTROLLER-RUN: it registers 2 QC devices (`posqc-vis-dev-<pid>-{1,2}`), opens one shift on device 2 (service `openShift`), sells one cash bill (paydone-print, 1440 only) and in `finally`/signal closes that shift (count = expected) and revokes both devices (stale ACTIVE QC devices > 1 h are revoked at start — default limit is 3 ACTIVE per unit). settings-print-pair hides `navigator.usb` before page scripts so the dialog shows its "ไม่รองรับ" state.

## Gates (head 56e80a44 · before fix round 1)
All QC runs: `iso → (QC_FORCE=1) → qc4.sh (.env.qc4 = ep-frosty-lab, QC4) → with-gate-lock`. The QC4 gate lock was held by other lanes for long stretches: p1.3 / p1.9 hit the 1800-s lock wait twice (exit 1, empty log = never started) before running green on a later attempt.
| command | result |
|---|---|
| typecheck (iso · flock /tmp/pos-gate.lock) | exit 0 (before every push, steps 1–6) |
| `qc-pos-p1.10` QC_FORCE=1 run 1 | exit 0 · 40/40 |
| `qc-pos-p1.10` QC_FORCE=1 run 2 | exit 0 · 40/40 |
| `qc-pos-p1.10` unforced | exit 0 · 40/40 (not skipped) |
| `qc-pos-p1.10u-print` (no DB) | exit 0 · 7/7 (mutation: forward splice ⇒ exit 1) |
| `qc-pos-p1.16` QC_FORCE=1 | exit 0 · 28/28 |
| `qc-pos-p1.3` QC_FORCE=1 | exit 0 · 128/128 (also 128/128 at c864a48d) |
| `qc-pos-p1.9` QC_FORCE=1 | exit 0 · 53/53 |
| `qc-hf-pos-page-authz` | exit 0 · 56/56 |
| `qc-nav-functions` | exit 0 · 11 checks |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | exit 0 · 41/41 |
| `bash scripts/qc4.sh pnpm fitness` | exit 0 · 41/41 |
| `scripts/fitness-pos.mts` | exit 0 · 8/8 |
| visual `p1.10u --page settings --states --dry` owner / cashier | rc 0 / rc 0 (13 shots each) |
| visual `p1.10u --page register --states --dry` owner / cashier | rc 0 / rc 0 (37 shots each) |
Not run: `next build`, real visual run (needs a POS QC server) — CONTROLLER-RUN.

## Fix round 1 (reviewer MERGEABLE-AFTER-FIXES on 56e80a44 · controller rulings F1–F7, FU-a/b/c)
- F1 drawer: `printReceipt` takes `opts.kickDrawer` (default false); `escpos.ts drawerKickFor(payload, cfg, kick)` = kick && `cfg.drawerKick` && `!payload.copy`. PayDone passes true only for the first original print of the sale (auto or manual, payload not upgraded to copy by the 30-min rule); "พิมพ์สำเนา", "พิมพ์ซ้ำ", bills reprint, settings "พิมพ์ตัวอย่าง"/"ทดสอบพิมพ์" pass false. QC U8: copy + drawerKick + kick ⇒ no `1B 70`; original + kick ⇒ present; default ⇒ absent (mutation dropping the copy guard ⇒ U8 red, exit 1).
- F2: module-level `printedOriginal` set (client) — after a successful original print the PayDone button reads "พิมพ์ซ้ำ" (`pos.print.reprint`) and goes through `reprintReceiptAction` (copy + audit); retry after an original success also reprints.
- F3: this file (steps, gates, deviations, matrix, follow-ups).
- F4: U1 pins raster/80 = 689 B · 25 slots · fnv 451d547a and tis620/58 = 1017 B · fnv fe27237c.
- F5: `receiptSettingsPageDataAction` returns `refundPrefix` (raw `settings.pos.receipt.refundPrefix`, same regex/default as `refund.ts refundPrefixOf` → `REFUND_PREFIX_DEFAULT` "CN"); 17A shows `<prefix>{YYYY}{MM}-{NNNN}`. (Still inside the one allowed composed read.)
- F6: status bar — REVOKED device (heartbeat row or `registerStatus.deviceStatus`) ⇒ red chip "เครื่องนี้ถูกเพิกถอน" (`pos-reg-status-device`, `data-state="revoked"`), not the register link. Key `pos.register.status.deviceRevokedChip`.
- F7: BillsClient change kept (P1.16 is in the base); printer config re-read (`thisDevicePrinter`) on every reprint instead of a page-lifetime cache. Shifts "เปิดลิ้นชัก" also re-reads the config before sending.
- FU-a: preview iframe `sandbox="allow-same-origin"` (no scripts; parent still measures height); hidden print iframe `sandbox="allow-same-origin allow-modals"` (parent calls `print()`; dialog allowed).
- FU-b: `CanvasUnavailableError` (no canvas) ⇒ UNSUPPORTED; any other byte-build/splice failure ⇒ WRITE_FAILED — matches the `raster.ts` comment.
- FU-c: follow-ups above.

### Gates (fix round 1)
| command | result |
|---|---|
| typecheck (iso · flock /tmp/pos-gate.lock) | exit 0 |
| `qc-pos-p1.10u-print` | exit 0 · 8/8 (U1 pinned · U8 new; mutation: copy guard removed ⇒ U8 red, exit 1) |
| `qc-pos-p1.10` QC_FORCE=1 | exit 0 · 40/40 (first two attempts exit 1 = 1800-s QC4 gate-lock wait, never started) |
| `scripts/fitness-pos.mts` | exit 0 · 8/8 (pre-commit `pnpm fitness` green) |
| visual `p1.10u --page settings --states --dry` owner / cashier | rc 0 / rc 0 (13 shots) |
| visual `p1.10u --page register --states --dry` owner / cashier | rc 0 / rc 0 (37 shots) |
Not re-run in this round: p1.3 / p1.9 / p1.16 / authz / nav (controller runs them on the merge tree). Real visual run + `next build` = CONTROLLER-RUN.
