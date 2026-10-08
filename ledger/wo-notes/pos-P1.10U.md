# POS P1.10 U — builder notes (17A receipt & tax · 17B devices & printers · print module · PayDone print)

Builder · VPS tree `/root/projects/shark-pos-c` · branch `wip/pos-p1.10u` from `origin/session/pos` 611f54c7 · 8 Oct 2026.
Contract: `ledger/pos-briefs/pos-brief-P1.10U.md` §1–§7 (CD1–CD5) · server frozen except the one additive read `receiptSettingsPageDataAction`.

## Progress (checkpoint — updated per step)
1. 883376a3 — `/pos/settings` shell: `SettingsShell` + `POS_SETTINGS_TABS` registry · tab "ตั้งค่า" last in `posTabs` + `childrenFor("POS")` · messages `pos.settings.*`, `pos.device.*`, `pos.print.*`, `pos.register.status.device*` th+en.
2. 3ebda612 — 17A `ReceiptSettings.tsx` + `receiptSettingsPageDataAction` + `sample-payload.ts` (pure) + live preview iframe.
3. (this step) — 17B `DeviceSettings.tsx` · `pairing.ts` (localStorage per deviceCode).
Next: 4 print module · 5 PayDone/register/bills/shifts wiring · 6 visual states + gates.
