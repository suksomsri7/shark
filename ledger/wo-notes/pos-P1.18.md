# POS P1.18 S — builder notes (account B, lane 2, tree c)

Branch `wip/pos-p1.18` from `origin/session/pos` d46b8e89 (oracle b93f0623 merged). Contract = `pos-brief-P1.18.md` §2/§9 + `pos-P1.18-oracle.md` names table + prompt rulings 1–13.
Tree `/root/projects/shark-pos-c` · QC4 (`ep-frosty-lab`) · logs under `scratchpad/p118/runs/`.

## Checkpoint
- done: step 1 (permissions · settings-shared · posHeldCartExpireDays · settings-general · settings-overview (posSettingsOverview) · audit hunks · history · 5 actions)
- next: step 2 (day cut-off reports+closeDay · per-branch PromptPay writer + QR path · /pos/sales gate · FU-c)
- commands:
  - oracle forced: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.18.mts`
  - typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`

## Per-step results
- **Step 1** (R1–R6, R9): `permissions.ts` +2 keys · `settings-shared.ts` (pure: posReceiptLocale, posDayCutoffMinutes, settingsRefusalMessageKey, PosSettingsRefusalCode, settingsAuditDiff, types) · `register-shared.ts` posHeldCartExpireDays (held-cart.ts uses it) · `settings-general.ts` (updatePosGeneralSettings / updatePosDiscountCaps / updatePosUnitStockPolicy / posSettingsHistory) · `settings-overview.ts` posSettingsOverview · audit hunks in receipt-settings/payment-settings (payment + intent) · `settings-actions.ts` (5 of 7) · messages (nav, settings.errors.{settingsSectionLocked,confirmRequired}, register.errors.pinThrottled).
  oracle forced: 33/77 — B1 B2 B4–B7 G1–G6 C1–C4 U1–U3 P1–P4 H1 H3 H4 V2 D2 ST1 ST7 ST10 Z1 Z2 green (H2 waits for the account toggle, step 4) · typecheck 0.

## Deviations
(filled)

## Foreign-module edits
(filled)

## Contract for P1.18U
(filled at the end)

## Follow-ups
(filled)

## Gate exit codes
(filled at the end)
