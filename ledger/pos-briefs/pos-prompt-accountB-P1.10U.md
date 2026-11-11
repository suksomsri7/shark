# Prompt — P1.10U builder (settings 17A/17B · print module · PayDone print). Controller: P1.16 accepted into session/pos at `a21c1d2a`; 1 lane.

---

You are the BUILDER for POS work order **P1.10U** (UI + client print module; the server is frozen). English reports, Thai code comments. Reply compact.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`, `pos-spec-P1.3-register-ui.md`.
- `ledger/pos-briefs/pos-brief-P1.10U.md` — whole file; §1–§7 binding (CD1–CD5). Mockups `ledger/design-pos/17-settings-3.png` (17A + 17B only), `11-customer-display.png` (11B), `02-payment.png`.
- `ledger/wo-notes/pos-P1.10.md` "Contract for P1.10U" + "Fix round 1" (payload `status`, 30-min original rule → read `payload.copy`, `deviceStatus`, raster offsets pre-splice, `receiptRefusalMessageKey`).
- P1.16 is merged: the bills page already reprints through a hidden iframe (`src/app/app/sys/[id]/pos/sales/BillsClient.tsx`) and reads the paper size from `heartbeatAction`. Once your `src/components/pos/print/printReceipt` exists, wire the bills page's reprint to it (one small hunk) — brief CD4.
- AGENTS.md → `node_modules/next/dist/docs/` before Next code. Memory rules: `'use client'` imports only `*-shared`/pure modules; `"use server"` exports only async functions; `scripts/*.mts` typechecked by `next build`.

## Tree
`/root/projects/shark-pos-c` (own rw node_modules; `.env.qc`/`.env.qc4` = QC4 `ep-frosty-lab`, neondb_owner — print only the hostname). `git status --short` must be clean; `git fetch origin session/pos && git checkout -b wip/pos-p1.10u origin/session/pos` then `pnpm exec prisma generate` (no schema change — just to be in sync). Never touch other trees/processes, never `pkill -f`, no build/server/deploy/.env/Telegram, no schema/migration, no edits to `receipt.ts`/`device.ts`/`receipt-settings.ts` except the ONE additive composed read `receiptSettingsPageDataAction` in `receipt-settings-actions.ts` (brief §2). DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` (never `/tmp/shark-gate.lock`).

## Build order (commit + push `wip/pos-p1.10u` after each step; typecheck before each push)
1. `/pos/settings` shell (`SettingsShell` + tab registry, tab "ตั้งค่า" last in `posTabs` + `childrenFor("POS")`), muted placeholders for the P1.18 tabs.
2. 17A receipt & tax tab (brief §2) incl. the live preview iframe (`renderReceiptHtml` on a client-built sample payload) and the ภาษี card.
3. 17B devices & printers tab (brief §3): cards, right panel, register/revoke/update, pairing state in localStorage per deviceCode.
4. Print module `src/components/pos/print/` (brief §4): `printReceipt`, `usb`/`bluetooth`/`browser` transports, raster splice from the last slot backwards, pairing dialog, `scripts/qc-pos-p1.10u-print.mts` (~6 deterministic checks, no DB).
5. PayDone + register wiring (brief §5): print buttons, autoPrint once per sale, revoked banner, device chip; bills-page reprint → `printReceipt`; shifts page "เปิดลิ้นชัก" only when paired + drawerKick.
6. Visual: `POS_PAGES` + `"settings"`, `PAGE_EXPECT.settings`, `--states` per brief §6 (`settings-receipt`, `settings-devices`, `settings-device-revoke`, `settings-print-pair`, `paydone-print`), cleanup in `finally`; `--dry` rc 0 owner + cashier; keys th+en; testids `pos-settings-*`/`pos-device-*`/`pos-print-*` + inventory rows.

## Gates before "done" (exit codes in `ledger/wo-notes/pos-P1.10U.md`)
typecheck 0 · `qc-pos-p1.10` 40/40 forced ×2 + unforced · `qc-pos-p1.10u-print` · `qc-pos-p1.16` 28/28 · `qc-pos-p1.3` 128 · `qc-pos-p1.9` 53 · `qc-hf-pos-page-authz` · `qc-nav-functions` · `pnpm fitness` with/without .env · `scripts/fitness-pos.mts` · visual `--page settings --states --dry` and `--page register --states --dry` rc 0 (owner + cashier).

## Done =
- Notes: screens built, keys, deviations from 17A/17B/02 with the ruling for each, browser support matrix (Chrome desktop/Android: USB+BT · iOS Safari: browser print only), follow-ups, gate lines.
- Last push of `wip/pos-p1.10u`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
