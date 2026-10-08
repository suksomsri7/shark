# WO P1.8 — partial refund · credit note · stock/points/member reversal · shift cash · doc-type-aware readers (builder S)

> POS RUN · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.8` (from `session/pos` 7c479596 = oracle ef22651f + prompt) · 7 Oct 2026 · builder S (Opus)
> Brief `ledger/pos-briefs/pos-brief-P1.8.md` (§2 R1–R10 · §7 CD1–CD8) · prompt `pos-prompt-accountB-P1.8-S.md` · oracle `scripts/qc-pos-p1.8.mts` (49 checks · **not edited**) · oracle notes `ledger/wo-notes/pos-P1.8-oracle.md`
> DB: QC4 only (`ep-frosty-lab`, neondb_owner) through `iso.sh → qc4.sh → with-gate-lock.sh` · typecheck through `/tmp/pos-gate.lock`

## ⚠️ ORACLE-EDIT? — P1.8-C2 (`docNo` clause only)

C2 requires the CREDIT_NOTE of the ฿85 refund to have `docNo === <POS CN number>` (`CN202610-0006`). This cannot hold in the oracle's own fixture:
- `AccountDocument` has `@@unique([systemId, docType, docNo])`.
- The oracle links units A, B, S, R, Q, Q2 to **one** POS (`POS-A`) and that POS to **one** book. R4/N1/N3 make the CN series **per unit** (unit B and unit Q both start at `CN${YYYYMM}-0001`; Q2 runs 0001–0010).
- So the same CN number exists on several units of one book. The queue books CNs in event order; unit Q's 6th refund (E5, `CN…-0006`) and Q2's `CN…-0006` are booked before unit A's 6th refund (RM1, `CN…-0006`). The DB forbids a second `CREDIT_NOTE CN…-0006` in that book.
- The builder follows the existing ABB rule (`upsertExternalSaleDocument`: "POS receipt number when it is free in the book, else `docNo` null"). Run result: `actual docNo null ≠ CN202610-0006`. Every other C2 clause passes: 1 CN, `sourceDocId` = ABB, grand 8,500, VAT 556, JV 1000 −8,500 · 4000 +7,944 · 2200 +556 · 1100 0, sale JV not reversed.
- Suggested oracle fix (controller): accept `docNo === receiptNo` **or** (`docNo === null` **and** another `CREDIT_NOTE` in the same book already holds `receiptNo`). Alternatives need a ruling: per-unit CN prefixes (spec defers per-device prefixes to P3.4), or a CN account number that differs from the POS number.
- The same collision already exists today for ABB documents of multi-branch POS (receipt numbers are per unit). Logged as follow-up F1.

## 1. Files

| file | new/changed | what |
|---|---|---|
| `prisma/schema/pos.prisma` | changed | enum `PosSaleDocType {SALE REFUND}` · `PosSale.docType @default(SALE)` · `refSaleId String?` · `refundedSatang Int @default(0)` · `reasonCode String?` · `PosSaleLine.refLineId String?` · `restock Boolean?` · model `PosDocCounter` `@@unique([unitId, docType, period])` (no FK, no index on refSaleId) |
| `prisma/migrations/20261128000000_pos_p18_refund/migration.sql` | new | additive (see §2) |
| `src/lib/core/scope.ts` | changed | `PosDocCounter: unit` (placed at the head of MODULE_SCOPES — the P1.9 note: oracle comment stripper eats everything after the M2.9 comment) |
| `scripts/pos-qc-env.mts` | changed | `posDocCounter` moved from `POS_FUTURE_MODELS` to `POS_MODELS` |
| `src/lib/modules/pos/refund-math.ts` | new | pure: `allocateBillDiscount` (moved from account-bridge, byte-identical logic) · `halfUpDiv` · `lineNets` · `refundLineAmount` · `refundServiceCharge` |
| `src/lib/modules/pos/refund-shared.ts` | new | types + constants (no prisma — client-safe for P1.16) |
| `src/lib/modules/pos/refund.ts` | new | `refundSale` (R5/R6) · `saleForRefund` (R9) · `REFUND_PERMISSION` |
| `src/lib/modules/pos/refund-actions.ts` | new | `"use server"` · `refundSaleAction` · `saleForRefundAction` (session → assertCan → service · refusal as data · `revalidatePath` · `unstable_rethrow`) |
| `src/lib/modules/pos/refund-consumer.ts` | new | `posSaleRefunded` handler (R7) |
| `src/lib/outbox-consumers.ts` | changed (+2 lines, hot file) | `"pos.sale.refunded": withAutomation(async (evt) => (await import("@/lib/modules/pos/refund-consumer")).posSaleRefunded(evt))` (dynamic import — refund-consumer → pos/service → scheduleDrain would cycle) |
| `src/lib/modules/pos/account-bridge.ts` | changed | uses shared `allocateBillDiscount` · new `bridgePosSaleRefunded` |
| `src/lib/modules/account/index.ts` | changed | facade `applyExternalRefund` · `posSaleAccountingRef` (read) |
| `src/lib/modules/account/service.ts` | changed | `EXTERNAL_REFUND_DOC_TYPE` · `findExternalSaleDoc` · `upsertExternalCreditNoteDocument` |
| `src/lib/modules/account/gl.ts` | changed | `postExternalRefund` (Dr 4000/4030 + Dr 2200 · Cr 1000/1010 · key `PosSale#<refundSaleId>#REFUNDED`) |
| `src/lib/modules/point/lots.ts` · `point/index.ts` | changed | `reversePartialEarn` (+ facade export) · `reverseWithLots` reverses only the EARN remainder after partial reversals (CD2) · per-ref advisory lock shared by both |
| `src/lib/member-bridges.ts` | changed | `onPosSaleRefunded` · `onPosSalePaid`/`saleStillPaid` treat `REFUNDED` as a purchase (never the void path) |
| `src/lib/modules/pos/service.ts` | changed | `voidSale` HAS_REFUNDS (CD1) + refuses REFUND docs + conditional update · readers (§5) · `PosSaleErrorCode` + `HAS_REFUNDS` |
| `src/lib/modules/pos/shift.ts` | changed | `computeReport`/`offShiftCash` (R8) |
| `src/lib/modules/pos/reports.ts` | changed | P1.17 readers (§5) |
| `src/lib/modules/pos/register.ts` | changed | pending-stock SQL `docType = 'SALE'` · HAS_REFUNDS type guard in the createSale refusal map |
| `src/lib/core/permissions.ts` | changed | `pos.sale.refund` (Thai label) next to `pos.sale.void` |
| `src/messages/{th,en}/pos.json` | changed | `pos.refund.errors.*` (11 codes + hasRefunds + unknown) |
| `src/lib/automation/labels.ts` | changed | `pos.sale.refunded` trigger label |
| `src/lib/ui/status-labels.ts` | changed | POS labels `REFUNDED` · `REFUND` |
| legacy pages `sys/[id]/page.tsx` · `pos/sales/page.tsx` · `pos/close/page.tsx` | changed | net totals, refund rows negative with a chip |
| `src/lib/dashboard/{service,widgets}.ts` · `ai/analyst.ts` · `ai/dna-review.ts` · `app/api/v1/sales/route.ts` · `member/reports.ts` · `reports/service.ts` | changed | reader verdicts (§5) |
| `docs/modules/14-pos.md` §7.6 rows 1–3 | changed | "P1.8 ruling (CD8)" notes |

