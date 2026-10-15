# POS P2.9b S — มัดจำเป็นวิธีชำระของ POS (รับ · ใช้ · คืนสภาพ · คืนเงิน · VAT ตอนรับเงิน)

Brief `ledger/pos-briefs/pos-brief-P2.9b.md` (§10 rulings 1–20 binding) · prompt `pos-prompt-accountB-P2.9b.md` · builder account B · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.9b` from the oracle branch `wip/pos-p2.9b-oracle` 6749b1b8, merged `origin/session/pos` (3fe3bcbc, then 501f78ab — ledger only).
Oracle `scripts/qc-pos-p2.9b.mts` (41 checks, oracle writer) · oracle notes `ledger/wo-notes/pos-P2.9b-oracle.md` (names table = the contract) · red-before `P2.9b-red.txt` (8/41).

## Status
- [x] 1 migration `20261211100000_pos_p29b_deposits` + `pos.prisma` + `core/scope.ts` + `scripts/pos-qc-env.mts` (5e99d600) · scope entries moved to the registry head (73ca0345, see deviation 1) · **applied on QC4** (`prisma migrate deploy`: "Applying migration `20261211100000_pos_p29b_deposits` … All migrations have been successfully applied." · host ep-frosty-lab · 178 migrations) · `prisma generate` in tree b.
- [x] 3 apply inside `createSale` + register `{DEPOSIT, depositId}` + codes/messages + `voidSale` guard + `regCreateSale` read-only export (fa90d5b9)
- [x] 4 GL facades + document layer + bridge branch (22ef90f8)
- [x] 2/6 `pos/deposit.ts` receive · lookup · refund-deposit · void restore + setting + `registerPayTenders.deposit` (f545d43a, 759cbfc0)
- [x] 5 reversal: `outbox-consumers.ts` try-block · `refund-consumer.ts` branch · one pure `refundTenderCaps` (00e749e7)
- [x] 7 readers: receipt title/lines · bill detail links · close-day `deposits` block (4091f9ab + close-day in fa90d5b9)
- [x] 9 ORACLE-EDIT `qc-pos-p2.9` ST1 `:275` (50d523c7) — R2 `:1786` not edited (stays green)
- [x] 10 owner lines `POS-OWNER-PENDING.md` (P2.9b section + CD7 extension of the "P2.9 (มติ 6)" line) + these notes
- [x] 11 merge `origin/session/pos` → final gates (table below)
- [x] **CD-P29b-1 APPROVED** by the controller (15 Oct) → applied as ORACLE-EDIT 180bd51a · re-run below.

## ORACLE-EDITs (own `test(...)` commits, dated marker `// ORACLE-EDIT ผู้คุม 15 ต.ค. …`)
1. `qc-pos-p2.9` ST1 `:275` — PosDeposit now exists (P2.9b migration); PosPayment.depositId still forbidden (50d523c7 · ruling 10).
2. `qc-pos-p2.9b` `regSubmit` (`:801`, used by P1) — CASH row carries `cashReceivedSatang` (180bd51a · CD-P29b-1 approved).

## Follow-ups
- **Oracle maintenance**: oracle ST2 comment-stripping swallows the middle of `scope.ts` (`stripComments` treats the `` `/m/*` `` inside an M2.9 line comment as a block-comment start, so the whole middle of MODULE_SCOPES is invisible) — P2.9b entries sit at the head of MODULE_SCOPES; fix the stripper (strip line comments first) in a later oracle pass.
- Refund-deposit approval queue (POS_REFUND) not wired — owner line in `POS-OWNER-PENDING.md` (P2.9b section).

