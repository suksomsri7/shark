# POS P1.10 — builder S notes (devices · printer config · receipt payload · renderers)

Builder S · VPS tree `/root/projects/shark-pos-c` (own node_modules) · branch `wip/pos-p1.10` from `origin/session/pos` 2d1d69c2 · 7–8 Oct 2026.
Contract: `ledger/pos-briefs/pos-brief-P1.10.md` §2 R1–R9 + §6 CD1–CD5 · oracle `scripts/qc-pos-p1.10.mts` (unchanged) · names = oracle notes table (all 31 used as written).

## Migration (QC4 only · additive)
- `prisma/migrations/20261128100000_pos_p110_devices/migration.sql` = body of `prisma migrate diff --from-schema <prisma/schema at 2d1d69c2, copied to scratch> --to-schema prisma/schema --script` (not diffed against the DB, which holds P1.8 objects).
- Content: `CREATE TYPE "PosDeviceStatus" (ACTIVE, REVOKED)` · `CREATE TABLE "PosDevice"` (14 columns, no FK) · `CREATE INDEX PosDevice_tenantId_unitId_status_idx` · `CREATE UNIQUE INDEX PosDevice_unitId_deviceCode_key`. No SET/ALTER/DROP (ST2 requires CREATE only). Nothing of P1.8 (`PosDocCounter`, `PosSale.docType`) touched.
- `migrate status` before: up to date (156) · `migrate deploy` (iso → qc4 → with-gate-lock): applied `20261128100000_pos_p110_devices`, exit 0 · `prisma generate` in tree c only.
- Registered `PosDevice: sys()` in `core/scope.ts`; `scripts/pos-qc-env.mts` moved PosDevice from POS_FUTURE_MODELS to POS_MODELS.

## Steps (commit + push of `wip/pos-p1.10` after each; typecheck 0 before every push)
1. 7f17b7ba — schema+migration · `pos.device.manage` + `pos.sale.read` keys · `device-shared.ts` (parsePrinterConfig) · `receipt-settings-shared.ts` (parseReceiptSettings) · `receipt-settings.ts` + `-actions.ts`.
2. 8af0fe5a — `device.ts` + `device-actions.ts` · DEVICE_REVOKED guards in `submitRegisterSale` (after the idempotency lookup), `openShift` (input.deviceId and ctx.deviceId · CD2), `holdRegisterCart`/`recallHeldCart` (held-cart.ts, raw ctx.deviceId) · heartbeat in `registerStatus` · refusal codes + `refusalMessageKey` · messages `pos.device.*`, `pos.receipt.*`, `pos.register.errors.device*` th+en. Oracle forced: 21/40 (all device checks green).
3. abd10505 — `receipt.ts` receiptPayload + `receipt-actions.ts` · payload types/labels in `receipt-render.ts` · `account/index.ts` re-exports `vatConfigOf` (fitness F2.2: pos may reach account only through the facade). Oracle forced: 30/40.
4. 4f421a34 — `renderReceiptHtml` + `encodeEscPos`. Oracle forced: 39/40 (P5 only, see ORACLE-EDIT).
5. 3e71612e — receipt settings written with one `jsonb_set` statement (COMMON rule: no whole-settings overwrite).

## Gates (final code 3e71612e)
| command | result |
|---|---|
| `iso … flock /tmp/pos-gate.lock pnpm typecheck` | exit 0 (run before each push, 6×) |
| `qc-pos-p1.10` QC_FORCE=1 run 1 | exit 1 · 39/40 · failed [P5] · Z1/Z2 green · cleanup device 10, audit 22 |
| `qc-pos-p1.10` QC_FORCE=1 run 2 | exit 1 · 39/40 · failed [P5] · Z1/Z2 green |
| `qc-pos-p1.10` unforced | exit 1 · 39/40 · failed [P5] · Z1/Z2 green (no SKIP) |
| positive control: oracle copy with only the fixture path fixed (lines 698–699), run forced, file deleted after | exit 0 · 40/40 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | exit 0 · 41/41 |
| `bash scripts/qc4.sh pnpm fitness` | exit 0 · 41/41 |
| `pnpm exec tsx scripts/fitness-pos.mts` | exit 0 · 8/8 |

Regression suites (unforced, QC4). "Before" = code at 2d1d69c2 with a client regenerated from that schema (then switched back + regenerated):

| suite | before | after |
|---|---|---|
| qc-pos-p1.3 | 0 · 128/128 | 0 · 128/128 |
| qc-pos-p1.5 | 0 · 21/21 | 0 · 21/21 |
| qc-pos-p1.6 | 0 · 48/48 | 0 · 48/48 |
| qc-pos-p1.9 | 0 · 53/53 | 0 · 53/53 |
| qc-pos-p1.9b | 0 · 22/22 | 0 · 22/22 |
| qc-pos-p1.14 | 0 · 30/30 | 0 · 30/30 |
| qc-pos-p1.17 | 0 · 40/40 | 0 · 40/40 |
| qc-pos-p1.1 | 0 · 178/178 | 0 · 178/178 |
| qc-hf-pos-page-authz | 0 · 56/56 | 0 · 56/56 |

Not run here: `next build`, visual, the caller money suites — CONTROLLER-RUN.

