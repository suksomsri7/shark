# POS P1.8 — oracle notes (`scripts/qc-pos-p1.8.mts`)

Oracle writer · VPS lane 2 · 7 Oct 2026 (22:55Z) · branch `wip/pos-p1.8-oracle`, base `4aa1a286` (= session/pos head, brief P1.8 committed).
Contract: `ledger/pos-briefs/pos-brief-P1.8.md` §2 R1–R10, owner questions §6 Q1–Q6 at their defaults.
Run: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.8.mts` (then again with `env QC_FORCE=1`).
Also: `--list` (no DB, 48 ids) · `--no-db` (static S1–S9 only).

## CONTROLLER-DECISION (read first)

| # | item | what the oracle does now | why it needs a ruling |
|---|---|---|---|
| CD1 | **voidSale of a partially refunded bill.** After a partial refund the bill is still `PAID`, so today's `voidSale` accepts it. It would then reverse the whole sale JV (`reverseFor("PosSale", saleId)`), all points (`releaseOnVoid`) and all stock, while the CN(s) stay posted. That double-reverses the refunded part. | **Not tested** (the brief has no ruling). | Suggest: `voidSale` refuses when `refundedSatang > 0` (the bill must be refunded instead). One extra check if ratified. |
| CD2 | **Full refund after a partial one: points.** R7.2 says "full refund ⇒ `member.releaseOnVoid` path exactly as void (whole EARN+BURN reverse)". Taken literally this reverses all 62 EARN points on top of the 8 already reversed by `reversePartialEarn`, which gives −8 net. | C6 requires the EARN side of the bill to net to **0** (the task says "full refund reverses the remainder"). | The builder must make the whole reverse aware of the partial reversals. The oracle does not test BURN restore on a full refund. |
| CD3 | **`grossSatang` of `reversePartialEarn`.** | C5 pins it to the original `PosSale.grandTotalSatang`: `floor(earned × refund / grandTotal)`. The bill that used points: 26 earned × 9,333 / 28,000 → 8. | The brief names the field but not its value. The other reading is the earn base (grand − points paid), which gives 9. |
| CD4 | **Service charge on the refund that completes the bill.** | The refund that makes every line fully refunded takes `SC − Σ SC already refunded`. Earlier refunds take `half-up(SC × refunded lines / Σ line nets)`. | R5 only says "pro-rata". This rule keeps Σ SC = SC exactly. |
| CD5 | **Rounding rule per line.** | Rule A: each refund is `half-up(net × q / Q)`, and the last unit takes the remainder. For net 26,857 / 3 the refunds are 8,952 · 8,952 · 8,953. A2 uses numbers where the cumulative rule (8,952 · 8,953 · 8,952) fails. | This follows the brief's wording literally. The controller should confirm this is the intended rule, not the cumulative one. |
| CD6 | **ABB tax invoice on a full refund.** | C3 requires the bill's `TAX_INVOICE_ABB` **not** to be `VOIDED` after a full refund. | A full refund issues CNs. It is not a void, and the issued tax invoice stays. |
| CD7 | **REASON_REQUIRED vs VALIDATION.** | Missing `reasonCode` → `REASON_REQUIRED`. `OTHER` with an empty or blank `reason` → `REASON_REQUIRED`. An unknown `reasonCode` and `reason` > 200 chars → `VALIDATION`. | The brief lists the codes but not the mapping. |
| CD8 | **Spec vs brief.** `14-pos.md:910` says CASH always needs an open shift, numbers are `CN2607-000004` (YYMM, 6 digits), and there is a status `PARTIALLY_REFUNDED`. | Follows the brief: SHIFT_REQUIRED only when `pos.shift.required.register`, `CN${YYYYMM}-NNNN`, and the bill stays `PAID` on a partial refund. | The spec rows should be updated after acceptance. |

## Check list (48 · S=9 X1=3 X3=1 X4=15 X5=9 X6=2 functional=9)

| id | X | what |
|---|---|---|
| S1 | S | Schema has `PosSaleDocType {SALE REFUND}`. `PosSale` has `docType` (`@default(SALE)`), `refSaleId String?` (no `@relation`, no index), `refundedSatang Int @default(0)` and `reasonCode String?`. `PosSaleLine` has `refLineId String?` and `restock Boolean?`. |
| S2 | S | Model `PosDocCounter {tenantId unitId docType period seq}` with `@@unique([unitId, docType, period])`, and `core/scope.ts` registers `PosDocCounter`. |
| S3 | S | Migration is additive only: CREATE TYPE, CREATE TABLE plus the unique index, and every NOT NULL column has a DEFAULT. No DROP, RENAME, SET NOT NULL or ADD VALUE. No FK or index on `refSaleId`/`refLineId`. |
| S4 | S | `pos.sale.refund` is in the pos module of `permissions.ts`. |
| S5 | S | `"pos.sale.refunded"` is registered in `outbox-consumers.ts` with `withAutomation` on the same line, and `pos/refund-consumer.ts` exists. |
| S6 | S | 11 `pos.refund.errors.*` keys exist in th (Thai text) and en (no Thai). |
| S7 | S | `refund-actions.ts`: "use server" is the first line, only async function exports, no throw. Both actions call their service and have a catch. Uses `revalidatePath` and `unstable_rethrow`. |
| S8 | S | `refund.ts` exports both functions, uses FOR UPDATE, and does not touch `posReceiptCounter` or `InvItem.onHand`. The other new functions are exported: `applyExternalRefund`, `reversePartialEarn` (from lots and the point facade) and `onPosSaleRefunded`. The `createSale` and `voidSale` signatures are unchanged. |
| S9 | S | The minimum readers mention `docType`: `daySummary`, `listSales`, `closeDaySummary`, `computeReport`, `offShiftCash` and `reports.ts`. |
| A1 | X4 | Partial refund of bill X (shirt ×1 + hat ×1): every field of the REFUND document, line amounts by formula, SC pro-rata, tip 0, grand, the CASH payment, and the result shape. |
| A2 | X4 | Shirt refunds are 8,952 / 8,952 / 8,953 and hat refunds are 6,946 / 6,945 (half-up, last unit takes the remainder). Σ refunds per line = the line's net. |
| A3 | X4 | Full refund: SC takes the remainder (Σ SC = 4,383) and Σ grand = 48,217. The tip of 500 is never refunded. |
| A4 | X4 | `vatSatang = splitIncludedVat(grand, 700)` on 6 refund docs of the linked VAT POS. 0 on the unlinked POS. |
| A5 | X4 | ±1 → `PAYMENT_MISMATCH` with no doc and no counter move. Split CASH 2,000 + TRANSFER 3,000 works. |
| A6 | X4 | Weighed line qty 2 → `REFUND_EXCEEDS`. Weighed qty 1 = 3,500. Bundle 1 of 2 = 4,000. `restock` is stored on the refund lines. |
| A7 | X4 | Original bill: `refundedSatang` 17,488 → 27,335 → 48,217. Status stays PAID until the last refund, then REFUNDED. |
| E1 | - | VOIDED, REFUNDED, a REFUND doc and a gift-card bill → `SALE_NOT_REFUNDABLE`. Unknown id, other unit and other tenant → `SALE_NOT_FOUND`. No document is created. |
| E2 | X4 | `REFUND_EXCEEDS` ×2 (also after a partial refund), `REFUND_EMPTY`, and `VALIDATION` ×9 (qty 0/−1/1.5/"1", unknown/foreign/duplicate lineId, reason 201 chars, bad reasonCode). |
| E3 | - | `REASON_REQUIRED` ×3. OTHER with a reason is stored. |
| E4 | X4 | DEPOSIT and ROOM_CHARGE → `REFUND_METHOD_INVALID`. |
| E5 | X3 | QC cashier (create + void, no refund) → `NO_PERMISSION`. STAFF with `pos.sale.refund` → ok. MANAGER → ok. `soldByUserId` is the refunding user. |
| E6 | - | All 34 collected refusals are `{ok:false, code, message}` with Thai text and are not thrown. |
| N1 | - | `CN${YYYYMM}-0001` per unit. Another unit starts at 0001. `PosReceiptCounter` does not move, there is no SALE row in `PosDocCounter`, and the next sale continues `YYYYMM-NNNN`. |
| N2 | - | `settings.pos.receipt.refundPrefix` "RF" gives `RF${YYYYMM}-0001`. |
| N3 | X6 | 10 bills refunded in parallel on 10 connections, on a unit with no counter row yet → 10 ok, CN 0001–0010, seq 10. |
| R1 | X6 | 2 connections refund the same last unit, 3 rounds → 1 ok + 1 `REFUND_EXCEEDS` each round, 1 doc, REFUNDED. |
| I1 | X1 | Same key + payload → same refund id, 1 doc, 1 number, counter unchanged, 1 outbox event, 1 payment. |
| I2 | X1 | Same key with another qty or method, or a key equal to a sale's key → `IDEMPOTENCY_CONFLICT`. Nothing is created. |
| H1 | X4 | Shift (float 1,000) → ฿620 cash sale → ฿85 cash refund at the same device. The X report has the refund fields and the CASH line refund fields. Expected 153,500. Z at close is the same with over/short 0. |
| H2 | X4 | Shifts required: CASH with no shift, or without a device → `SHIFT_REQUIRED`. TRANSFER → ok with `shiftId` null. |
| H3 | X4 | Bill of a closed shift: void → `SHIFT_CLOSED`. A refund binds to the shift that is open now. An off-shift refund → `shiftId` null. |
| D1 | X4 | `daySummary`, `closeDaySummary` and `offShiftCash`: +62,000 (positive control) then −8,500 exactly. Bill counts do not change. `listSales` has no REFUND doc. `offShiftCash` shows a −8,500 row. |
| D2 | X4 | `reportDailySales` and `reportOverview`: net +62,000 then −8,500. billCount Δ0, refundCount +1, refundTotal +8,500. |
| D3 | X4 | A fully refunded ฿300 bill has a net effect of 0 on all five readers. |
| C1 | - | 1 `pos.sale.refunded` event per refund, key `PosSale#<refundSaleId>#REFUNDED`, with the payload shape and `full` flag. No `pos.sale.paid` for refund docs. An AuditLog row for the refund. |
| C2 | X5 | CREDIT_NOTE (ref = refundSaleId, `sourceDocId` = the ABB, docNo = CN number, 8,500 / VAT 556). Balanced JV: 1000 −8,500, 4000 +7,944, 2200 +556, 1100 0. The sale JV is not reversed. |
| C3 | X5 | Second CN. Bill + both CNs net 0 on 1000, 4000, 2200 and 1100. The whole book balances. The ABB is not VOIDED. |
| C4 | X5 | Unlinked POS: the event is DONE with no docs or JV, and `applyExternalRefund` → `{posted:false, reason:"unlinked"}`. |
| C5 | X5 | 62 points earned → −8 from the same lot (remaining 54). On the bill that used points, the BURN is not restored (the burned lot is unchanged, balance −8 only). |
| C6 | X5 | Full refund: the bill's points net 0, the balance is back to the pre-sale value, and the lot is 0. |
| C7 | X5 | Member spend 62,000 → 53,500 → 0. |
| C8 | X5 | Stamps: 0 VOID after the partial refund, 1 VOID after the full refund. |
| C9 | X5 | IN movements use key `pos-refund-<refundSaleId>-<refundLineId>[-<invItemId>]` at the original OUT cost (the fixture changes the average cost after the sale). Bundle components are returned, and the weighed line returns 350 g. `restock:false` → no movement. onHand follows. |
| C10 | X1 | Replaying every `pos.sale.refunded` event ×2 throws nothing and leaves 11 counters unchanged. All events are DONE. |
| C11 | X5 | Coupon stays REDEEMED through the partial refunds and is RELEASED on the full refund. |
| Q1 | - | `saleForRefund` returns `refundableQty` 2/1/1, refunds, payments, `member.pointsEarned` 62 and `accounting.docNo` = ABB number. An unknown id → `SALE_NOT_FOUND`. |
| Z1 | - | QC tenants' row counts are equal before and after. The temp tenant has 0 rows in every `tenantId` table (312) and its Tenant row is gone. |
| Z2 | - | QC tenants' fingerprint (7 models) is equal before and after. |