## 2. Migration (QC4 only · additive)

`prisma/migrations/20261128000000_pos_p18_refund/migration.sql` = `SET lock_timeout = '3s'` + verbatim `prisma migrate diff --from-schema <schema at 7c479596> --to-schema prisma/schema --script`:
- `CREATE TYPE "PosSaleDocType" AS ENUM ('SALE','REFUND')` (new type ⇒ no `ALTER TYPE … ADD VALUE`)
- `ALTER TABLE "PosSale" ADD COLUMN "docType" … NOT NULL DEFAULT 'SALE'`, `"reasonCode" TEXT`, `"refSaleId" TEXT`, `"refundedSatang" INTEGER NOT NULL DEFAULT 0` (constant defaults ⇒ catalog-only on PG ≥ 11)
- `ALTER TABLE "PosSaleLine" ADD COLUMN "refLineId" TEXT`, `"restock" BOOLEAN`
- `CREATE TABLE "PosDocCounter" (id, tenantId, unitId, docType, period, seq DEFAULT 0, PK)` + `CREATE UNIQUE INDEX "PosDocCounter_unitId_docType_period_key"`
- No DROP / RENAME / SET NOT NULL / FK / index on `refSaleId`/`refLineId` (P6.1 adds the index CONCURRENTLY).
- The diff taken straight from QC4 (`--from-config-datasource`) also proposed `DROP INDEX` ×3 of CRM hand-made indexes (`CrmContact_previousEmails_idx`, `CrmContact_systemId_createdAt_id_idx`, `CustomRecord_objectId_createdAt_id_idx`, migration `20261103000000_crm_perf_indexes` exists only in the DB) — **not** included.
- `migrate status` on QC4 before: only `20261128000000_pos_p18_refund` pending (+ the CRM DB-only migration). `migrate deploy` (iso → qc4 → gate lock): applied, exit 0. `pnpm exec prisma generate` in this tree: client has `posDocCounter` + the 6 columns. Never `migrate dev/reset`, never `db push`.
- R4 deviation (brief): SALE receipts stay on `PosReceiptCounter` (`YYYYMM-NNNN`); moving them into `PosDocCounter` is deferred to P1.10/P6.1 — no SALE row is ever written to `PosDocCounter` (N1 asserts it).

