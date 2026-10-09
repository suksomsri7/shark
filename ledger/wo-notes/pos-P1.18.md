# POS P1.18 S — builder notes (account B, lane 2, tree c)

Branch `wip/pos-p1.18` from `origin/session/pos` d46b8e89 (oracle b93f0623 merged). Contract = `pos-brief-P1.18.md` §2/§9 + `pos-P1.18-oracle.md` names table + prompt rulings 1–13.
Tree `/root/projects/shark-pos-c` · QC4 (`ep-frosty-lab`) · logs under `scratchpad/p118/runs/`.

## Checkpoint
- done: step 1 (d4ccb98c) · step 2 (day cut-off · per-branch PromptPay · sales gate · FU-c)
- next: step 3 (K1 throttle · K2 same-as-weak + ORACLE-EDIT PN3/PN8 · K3 same-key auto-hold · K4 self-approval in core)
- commands:
  - oracle forced: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.18.mts`
  - typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`

## Per-step results
- **Step 1** (R1–R6, R9): `permissions.ts` +2 keys · `settings-shared.ts` (pure: posReceiptLocale, posDayCutoffMinutes, settingsRefusalMessageKey, PosSettingsRefusalCode, settingsAuditDiff, types) · `register-shared.ts` posHeldCartExpireDays (held-cart.ts uses it) · `settings-general.ts` (updatePosGeneralSettings / updatePosDiscountCaps / updatePosUnitStockPolicy / posSettingsHistory) · `settings-overview.ts` posSettingsOverview · audit hunks in receipt-settings/payment-settings (payment + intent) · `settings-actions.ts` (5 of 7) · messages (nav, settings.errors.{settingsSectionLocked,confirmRequired}, register.errors.pinThrottled).
  oracle forced: 33/77 — B1 B2 B4–B7 G1–G6 C1–C4 U1–U3 P1–P4 H1 H3 H4 V2 D2 ST1 ST7 ST10 Z1 Z2 green (H2 waits for the account toggle, step 4) · typecheck 0.
  Touched suites (unforced): qc-pos-p1.7 32/32 · p1.5 19/21 · p1.10 38/40 · p1.6 46/48 — the red ones are only Z1/Z2 seed drift on `posqc-coffee-tenant` (posSale/outbox rows written by the parallel P1.12U lane on tree d); every functional check green. Re-run at the end.
- **Step 2** (Q9): `reports.ts` reads `posDayCutoffMinutes` in scopeOf (Scope.cutoffMin → rangeOf/bkkBusinessDate/dayStart, constant removed) · `service.ts` closeDaySummary/closeDayBills/closeDayCsv use `bkkDayRange(date, cutoff)` + business "today"; new export `posBusinessToday(ctx)` for pages · `payment-intent-shared.ts` promptpayIdForUnit · `payment-intent.ts` scope reads the unit id first, profile only when none · `payment-settings.ts` updatePosUnitPromptpay (OWNER-only else SETTINGS_SECTION_LOCKED · masked audit) + `maskPromptpayId` · `access.ts` posSalesReadScope · `pos/sales/page.tsx` uses it · `pos/settings/page.tsx` canEditReceipt = canManageAllLinkedUnits (FU-c) · action updatePosUnitPromptpayAction.
  oracle forced: 40/77 (D1 D2 PP1 PP2 V1 V2 B3 ST8 ST11 newly green) · typecheck 0.

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