### Fixture (temp tenant `qc-p18-<rand>`, deleted in `finally`)

**Systems and units**
- POS-A is linked to a VAT 7% book, the same way `qc-pos-account` does it.
- POS-N is unlinked. POS-P has `refundPrefix` "RF".
- Unit A also has INVENTORY, MEMBER, POINT and COUPON. Point settings are `satangPerPoint` 1000. There is a PER_SALE_MIN stamp card.
- Other units: B and Q (numbering), Q2 (parallel), S (shifts), R (readers), N and P.

**Bills**
- **M**: member C1, CASH 62,000.
- **X**: shirt 3×10,000 with line discount 999, hat 2×7,500 and bag 3,333. Bill discount 2,000, coupon FIXED 1,500 and SC 4,383 give a grand total of 48,217. Allocated D = 3,500 → nets 26,857 / 13,891 / 3,086. The tip of 500 is patched into the row.
- **B2**: member C2 burns 200 points.
- **V**: an item line, a bundle line and a 350 g weighed line. The average cost is then changed by a second receipt.
- **NB**: on the unlinked POS-N.

**Actors** are objects using the seed users: owner, MANAGER (resto owner id), and the cashier with `PQC.cashierPermissions` + void + shift.operate.

**Cleanup** first checks the slug. It then runs `DELETE … WHERE "tenantId" = $1` over every base table with that column, in passes, and deletes the Tenant row last.

