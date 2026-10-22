# Spec — P3-SKEL U (โครงแพลตฟอร์ม · UI) — as built 22 Oct 2026 (builder, account B)

Prompt `pos-prompt-accountB-P3-SKEL-U-BUILD.md` · rulings CD-SKELU-1…12 (confirmed by controller B) · S contract `wo-notes/pos-P3-SKEL.md` §U-only handoff · notes `wo-notes/pos-P3-SKEL-U.md`.
"Skeleton" = the real seam + polite refusal: nothing on screen claims "เชื่อมแล้ว", "รับเงินแล้ว" or "พิมพ์แล้ว"; switch-on later (W4/W5) = adapter body + `ready:true`, no UI change.

## Server surface (CD-SKELU-2)
| file | exports | perm (coarse gate · module re-checks per unit) |
|---|---|---|
| `src/lib/modules/pos/platform-ui-actions.ts` (`"use server"`, async only, no throw, one `run()` with try/catch) | `listPrintAgentsAction` · `registerPrintAgentAction` · `revokePrintAgentAction` · `enqueuePrintJobAction` · `reconcileReportAction` · `reconcileCsvAction` · `slipTargetsAction` | device.manage∨sale.create · device.manage · device.manage · sale.create · report.view · report.view · sale.read∨sale.create |
| `src/lib/modules/pos/slip-targets.ts` (read-only) | `slipTargets(ctx, actor, {saleId})` → `{targets:[{paymentId, type TRANSFER\|PROMPTPAY, amountSatang}], slips:[{slipId, paymentId, amountSatang}]}` | sale.read ∨ sale.create at the unit · other unit/tenant = `SALE_NOT_FOUND` |
Page-server reads: platform-channel statuses (`readIntegrationCredentials`, ≤ 5 channels, `pos.channel.manage` holders) · `slipRetentionDaysOf(sys.settings)` · provider `{code,label}` lists (`SLIP_VERIFY_PROVIDERS`, `ETAX_PROVIDERS`, `PLATFORM_PROVIDERS`) · `listPrintAgents` + `PRINT_PRINTER_PORTS` (devices tab) · `SLIP_MAX_BYTES` (bills page). No other server file changed.