## 3. What was built (per step)

### Step 1 — shared money helpers (`refund-math.ts`)
- `allocateBillDiscount` moved out of `account-bridge.ts` (same largest-remainder code; the bridge imports it). `lineNets(lineTotals, SC, grand)`: D = Σ lineTotal + SC − grand, spread over product lines by lineTotal (SC not spread). `refundLineAmount` = half-up(net × q / Q), last unit takes `net − Σ refunded` (CD5). `refundServiceCharge` = half-up(SC × refunded lines / Σ nets), the refund that completes the bill takes `SC − Σ SC refunded` (CD4). VAT = `splitIncludedVat(grand, rate)` at document level.

### Step 2 — `refund.ts`
`refundSale(ctx: RegisterCtx, actor: RegisterActor, input: RefundSaleInput, client?: PrismaClient)`:
1. Scope: AppSystem(POS) of the tenant, unit linked to that POS, actor can access the unit (else `SALE_NOT_FOUND`) · `pos.sale.refund` via `evaluate` (OWNER/MANAGER by role, STAFF only with the key) else `NO_PERMISSION`.
2. Shape (no DB): `REASON_REQUIRED` (missing code / OTHER + blank) · `VALIDATION` (unknown code, reason > 200, qty not integer ≥ 1, dup lineId, bad restock/reference/deviceId) · `REFUND_EMPTY` · `REFUND_METHOD_INVALID` (DEPOSIT/ROOM_CHARGE).
3. Device shift (pre-tx `resolveRegisterShift`, same rule as the register).
4. Tx (timeout 20 s): advisory lock (tenant, key) → idempotency (same payload ⇒ stored refund `duplicated:true`; other payload or a SALE doc holding the key ⇒ `IDEMPOTENCY_CONFLICT`) → unlocked eligibility read (`SALE_NOT_FOUND` / `SALE_NOT_REFUNDABLE` for REFUND doc, VOIDED, REFUNDED, gift-card sale) → **`SELECT … FOR UPDATE`** on the bill → after the lock a bill that became REFUNDED meanwhile falls through to the quantity check (`REFUND_EXCEEDS` for the race loser, R1) → line ids must belong to the bill (`VALIDATION`) → remaining qty from prior REFUND docs (`REFUND_EXCEEDS`) → amounts → `PAYMENT_MISMATCH` → shift `FOR SHARE` re-check, CASH without an open shift while `pos.shift.required.register` ⇒ `SHIFT_REQUIRED` → VAT → CN number (`INSERT … ON CONFLICT (unitId, docType, period) DO UPDATE SET seq = seq + 1 RETURNING seq` — 10 parallel first refunds do not collide, N3) → REFUND PosSale (+ lines with `refLineId`/`restock`, copies of itemId/productId/serviceId/weightGrams, `unitPrice × qty − discount = lineTotal`, discount never negative) + payments → original `refundedSatang += grand`, `REFUNDED` when every line is fully refunded → coupons released only on full refund → outbox `pos.sale.refunded` (key `PosSale#<refundSaleId>#REFUNDED`) → `AuditLog` row `pos.sale.refund` in the same tx (POS pattern of stock-count/held-cart).
5. Unexpected errors ⇒ `{ok:false, code:"UNKNOWN"}` (never thrown).
- REFUND document: `memberId` **null** and `sourceId` **null** on purpose (every member-scoped / source-scoped reader stays blind to refunds — see §5); `sourceModule` copied; `soldByUserId` = refunder; `note` = reason; `reasonCode`; `tipSatang` 0; `subtotal = Σ lines`, `discount 0`, `SC part` ⇒ `subtotal − discount + SC = grand`.
- `voidSale` (CD1): REFUND docs refused like non-PAID bills; `refundedSatang > 0` ⇒ `PosSaleError("HAS_REFUNDS", "บิลนี้มีการคืนเงินแล้ว — ยกเลิกทั้งใบไม่ได้ ใช้การคืนเงินส่วนที่เหลือแทน")` before any write; the VOIDED flip is now `updateMany where {status PAID, refundedSatang 0}` so a refund committing in between cannot be overwritten. Signature unchanged.