## Names I had to invent (17 · builder must use exactly these)

| name | where | note |
|---|---|---|
| `refundSale(ctx: RegisterCtx, actor: RegisterActor, input, client?)` | `pos/refund.ts` | `client` is a PrismaClient, used by the race lanes (P1.9 shape). `ctx.deviceId` and `input.deviceId` are both sent. |
| refund input `{ saleId, lines:[{lineId, qty, restock?}], payMethods:[{type, amountSatang, reference?}], reasonCode, reason?, deviceId?, idempotencyKey }` | refund.ts | Brief R5 names, with `lineId` as the key of a line. |
| ok result `{ ok:true, refund:{ id, receiptNo, … }, sale:{ status, refundedSatang } }` | refund.ts | `refund.id` = refundSaleId. `duplicated` is optional and not asserted. |
| `saleForRefund(ctx, actor, { saleId }, client?)` → `{ ok, lines:[{lineId, refundableQty, …}], payments:[…], refunds:[{receiptNo, grandTotalSatang, …}], member:{pointsEarned}|null, accounting:{docNo}|null }` | refund.ts | Read model R9. |
| `refundSaleAction`, `saleForRefundAction` | `pos/refund-actions.ts` | As in the brief. |
| message keys `pos.refund.errors.{noPermission saleNotFound saleNotRefundable refundExceeds refundEmpty paymentMismatch refundMethodInvalid shiftRequired reasonRequired idempotencyConflict validation}` | `src/messages/{th,en}/pos.json` → `refund.errors.*` | The namespace is my choice. Register refusals use `pos.register.errors.*`. |
| `PosDocCounter.seq` (not spec `lastNo`), `period` = YYYYMM | schema | Brief R4. The spec sketch uses `lastNo` + YYMM. |
| CN number `${prefix}${YYYYMM}-${seq 4d}`, prefix `settings.pos.receipt.refundPrefix` (default "CN") | refund.ts | `period` is taken from the sale `receiptNo` of the same unit in the oracle. |
| refund document fields | REFUND PosSale row | `soldByUserId` = actor, `note` = reason, `reasonCode`, `tipSatang` 0, `serviceChargeSatang` = SC part. Invariant `subtotal − discount + SC = grand`. Lines: `qty` = refunded units, `lineTotalSatang` = refund amount, `unitPrice×qty − discount = lineTotal`, `refLineId`, `restock`. |
| outbox payload `{ saleId, refundSaleId, sourceModule, full, lines:[{refLineId, qty, amountSatang, restock, itemId}], payMethods:[{type, amountSatang}] }` | refund tx | Brief R6. `restock` may be absent/null/false for non-stock lines. `itemId` = the original line's itemId (null for bundles). |
| AuditLog: `targetId` = refundSaleId, `action` contains "refund" (case-insensitive) | refund tx | The helper is the builder's choice. |
| `applyExternalRefund({ tenantId, sourceSystemId, refId: refundSaleId, saleRefId, occurredAt, grossSatang, payMethods:[{channel, amountSatang}], lines, docNo })` → `{posted, reason?, docId?}` | `account/index.ts` | The oracle only calls it on an unlinked POS. Only the input field names above are fixed. |
| CN document: `docType CREDIT_NOTE`, `refType "PosSale"`, `refId` = refundSaleId, `sourceDocId` = ABB id, `docNo` = POS CN number, `grandTotal`, `vatAmount` | account | JV location is flexible: the oracle reads entries with `(refType PosSale, refId refundSaleId)` OR `(refType AccountDocument, refId cnDocId)`. |
| `reversePartialEarn(ctx, { refType:"PosSale", refId: saleId, amountSatang, grossSatang, idempotencyKey })` | `point/lots.ts` + point facade | `grossSatang` = original grandTotal (CD3). The C6 net-0 sum covers ledger rows with refId ∈ {saleId, refundSaleIds}. |
| `onPosSaleRefunded` | `member-bridges.ts` | Exported. The handler signature is not asserted. |
| stock keys `pos-refund-<refundSaleId>-<refundLineId>` (item/weighed line) and `pos-refund-<refundSaleId>-<refundLineId>-<invItemId>` (bundle component) | refund consumer | Mirrors `lineConsumption`. type IN, sourceModule "POS", `costSatang` = original OUT movement cost. |
| ShiftReport additions `refundCount`, `refundSatang`, `byMethod[].refundCount`, `byMethod[].refundSatang` | `shift.ts` | Brief R8. `salesTotalSatang` stays gross sales. |

