# POS P4.3 fix8 (CD-P43-15) — settings › devices two-column layout at iPad width · logo preview only for well-formed https

Branch `wip/pos-p4.3-fix8` from `f6da735d` (session/pos tip ≥ 61f271a7) · tree `/root/projects/shark-pos-b` · builder S · no build/serve.

## 1. Cause (read from source, matches the walker screenshot)
- Screenshot `walker-B-20261025T030640Z` cell owner-ipad 1024×768 (copy: `/root/pos-runs/p43-fix8/pos-device-lan-printer-name-x-owner-ipad.png`): the settings card spans x = 312…1000 with the settings menu divider at x = 552, i.e. the brief's "sidebar ~285 / content ~700" missed the **second** sidebar — the settings shell's own menu (`SettingsShell.tsx` aside `lg:w-[240px]`).
- `DeviceSettings.tsx` row was `flex-col lg:flex-row` with `pos-device-panel` `lg:w-[400px] lg:shrink-0 xl:w-[430px]`. At 1024 the tab pane has only **398 px** of content width, so panel 400 + gap 32 = 432 > 398 ⇒ the `flex-1 min-w-0` left column shrinks to 0 and the LAN card is only as wide as its own padding (card px-7 28+28 + border 2 = 58 px ≈ the "~60 px column" in the shot). The panel overflows into the hidden `overflow-hidden` of the settings root.
- `LanAgentsCard.tsx` fieldset used `sm:grid-cols-2` (viewport-based) ⇒ even in a narrow column the printer inputs were split in half.
- The same fixed-panel pattern in `ReceiptSettings.tsx` (`xl:flex-row` + preview `xl:w-[380px]`) is fine at 1024 (stacks) but at 1280 with the menu open gives the left column 226 px (form `md:grid-cols-2` ⇒ ~73 px inputs).
- Logo: the `<img>` beside the field was already guarded by `startsWith("https://")`, but the **live receipt preview** (`samplePayload` → `renderReceiptHtml` → `<img class="logo">` inside the `srcdoc` iframe, receipt-render.ts:359) got `form.logoUrl.trim()` on every keystroke ⇒ "h", "ht", "htt"… resolve as relative paths under the app page ⇒ 404s in the owner-desktop console.

## 2. Breakpoint math (real numbers from the source)
Constants: `AppMain` ≥ lg: left pad `calc(18rem+1.5rem)` = **312** (menu open) or `calc(3.5rem+1.5rem)` = 80 (rail) · right pad `sm:px-6` = 24 · page wrapper `max-w-7xl` = 1280 · `SettingsShell` root border 2 · settings menu `md:w-[200px] lg:w-[240px]` · tab pane padding `md:px-6` 24×2, `xl:px-8` 32×2.
C = content width = min(1280, W − 312 − 24) · P = tab pane content width = C − 2 − 240 − 2×pad.

| viewport (menu open) | C | P (pane) | devices before (lg/xl row, panel 400/430, gap 32) | devices after (row only when P ≥ 882) | receipt before (xl row, panel 380) | receipt after (row only when P ≥ 832) |
|---|---|---|---|---|---|---|
| 1024×768 | 688 | 398 | row · left 398−432 = **−34 → 0** (LAN card 58 px) | stacked · left 398 · panel 398 below | stacked · 398 | stacked · 398 |
| 1280×800 | 944 | 638 | row · left 638−462 = **176** | stacked · 638 | row · left 638−412 = **226** | stacked · 638 |
| 1440×900 | 1104 | 798 | row · left 798−462 = **336** | stacked · 798 | row · left 798−412 = **386** | stacked · 798 |
| ≥ 1524 / ≥ 1474 | ≥ 1188 / ≥ 1138 | ≥ 882 / ≥ 832 | — | row · left ≥ 420 · panel 430 | — | row · left ≥ 420 · preview 380 |

Rail (menu collapsed, left pad 80): 1024 → P 630 (before: devices left 198) → after stacked · 1280 → P 870 → devices stacked (870 < 882; before 408) · receipt row left 458 · 1440 → C capped 1280 → P 974 → devices row left 512 · receipt row left 562 (same as before).

LAN fieldset (form = `@container`, two columns at form content ≥ 360 px ⇒ each input ≥ ~163 px): form content = left − 56 (card px-7) − 2 − 32 (form px-4) − 2. 1024 stacked: 398 → 306 ⇒ **1 column** (inputs 280 px) · 1280 stacked: 638 → 546 ⇒ 2 columns · 1440 stacked: 798 → 706 ⇒ 2 columns · two-column row at P = 882 (left 420) → 328 ⇒ 1 column · P = 974 (left 512) → 420 ⇒ 2 columns. Below md (390 phone) form ≈ 248 ⇒ 1 column, so the "md" condition of the brief holds by construction.

