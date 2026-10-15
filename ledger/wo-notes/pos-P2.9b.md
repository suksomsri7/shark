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

## Fix round 1 (controller rulings 1–7 · R1 MERGEABLE + money hunt D1–D5 · `ledger/wo-notes/pos-P2.9b-review.md`)
Oracle first: `test(qc-pos-p2.9b)` 3adb1e19 (ORACLE-ADD A7 X9 A8 R6 P8 P9 + ORACLE-EDIT `regDep` phoneLast4 / P7 name lookup) → red-before block 2 in `P2.9b-red.txt` = **38/47** (red = the 6 new + P4/C3 (register refused the new `phoneLast4` key) + P7) → code (one commit per ruling) → **47/47**.
| ruling / finding | commit | change |
|---|---|---|
| 1 · R1 F2 (1-satang 2110 drift on tiny deposits) | 65837d05 | `service.ts lockSaleDeposits`: APPLY VAT = last apply (x = remaining) ? all unreleased VAT : min(pro-rata, unreleased, `splitIncludedVat(x, bill rate)`) · facade `applyExternalSale`: deposit VAT above the bill's VAT lowers the revenue base (no clamp) ⇒ **invariant: Σ released VAT ≤ deposit VAT; unreleased satang stay on the deposit and leave with the final apply or the remainder refund; when the deposit closes Σ = VAT at receipt and 2110 nets 0** (A7) |
| 2 · hunt D1 (refund of a deposit-paid bill reversed too little VAT) | 57722a00 | `refund.ts`: bills with APPLY rows — basis = bill VAT + Σ APPLY VAT (= full-bill VAT); CN VAT = full ? basis − already reversed : min(half-up basis·refund/grand, basis − reversed); bills without APPLY = old path (X9) |
| 3 · hunt D2 (receipt never posted / VAT de-registered) | 29253342 | `account-bridge.ts ensureDepositReceiptsPosted`: referenced receipts with `posSalePosted === false` are posted first · `applyExternalDepositReceipt` posts the VAT recorded on the deposit and `applyExternalSale` deducts the recorded deposit VAT even when the book is no longer VAT-registered (excess lowers the base) (A8) |
| 4 · hunt D3 (X/Z + reports counted receipts as sales) | 8d8b847e | `shift.ts computeReport`: `billCount`/`salesTotalSatang` exclude POS_DEPOSIT (pay rows/cash unchanged) · `reports.ts`: daily + staff exclude POS_DEPOSIT receipts and their refunds (`notDeposit`) (R6) |
| 5 · hunt D4 (merged member's deposit stuck) | 6fddae0f | `service.ts depositOwnerIs` follows `Customer.mergedIntoId` ≤ 5 hops at apply · lookup `{memberId}` returns the member's + merged-in members' deposits (P8) |
| 6 · hunt D5 (bearer walk-in deposits guessable) | fbe92b5a | register pay row `phoneLast4` (DEPOSIT only, 4 digits) — walk-in deposit with a recorded phone ⇒ must match, else `DEPOSIT_NOT_OWNER` · lookup: query ≥ 3 characters · name/phone search rows have `remainingSatang/amountSatang = null` · balance only for an exact receipt no (+ correct last 4 when the deposit has a phone) or a member search · `needsPhoneLast4` flag · deposits without a phone stay bearer by receipt no (owner line) (P9) |
Count note: the controller message says 48 — the oracle has 41 + A7 X9 A8 R6 P8 P9 = **47** (the CD-P29b-1 fix is an edit of P1, not a new check).

## Fix round 2 (controller rulings 1–6 · R2 MERGEABLE + hunter re-check N1 N2 + D3 leftover)
Oracle first: `test(qc-pos-p2.9b)` d5ed3a9e (ORACLE-ADD P10 A9 P11 + ORACLE-EDIT R6 deposit refund in the shift) → red-before block 3 in `P2.9b-red.txt` = **46/50** (red = P10 A9 P11 + R6) → code → **50/50**.
| ruling / finding | commit | change |
|---|---|---|
| 1 · R2 F1 (lookup by member showed other members' balances) | 410ded79 | `deposit.ts` lookup: `holder` for member deposits only when the owner ∈ `mergedFamily(memberId)` (P10) |
| 2 · hunter N1 (VAT stranded when the last piece < unreleased VAT) | 86cc9163 · 7d38de9a | `service.ts lockSaleDeposits`: release = min(use, VATleft, max(cap, VATleft − (remaining − use))) ⇒ **VATleft ≤ remaining always** (the last use or the remainder refund closes it) · `applyExternalDepositRefund` posts the recorded unreleased VAT even after VAT de-registration (A9) |
| 3 · hunter N2 (last 4 visible in the masked phone · unlimited guesses) | 19c097e1 | walk-in deposits with a phone: stored/served `phoneMasked = <first 3>-xxx-xxxx` (readers re-mask older rows · `phoneLast4` never serialised) · `deposit-links.checkDepositPhone` = gift-card PIN reserve pattern (one `UPDATE … RETURNING` reserves a slot; 5th wrong sets a 15-min lock; correct resets only if not locked) used by the register and by the lookup (receipt no + last 4) · new code `DEPOSIT_LOCKED` (register union · `REFUSAL_KEY errors.depositLocked` · th/en) · migration `20261211110000_pos_p29b_deposit_phone_lock` (`phoneFailedCount`, `phoneLockedUntil` · ADD COLUMN IF NOT EXISTS · applied on QC4) (P11) |
| 4 · D3 leftover (X/Z counted deposit refunds) | 34fb3ebf | `shift.ts`: `refundCount/refundSatang` exclude POS_DEPOSIT refund docs · `cashRefundsSatang`/expected cash unchanged (R6 extended) |
| 5 · R2 F2 | ledger | owner line + P2.9bU contract line (phone required at take) |
| 6 · merge | 1513ed7c · 491ff89e | `origin/session/pos` 0bcf09fe (ledger only) then ed200e6c with **P2.11 S** (merge 744e4f35): auto-merged `receipt.ts` (P2.11 per-branch receipt identity + P2.9b deposit links/title — both kept), `reports.ts`, messages th/en · conflict only in `POS-OWNER-PENDING.md` (both sections kept) · no prisma change from P2.11 · gates add `qc-pos-p2.11` + `qc-pos-p1.17` |

## ORACLE-EDITs (own `test(...)` commits, dated marker `// ORACLE-EDIT ผู้คุม 15 ต.ค. …`)
1. `qc-pos-p2.9` ST1 `:275` — PosDeposit now exists (P2.9b migration); PosPayment.depositId still forbidden (50d523c7 · ruling 10).
2. `qc-pos-p2.9b` `regSubmit` (`:801`, used by P1) — CASH row carries `cashReceivedSatang` (180bd51a · CD-P29b-1 approved).
4. `qc-pos-p2.9b` fix 2 (d5ed3a9e): **ORACLE-ADD** P10 A9 P11 · **ORACLE-EDIT** R6 (deposit received + refunded in the shift ⇒ X refunds/sales/expected cash unchanged) — dated `ORACLE-ADD/EDIT ผู้คุม 15 ต.ค. (P2.9b fix 2 …)`.
3. `qc-pos-p2.9b` fix 1 (3adb1e19): `regDep` sends `phoneLast4` for walk-in deposits with a phone · P7 name lookup expects no balance, receipt no + last 4 shows 20,000 · **ORACLE-ADD** A7 X9 A8 R6 P8 P9 (dated `ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 1 …)`).

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
- **Pick sheet** `registerDepositLookup(ctx, actor, {query?, phoneLast4?, memberId?})` → `{ok, deposits:[{id, receiptNo, customerName, phoneMasked, remainingSatang|null, amountSatang|null, status, expiresAt, memberLinked, needsPhoneLast4}]}` · query ≥ 3 characters = receipt no (exact) / holder name prefix only (**fix 3: never matched by phone last 4**) · name search rows carry **no balance** (null) — the sheet then asks for the receipt no (+ last 4 of the phone when `needsPhoneLast4`) and re-looks up to show the balance · `{memberId}` = deposits of the bill's member (incl. merged-in members) with balances · refusals `PERMISSION_DENIED` · `VALIDATION`. Default amount = min(remaining due, `remainingSatang`).
- **Apply** = `submitRegisterSale` pay row `{type:"DEPOSIT", amountSatang, depositId, phoneLast4?}` (≤ 3 deposits · each once · no reference · `phoneLast4` required for walk-in deposits with a phone) — refusals `DEPOSIT_NOT_FOUND` · `DEPOSIT_NOT_OWNER` (other member · wrong/missing last 4) · `DEPOSIT_EXCEEDS` (race — re-lookup) · `DEPOSIT_CLOSED` · `VALIDATION` · tip never from a deposit (VALIDATION). Done screen: `PayDone` label `pay.deposit`.
- **fix 2**: walk-in phones are served as `<first 3>-xxx-xxxx` (no last 4 anywhere) · wrong last 4 is counted per deposit: 5 wrong ⇒ `DEPOSIT_LOCKED` for 15 minutes (register submit and receipt-no lookup both count; a correct value during the lock is still refused) · the U card shows `errors.depositLocked` and must **require a phone (or a member) at take** (R2 F2 · owner line).
- **fix 3 (ruling 2 · brief ruling 19 amended)**: the lookup field placeholder is "เลขใบเสร็จ / ชื่อ" (no phone / last-4 hint) — the phone last 4 is a verification secret asked **only at apply** (pay row `phoneLast4`, or receipt no + `phoneLast4` re-lookup to show the balance; both counted by `checkDepositPhone` → `DEPOSIT_LOCKED`); a 4-digit query never returns a deposit by phone (P12).
- **R1 F5**: `registerTakeDeposit` accepts a CASH row without `cashReceivedSatang` (change 0) — the U card must **always send `cashReceivedSatang` on CASH rows** (same rule as the register submit). The receive sheet should also require a phone for walk-in deposits (owner line · bearer deposits).
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

## Gates after fix round 1 (whole run in ONE systemd-run unit · `ISO_MEM=7000M bash scripts/iso.sh bash scratchpad/p29b/gates/run-gates3.sh …` · logs `scratchpad/p29b/gates/out3/*.out` all headed `tree=/root/projects/shark-pos-b head=e800b1c0 dirty=0` · 15 Oct 04:39Z→)
Code head **fbe92b5a** (e800b1c0 = + notes). CD-P29b-1 re-run before fix 1 (head 180bd51a/3918a9ee): p2.9b 41/41 ×2 forced + unforced, typecheck 0.
| gate | result |
|---|---|
| typecheck (pos-gate.lock · heap 5632) | rc 0 |
| fitness no-env / env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 |
| **qc-pos-p2.9b forced ×2 / unforced** | **47/47 · 47/47 · 47/47** (residue 0 · guardHits 0 · leaks 0) |
| qc-pos-p2.9 · qc-hf-tx | 62/62 · 22/22 |
| qc-pos-p1.6 · p1.8 · p1.12 · p1.3 · p1.1 | 48 · 49 · 72 · 128 · 180 (all green) |
| qc-pos-account · qc-account-cpa | 16/16 · 107/107 |
| qc-pos-p2.5 · p2.4 · p2.6 | 49/49 · 50/50 · 67/67 |
| qc-pos-p2.8 | 60/61 — ST6 wip-only pin |
| qc-booking-deposit · qc-hotel-public · qc-rental-public | 18/18 · 15/15 · 16/16 |
| qc-hf-pos-page-authz | 81/81 |

## Gates after fix round 2 + P2.11 merge (one systemd-run unit · `scratchpad/p29b/gates/out5/*.out` · all headed `tree=/root/projects/shark-pos-b head=f51a942b dirty=0`)
Code head **7d38de9a** (+ merges 1513ed7c / 491ff89e with P2.11 S 744e4f35, + ledger). Red-before block 3 = 46/50.
| gate | result |
|---|---|
| typecheck · fitness no-env / env · fitness-pos | rc 0 · 50/50 · 50/50 · 8/8 |
| **qc-pos-p2.9b forced ×2 / unforced** | **50/50 · 50/50 · 50/50** (residue 0) |
| qc-pos-p2.11 | **32/34** — ST1 (prisma/ ≠ P2.11 base) + ST4 (lane-A files / unmarked receipt hunks ≠ P2.11 base) are P2.11's lane-boundary pins, red by construction on any tree carrying P2.9b (like p2.8 ST6) → CONTROLLER-DECISION: re-base those pins at the P2.9b merge |
| qc-pos-p1.17 | 40/40 |
| qc-pos-p2.9 · qc-hf-tx | 62/62 · 22/22 |
| qc-pos-p1.6 · p1.8 · p1.12 · p1.3 · p1.1 | 48 · 49 · 72 · 128 · 180 |
| qc-pos-account · qc-account-cpa | 16/16 · 107/107 |
| qc-pos-p2.5 · p2.4 · p2.6 | 49/49 · 50/50 · 67/67 |
| qc-pos-p2.8 | 60/61 — ST6 wip-only |
| qc-booking-deposit · qc-hotel-public · qc-rental-public | 18 · 15 · 16 |
| qc-hf-pos-page-authz | 81/81 |
Note: an earlier gate run at 1513ed7c (pre-P2.11) was stopped at a suite boundary (after p1.12) when P2.11 landed; its partial logs (`out4`) are superseded.

## Fix round 3 delivered (account B, 15 Oct 08:1xZ) — head 6b019acb + this notes commit (code eef6e031 · gates at 6b019acb)
Oracle first: 92da6d7c `test(qc-pos-p2.9b)` ORACLE-EDIT A9 (no FAILED/DEAD/PENDING `pos.sale.paid` of the fixture bills + the last bill's sale document) · ORACLE-ADD P12 → red-before block 4 in `P2.9b-red.txt` = **49/51** (red = A9 + P12, residue 0) → code → **51/51** (50 + P12).
| ruling / finding | commit | change |
|---|---|---|
| 1 · R3 F1 (zero-entry bill threw ⇒ event never completed) | 950fc192 | `account/index.ts applyExternalSale`: base 0 + VAT 0 + no tip + every Dr line 0 ⇒ skip `postExternalSale` (no throw ⇒ `pos.sale.paid` DONE) · document layer unchanged (sale document still written) · audit `account.external.zeroEntry` payload `zeroEntry: true` · any other bill = old path · owner line `POS-OWNER-PENDING.md` (VAT de-registration absorbs a small last bill; accountant to confirm). Siblings checked: `applyExternalDepositReceipt` / `applyExternalDepositRefund` / `applyExternalRefund` (gross > 0 guard + money lines = gross ⇒ never all-zero) · `applyExternalChannelCommission` (returns `zero` before posting) — no change needed |
| 2 · R3 F2 / hunter F1 (4-digit lookup searched phone last 4 without the counter) | eef6e031 · 6b019acb | `deposit.ts registerDepositLookup`: OR = receipt no (exact) / name prefix / member family only — `phoneLast4` never a search key; receipt no + `phoneLast4` still verifies via `checkDepositPhone` (counter + `DEPOSIT_LOCKED`) · VALIDATION text drops the last-4 hint · 6b019acb = P2.9bU contract line (ledger) |
ORACLE-EDIT of an older lookup check: none needed — no existing check expected a 4-digit query to match by phone (P7/P9 use receipt no + last 4 = verification, still green); P12 covers the rule.
**P2.9bU contract update**: lookup placeholder "เลขใบเสร็จ / ชื่อ" (no phone hint) · phone last 4 asked only at apply (pay row `phoneLast4`, or receipt-no re-lookup to show the balance; both counted) · a 4-digit query never returns a deposit by phone.

### Gates after fix round 3 (one systemd-run unit · `ISO_MEM=7000M bash scripts/iso.sh bash scratchpad/p29b-f3/run-gates6.sh …` · logs `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p29b-f3/out6/*.out`, all 15 headed `tree=/root/projects/shark-pos-b head=6b019acb dirty=0` · 07:58–08:12Z)
| gate | result | log |
|---|---|---|
| typecheck (pos-gate.lock · heap 5632) | rc 0 | out6/typecheck.out |
| fitness no-env / env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 | out6/fitness-noenv.out · fitness-env.out · fitness-pos.out |
| **qc-pos-p2.9b forced ×2 / unforced** | **51/51 · 51/51 · 51/51** (residue 0 · guardHits 0 · leaks 0) | out6/p29b-f1.out · p29b-f2.out · p29b-u.out |
| qc-pos-p2.9 · qc-hf-tx | 62/62 · 22/22 | out6/qc-pos-p2.9.out · qc-hf-tx.out |
| qc-pos-account · qc-account-cpa | 16/16 · 107/107 | out6/qc-pos-account.out · qc-account-cpa.out |
| qc-pos-p1.17 · qc-hf-pos-page-authz | 40/40 · 81/81 | out6/qc-pos-p1.17.out · qc-hf-pos-page-authz.out |
| qc-pos-p2.11 | 32/34 — ST1/ST4 lane pins (expected; green after push) | out6/qc-pos-p2.11.out |
| qc-pos-p2.8 | 60/61 — ST6 wip-only (expected) | out6/qc-pos-p2.8.out |
Next: R4 on the two hunks + hunter re-check → merge gates on tree b → merge.
