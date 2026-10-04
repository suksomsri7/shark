# POS P1.6 — builder S notes (branch wip/pos-p1.6 · base origin/session/pos cb1a2331)

## QUOTA STOP — next: deploy migration to QC4, then build step 2 (createSale)
Stopped on owner's order (4 Oct 2026) at a clean commit.

Done:
- `prisma/schema/pos.prisma`: additive. Enum `PosPayType` + `CARD`. `PosSale.note`, `serviceChargeSatang` (default 0) and `tipSatang` (default 0). `PosSaleLine.note`. `PosPayment.tenderedSatang`, `changeSatang` and `reference`.
- Migration `prisma/migrations/20261121000000_pos_p16_payment/migration.sql`:
  - Generated with `migrate diff --from-config-datasource (QC4) --to-schema`.
  - Read and checked: ADD VALUE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS only (nullable or constant default), with a session `lock_timeout` of 3s.
  - Removed 3 `DROP INDEX` lines (CrmContact_previousEmails_idx, CrmContact_systemId_createdAt_id_idx, CustomRecord_objectId_createdAt_id_idx). They are inherited crm_perf_indexes drift, not ours.
  - **NOT yet applied to QC4. `prisma generate` NOT run.**
- Step 1: `src/lib/money/vat.ts` `splitIncludedVat`, pure and integer-only. Checked against the bridge's `Math.round` formula on gross −3000…200000 × 11 rates: 0 differences.
- `account/index.ts`: the bridge VAT lines (~:125) now call the helper. Plus one import line, required for that call.

Not done:
- Typecheck and suites have not run on these changes.

Baseline run (base code, separate copy in the scratchpad) was started in the background:
- Results go to `scratchpad/before/SUMMARY.txt`.
- The two "forced" entries did NOT actually force: iso.sh drops env. Use `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh …`.
- Re-run the baseline next session if those results are gone.

Next steps, in order:
1. `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy`, then `prisma generate`.
2. createSale (service.ts):
   - New input fields and storage.
   - VAT read in the tx (enabled link + AccountSettings, defaults registered/700, same as vatConfigOf), then `splitIncludedVat(grand)`.
   - Σpay = grand + tip.
   - Tendered/change on the CASH row.
   - Idempotency payload compare: lines bag of price|qty|disc, payments bag, unit/system. Returns `status`; otherwise IDEMPOTENCY_CONFLICT. Retry P2002 when ownsTx (I7).
   - O21 guard before the counter (linked to another POS ⇒ refuse; unlinked + ≥2 active POS ⇒ refuse with "เลือกจุดขายก่อน").
   - BLOCK: `inventory.lockItemsInTx` + `consumeInTx` with key `pos-consume-<saleId>-<lineId>`, before the counter.
   - Larger tx timeout.
   - closeDay: CARD in PAY_TYPE_ORDER/labels.
   - account-bridge: subtract tip from the Dr lines, and add the SC line.
3. Payment settings (K).
4. Register (R1–R3).
5. Restaurant new key on VOIDED (I6).