Why container queries instead of `xl:`: the brief's `xl` proposal still leaves the left column at 176 px (1280) / 336 px (1440) because of the settings menu; a viewport breakpoint that satisfies "left ≥ ~420" with the menu open would be ~1524, and it would be wrong with the menu collapsed. The pane is the thing that is narrow, so the pane decides. Precedent in POS: `shifts-ui.tsx` CARD `@container`, `OrderCardView.tsx`, `StockShortcuts.tsx` (`@min-[608px]:`).

Checks done without build/serve:
- Tailwind v4 `compile().build()` of the new candidates generates `.\@container { container-type: inline-size }` and `@container (width >= 882px|832px|360px)` rules.
- Headless Chromium 156 static page (compiled CSS, panes 398/638/798/882/974 px): row direction column/column/column/row/row; LAN grid `repeat(1…)` at 398 and `repeat(2…)` at 638+.
- Headless Chromium 156: an element with `container-type: inline-size` does **not** become the containing block of `position: fixed` children (fixed child at 0,0 width 1024) ⇒ drawers/dialogs inside settings tabs (ChannelDrawer, SlipSettingsCard, EtaxProviderSheet, StaffPinDialog, device register sheet) are unaffected.

## 3. Files changed
- `src/components/pos/settings/SettingsShell.tsx` — tab pane `<div>` gets `@container` (+ comment) · ~:95–98.
- `src/app/app/sys/[id]/pos/settings/DeviceSettings.tsx` — row `lg:flex-row lg:items-start lg:gap-8` → `@min-[882px]:flex-row @min-[882px]:items-start @min-[882px]:gap-8` (~:444–447) · `pos-device-panel` `lg:w-[400px] lg:shrink-0 xl:w-[430px]` → `@min-[882px]:w-[430px] @min-[882px]:shrink-0` (~:479).
- `src/app/app/sys/[id]/pos/settings/LanAgentsCard.tsx` — register `<form>` gets `@container` (~:194) · fieldset `sm:grid-cols-2` → `@min-[360px]:grid-cols-2` (~:206–208).
- `src/app/app/sys/[id]/pos/settings/ReceiptSettings.tsx` — `LOGO_PREVIEW_RE = /^https:\/\/[^\s]+\.[^\s]+$/` + `logoPreviewUrl()` (~:42–49) used by the sample payload (~:141, preview iframe + print sample) and the `<img>` beside the field (~:354–356); save path untouched (still `form.logoUrl.trim() || null`, ~:183) · row `xl:flex-row xl:items-start xl:gap-8` → `@min-[832px]:…` (~:343–347) · preview column `xl:w-[380px] xl:shrink-0` → `@min-[832px]:w-[380px] @min-[832px]:shrink-0` (`xl:gap-7` kept) (~:641).
- No `data-testid` added/removed (p4.1 registry pin unchanged, 16/16). No i18n keys (placeholder `logoNone` reused).

## 4. Files checked and left alone
- `PaymentSettings.tsx:133` `xl:grid-cols-2` equal halves, no fixed panel · stacks at 1024 (halves 305/385 px at 1280/1440 hold single-column cards).
- `StaffSettings.tsx:234` `xl:flex-row` with `flex-[1.25]`/`flex-1`, no fixed panel · stacks at 1024 · `:440` `xl:grid-cols-2` equal halves.
- `SharkSettings.tsx:424` card grid `md:2 xl:3` · `:431` `xl:flex-row` two `flex-1` panels (already moved lg→xl in P1.18U fix2 V3) · no fixed panel.
- `GeneralSettings.tsx:372` `xl:columns-2` masonry, no fixed panel.
- `settings-ui.tsx` (`SettingsCard` no width; `TabHead` `md:flex-row` title + wrapping buttons) · `shark-ui.tsx` · `ChannelsPanel.tsx` · `BoardSettings.tsx` · `ApiKeysCard.tsx` · `ChatSettingsCard.tsx` · `CreditSettingsCard.tsx` (`sm:grid-cols-2` two numeric inputs in a full-width card) · `DepositSettingsCard.tsx` · `TipSettingsCard.tsx` · `OrderMemberCard.tsx` · `QrChannelBlock.tsx` · `IntegrationCredsCard.tsx` · `StaffHrCards.tsx` (`sm:grid-cols-3` short number inputs) · `AiBriefSheet.tsx` · `StaffPinDialog.tsx` · `ChannelDrawer.tsx` / `EtaxProviderSheet.tsx` / `SlipSettingsCard.tsx` (fixed drawers `md:w-…`, not inline columns) · `page.tsx` — no two-column row with a fixed-width panel.
- Inside the device panel `DeviceSettings.tsx:~495` `sm:grid-cols-2` — panel is ≥ 398 px stacked or 430 px in the row ⇒ inputs ≥ 162 px; left alone.

