# POS P1.16 — builder S+U notes (bills page "บิลวันนี้" · mockup 12)

Builder · tree `/root/projects/shark-pos-c` · branch `wip/pos-p1.16` from `origin/session/pos` b6c1114b (oracle merged at f7134ed8) · 8 Oct 2026.
Contract: `ledger/pos-briefs/pos-brief-P1.16.md` §2–§5 + names table / drift list / CD-O rulings in `pos-P1.16-oracle.md` + controller rulings in the prompt
(CD-O3 half-up avg · CD-O7 precedence · CD-O8 CN document VAT pass-through · CD-O13 SALE only).
DB: QC4 only (`ep-frosty-lab-aoylqlv8-pooler…`) via `iso.sh → qc4.sh → with-gate-lock.sh`.

## Step 1 — S (commit 5e864bae)
- `receipt-shared.ts receiptKindOf` (pure) · `receipt.ts` calls it (same 4-condition rule, no payload change).
- `bills-shared.ts` (types · `BILLS_ERROR_KEYS` 8 codes · `REFUND_REASON_LABEL_TH` · date helpers) · `bills.ts` (`billsPageData`, `billDetail`, `voidSaleByActor`) · `bills-actions.ts` (3 actions, `assertCan` tenant-level first gate for F6.1).
- `service.ts voidSale(tenantId, unitId, saleId, audit?: VoidSaleAudit)` — optional 4th arg ⇒ `tx.auditLog.create` `pos.sale.void` {before: status/receiptNo/grand, after: {status, reason, idempotencyKey}} in the void tx; return type `Promise<void>` kept; 3-arg callers unchanged (no audit).
- `pos.bills.errors.*` th+en · tab label "บิลวันนี้" in `tabs.ts` + `layout.tsx`.
- `qc-pos-p1.16` forced: exit 1 · 26/28 (only R5b-1/R5b-2 red, as planned) · cleanup 314 tables · residue 0 · typecheck 0.

## Step 2 — S R5b
- (a) `account/index.ts applyExternalRefund` takes optional `vatSatang` (VAT book + integer 0…gross ⇒ base = gross − vat for the JV) and passes it to `upsertExternalCreditNoteDocument` (new optional `vatSatang`: INCLUDE + VAT book ⇒ header `vatAmount = vat`, `subTotal = grand − vat`) — CD-O8: documents = POS refund docs = JV. `account-bridge.ts bridgePosSaleRefunded` forwards `refund.vatSatang` (row already carries it).
- (b) `service.ts saleStatusByKey` selects `docType`; REFUND row ⇒ `null`.
- Fixture line after the fix: `VAT ใบคืน POS 393+392 · VAT เอกสาร CREDIT_NOTE 393+392 · 2200 สุทธิ 0`.
- `qc-pos-p1.16` forced #1 exit 0 · 28/28 · forced #2 exit 0 · 28/28 · unforced exit 0 · 28/28 · cleanup each run `314 ตาราง · แถวค้าง 0 · Tenant 0`.
- Money set (after = this branch · baseline = pos-P1.8 §9 gate lines): qc-pos-account 0 · 16/16 · qc-account-cpa 0 · 107/107 · qc-restaurant-money 0 · 6/6 · qc-shop-refund 0 · 12/12 · qc-hotel-money 0 · 5/5 · qc-ticket-money 0 · 6/6 · qc-subscription-money 0 · 14/14 — identical.
- `qc-pos-p1.8` exit 1 · 48/49 — only **P1.8-S8** (static regex `voidSale\s*\(\s*tenantId: string, unitId: string, saleId: string\s*\)` freezes the 3-param text). The 4th optional param is mandated by P1.16 R3/CD2 and asserted by P1.16-ST1, so the two static checks are mutually exclusive (overloads cannot satisfy both: ST1 reads the first `export async function voidSale(` and needs its body `{`). All functional p1.8 checks green. **ORACLE-EDIT? P1.8-S8** (suggest: allow an optional 4th param, e.g. `saleId:\s*string\s*(,\s*\w+\?\s*:\s*\w+\s*)?\)`).
- typecheck 0.

## Next
Step 3 U page `/pos/sales` · step 4 visual states.