## Expected result on base (4aa1a286)

- `--list`: exit 0, 48 ids. **Verified.**
- `--no-db`: 0/9, exit 1. Every static check is red for the missing schema, migration, permission, consumer, messages, actions, wiring or reader `docType`. **Verified.**
- Unforced on QC4: **SKIPPED, exit 0**, with 9 reasons: 2 refund.ts exports, 6 columns (client ✗ DB ✗), and the `posDocCounter` delegate. **Verified.**
- `QC_FORCE=1` on QC4: **exit 1, 2 green (Z1, Z2) / 46 red, no crash, cleanup clean** (312 tables, 0 rows left, Tenant gone). **Verified.**
  - Every fixture works on base. Log line: `บิล X: grand 48217 · SC 4383 · D 3500 · net [26857,13891,3086] · tip 500`.
  - Second log line: `M แต้ม 62 ยอดสะสม 62000 ตรา 1 ABB 202610-0001 · B2 แต้มได้ 26 ยอด 326 ล็อตตั้งต้นเหลือ 300`.
  - The DB checks are red through `MISSING:refundSale`, `MISSING:saleForRefund` or `MISSING:applyExternalRefund`, or because the reader deltas are 0 or +30,000. Example: H1 expected 162,000 vs 153,500.
- `pnpm typecheck` (POS lock): **exit 0**.