## 5. Visual impact the controller should know
- 1440×900 with the app menu open (the harness desktop size): devices **and** receipt tabs now stack (left column would have been 336 / 386 px < 420). Two columns return at ≥ 1524 / ≥ 1474 px, or with the menu collapsed at 1440. 1024 (iPad): devices now stacks — the dead row `pos-device-lan-printer-name-*` gets a 280 px input.

## 6. Tests (run 2026-10-25 · logs in `/root/pos-runs/p43-fix8/*.log`) — verbatim result lines

QC4 suites via `env -C /root/projects/shark-pos-b ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` (2026-10-25T09:04:13Z → 09:09:25Z):
```
===== qc-pos-p2.14 ===== ผ่าน 60/60
JSON_SUMMARY {"suite":"qc-pos-p2.14","total":60,"passed":60,"failed":[],"skippedChecks":[],"skipped":false,"forced":false,"missing":[],"hasP27U":true,"crashed":false,"guardHits":0,"residue":0}
===== qc-pos-p3-skel ===== ผ่าน 41/41
JSON_SUMMARY {"suite":"qc-pos-p3-skel","total":41,"passed":41,"failed":[],"skipped":false,"forced":false,"crashed":null,"missing":[],"guardHits":0,"residue":0,"leaks":[],"fpDrift":[]}
===== qc-pos-p2.9 ===== ผ่าน 62/62
JSON_SUMMARY {"suite":"qc-pos-p2.9","total":62,"passed":62,"failed":[],"skipped":false,"forced":false,"missing":[],"guardHits":0,"residue":0,"leaks":[],"drift":[]}
===== qc-pos-p3.4 ===== ผ่าน 51/51
JSON_SUMMARY {"suite":"qc-pos-p3.4","total":51,"passed":51,"failed":[],"skipped":false,"forced":false,"missing":[],"base":"72669941","guardHits":0,"residue":0,"uOnly":11}
```
Static (no qc4.sh, no env; 2026-10-25T09:03:08Z → 09:04:5xZ (visual dry runs ended ~09:04Z)):
```
# pnpm exec tsx scripts/qc-pos-p4.1.mts --no-db
✅ qc-pos-p4.1: 16/16 ผ่าน
JSON_SUMMARY {"suite":"qc-pos-p4.1","mode":"no-db","total":16,"passed":16,"failed":[],"skipped":false,"registered":16,"pin":"6e32c1e2","probes":{"P4.1-R1":true,"P4.1-R2":true,"P4.1-R3":true,"P4.1-R4":true,"P4.1-R5":true,"P4.1-R6":true,"P4.1-R7":true,"P4.1-R8":true,"P4.1-R9":true,"P4.1-R9b":true,"P4.1-R10":true,"P4.1-R11":true,"P4.1-R12":true,"P4.1-R13":true,"P4.1-R14":true,"P4.1-Z1":true}}
# pnpm exec tsx scripts/fitness.mts (no env)
ผ่าน 53/53
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":53,"passed":53,"findings":[]}
# pnpm exec tsx scripts/fitness-pos.mts
JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
# pnpm exec tsx scripts/visual-pos.mts all --states --dry --user owner
รวม 221 ภาพ (15 หน้า × 3 ขนาด · หน้าขายแยกตามสถานะ × 1 ผู้ใช้)
JSON_SUMMARY {"wo":"all","user":"owner","tenant":"coffee","dry":true,"locale":"th","states":true,"pages":15,"viewports":3,"shots":221,"plan":[{"page":"register","state":"
…(plan truncated here; full in log)
# env LOCALE=en pnpm exec tsx scripts/visual-pos.mts all --states --dry --user owner
รวม 141 ภาพ (15 หน้า × 2 ขนาด · หน้าขายแยกตามสถานะ × 1 ผู้ใช้)
JSON_SUMMARY {"wo":"all","user":"owner","tenant":"coffee","dry":true,"locale":"en","states":true,"pages":15,"viewports":2,"shots":141,"plan":[{"page":"register","state":"
…(plan truncated here; full in log)
```
Strict typecheck exactly as `scripts/pos-gates.json` commands.typecheck (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`, started at 9172 MB available):
```
2026-10-25T09:09:35Z

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-b
> tsc --noEmit

exit=0
2026-10-25T09:10:35Z
```

## 7. Not done / notes
- No build, no serve, no real render of the app (builder rule); layout verified by source math + Tailwind compile + a static Chromium page with the compiled classes (see §2). The controller's next walker/visual pass at 1024 and 1440 is the real oracle.
- `ledger/POS-RESUME.md` not touched. No merge/push.