### Step 3 — `refund-actions.ts`
`refundSaleAction({systemId, unitId, deviceId?, refund})` · `saleForRefundAction({systemId, unitId, deviceId?, saleId})`: `requireTenant` (redirects rethrown) → unit access → `assertCan` (`pos.sale.refund`; read: `pos.sale.refund` or `pos.sale.create`) → service; `revalidatePath("/app/sys/<id>/pos", "layout")` after a refund. Fitness F6.1 needed the `assertCan` (pre-commit caught it on the first try).

### Step 4 — consumer chain (`refund-consumer.ts` + bridges)
0. If the bill's `pos.sale.paid` event is still PENDING ⇒ throw (queue retries) so accounting/member always see the sale before the refund.
1. Account: `bridgePosSalePaid` for the original bill first (idempotent no-op normally; covers a bill fully refunded before its `pos.sale.paid` ran — `posSalePaid` skips non-PAID bills, which would leave a CN without its sale) → `bridgePosSaleRefunded` → `account.applyExternalRefund`: unlinked ⇒ `{posted:false, reason:"unlinked"}` (no throw); JV `postExternalRefund` (base/VAT by `splitIncludedVat`, service share → 4030, cash → 1000, others → 1010); CREDIT_NOTE (`status PAID`, `refType PosSale`, `refId` = refundSaleId, `sourceDocId` = ABB, contact from ABB, `adjustReason` = reason, `docNo` = CN number when free in the book else null). No GL from the document itself (never goes through `issueDocument/postDocument`, which would credit 1100). ABB is never voided (CD6).
2. Stock (O12): lines with `restock === true` → parts = `lineConsumption` of the original line scaled to the refunded qty (weighed = original grams, bundle = component qty × refunded sets) → `inventory.receive` at the **original OUT movement's** `costSatang`, key `pos-refund-<refundSaleId>-<refundLineId>[-<invItemId>]`, sourceModule POS (inventory bridge posts Dr1200/Cr5000). No OUT movement ⇒ nothing to return. `restock:false/null` ⇒ no movement. Failure ⇒ logged (HF-INV-1 style) and the event retries.
3. Member (`member-bridges.onPosSaleRefunded`, WARN on failure): partial ⇒ `point.reversePartialEarn` (floor(earned × refund / original grandTotal), key `pos-refund-<refundSaleId>:<earnId>`, BURN untouched); full ⇒ `member.releaseOnVoid` (vouchers, BURN restore, gift-card uses, EARN **remainder** — `reverseWithLots` now subtracts partial reversals ⇒ bill nets to 0, CD2) + `stamp.voidStampsForSale`; spend `recordSpend(−refund)` behind a `pos/REFUND` activity flag per refund doc (only if the bill's PURCHASE flag exists); then `evaluateAndApply`.
4. CRM/kanban bridges: not touched (CRM-hot) — follow-up F3.

### Step 5 — readers (R3) — table §5
### Step 6 — spec rows (CD8): `docs/modules/14-pos.md` §7.6 rows 1–3 carry a "P1.8 ruling (CD8)" note each.

## 4. Contract for P1.16 (bills page)

Actions (`src/lib/modules/pos/refund-actions.ts`, types in `refund-shared.ts`):
- `refundSaleAction({ systemId, unitId, deviceId?, refund: RefundSaleInput }) → RefundSaleResult`
  - `RefundSaleInput = { saleId, lines: [{ lineId, qty, restock? }], payMethods: [{ type: "CASH"|"TRANSFER"|"PROMPTPAY"|"CARD", amountSatang, reference? }], reasonCode: "DAMAGED"|"WRONG_ITEM"|"CHANGED_MIND"|"OTHER", reason?: ≤200, deviceId?, idempotencyKey }`
  - ok: `{ ok:true, refund: { id, receiptNo, saleId, status, subtotalSatang, serviceChargeSatang, vatSatang, grandTotalSatang, reasonCode, reason, shiftId, soldByUserId, createdAt, lines:[{ id, refLineId, name, qty, unitPriceSatang, discountSatang, lineTotalSatang, restock }], payments:[{ type, amountSatang, reference }] }, sale: { id, status, refundedSatang }, duplicated?: true }`
  - refusal: `{ ok:false, code, message }` — codes `NO_PERMISSION SALE_NOT_FOUND SALE_NOT_REFUNDABLE REFUND_EXCEEDS REFUND_EMPTY PAYMENT_MISMATCH REFUND_METHOD_INVALID SHIFT_REQUIRED REASON_REQUIRED IDEMPOTENCY_CONFLICT VALIDATION UNKNOWN`; message keys `pos.refund.errors.<camel>` (`REFUND_ERROR_KEYS`), plus `hasRefunds` for `voidSale` and `unknown`.
  - UNKNOWN = "not sure it was saved": retry with the **same key + payload**.
- `saleForRefundAction({ systemId, unitId, saleId }) → SaleForRefundResult`
  - `{ ok:true, sale: { id, receiptNo, status, sourceModule, createdAt, grandTotalSatang, refundedSatang, serviceChargeSatang, serviceChargeRefundedSatang, tipSatang, vatSatang, netTotalSatang, shiftId, refundable, notRefundableCode }, lines: [{ lineId, name, qty, unitPriceSatang, discountSatang, lineTotalSatang, netSatang, refundedQty, refundedSatang, refundableQty, itemId, productId, serviceId, weightGrams, isBundle, stocked }], payments: [{ type, amountSatang, reference }], refunds: [{ id, receiptNo, grandTotalSatang, createdAt, reasonCode, reason, soldByUserId }], member: { memberId, pointsEarned } | null, accounting: { docId, docNo } | null, canRefund }`
  - The UI can price a draft refund client-side with `refund-math.ts` (`refundLineAmount(netSatang, qty, refundedQty, refundedSatang, q)` + `refundServiceCharge(serviceChargeSatang, Σ, netTotalSatang, serviceChargeRefundedSatang, full)`); the server recomputes and refuses `PAYMENT_MISMATCH` on any difference.
  - `stocked` = default for the "รับของคืน" tick (Q3); weighed lines (`weightGrams`) refund whole (qty 1).
- Service functions (for API v1 / AI later): `refundSale(ctx, actor, input, client?)`, `saleForRefund(ctx, actor, {saleId}, client?)` in `refund.ts`.
- Event `pos.sale.refunded` payload `{ saleId, refundSaleId, sourceModule, full, lines:[{ refLineId, qty, amountSatang, restock, itemId }], payMethods:[{ type, amountSatang }] }`; automation trigger label "เมื่อคืนเงิน (POS)".

## 5. Reader call-site table (R3)

Grep: `posSale.(findMany|findFirst|findUnique|count|aggregate|groupBy)` · `posSaleLine.(findMany|…)` · raw `FROM/JOIN "PosSale"` in `src/` (94 hits incl. the new files; `PosPayment` readers outside `pos/` = 0). Rule applied: a reader that **sums/counts sales by unit/system/date** must know `docType`; a reader **by id / idempotency key / memberId / sourceId** is unaffected because a REFUND doc is never referenced by id elsewhere and carries `memberId = null`, `sourceId = null`.

| site | verdict |
|---|---|
| `pos/service.ts` `daySummary` | **changed**: SALE docs not VOIDED (PAID + REFUNDED) count/gross − REFUND docs of the day (D1 −8,500 · D3 0) |
| `pos/service.ts` `listSales` | **changed**: `docType: "SALE"` (D1: no REFUND doc listed) |
| `pos/service.ts` `closeDaySummary` | **changed**: net = SALE (not VOIDED) − REFUND of the day · byMethod amounts net of refund payments (+ `refundCount/refundSatang` when present) · cash in drawer net · product/service/other buckets subtract refund lines · new `refundCount`, `refundTotalSatang` |
| `pos/service.ts` `closeDayBills` / `closeDayCsv` | **changed**: rows carry `docType`; CSV/close page show refund docs as negative "ใบคืนเงิน"; summary line "คืนเงิน" when any |
| `pos/service.ts` `saleStatusByKey`, `createSaleOnce` dup, `consumeSaleInventory`, `voidSale` | by key/id — unaffected (voidSale now refuses REFUND docs + HAS_REFUNDS) |
| `pos/shift.ts` `computeReport` (X/Z) | **changed** (R8): SALE docs = sales of the shift (REFUNDED still a sale) · REFUND docs bound to the shift ⇒ `cashRefundsSatang` = Σ CASH refund payments, `refundCount`, `refundSatang`, `byMethod[].refundCount/refundSatang` (only on methods with refunds) · expected subtracts cash refunds (H1 153,500) |
| `pos/shift.ts` `offShiftCash` | **changed**: REFUND docs off-shift = negative rows (D1 −8,500) |
| `pos/reports.ts` `loadSales` + all P1.17 reports | **changed**: loads SALE (PAID/VOIDED/REFUNDED) + REFUND docs; `paidOf` = SALE not VOIDED; `refundsOf` = REFUND. daily/card/overview: net = sales − refunds of the day, `refundCount/refundTotalSatang` filled, gross/SC/VAT net so `gross − discount + SC = net` still holds (D2). products/card top product: refund lines negative qty/grams/sales, not counted as lines/bills. staff: refunds subtract from the **original seller** (+ optional `refundCount/refundTotalSatang`). payments: amounts net of refund payments (+ optional refund fields), `salesSatang` net. margin: refund lines = negative revenue, cost = −(cost of goods actually restocked at the original cost); not restocked = cost stays (loss). tax: first/last receipt = sales only; per day+unit optional `refundCount/refundGrossSatang/refundVatSatang/refundReceiptNos` (+ totals). CSV headers unchanged. |
| `pos/report-overview.ts` | unaffected file — composes `reports.ts` (D2 asserts through it) |
| `pos/register.ts` `registerStatus` pending-stock raw SQL | **changed**: `docType = 'SALE'` (refund lines carry itemId but are never stock-cut) |
| `pos/register.ts` `regLoadSale` (by key) | unaffected |
| `pos/api/ops/sales.ts` void (by id) | unaffected — voidSale refuses REFUND docs |
| `pos/api/ops/reports.ts` | unaffected file — uses `closeDaySummary` (net) |
| `app/app/sys/[id]/pos/sales/page.tsx` (legacy history) | **changed**: total = SALE not VOIDED − REFUND in the list; refund rows negative + chip "ใบคืนเงิน" |
| `app/app/sys/[id]/page.tsx` (POS overview) | **changed**: lifetime total = SALE (PAID+REFUNDED) − REFUND aggregate; latest bills show refund rows negative + chip |
| `app/app/sys/[id]/pos/close/page.tsx` | **changed**: refund rows "(คืนเงิน)" negative |
| `app/api/v1/sales/route.ts` | **changed**: `docType: "SALE"` (refund API = HF-APIV1 follow-up) |
| `dashboard/service.ts` sales today · `dashboard/widgets.ts` salesToday/sales7d/billsToday | **changed**: SALE (PAID+REFUNDED), amount `grand − refundedSatang` (net by sale date, one query) |
| `ai/analyst.ts` 7-day sales | **changed**: same net-by-sale-date rule |
| `ai/dna-review.ts` paid count | **changed**: `docType: "SALE"` |
| `ai/tools.ts` ×5 (sales totals) | **not changed — CRM-hot file** (lane rule 6; brief R10 puts the AI tool out of scope). Today they count REFUND docs (status PAID) as sales ⇒ follow-up F2 for the CRM session: add `docType: "SALE"` (and `− refundedSatang` where net). |
| `ai/proposals.ts` void proposal (by id) | unaffected |
| `reports/service.ts` dataset `sales` | **changed**: `baseWhere { status: PAID, docType: SALE }` |
| `member/reports.ts` shop total aggregate | **changed**: `docType: "SALE"` (member-share denominator, gross like the member side) |
| `member/reports.ts` groupBy/raw SQL by memberId · `member/tiers.ts` · `member/sources.ts` · `member/referrals.ts` ×4 · `member/journeys.ts` ×4 · `member/privacy.ts` · `member/history.ts` ×2 · `member/reviews.ts` ×2 · `member/wallet.ts` | unaffected — filter by `memberId` or by sale id; REFUND docs have `memberId = null`. Spend/tier effect of a refund comes through `recordSpend(−refund)` (C7). Gross-by-member reports (tiers 12-month spend from PosSale) still show the original bill: follow-up F4 (member session) if they should net `refundedSatang`. |
| `member-bridges.ts` `loadSale`, `saleStillPaid`, `onShopOrderPaid` | by id — `onPosSalePaid`/`saleStillPaid` now treat REFUNDED as a purchase (never the void path, which would subtract the whole bill a second time) |
| `outbox-consumers.ts` `posSalePaid` / `posSaleVoided` | by id from `pos.sale.paid/voided` payloads — REFUND docs never emit them (C1 asserts 0). `posSalePaid` still skips non-PAID bills; the refund consumer re-applies the sale posting idempotently to cover a bill fully refunded before its paid event ran (no hot-file edit). |
| `platform/kanban-bridges.ts`, `kanban/link-resolvers.ts`, `crm/commissions.ts` ×2, `crm/payments.ts` ×3, `stamp/service.ts` ×3, `marketing/campaigns.ts` ×2, `giftcard/service.ts`, `hotel/service.ts`, `ticket/service.ts`, `shop/service.ts`, `booking/service.ts`, `clinic/service.ts`, `school/service.ts`, `rental/service.ts`, `restaurant/order.ts` void lookup, `actions/pos.ts` | by id / key — unaffected. CRM money (deal `paidSatang`) does not see partial refunds: follow-up F3 (CRM-hot). |
| `restaurant/order.ts` `billsToday` (sourceModule RESTAURANT by day) | unaffected — REFUND docs have `sourceId = null` and the function skips rows without `sourceId` |
| new `pos/refund.ts`, `pos/refund-consumer.ts` | doc-type aware by construction |

## 6. Side effect on other trees (controller: read this)

`node_modules` of this tree is bind-mounted into `/root/projects/shark-pos` (lane 1) and `/root/projects/shark-pos-b` (ro). After `prisma generate` the client knows `PosDocCounter`, and `src/lib/core/db.ts → assertRegistryComplete` in **base** code (no `PosDocCounter` in `scope.ts`) throws at load: `[scope] 1 model ในschema ยังไม่ได้ลงทะเบียน: PosDocCounter`. Seen here when running base suites. Any DB-touching command in those two trees fails until P1.8 (or at least its `scope.ts` line) is merged into `session/pos`. `shark-pos-c` (lane 2, p1.10) has its own node_modules and is unaffected. The "before" baseline below was run on base 7c479596 **plus that one uncommitted scope line** (reverted afterwards).

## 7. Follow-ups

| # | item | owner |
|---|---|---|
| F1 | ORACLE-EDIT? P1.8-C2 `docNo`: per-unit CN numbers collide inside one book (`AccountDocument @@unique([systemId, docType, docNo])`); same as ABB today. Needs either the oracle fix in the header or a numbering ruling (per-unit prefix · P3.4) | controller |
| F2 | `src/lib/ai/tools.ts` ×5 sales readers count REFUND docs (status PAID) as sales — add `docType: "SALE"` (and `− refundedSatang` where net). CRM-hot file, not touched | CRM session |
| F3 | CRM money/business bridges: no `pos.sale.refunded` consumer (deal `paidSatang`, commissions, timeline); CRM `onPosSalePaid` for a bill already REFUNDED | CRM session |
| F4 | Member gross readers (`member/tiers.ts` 12-month spend from PosSale, `member/reports.ts` by member) still show the original bill on a partial refund (`Customer.totalSpentSatang` is reduced) — decide whether to net `refundedSatang` | member owner |
| F5 | Index `PosSale(refSaleId)` (P6.1 CONCURRENTLY). Until then `priorRefunds` filters tenantId + unitId + docType + refSaleId (index prefix tenantId, unitId) | P6.1 |
| F6 | Gift-card-paid share of a bill (`giftCardTxnId`, counted as a member discount): a partial refund pays out only the cash share; the card is credited back only on a full refund (`releaseOnVoid`). Needs a ruling | controller/owner |
| F7 | Out of card (R10): store credit (Q1), gateway refunds (P1.7), approval/PIN (P1.15), printing CN (P1.10), bills page UI (P1.16), API v1 `POST /sales/:id/refund`, AI tool, moving the SALE counter into `PosDocCounter` | later cards |
| F8 | CN document VAT comes from `computeTotals` (as ABB); JV VAT = `splitIncludedVat(gross)`. Multi-line refunds may differ by a satang between document and JV (same as ABB today) | account owner |
| F9 | `posSalePaid` (hot file) still skips non-PAID bills; the refund consumer re-applies the sale posting (idempotent) so a bill fully refunded before its paid event still gets its sale JV/ABB — without the member contact on the ABB in that race | note |
| F10 | `scripts/pos-sale-contract.json` not refreshed (F15.2 green; info lines: 5 older additive fields + new `refundSale` caller `refund-actions.ts`) — controller may run `--update-pos-contract` at merge | controller |

## 8. Results (QC4 · 7–8 Oct 2026 UTC)

Oracle `qc-pos-p1.8` (49):
- forced #1 (before the R1 fix): 47/49 — R1 (race loser got `SALE_NOT_REFUNDABLE`; fixed: eligibility read before the lock, a bill that turns REFUNDED while waiting ⇒ `REFUND_EXCEEDS`) + C2 docNo.
- forced #2: `JSON_SUMMARY {"suite":"qc-pos-p1.8","total":49,"passed":48,"failed":["P1.8-C2"],"skipped":false,"forced":true,"missing":[],"a5":{"drift":[],"tempLeft":[]}}` · cleanup `314 ตาราง · เหลือ {} · Tenant 0`
- unforced: `JSON_SUMMARY {"suite":"qc-pos-p1.8","total":49,"passed":48,"failed":["P1.8-C2"],"skipped":false,"forced":false,"missing":[],"a5":{"drift":[],"tempLeft":[]}}`
- forced #3 (final HEAD code): `… "passed":48,"failed":["P1.8-C2"] …` · cleanup `314 ตาราง · เหลือ {} · Tenant 0` · Z1/Z2 green every run
- `--no-db` 9/9.
- Only red = C2 `docNo` clause (ORACLE-EDIT? at the top).

Money set + unchanged suites — before = base 7c479596 (+ the one-line scope registration needed to load the regenerated client, reverted) · after = this branch:

| suite | before | after | same |
|---|---|---|---|
| qc-pos-account | 0 · 16/16 | 0 · 16/16 | ✅ |
| qc-account-cpa | 0 · 107/107 | 0 · 107/107 | ✅ |
| qc-restaurant-money | 0 · 6/6 | 0 · 6/6 | ✅ |
| qc-shop-refund | 0 · 12/12 | 0 · 12/12 | ✅ |
| qc-hotel-money | 0 · 5/5 | 0 · 5/5 | ✅ |
| qc-ticket-money | 0 · 6/6 | 0 · 6/6 | ✅ |
| qc-subscription-money | 0 · 14/14 | 0 · 14/14 | ✅ |
| qc-pos-p1.3 | 0 · 128/128 | 0 · 128/128 | ✅ |
| qc-pos-p1.6 | 0 · 48/48 | 0 · 48/48 | ✅ |
| qc-pos-p1.9 | 0 · 53/53 | 0 · 53/53 | ✅ |
| qc-pos-p1.9b | 0 · 22/22 | 0 · 22/22 | ✅ |
| qc-pos-p1.14 | 0 · 30/30 | 0 · 30/30 | ✅ |
| qc-pos-p1.17 | 0 · 40/40 | 0 · 40/40 (first after-run 39/40: ST5 — the new staff "original seller" query lacked unitId/createdAt; fixed) | ✅ |
| qc-pos-p1.1 | 0 · 178/178 | 0 · 178/178 | ✅ |
| qc-hf-pos-page-authz | 0 · 56/56 | 0 · 56/56 (first after-run 55/56: O-2 matches the literal `where` of the overview total; restored the literal and net the total with one `groupBy`) | ✅ |
| qc-pos-closeday | 0 · 22/22 | 0 · 22/22 | ✅ |

No suite needed a fixture change; no assertion weakened.

Gates:
- `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → `TYPECHECK_EXIT 0` (final HEAD code)
- `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` → exit 0 · `JSON_SUMMARY {"total":41,"passed":41,"findings":[]}`
- `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` → exit 0 · `JSON_SUMMARY {"total":41,"passed":41,"findings":[]}`
- `pnpm exec tsx scripts/fitness-pos.mts` → `JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}` (F15.2 info: new `refundSale` caller `refund-actions.ts`)
- pre-commit fitness caught F6.1 once (`refund-actions.ts` without `assertCan`) → fixed before the commit.
- Not run (rules): `next build`, server, visual (no UI in this card), `qc-pos-p1.10` (lane 2).