## CONTROLLER-DECISION CD-P29b-1 (✅ APPROVED 15 Oct · applied 180bd51a) — oracle `qc-pos-p2.9b` P1 fixture sends a CASH row without `cashReceivedSatang`
**What**: P1 submits `submitRegisterSale` with `[{DEPOSIT, 107000, depositId}, {CASH, 43000}]` and no `cashReceivedSatang`. The register refuses every CASH row without the cash received **before** looking at anything else (`register.ts` submit ⑤ "R4 K4 · มติ R4.1 ข้อ 3" — `PAYMENT_MISMATCH "เงินที่รับน้อยกว่าส่วนที่จ่ายเงินสด"`, pinned by `qc-pos-p1.6`). So P1 can never pass whatever P2.9b does. The run shows `หน้าขาย → PAYMENT_MISMATCH เงินที่รับน้อยกว่าส่วนที่จ่ายเงินสด`.
**Not done**: the prompt allows ORACLE-EDITs only for `qc-pos-p2.9` ST1/R2 ("any other red pin = CONTROLLER-DECISION, do not edit"), so the oracle file is unchanged.
**Proposed ORACLE-EDIT** (`ledger/wo-notes/P2.9b-CD-oracle-P1-cash.patch`, `git apply --check` OK on this head): the oracle's `regSubmit` helper sends `cashReceivedSatang` = Σ of its CASH rows when there is one (only P1 has a CASH row; P4/P5/C3 register calls are deposit-only, unchanged).
**Evidence**: patch applied locally → `qc-pos-p2.9b` forced **41/41** (`scratchpad/p29b/runs/p29b-run2-cdpatch.log`, residue 0, guardHits 0) → reverted (`git checkout scripts/qc-pos-p2.9b.mts`). Without it: 40/41 (P1 only).
**Apply**: `git -C <tree> apply ledger/wo-notes/P2.9b-CD-oracle-P1-cash.patch` → own `test(qc-pos-p2.9b)` commit with the dated marker → re-run p2.9b ×2 + unforced.

