# P4.3 fix8+fix8b — R1 review

## R1 P4.3 fix8+fix8b (d6d0f66a)
Reviewer: independent R lane · tree p11 detached `d6d0f66a` · range `f6da735d..d6d0f66a` (4 src files) · 2026-10-25T09:21:42Z
Method: I read the diff, then checked in context: SettingsShell layout (:27–99), every `@container`/`@min-`/`@max-`/named `@sm…@2xl` use in src, the render sites of the changed components (page.tsx:228–291), fixed-position descendants in the settings tabs (RegisterDialog.tsx:67, DeviceSettings.tsx:81 and the five RegisterDialog users), the save path and the preview renderer (ReceiptSettings.tsx:141, :183, :354–371, :654–657; receipt-render.ts:359). I read the builder's notes only after forming my view. No build, render or suite run: this is a static review. The builder's Tailwind compile and static Chromium page cover class generation; the controller's walker and visual pass is the real render check.

### Verdict: MERGEABLE (no must-fix)

### (1) Syntax and scope
- `@container` plus the arbitrary `@min-[Npx]:` variant is the same form the project already compiles: StockShortcuts.tsx:144/155 (`@min-[608px]:`), OrderCardView (`@min-[220px]`/`@max-[140px]`), shifts-ui.tsx:161 (`@container card`). Tailwind ^4.
- The only container-query classes under the settings pane are the new ones: DeviceSettings (5× `@min-[762px]`), ReceiptSettings (5× `@min-[712px]`), LanAgentsCard (`@container` form + 1× `@min-[360px]`). No settings tab uses OrderCardView, shifts-ui, StockShortcuts, QrOrderBits or HomeKpis, and none has a named `@sm…@2xl` variant (those exist only in ShiftsClient). So the new pane container cannot rebind or change any other tab's layout.
- Nesting resolves correctly: the 762/712 rows and the device panel sit outside the LAN form, so they resolve to the pane; the fieldset's `@min-[360px]` resolves to the nearer LAN form container. DeviceSettings and ReceiptSettings render only inside SettingsShell (page.tsx:228–291), so there is no render site without a container, where the `@min` variants would never match.

### (2) container-type and fixed/absolute descendants
- Fixed overlays inside the pane:
  - RegisterDialog renders `fixed inset-0` inline, with no portal (RegisterDialog.tsx:67). ChannelDrawer, EtaxProviderSheet, SlipSettingsCard, StaffPinDialog and AiBriefSheet all use it.
  - DeviceSettings DialogBox is `fixed inset-0` (:81).
  - All of these are descendants of the pane. HistoryDrawer is a sibling, outside the pane. No toast or overlay in the settings tabs uses fixed positioning outside these.
- The rule I rely on: under CSS Conditional 5 / Containment 3 as now specified, `container-type: inline-size` applies only style containment and inline-size containment. Layout containment was removed from container-type by a CSSWG resolution in 2022. A fixed-position element's containing block changes only for an ancestor with transform, perspective, filter, backdrop-filter, will-change of those, or contain: layout/paint/strict/content. container-type is not on that list, so these overlays still position against the viewport.
- Absolute descendants use the nearest positioned ancestor, which this change does not affect.
- Inline-size containment makes the pane's min-content width 0. The pane is already `flex-1 min-w-0`, and stretches in the `flex-col` layout below md, so its width is unchanged. The same holds for the LAN form, a stretched block in the card.

### (3) Threshold arithmetic
Container queries measure the content box. With the app menu open: 312 left pad + 24 right pad, max-w-7xl, root border 2, settings menu 240 at lg, pane padding 48 below xl and 64 from xl.
- 1024: P = 398. Both tabs stack. This fixes the 58 px LAN column; receipt stacked before too.
- 1280: P = 638. Both stack. Before: devices row with left 176, receipt row with left 226.
- 1440: P = 798 ≥ 762 and ≥ 712. Devices row: left 336, panel 430. Receipt row: left 386, preview 380. Same as before and as the approved mockups.
- Margin at 1440 is 36 px for devices and 86 px for receipt, so a ~15–17 px classic scrollbar does not flip it.
- Other cases: 1366 with menu open gives P = 724, so devices stacks (before: row, left 262) and receipt stays a row with left 312, identical to before. Rail mode at 1280/1440 is unchanged (rows). Rail at 1024 now stacks devices (before: row, left 198).

### (4) logoPreviewUrl()
- What is submitted is unchanged: save still sends `form.logoUrl.trim() || null` (ReceiptSettings.tsx:183). Only the sample payload (:141 → iframe preview and print sample) and the 76 px thumbnail (:354–356) use `logoPreviewUrl`.
- A valid https URL with a dotted host behaves exactly as before.
- Empty or invalid input gives null: the preview omits the logo (receipt-render.ts:359 checks `if (p.shop.logoUrl)`) and the thumbnail shows `tr("logoNone")` as before.
- No new testid, no i18n change. The renderer still HTML-escapes the URL (`esc()`) and the iframe stays `sandbox="allow-same-origin"`; the new filter only narrows the input.

### (5) Walker rows
No element or testid is removed or added: pos-device-panel, pos-device-empty, pos-device-lan-register, pos-device-lan-printer-{name,host,port}-*, pos-settings-header-card are all intact. Only classes changed, and disabled/needs/aria attributes are untouched. At 1024 the LAN printer-name input goes from ~0 px wide to ~280 px, which should turn the dead walker row live.

### Findings
G1 · Low · SettingsShell.tsx:98 (`@container` on the pane, which contains inline `fixed` overlays: RegisterDialog.tsx:67, DeviceSettings.tsx:81)
Why: correct under the current spec and current engines (the builder checked Chromium). The early container-query implementations shipped with layout containment, which would make the pane the containing block for these overlays: drawers and dialogs clipped by the root's `overflow-hidden` and positioned against the pane. That would be a severe break on an old iPad. I could not confirm the exact Safari version where this changed from this tree.
Fix: no code change needed if the supported iPadOS/Safari floor is recent (16.4+ / 17). Otherwise, include one settings drawer (e.g. ChannelDrawer or the device DialogBox) in the iPad visual pass, or portal RegisterDialog to body.

G2 · Low · LanAgentsCard.tsx:206–209 (fieldset `@min-[360px]:grid-cols-2`)
Why: at 1440 (row, left 336) the add-printer form content is about 244 px, so the printer fields go from two columns (`sm:`, ~110 px inputs) to one column. This is a visible change in the configuration the brief says must look as approved. It is better UX, but I could not tell from the tree whether the approved device mockup shows this form.
Fix: confirm in the 1440 visual pass against the mockup. If the mockup shows two columns, a ruling is needed (keep one column for readability, or lower the threshold).

G3 · Info · ReceiptSettings.tsx:46–49
Why: `https://` hosts without a dot (e.g. `https://localhost/x.png`, `https://intranet/logo`) used to show in the thumbnail (`startsWith("https://")`) and now show the placeholder, and they are dropped from the preview. The saved value is unaffected. This is intended and harmless.
Fix: none.

G4 · Info · ReceiptSettings.tsx left-column form grids (viewport `md:grid-cols-2`)
Why: at the new receipt threshold (left exactly 300 at P = 712, e.g. ~1366 with menu open: left 312) the inner `md:` grids still split into two narrow columns. This is identical to before this change at those widths, so not a regression.
Fix: optional later. Move those inner grids to container variants on the card.