### Base run tails

Unforced, exit 0:
```
⏭️  SKIPPED — qc-pos-p1.8: ของใบ P1.8 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)
   • src/lib/modules/pos/refund.ts ยังไม่มี export refundSale
   • src/lib/modules/pos/refund.ts ยังไม่มี export saleForRefund
   • PosSale.docType ยังไม่มี (client ✗ · DB ✗)
   • PosSale.refSaleId ยังไม่มี (client ✗ · DB ✗)
   • PosSale.refundedSatang ยังไม่มี (client ✗ · DB ✗)
   • PosSale.reasonCode ยังไม่มี (client ✗ · DB ✗)
   • PosSaleLine.refLineId ยังไม่มี (client ✗ · DB ✗)
   • PosSaleLine.restock ยังไม่มี (client ✗ · DB ✗)
   • Prisma client ยังไม่มี delegate posDocCounter (R4)
   ข้อมูล: seed ร้านกาแฟ มี · ข้อสอบ 48 ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)
JSON_SUMMARY {"suite":"qc-pos-p1.8","total":0,"passed":0,"failed":[],"skipped":true,"reason":[…9…],"registered":48,"seed":true}
```
Forced, exit 1 (lines truncated):
```
  ❌ [P1.8-C5] … | actual ยอดแต้ม 62→62 (คาด −8) · ล็อต remaining 62 (คาด 54) · คืนบิลใช้แต้ม MISSING:refundSale · …
  ❌ [P1.8-C9] … | actual ไม่มี RV1 · … · IN ของ RV1 0 (คาด 4) · …
  ❌ [P1.8-C3] … | actual RM2 MISSING:refundSale · CREDIT_NOTE 0 (คาด 2) · 1000 สุทธิ 62000 · 4000 สุทธิ -57944 · 2200 สุทธิ -4056
  ❌ [P1.8-C6] … | actual แต้มของบิลสุทธิ 62 (1 แถว) · ยอดแต้ม 62 (คาด 0) · ล็อต remaining 62
  ❌ [P1.8-C7] … | actual 62000 → 62000 → 62000
  ❌ [P1.8-C8] … | actual ตรา 1 · หลังบางส่วน ADD 1 VOID 0 · หลังครบ VOID 0
  ❌ [P1.8-C10] … | actual ไม่มี consumer pos.sale.refunded · event 0 (คาด ≥10) · …
  ❌ [P1.8-Q1] … | actual X MISSING:saleForRefund · M MISSING:saleForRefund · id ไม่มี → MISSING:saleForRefund
  ❌ [P1.8-E6] … | actual PAYMENT_MISMATCH 4999: MISSING:refundSale · … (+28)
  ลบร้านชั่วคราว cmuypfhpj000010kz9qv4tmsp: 312 ตาราง · เหลือ {} · Tenant 0
  ✅ [P1.8-Z1] QC4 คืนสภาพ: …
  ✅ [P1.8-Z2] QC4 ลายนิ้วมือ: …

===== qc-pos-p1.8 ===== ผ่าน 2/48 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.8","total":48,"passed":2,"failed":[…46…],"skipped":false,"forced":true,…}
```
Typecheck: `> tsc --noEmit` → `TYPECHECK_EXIT 0`.