## Hunks (file:line at the final head; every hunk marked `// POS P2.9b ▸ … ◂`)
**Schema/migration**: `prisma/migrations/20261211100000_pos_p29b_deposits/migration.sql` (lock_timeout 3s · DO-block enums `PosDepositStatus` `PosDepositTxnType` · `CREATE TABLE IF NOT EXISTS "PosDeposit"` + CHECK `amount > 0 · vat ≥ 0 · used ≥ 0 · refunded ≥ 0 · used + refunded ≤ amount` · `"PosDepositTxn"` · uniques `(receiptSaleId)` `(tenantId, idempotencyKey)` txn `(idempotencyKey)` · indexes `(tenantId, unitId, status, createdAt)` `(tenantId, customerId)` txn `(depositId)` `(saleId)` · no FK · no ALTER of PosSale/PosPayment) · `prisma/schema/pos.prisma` (tail block) · `core/scope.ts:63` (`PosDeposit: sys()` · `PosDepositTxn: tenant`) · `scripts/pos-qc-env.mts:184`.
**pos/service.ts**: `:181` 4 codes in `PosSaleErrorCode` · `:262` `MAX_DEPOSIT_ROWS`/`POS_DEPOSIT_SOURCE` · `:290` `validateTenderRows` ref'd DEPOSIT rows (≤ 3 · distinct · ≥ 1 satang · not on MEMBER/POS_DEPOSIT bills) · `:402–475` `checkDeposit` (NOT_FOUND → CLOSED → NOT_OWNER → EXCEEDS) · `prepareSaleDeposits` (unlocked read before stock) · `lockSaleDeposits` (`FROM "PosDeposit" … ORDER BY id FOR UPDATE` + APPLY VAT split, BigInt half-up) · `depositVatLeft` (exported; Σ APPLY − RESTORE + REFUND VAT) · `useSaleDeposits` (conditional `"usedSatang" = "usedSatang" + x … WHERE status='OPEN' AND remaining ≥ x`, 0 rows = DEPOSIT_EXCEEDS · APPLY key `dep-apply-<saleId>-<depositId>`, paymentId) · `:504` samePayload bag `DEPOSIT|amount|refSaleId` (only when a ref exists) · `:722` dup select `refSaleId` · `:808` prepare call · `:855` lock **after** `lockTenderCards` + `billVat` · `:875`/`:976` vatSatang via `billVat` · `:987` ordered payment ids for deposit bills · `:1008` `useSaleDeposits` · `:1388` `voidSale` POS_DEPOSIT guard (plain Error, like non-PAID) · `:1579–1737` close-day `deposits {receivedSatang, appliedSatang, refundedSatang}` + POS_DEPOSIT bills/refunds out of ยอดขาย/billCount/kind split (payments still in byMethod/cash).
**pos/register.ts**: `:421` import `MAX_DEPOSIT_ROWS` · `:616` 4 messages · `:1152` `REG_PAY_KEYS + depositId` · `:1689` `regPaySettings` + deposit · `:2095` parsed pay type `depositId/refSaleId` · `:2179` parse `{DEPOSIT, amountSatang, depositId}` (no depositId / reference / > 3 / duplicate = VALIDATION) · `:2407` `regSameSubmission` bag + deposit ref (N4) · `:2505` depositId → receipt (`tenant + unit`, else DEPOSIT_NOT_FOUND) before ① · `:2660` `refSaleId` into the createSale row · `:2725` `export { regCreateSale }` (ruling 18, no body change).
**pos/register-shared.ts**: `:23` `REGISTER_PAY_TYPES + DEPOSIT` · `:237` `RegisterRefusalCode` + 4 · `:441` `RegisterPayMethod.depositId?` · `:981` `REFUSAL_KEY` → `errors.depositNotFound/NotOwner/Exceeds/Closed`.
**pos/order.ts** `:1117` payOrder keeps refusing DEPOSIT (P6) · **PayDone.tsx** `:38` `DEPOSIT: "pay.deposit"` (type completeness only).
**pos/payment-settings.ts** `:34–170` `deposit {enabled}` (reader `pos.deposit.enabled === true` · writer `updatePosPaymentSettings(…, {deposit:{enabled}})`, OWNER) · **pos/tender.ts** `:69–96` `registerPayTenders.deposit = {visible:true, enabled:<setting>}` (+ `reason:"DISABLED"` when off).
**pos/deposit.ts** (new): `registerTakeDeposit` · `registerDepositLookup` · `registerRefundDeposit` · `depositSaleVoided` · `DEPOSIT_PAY_TYPES`. **pos/deposit-links.ts** (new, db-only reader): `paymentDeposits` (payment id → receipt no + remaining after that APPLY).
**pos/account-bridge.ts**: `:8` facade imports · `:63` `SaleForBridge.sourceModule/vatSatang` · `:110–118` POS_DEPOSIT branch → `bridgePosDepositReceipt` + applying bill `depositApplied` · `:171` `depositVatSatang/depositGrossSatang` into `applyExternalSale` · `:192–239` `bridgePosDepositReceipt` / `bridgePosDepositRefunded`.
**pos/refund-consumer.ts** `:19`, `:57` POS_DEPOSIT branch (receipt JV if missing · `bridgePosDepositRefunded` · return). **pos/refund-shared.ts** `:12` pure `refundTenderCaps` + `REFUND_CASH_LIKE` · **refund.ts** `:34`, `:382` and **refund-tenders.ts** `:10`, `:48` call it.
**outbox-consumers.ts** `:757` one try-block `depositSaleVoided` after `tenderSaleVoided` in `pos.sale.voided` (only hunk in the hot file).
**pos/receipt.ts** `:35 :204 :338 :351 :371` (deposit links · VAT base net of the deposit · `deposit` on payment rows · `depositReceipt`) · **receipt-render.ts** `:61 :79 :124 :172 :217 :277 :280 :406 :595` (label `depositReceipt` th/en · title "ใบรับเงินมัดจำ" + " / ใบกำกับภาษีอย่างย่อ" when ABB · row "มัดจำ #<receiptNo>" + "คงเหลือ") · **bills.ts** `:25 :357 :516` + **bills-shared.ts** `:132` (`payments[].deposit {depositId, receiptNo, remainingAfterSatang}`).
**account (marked additive, owner line each)**: `account/index.ts:86` gl imports · `:148–220` `applyExternalSale.depositVatSatang?/depositGrossSatang?` (Dr 2110 lines cut by deposit VAT · Cr 2200 = VAT − deposit VAT · doc `depositDeductedSatang`) · `:295–426` `applyExternalDepositReceipt` / `applyExternalDepositRefund` · `account/gl.ts:1838–1880` `postExternalDepositReceipt` (key `PosSale#<receipt>#PAID`) / `postExternalDepositRefund` (key `PosSale#<refund>#REFUNDED`) · `account/service.ts:5029–5118` `upsertExternalSaleDocument` + `depositReceipt?` (doc type DEPOSIT_RECEIPT, status PAID) `vatSatang?` `depositDeductedSatang?` `depositVatSatang?`.
**messages** th/en: `register.errors.depositNotFound/NotOwner/Exceeds/Closed` (en no Thai) · `register.pay.deposit` · `report.closeDay.depositReceived/depositApplied` (`shift.method.DEPOSIT` / `receipt.public.pay.DEPOSIT` already existed).