## ORACLE-EDIT? P1.10-P5 (fixture writes the POS-abbreviated switch at the wrong JSON path)
- `scripts/qc-pos-p1.10.mts:698-699` write `docConfig: { autoTaxInvoice: { posAbbreviated: … } }`. The real reader `parseDocSettings` (`account/settings-schema.ts:279-338`, `DOC_SETTINGS_KEY = "docSettings"`) reads `docConfig.docSettings.autoTaxInvoice.posAbbreviated`, and so do `vatConfigOf` and the account bridge (`account/index.ts:123,191`) that decides whether the TAX_INVOICE_ABB document is issued. With the fixture as written, ACC-W is "posAbbreviated on" for the whole system, so the receipt correctly says TAX_INVOICE_ABB.
- Exact hunk: on both lines replace `docConfig: { autoTaxInvoice: { posAbbreviated: X } }` with `docConfig: { docSettings: { autoTaxInvoice: { posAbbreviated: X } } }`. Positive control above: 40/40 with that change only.
- Not worked around in code: reading the root path would make the paper receipt disagree with the accounting document type.

## Contract for P1.10U
Actions (all "use server", refusals returned as data `{ok:false, code, message}`):
- `device-actions.ts`: `registerDeviceAction({systemId, unitId, name, deviceCode})` · `updateDeviceAction({systemId, unitId, patch:{id, name?, posRegNo?, printerConfig?}})` · `revokeDeviceAction({systemId, unitId, id})` · `listDevicesAction({systemId, unitId})` (all `pos.device.manage` at the unit) · `heartbeatAction({systemId, unitId, deviceCode})` (`pos.sale.create`).
  - `PosDeviceResult = {ok:true, device: PosDeviceView}` · `ListDevicesResult = {ok:true, items: (PosDeviceView & {online, openShift:{id, shiftNo, openedAt}|null})[], limit, activeCount}` · `HeartbeatResult = {ok:true, registered, written, device: PosDeviceView|null}` — the register screen gets its printerConfig from heartbeat.
  - `PosDeviceView = {id, unitId, systemId, name, deviceCode, status, posRegNo, printerConfig (parsed), registeredByUserId, lastSeenAt, revokedAt, createdAt}` (ISO strings). Types in `device-shared.ts`.
  - Codes: NOT_FOUND (scope) · PERMISSION_DENIED · VALIDATION (+`field`) · DEVICE_REVOKED · DEVICE_LIMIT · DEVICE_NOT_FOUND · INTERNAL.
- `receipt-settings-actions.ts`: `posReceiptSettingsAction({systemId})` (pos.sale.create or pos.device.manage) · `updatePosReceiptSettingsAction({systemId, patch})` (pos.device.manage) → `{ok:true, settings: PosReceiptSettings}`; codes NOT_FOUND · PERMISSION_DENIED · VALIDATION(+field) · UNKNOWN.
- `receipt-actions.ts`: `receiptPayloadAction({systemId, saleId})` (copy:false) · `reprintReceiptAction({systemId, saleId})` (copy:true + audit) → `{ok:true, payload: ReceiptPayload}`; codes PERMISSION_DENIED · SALE_NOT_FOUND · VALIDATION · INTERNAL.
- Register refusals: `DEVICE_REVOKED` from submit/hold/recall (RegisterRefusal) and openShift (ShiftRefusal) → `refusalMessageKey` → `errors.deviceRevoked`.
Pure (client-safe) — `receipt-render.ts`: `renderReceiptHtml(payload, {paper:"58"|"80", locale:"th"|"en"}) → string` · `encodeEscPos(payload, {paper, drawerKick, thaiText:"raster"|"tis620", cut?=true, codePage?=255, locale?="th"}) → {bytes: Uint8Array, rasterSlots: {offset, length:8, text, cols, align, bold, big}[]}` (client replaces the 8-byte `GS v 0` placeholder at `offset` with the real raster command) · `formatSatang` · `formatReceiptDate` · `receiptColumns` · `RECEIPT_LABELS`. `device-shared.ts parsePrinterConfig`, `receipt-settings-shared.ts parseReceiptSettings`.

## Decisions taken (controller may overrule)
- `pos.sale.read` is granted implicitly to anyone with `pos.sale.create` (CD3 "every role that has create"; no role presets exist to grant it, so STAFF cashiers would otherwise lose reprint).
- ABB requires a tax id on the book; a VAT book without one prints RECEIPT (an ABB without tax id is not valid).
- `showPoints:false` omits the whole member block; `showCashier:false` omits cashierName.
- `updateDevice` on a REVOKED device = DEVICE_REVOKED; `revokeDevice` twice = ok (same row). Device register/update/revoke write AuditLog `pos.device.*`.
- Logo URL must be https.

## Follow-ups
- P1.8 merge: `docType`/`refReceiptNo` are read dynamically from the PosSale row (`receipt.ts`); after P1.8 lands, replace with typed fields and fill `refReceiptNo` from the real column name.
- Receipt of a VOIDED bill is still served (no void stamp) — decide in P1.10U/P1.16.
- Thai line breaking in ESC/POS is per character cluster (no dictionary); long Thai names without spaces break mid-word (leading vowels kept with their consonant).
- QR e-receipt (P1.11) prints nothing while `qrEReceiptUrl` is null.