## Drift from brief §1 (re-verified on 4aa1a286)

None of the drift changes a ruling.

| brief says | actual |
|---|---|
| `PosSaleLine:75-97` · `PosPayment:119-133` | 75-98 · 119-135 |
| `voidSale` `service.ts:756-798` · `restoreVoidedInventory:807-860` | 756-786 · 807-848 |
| `listSales:850` | 851 (`daySummary:862` ✓) |
| `closeDaySummary (:533-596 legacy)` | No legacy copy at 533. The only one is `service.ts:933-996`; shift.ts:527-543 is `currentShift`. Callers: `app/app/sys/[id]/page.tsx:162`, `pos/close/page.tsx:42`, `pos/api/ops/reports.ts`. |
| `point.reverseWithLots` `lots.ts:321` | `ReverseInput` at 320, function at 328 |
| TAX_INVOICE_ABB doc `service.ts:4080-4209` | `EXTERNAL_SALE_DOC_TYPE` 4079, `upsertExternalSaleDocument` 4097 to about 4210 |

Facts the brief does not mention, all confirmed on this head:
- **P1.17 already reserves the refund fields.** `DailyRow.refundCount` and `refundTotalSatang` exist (`reports.ts:65-66`, always 0). D2 asserts them.
- **The P1.17 report loader excludes REFUNDED bills.** `loadSales` (`reports.ts:351`) reads `status in [PAID, VOIDED]`. A fully refunded bill's gross therefore disappears, so the builder must not also subtract its REFUND docs. D3 catches this.
- **`ShiftReport.cashRefundsSatang` is already reserved** (`shift.ts:118`, `refunds = 0` at :345).
- **Tips are off platform-wide.** `TIP_POSTING_READY = false` (`payment-settings.ts:41`) means `createSale` refuses any tip today. The tip bill is created by patching the row (see the oracle header).
- **`PosDocCounter` is still listed as a future model.** `scripts/pos-qc-env.mts` has it in `POS_FUTURE_MODELS`. The builder should move it to `POS_MODELS` when the migration lands.
- Every other §1 fact checks out:
  - schema columns, `receiptNo` format `service.ts:470-475`, `voidSale` `SHIFT_CLOSED` rule
  - `applyExternalSale :89`, `reverseExternalSale :264-277`, `account-bridge :90-153`
  - `member-bridges :316-337`, `register.ts:1685`, `permissions.ts:136`, `InvMovement.costSatang inventory.prisma:171`
  - `shop refundOrder :309`, `CREDIT_NOTE account.prisma:14` + `doc-detail.ts:36`
  - `createDocument :1879`, `reverseFor gl.ts:852`, `computeReport 311-372`, `offShiftCash 824`