## Registries (ruling 18 · §7)
Receipt bill + CN go through `regCreateSale` / the CN path inside `deposit.ts` — no new `createSale(` call site: oracle L2 green (= base e7b05787 per file) · `qc-pos-p1.6` U4 19/16 and `qc-hf-tx` HT6.4 in the gate table. `regCreateSale(…, callerTx(tx))` in `deposit.ts` (HT6.1 accepts `callerTx(` as the 2nd argument). Contract `scripts/pos-sale-contract.json` unchanged (L1 sha `72afb258…`, F15.2).

## Deviations (ruling refs)
1. **scope.ts placement**: the oracle's `stripComments` eats everything between a `/*` inside an M2.9 line comment (`` `/m/*` `` at scope.ts ~:298) and the next `*/` — the whole MODULE_SCOPES middle, so entries placed beside `PosTableSplit` are invisible to ST2. Moved to the head of MODULE_SCOPES next to `PosDocCounter` (same reason as PosShift, comment says so). No oracle edit.
2. **Receive idempotency keys**: `PosDeposit.idempotencyKey = "dep:" + client key` · receipt bill key `dep-rcv:<key>` · RECEIVE txn `dep-receive-<depositId>` · refund bill key `dep-ref:<key>` · REFUND txn `dep-refund-<refundSaleId>` (names table: builder's choice).
3. **pi_ intents on receive** (prompt "pi_ intents as today"): PROMPTPAY/CARD rows with a `pi_…` reference lock + consume the intent in the same tx (`lockSaleIntents` / `consumeSaleIntents`, as `regSubmitWithIntents`). Refund-deposit refuses `pi_` references (money out). Manual PromptPay/card on receive follows the HF-PP `manualConfirmRequiresManager` rule like the register.
4. **Refund-deposit approval path** (ruling 5 "pos.sale.refund or the P1.8 manager PIN/approval path"): `pos.sale.refund` or manager PIN (`verifyManagerPin`, PIN holder must have `pos.sale.refund`, audit `via:"pin_override"`). The POS_REFUND approval queue (`submitPosApproval` → consumer) is **not** wired for deposits (it targets sale lines); owner/U card can add it. No oracle check.
5. **Refusal codes of refund-deposit** (ruling 17): `PERMISSION_DENIED` · `REASON_REQUIRED` · `VALIDATION` (non-cash-like or Σ ≠ remaining) · `DEPOSIT_CLOSED` (used up / refunded; checked under the row lock, before the amount rule) · `DEPOSIT_NOT_FOUND` (other unit/tenant).
6. **Receipt bill status after a full refund of an unused deposit** = REFUNDED (`refundedSatang` += refund on every deposit refund; partial = PAID). The receipt's JV is still posted by the refund consumer when pos.sale.paid skipped it (F8 pattern).
7. **Document layer of the receipt + CN is created whenever the POS is linked** (not gated by `posAbbreviatedInvoice`, unlike the sale ABB): the DEPOSIT_RECEIPT is the tax document of the advance payment. Title in the doc note: "ใบรับเงินมัดจำ/ใบกำกับภาษีอย่างย่อ" when VAT + ABB, else "ใบรับเงินมัดจำ" (ruling 3). CN `contactId` null (`findDocByRef` returns id only).
8. **Applying bill VAT clamp**: `PosSale.vatSatang = max(0, VAT(grand) − Σ APPLY VAT)`; facade `depositVat = min(depositVat, VAT, Σ DEPOSIT rows)` and 0 when the book is not VAT-registered — JV always balances. APPLY VAT never exceeds the deposit's remaining VAT.
9. **Close-day**: POS_DEPOSIT receipts and their refunds are out of `netSalesSatang`, `billCount`, `refundCount/TotalSatang` and the product/service/other split; they stay in `byMethod` / `cashInDrawerSatang` (real cash). Block `deposits {receivedSatang, appliedSatang, refundedSatang}` (oracle names the first two; `refundedSatang` additive).
10. **Lookup** (ruling 19): exact receipt no · name prefix (case-insensitive) · `phoneLast4` (new nullable column, not in the oracle's spec list — ST1 checks listed fields only) · unit-scoped · max 20 · member deposits carry the member's name and masked phone as snapshot.
11. **Setting off** (ruling 14): receive = VALIDATION before any row; apply/refund of existing deposits stay allowed (owner line).
12. **VAT base on the receipt of an applying bill** = grand − applied deposit rows − net VAT (the deposit's VAT was on the deposit receipt); bills without deposit links print as before.

## P2.9bU contract (server side for the U card · brief §9)
Actions are not added in S (U card adds `*-actions.ts` thin wrappers like `register-actions.ts`); call the module functions below. All refusals = `{ok:false, code, message}`; screen text via `refusalMessageKey(code)` → `pos.register.errors.*`.
- **Pay dialog tile** `registerPayTenders(ctx, actor)` → `tenders.deposit = {visible:true, enabled:boolean, reason?:"DISABLED"}` (testid `pos-reg-paydlg-method-deposit` kept; `enabled:false` = setting off — existing deposits can still be applied from the bill detail/lookup if the U card chooses; server accepts them).
- **Pick sheet** `registerDepositLookup(ctx, actor, {query})` → `{ok, deposits:[{id, receiptNo, customerName, phoneMasked, remainingSatang, status, expiresAt, amountSatang, memberLinked}]}` · refusals `PERMISSION_DENIED` · `VALIDATION` (empty/>60). Default amount = min(remaining due, `remainingSatang`).
- **Apply** = `submitRegisterSale` pay row `{type:"DEPOSIT", amountSatang, depositId}` (≤ 3 deposits · each once · no reference) — refusals `DEPOSIT_NOT_FOUND` · `DEPOSIT_NOT_OWNER` · `DEPOSIT_EXCEEDS` (race — re-lookup) · `DEPOSIT_CLOSED` · `VALIDATION` · tip never from a deposit (VALIDATION). Done screen: `PayDone` label `pay.deposit`.
- **Receive** `registerTakeDeposit(ctx (+deviceId), actor, {amountSatang, payMethods:[{type: CASH|PROMPTPAY|TRANSFER|CARD, amountSatang, reference?}], memberId?, customerName?, phone?, note?, cashReceivedSatang?, idempotencyKey})` → `{ok, deposit: DepositView, receiptNo, changeSatang, duplicated?}` · refusals `VALIDATION` (incl. setting off) · `PERMISSION_DENIED` · `NOT_FOUND` · `PAYMENT_MISMATCH` · `PHONE_INVALID` · `MEMBER_NOT_FOUND` · `SHIFT_REQUIRED` · `DEVICE_REVOKED` · `IDEMPOTENCY_CONFLICT` · `INTENT_*`. Receipt preview: `receiptPayload(saleId = deposit.receiptSaleId)` → `payload.depositReceipt = true`, title "ใบรับเงินมัดจำ" (+ " / ใบกำกับภาษีอย่างย่อ").
- **Refund deposit** `registerRefundDeposit(ctx (+deviceId), actor, {depositId, payMethods (Σ = remaining, cash-like), reason, idempotencyKey, managerPin?, managerUserId?})` → `{ok, refund:{id, receiptNo (CN…), grandTotalSatang, vatSatang}, deposit, duplicated?}` · refusals `PERMISSION_DENIED` · `REASON_REQUIRED` · `VALIDATION` · `DEPOSIT_CLOSED` · `DEPOSIT_NOT_FOUND` · `PIN_INVALID/PIN_LOCKED/DEVICE_REVOKED` · `SHIFT_REQUIRED` (cash, shift required) · `IDEMPOTENCY_CONFLICT`.
- **Bill detail** `billDetail` → `payments[].deposit {depositId, receiptNo, remainingAfterSatang}` ("มัดจำ #… ฿x · คงเหลือ ฿y") · receipt bills are `sourceModule "POS_DEPOSIT"` (filter chip "มัดจำ"; void/refund buttons hidden — server refuses SALE_NOT_VOIDABLE / SALE_NOT_REFUNDABLE).
- **Close-day** `closeDaySummary(...).deposits {receivedSatang, appliedSatang, refundedSatang}` · labels `report.closeDay.depositReceived/depositApplied`.
- **Settings** `updatePosPaymentSettings(ctx, owner, {deposit:{enabled}})` · `posPaymentSettings().deposit.enabled` (OWNER only).
- Visual states to shoot (U card, brief §9): `paydlg-deposit-pick`, `paydlg-deposit-exceeds`, `-closed`, `-notowner`, `paydlg-deposit-split`, `deposit-receive`, `sale-done-deposit`, bills 12 filter + receipt row + `refund-deposit` sheet, receipt preview "ใบรับเงินมัดจำ".

## Gates (final)
All logs headed `tree=/root/projects/shark-pos-b head=3ec8c707 dirty=1` (dirty = this notes file, untracked at run time) · scratch `scratchpad/p29b/gates/out/*.out` · 15 Oct 03:0x–04:2xZ · 3ec8c707 = code 759cbfc0 + merge of `origin/session/pos` 501f78ab (ledger only).
| gate | result |
|---|---|
| typecheck (pos-gate.lock · 5632/6500M) | rc 0 |
| fitness no-env / env (qc4) | 50/50 · 50/50 |
| fitness-pos (F15.2 · contract sha unchanged) | 8/8 |
| qc-pos-p2.9b forced ×2 / unforced | **40/41 · 40/41 · 40/41** — only P1 (CD-P29b-1 oracle defect) · residue 0 · guardHits 0 · leaks 0 · with the CD patch **41/41** (`runs/p29b-run2-cdpatch.log`) |
| qc-pos-p2.9 (after ST1 ORACLE-EDIT) | 62/62 |
| qc-hf-tx | 22/22 (HT6.4 registry 19/16 unchanged) |
| qc-pos-p1.6 | 48/48 (U4 registry unchanged) |
| qc-pos-p1.8 | 49/49 |
| qc-pos-p1.12 | 72/72 |
| qc-pos-p1.3 | 128/128 |
| qc-pos-p1.1 | 180/180 |
| qc-pos-account | 16/16 |
| qc-account-cpa | 107/107 |
| qc-pos-p2.5 | 49/49 (PAR 3/3) |
| qc-pos-p2.4 | 50/50 |
| qc-pos-p2.6 | 67/67 |
| qc-pos-p2.8 | 60/61 — ST6 red = wip-only pin (register.ts/service.ts touched; prompt: "ST6/L2 wip-only") |
| qc-booking-deposit / qc-hotel-public / qc-rental-public (legacy PAR) | 18/18 · 15/15 · 16/16 |
| qc-hf-pos-page-authz | 81/81 |

Next: controller rules CD-P29b-1 (apply the oracle patch) → hunter (money lane) → P2.9bU on a free tree. QC5 deploy of the migration = controller.