## Screens
| screen | where | what |
|---|---|---|
| 10 channels | `settings/ChannelsPanel.tsx` · `ChannelDrawer.tsx` · `IntegrationCredsCard.tsx` | row chip `pos-channel-conn-<code>` (awaitingCreds / complete / keyMissingShort) under the name for holders · drawer (edit, platform code, holder) → creds card PLATFORM + webhook URL (read-only + copy) + "ใช้ได้เมื่อเปิดตัวเชื่อมจริง (W4)" · adapter not changed |
| creds card | `IntegrationCredsCard.tsx` (PLATFORM · SLIP_VERIFY · ETAX) | read once · chip keyMissing ▸ complete ▸ awaitingCreds · line "โครง ✅ · สวิตช์รอ W4" · field rows `pos.platform.fields.<name>` (unknown = ASCII name) · secret = `password`, always empty, placeholder = server mask · OWNER saves only typed fields · clear = `""` after inline confirm · inputs cleared after every result · test disabled until COMPLETE → refusal key (NOT_CONFIGURED / ADAPTER_PENDING) · `data-status` (KEY_MISSING/DRAFT/COMPLETE) + `data-row-status` |
| 10 payments | `SlipSettingsCard.tsx` (slot after the Beam card) | "แนบสลิปโอน" live · retention `slip.retention {days}` read-only + help (W19) · "ตรวจสลิปอัตโนมัติ · รอผู้ให้บริการ" + sheet (provider select, nothing pre-selected → creds SLIP_VERIFY) for `pos.settings.payment` holders |
| 10 shark (e-Tax row) | `SharkSettings.tsx` · `EtaxProviderSheet.tsx` | chip "รอผู้ให้บริการ" kept · "สมัคร" live for `pos.settings.manage` → sheet (INET / Leceipt, nothing pre-selected → creds ETAX) · no preview/send |
| 17B devices | `LanAgentsCard.tsx` · `DeviceSettings.tsx` | agent list (online from server · last seen after mount) · register form (name 1–60 · 1–8 printers name/host/port select/target) → token box once (copy · cleared on close/unmount) · revoke with inline confirm · mode radios now a 2×2 grid incl. `pos-device-mode-lan` (enabled when exactly one live agent has a receipt/untargeted printer; 0 = agentNone · ≥ 2 = agentMany) · kitchen `pos-device-kitchen-lan` = alias of `kitchenSlip "after-sale"` when mode is LAN |
| print transport | `components/pos/print/{lan,printReceipt,types,PrintStatus}.ts(x)` · `kds/kds-print.ts` | `escpos-lan` ⇒ same ESC/POS bytes as USB/BT ⇒ `enqueuePrintJobAction` per slip/receipt ⇒ `{ok, via:"lan"}` shown "ส่งเข้าคิวแล้ว" · refusals `lanCode` → `pos.platform.print.*` · no `lan` ctx (KDS, offline, deposit) = NO_DEVICE → existing "print via system" fallback |
| 02 pay | `PayIntentPanel.tsx` + `register/SlipAttach.tsx` | PENDING `PROMPTPAY_STATIC` intent: `pos-pay-intent-slip` beside manual confirm → inline slip form (target = intentId) + chip `pos-pay-intent-slip-chip` |
| 02b done | `PayDone.tsx` + `SlipAttach.tsx` | TRANSFER bills only: `pos-reg-done-slip` → `slipTargetsAction` → form for TRANSFER rows · countdown paused while open |
| slip form | `SlipAttach.tsx` `SlipAttachPanel` | file (jpeg/png/webp, `capture="environment"`, type/size pre-check) · slip amount (baht→satang, never prefilled) · ref (`^[A-Za-z0-9_-]{4,64}$`) · key per pick (getRandomValues — S5.21) renewed after a result · `STORAGE_NOT_CONFIGURED` disables the opener with the reason |
| 12 bills | `sales/BillSlips.tsx` · `sales/SlipSheet.tsx` | block `pos-bills-slips` (chips = status only) + attach for TRANSFER/PROMPTPAY rows · sheet (portal): viewer link on open (no cache) · image error/FILE_PURGED keys · typed vs paid amount + mismatch line · confirm / reject (+ reason 3–200, short = client message) for `pos.shift.manage` holders · SLIP_INVALID_STATE reloads the drawer · "หลักฐาน" only |
| 15A | `TaxInvoiceDialog.tsx` | muted `pos-taxinv-etax-pending` under the e-mail field |
| 08 reports | `reports/ReconcileView.tsx` · `ReportsClient.tsx` · `reports/page.tsx` | view kind `reconcile` (tab `pos-reports-tab-reconcile`) · per unit (all-units = pick-unit) · ≤ 92 days (else no call) · day cards + rows + flag chips · CSV · PDF/settlement disabled with reason · no right = `pos-reports-reconcile-denied` (page level too) |

## Messages (th + en, same keys)
`pos.platform.fields.*` (14) · `pos.platform.creds.*` · `pos.platform.ownerOnly` · `pos.platform.status.{switchPending,webhookPending,keyMissingShort}` · `pos.platform.slip.*` (retention, retentionHelp, amount, transRef, amountMismatch, imageUnavailable, view, reasonLabel + card/form/sheet keys) · `pos.platform.print.*` (agentMany, agentNoPrinter, agentHowto, queued, register, revoke + card/form/token/radio keys) · `pos.report.kinds.reconcile` · `pos.report.reconcile.*`.

## Visual states (`visual-pos.mts p3-skel-u --states`)
owner (17): settings-channel-creds-draft · -complete · -keymissing · settings-channels-platform-chips · settings-slip-card · settings-slip-verify-sheet · settings-etax-sheet · settings-devices-lan-none · -agents · -token · paydlg-intent-slip · paydone-transfer-slip (1440) · taxinv-etax-line · bills-drawer-slips · bills-slip-sheet · bills-slip-reject-invalid · reports-reconcile-owner.
cashier (5): settings-channels-platform-chips · settings-slip-card · paydlg-intent-slip · bills-drawer-slips · reports-reconcile-denied.
Pre-flight (read-only, QC4): `visual-pos.mts p3-skel-u --probe`.

## Owner-ack (derived — no frame)
creds card + chips · webhook-pending line · slip card + retention read-only · slip attach form/sheet · e-Tax sheet · agents card + LAN radio (2×2 mode grid) + kitchen alias · reconcile tab · "ส่งเข้าคิวแล้ว" label.