## Encoding choices worth a second look
- **Temp tenant instead of the seed tenant.** The seed POS is linked to the seed book, so refunds there would post into it. Using a temp tenant follows `qc-pos-account` and keeps Z2 meaningful. Only the seed user ids are reused, as actor objects.
- **The oracle drains the global outbox.** It calls `drainAll()` (other tenants' pending events on QC4 are drained too, as other oracles do). The replay itself calls `consumers["pos.sale.refunded"]` directly, so no other event types run.
- **E1 cross-tenant case.** It calls `refundSale` with the seed coffee ctx and a temp-tenant saleId. A wrong implementation would write into the seed tenant, and Z1 would catch it.
- **The unlinked facade call in C4 only needs the link check to come first.** It sends `lines: []` and `docNo: "CN-QC"`.
- **Not covered:** refunds of non-POS `sourceModule` bills, and the BURN restore on a full refund.

## Commands run here
- `pnpm exec tsx scripts/qc-pos-p1.8.mts --list` → 48 ids, exit 0
- `pnpm exec tsx scripts/qc-pos-p1.8.mts --no-db` → 0/9, exit 1
- QC4 host check: `.env.qc4` DATABASE_URL host `ep-frosty-lab-…` (role neondb_owner)
- `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.8.mts` → SKIPPED, exit 0
- same with `env QC_FORCE=1` → 2/48, exit 1, no crash, residue clean (run twice; the first forced run found a BigInt fingerprint bug in Z2, which is now fixed)
- `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → exit 0
