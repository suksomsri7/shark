# Prompt — P1.10U reviewer (read-only). Controller: head under review `56e80a44` on `wip/pos-p1.10u` (base `session/pos` 611f54c7).

---

You are the REVIEWER for POS work order **P1.10U** (settings shell `/pos/settings` · 17A receipt & tax tab · 17B devices & printers tab · client print module WebUSB/Web Bluetooth/browser · PayDone print + register device chip/banner). Read-only: do not edit, commit, run DB suites, build, start servers or touch `.env*`. Report in English, ≤ 60 lines.

## Read first
- `ledger/pos-briefs/pos-brief-P1.10U.md` (§1–§7 binding; CD1–CD5), `pos-brief-COMMON.md`, `pos-spec-P1.3-register-ui.md` (refusals as data, Thai messages, ≥44 px, testids).
- Server contract (frozen for this card): `ledger/wo-notes/pos-P1.10.md` ("Contract for P1.10U" + "Fix round 1"), `src/lib/modules/pos/receipt.ts`, `receipt-render.ts`, `device.ts`, `receipt-settings.ts` (`parsePrinterConfig`, `parseReceiptSettings`).
- Builder notes `ledger/wo-notes/pos-P1.10U.md` (committed part; the working copy may be newer — `git show 56e80a44:ledger/wo-notes/pos-P1.10U.md` is the reviewed version).
- Mockups `ledger/design-pos/17-settings-3.png` (17A/17B), `11-customer-display.png` (11B preview), `02-payment.png` (PayDone) — look at them (Read tool renders PNG).
- Next.js 16.2 rules: `node_modules/next/dist/docs/` for server actions / client components; memory rules: `'use client'` files must not import anything that reaches prisma; `"use server"` files export only async functions.

## Tree
`/root/projects/shark-pos-c` is the builder's tree — read it with `git show 56e80a44:<path>` / `git diff 611f54c7..56e80a44` only (the working copy may change). Never run `git checkout`, `pnpm`, `prisma`, or any DB command there. If you need a scratch checkout, `git worktree` is forbidden too — use `git archive 56e80a44 <paths> | tar -x -C <scratchpad>`.

## Review — what to verify (cite file:line for every finding)
1. **CD5 server freeze**: the only server addition is `receiptSettingsPageDataAction` in `receipt-settings-actions.ts` composing existing reads. Any other change under `src/lib/modules/**`, `prisma/**`, oracle `scripts/qc-pos-p1.10.mts` = MAJOR.
2. **CD2**: no hardware ids (USB vendor/product, BT ids) reach the server; `printerConfig` sent to `updateDeviceAction` only contains keys `parsePrinterConfig` accepts; full object sent each time.
3. **Print module** `src/components/pos/print/`: `printReceipt` never throws, refusal codes exactly `NO_DEVICE|PERMISSION|UNSUPPORTED|WRITE_FAILED` with Thai messages; USB claim/transferOut chunking ≤16 KB; BT chunk ≤ 20 B or negotiated MTU; raster splice from the last slot backwards (offsets are pre-splice), every `GS v 0` placeholder replaced, order preserved; `thaiText` default raster, `tis620` opt-in; browser fallback path; iOS Safari → `UNSUPPORTED` + browser offer. Check `scripts/qc-pos-p1.10u-print.mts` actually asserts those (deterministic bytes, Σ length) and is not tautological.
4. **PayDone**: original vs copy (`copy:false` within 30 min via `receiptPayloadAction`, copy via `reprintReceiptAction`), autoPrint once per sale (ref guard — look for double-print on re-render / StrictMode), toast with "พิมพ์ซ้ำ", no standalone drawer button on PayDone; shifts page "เปิดลิ้นชัก" only with `drawerKick` + paired + `pos.shift.operate`, not audited (CD4) and noted.
5. **Register**: device chip from `registerStatus`/heartbeat; `DEVICE_REVOKED` refusals from submit/hold/recall/openShift rendered in Thai with "ติดต่อผู้จัดการ"; persistent banner on `deviceStatus === "REVOKED"`.
6. **Settings shell** (CD1): `SettingsShell` + tab registry reusable; muted "รอบถัดไป" entries without links; permission gating (`pos.device.manage` write / `pos.sale.create` read-only with disabled fields and "เฉพาะผู้จัดการแก้ได้"); page-level authz consistent with `qc-hf-pos-page-authz` conventions.
7. **17A**: live preview via `renderReceiptHtml` in iframe `srcdoc` (XSS: settings text must be escaped by the renderer — verify, since form text flows into srcdoc); placeholders from the linked book; read-only numbering patterns match what `service.ts`/`refund.ts` really format; `qrEReceipt` row handled per brief; "ส่วนลดท้ายบิล" label follow-up from P1.8 review (points/vouchers lumped) — note whether addressed.
8. **17B**: cards, online dot, shift line, REVOKED muted, right panel fields match parser enum, revoke confirm text, `DEVICE_LIMIT` inline message, register-this-device uses the P1.9 client id (`register-client-id.ts`) as `deviceCode`.
9. **i18n / a11y**: keys `pos.settings.* pos.device.* pos.receipt.* pos.print.*` present in both `src/messages/th/pos.json` and `en/pos.json` (en has no Thai), JSON valid; testids `pos-settings-* pos-device-* pos-print-*` in `scripts/pos-ui-inventory.json`; ≥44 px targets.
10. **Visual script**: `scripts/visual-pos.mts` states `settings-receipt settings-devices settings-device-revoke settings-print-pair paydone-print`; QC devices `posqc-vis-dev-<pid>-{1,2}` revoked in `finally`; `PAGE_EXPECT.settings`; `scripts/pos-qc-env.mts` `POS_PAGES` has `settings`.
11. Client/server boundary: no `'use client'` file imports a module reaching prisma; `"use server"` files export only async functions; `scripts/*.mts` typecheck-clean by inspection.

## Report format
- Verdict line first: `MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`.
- Findings `F1..Fn`, each: severity MAJOR/MINOR, file:line, what breaks (concrete input → wrong outcome), the fix. MAJOR = money/receipt correctness, security (XSS/authz/hardware ids to server), double-print, server freeze broken, crash paths.
- "Verified OK" list (one line each) for the items above you confirmed.
- Follow-ups for the controller (not blockers).
