# POS P1.18 S — builder notes (account B, lane 2, tree c)

Branch `wip/pos-p1.18` from `origin/session/pos` d46b8e89 (oracle b93f0623 merged). Contract = `pos-brief-P1.18.md` §2/§9 + `pos-P1.18-oracle.md` names table + prompt rulings 1–13.
Tree `/root/projects/shark-pos-c` · QC4 (`ep-frosty-lab`) · logs under `scratchpad/p118/runs/`.

## Checkpoint
- done: step 1 (d4ccb98c) · step 2 (af6ae94a + ORACLE-EDIT 29d5b747 + a887a2a6) · step 3 (K1–K4 + ORACLE-EDIT p1.15)
- next: step 4 (pos-integrations.ts composition root + setPosLinkEnabled account facade + actions)
- commands:
  - oracle forced: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.18.mts`
  - typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`

## Per-step results
- **Step 1** (R1–R6, R9): `permissions.ts` +2 keys · `settings-shared.ts` (pure: posReceiptLocale, posDayCutoffMinutes, settingsRefusalMessageKey, PosSettingsRefusalCode, settingsAuditDiff, types) · `register-shared.ts` posHeldCartExpireDays (held-cart.ts uses it) · `settings-general.ts` (updatePosGeneralSettings / updatePosDiscountCaps / updatePosUnitStockPolicy / posSettingsHistory) · `settings-overview.ts` posSettingsOverview · audit hunks in receipt-settings/payment-settings (payment + intent) · `settings-actions.ts` (5 of 7) · messages (nav, settings.errors.{settingsSectionLocked,confirmRequired}, register.errors.pinThrottled).
  oracle forced: 33/77 — B1 B2 B4–B7 G1–G6 C1–C4 U1–U3 P1–P4 H1 H3 H4 V2 D2 ST1 ST7 ST10 Z1 Z2 green (H2 waits for the account toggle, step 4) · typecheck 0.
  Touched suites (unforced): qc-pos-p1.7 32/32 · p1.5 19/21 · p1.10 38/40 · p1.6 46/48 — the red ones are only Z1/Z2 seed drift on `posqc-coffee-tenant` (posSale/outbox rows written by the parallel P1.12U lane on tree d); every functional check green. Re-run at the end.
- **Step 2** (Q9): `reports.ts` reads `posDayCutoffMinutes` in scopeOf (Scope.cutoffMin → rangeOf/bkkBusinessDate/dayStart, constant removed) · `service.ts` closeDaySummary/closeDayBills/closeDayCsv use `bkkDayRange(date, cutoff)` + business "today"; new export `posBusinessToday(ctx)` for pages · `payment-intent-shared.ts` promptpayIdForUnit · `payment-intent.ts` scope reads the unit id first, profile only when none · `payment-settings.ts` updatePosUnitPromptpay (OWNER-only else SETTINGS_SECTION_LOCKED · masked audit) + `maskPromptpayId` · `access.ts` posSalesReadScope · `pos/sales/page.tsx` uses it · `pos/settings/page.tsx` canEditReceipt = canManageAllLinkedUnits (FU-c) · action updatePosUnitPromptpayAction.
  oracle forced: 40/77 (D1 D2 PP1 PP2 V1 V2 B3 ST8 ST11 newly green) · typecheck 0.
  Touched suites: qc-pos-p1.17 40/40 · qc-pos-closeday 22/22 · qc-pos-p1.16 28/28 · qc-hf-pos-page-authz 55/56 → S-8 asserted the literal `posSalesScope` on the sales page ⇒ **ORACLE-EDIT** (own `test(...)` commit 29d5b747, count unchanged) → 56/56.
- **Step 3** (P1.15 close items): K1 `register-shared` STAFF_PIN_DEVICE_THROTTLE_AFTER=10 / _MS=15 min + `PIN_THROTTLED` (union, REFUSAL_KEY, REG_MESSAGE, staff-pin MSG) · `verifyStaffPin` counts `pos.staff.pin_failed {deviceId, unitId}` AuditLog rows of the device in the window **before** matching; anonymous PIN_INVALID writes one row; throttled attempts write none; named attempts untouched · K2 `setStaffPin` taken PIN ⇒ `refuse("WEAK_PIN")` (identical code+message) · K3 `regDiscountOver` ③ uses a deterministic held-cart id `hcap<sha256(tenant|system|unit|key)[0..21]>` → `holdCartForApproval(…, {id})` (P2002 ⇒ winner's row) so two concurrent same-key submits share one held cart and one request (submitForApproval/PosApprovalPayload already dedupe per entity) · K4 `approval/service.ts decide()` refuses requester = decider (`ok:false, status PENDING, code SELF_APPROVAL`, Thai message) before any write; bulkDecide reports that message.
  ORACLE-EDIT `qc-pos-p1.15` PN3/PN8 (own commit): PN3 expects WEAK_PIN + same message as a weak PIN; PN8 code list drops PIN_TAKEN (6). Count unchanged.
  oracle forced: 45/77 (K1–K4 + ST6 green) · qc-pos-p1.15 39/39 · typecheck 0.

## Deviations
1. **K4 self-approval guard exempts (a) OWNER and (b) entity type `crm.commission`** (ruling text: "refuse requester = approver inside the core"). (a) the OWNER is the last authority — a one-owner shop could never close its own OWNER-step request, and `qc-crm-c3.3` S4.8 asserts the owner approving the owner's own commission works; (b) CRM ruling C3.3 S3 handles a self-decided commission downstream (row stays PENDING + note + one owner escalation) and `qc-crm-c3.3` S4.8 asserts `decide().ok === true` for the MANAGER's own commission. Everything else (incl. K4's `QC_P118_SELF`, all POS_*) is refused in the core. Controller: confirm, or rule that CRM moves its rule into the core guard (then drop the set).
2. **ORACLE-EDIT `qc-hf-pos-page-authz` S-8** (not in the prompt's list): it asserted the literal `posSalesScope(...)` on the sales page that ruling Q9 replaces with `posSalesReadScope`; only the function name changed (own `test(...)` commit, 56 checks unchanged).

## Foreign-module edits
(filled)

## Contract for P1.18U
(filled at the end)

## Follow-ups
(filled)

## Gate exit codes
(filled at the end)
