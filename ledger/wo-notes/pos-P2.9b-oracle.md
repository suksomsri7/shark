# POS P2.9b S — oracle notes (`scripts/qc-pos-p2.9b.mts`)

Oracle writer (account B, tree b) · 15 Oct 2026 · branch `wip/pos-p2.9b-oracle` from `origin/session/pos` **e7b05787** (code 9ada96ef).
Contract: `ledger/pos-briefs/pos-brief-P2.9b.md` §0, §2 R1–R10, §3, §4, §6, §7 and **§10 controller rulings 1–12 (binding)**.
**41 checks**: ST1–ST5 · R1–R5 · A1–A6 · P1–P7 · C1–C4 · X1–X8 · L1–L4 · Z1–Z2. That is the brief's §6 count of 40, plus **X8** for ruling 13 (an addendum added to the brief at 02:4xZ while this was being written; ruling 10 accepts 36–42).
Static (`--no-db`, no prisma) = ST1–ST5 + L1–L3. Everything else runs on QC4.

Modes (same as qc-pos-p2.9):
- `--list` prints the ids without touching the DB.
- `--no-db` runs 8 static checks; exit 1 when red.
- Unforced with P2.9b missing = `SKIPPED` (exit 0 + reasons).
- `QC_FORCE=1` runs everything and goes red with reasons, without crashing.

Fixtures: temp tenant `posqc-p29b-<rand>` (+ `-t2`). Units A/B/C/D SHOP + L BOOKING. POS (A, B, L) is linked to a VAT book (7 %, ABB on). POSC (C) is linked to a non-VAT book. POSD (D) is unlinked. MEMBER is linked to A. Members X and Y. Gift cards G1/G2/G3. Tip ledger 2190 LIABILITY (tip on). Device DEV1 with an open shift on A. Actors: OWNER, MANAGER (`pos.sale.create` + `pos.sale.refund`), CASHIER (STAFF `pos.sale.create`), NOPERM (STAFF `pos.sale.read`).
Deposits are created only through `registerTakeDeposit`: cash on A (DEV1), TRANSFER on B/C/D. The one exception is the T2 deposit, a raw `PosDeposit` row in tenant `-t2` (P4). New tables are read with raw SQL, so the suite does not crash before the migration exists. Everything is wiped in `finally` (Z1 residue 0). The seed tenants are never written (Z2).
Run on QC4: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.9b.mts`.

## Names table (the contract the builder implements)
| Thing | Name / shape |
|---|---|
| Module | `src/lib/modules/pos/deposit.ts` (tender.ts style; refusals as data `{ok:false, code, message}`) |
| Receive | `registerTakeDeposit(ctx: RegisterCtx, actor, {amountSatang, payMethods (CASH\|PROMPTPAY\|TRANSFER\|CARD, pi_ allowed), memberId?, customerName?, phone?, note?, idempotencyKey})` → `{ok:true, deposit:{id, receiptSaleId, receiptNo, amountSatang, vatSatang, remainingSatang, status}, duplicated?}` · perm `pos.sale.create` |
| Refund deposit | `registerRefundDeposit(ctx, actor, {depositId, payMethods (cash-like, Σ = remaining), reason, idempotencyKey, managerPin?, managerUserId?})` → `{ok:true, refund:{id, receiptNo}, …}` · perm `pos.sale.refund` or the P1.8/P1.15 manager PIN |
| Lookup | `registerDepositLookup(ctx, actor, {query})` → `{ok:true, deposits:[{id, receiptNo, customerName, phoneMasked, remainingSatang, status, expiresAt}]}` · perm `pos.sale.create` · unit-scoped · read-only |
| Void step | `depositSaleVoided(evt)` in the `pos.sale.voided` block of `outbox-consumers.ts`, **after** `tenderSaleVoided`, same try/fail pattern |
| createSale tender row | `{type:"DEPOSIT", amountSatang, refSaleId: <deposit receipt PosSale.id>}` (CD2-A; contract sha `72afb258…` unchanged) · DEPOSIT row **without** a ref = legacy path (3 legacy callers only) |
| Register tender row | `{type:"DEPOSIT", amountSatang, depositId}` (REG_PAY_KEYS + `depositId`); DEPOSIT without `depositId` = VALIDATION |
| Receipt bill | PosSale `sourceModule "POS_DEPOSIT"`, `sourceId = depositId`, `memberId null`, 1 line `"มัดจำ — <note>"`, `vatSatang = splitIncludedVat(amount).vat`; created through `regCreateSale` (not a new `createSale(` site) |
| Tables | `PosDeposit` {id, tenantId, systemId, unitId, customerId?, customerName?, phoneMasked?, amountSatang, vatSatang, usedSatang, refundedSatang, status PosDepositStatus, receiptSaleId @unique, receiptNo?, note?, reference?, expiresAt?, idempotencyKey, createdByUserId, createdAt, updatedAt} · `PosDepositTxn` {id, **tenantId**, depositId, type PosDepositTxnType, satang, vatSatang, saleId?, paymentId?, refTxnId?, idempotencyKey @unique, createdAt} · no FKs |
| Enums | `PosDepositStatus` OPEN USED REFUNDED EXPIRED · `PosDepositTxnType` RECEIVE APPLY RESTORE REFUND |
| Migration | `prisma/migrations/20261211100000_pos_p29b_deposits/migration.sql` (§3 exactly; no ALTER PosSale/PosPayment) |
| Idempotency | `PosDeposit.idempotencyKey` contains the client key (the oracle matches `LIKE %key%`, so a prefix is fine) · the receipt bill's own key is the builder's choice (R2 counts receipts by `sourceId`) |
| Txn keys | APPLY `dep-apply-<saleId>-<depositId>` (paymentId = the DEPOSIT PosPayment.id) · RESTORE `dep-restore-<applyTxnId>` (refTxnId = APPLY id) · RECEIVE/REFUND keys builder's choice |
| APPLY VAT | `x = remaining ? remainingVat : roundHalfUp(vat·x/amount)` · applying bill `PosSale.vatSatang = vat(grand) − Σ APPLY.vatSatang` |
| Lock order | in `createSaleOnce`: `posReceiptCounter.upsert` → `lockTenderCards(` → `lock…Deposits(` (SQL `FROM "PosDeposit" … ORDER BY id FOR UPDATE`) · conditional `"usedSatang" = "usedSatang" + x` (or `updateMany … usedSatang:{increment}`) |
| Codes | `DEPOSIT_NOT_FOUND` `DEPOSIT_NOT_OWNER` `DEPOSIT_EXCEEDS` `DEPOSIT_CLOSED` in `PosSaleErrorCode`, `RegisterRefusalCode`, `REFUSAL_KEY` → `errors.depositNotFound/…NotOwner/…Exceeds/…Closed`, `pos.register.errors.*` th + en |
| Setting | `AppSystem(POS).settings.pos.deposit.enabled` (default off) · writer `updatePosPaymentSettings(ctx, owner, {deposit:{enabled}})` · reader `parsePosPaymentSettings(...).deposit.enabled` · `registerPayTenders().tenders.deposit = {visible:true, enabled:<setting>}` |
| Account facade (`@/lib/modules/account`) | `applyExternalDepositReceipt` (JV key `PosSale#<receiptSaleId>#PAID`: Dr pay / Cr 2110 base / Cr 2200 VAT + doc `DEPOSIT_RECEIPT`) · `applyExternalDepositRefund` (Dr 2110 base + Dr 2200 / Cr cash, CN; JV refType `PosSale` refId = refund PosSale id) · `applyExternalSale({…, depositVatSatang?})` · `upsertExternalSaleDocument({…, depositDeductedSatang?})` · hunks marked `// POS P2.9b ▸ … ◂` |
| Wiring | `bridgePosSalePaid` branch on `POS_DEPOSIT` (in `account-bridge.ts`) · `refund-consumer.ts` branch on origin `POS_DEPOSIT` → `applyExternalDepositRefund` (direct or via an account-bridge helper) · `voidSale` gains a `POS_DEPOSIT` guard |
| Close-day | `closeDaySummary(ctx)` → `netSalesSatang` excludes POS_DEPOSIT bills (and refunds of them) + additive `deposits: {receivedSatang, appliedSatang}` |
| Refund caps (ruling 13) | one pure `refundTenderCaps` exported from `refund-shared.ts` (or one new pure file, no db/prisma import), called by both `refund.ts` and `refund-tenders.ts` · X8: on a bill paid gift card 1,000 + deposit 1,000 + cash 1,000, `refundTenderOptions().cashLikeCapSatang` = 200000 = what `refundSale` accepts; after a 2,000 cash refund it is 0, and the server refuses 1,000 cash · card `capSatang` 100000 |
| Readers | receipt render title "ใบรับเงินมัดจำ" (+ "ใบกำกับภาษีอย่างย่อ" when the book is VAT + ABB) · applying receipt shows "มัดจำ" + the receipt no |

## Expected amounts (7 %, satang)
- Receive ฿1,070: Dr 1000 107000 / Cr 2110 100000 / Cr 2200 7000.
- Full apply on ฿2,140 (deposit 1,070 + cash 1,070): sale vat 7000; JV Dr 1000 107000 + Dr 2110 100000 / Cr 4000 200000 / Cr 2200 7000.
- Partial 500 then 570: APPLY vat **3271 + 3729**; bill 1 (1,000) vat 6542 − 3271 = 3271; bill 2 (570) vat 3729 − 3729 = 0.
- Refund of the remaining 570 after a 500 apply: REFUND vat 3729; JV Dr 2110 53271 + Dr 2200 3729 / Cr 1000 57000.

## Drift (brief vs code at e7b05787)
1. **§4 "33 + 37"** is baht-rounded. The satang-exact split from the R4 formula is 32.71 + 37.29 (3271 + 3729). A3/X4 encode the satang formula, so the total is exactly 70.
2. **R1 lists `PosDepositTxn` without `tenantId`.** §3 scope `PosDepositTxn: tenant` and the Z1 wipe both need it, so the oracle requires `tenantId` (ST1).
3. **Walk-in snapshot columns** are named `customerName` and `phoneMasked` (the brief says `{name?, phoneMasked?}`).
4. **The refund module's permission code is `NO_PERMISSION`** (`refund.ts:56`), not `PERMISSION_DENIED`. X5 accepts either for `registerRefundDeposit` (see CD-O4).
5. **The H1 cap runs only on bills that have GIFT_CARD/STORE_CREDIT rows** (`refund.ts:381`). A deposit + cash bill has no cash cap at all today, so CD8 only matters when a card is present. X2 therefore uses deposit + gift card + cash. Before the change, its cash refund of 2,000 is refused (cap = cash 1,000).
6. **The red run confirms §0.** Base `createSale` accepts a DEPOSIT row whose `refSaleId` points at nothing, at another unit, or at another tenant: P4 created those bills. The register refuses DEPOSIT (VALIDATION).
7. **`qc-pos-p2.9` R2 (`:1786`) will probably stay green.** Its fixture never turns the deposit setting on, and it asserts only `visible === true` and `enabled === false`, not `reason`. The approved ORACLE-EDIT is needed only if the builder changes the `deposit` shape (for example by dropping `visible` or making `reason` mandatory). **`qc-pos-p2.9` ST1 `:275` will go red** (model PosDeposit) → approved ORACLE-EDIT. `:271` stays green under CD2-A.
8. `PosDaySummary` has no deposit fields. The oracle names `deposits {receivedSatang, appliedSatang}` (additive).
9. The legacy booking receipt's revenue line may be 4000 or 4030, so A6 sums both. It is green today and stays a PAR check.
10. `AccountDocument.depositDeducted` is gross incl. VAT (`gl.ts:475` "depositDeducted = gross รวม VAT"), so A5 pins 107000.
11. `voidSale` throws a plain `Error` for non-PAID bills. The POS_DEPOSIT guard's code is not specified, so X7 accepts any refusal.
12. Brief R2: "open shift per register rules". The cash receipts on A use DEV1 with an open shift. The receipts on C/D use TRANSFER without a device (`requiredOtherSources` off).

## CONTROLLER-DECISION (the oracle encodes the proposal shown — rule before builder S starts)
1. **CD-O1 Setting off.** Proposal: `registerTakeDeposit` with `pos.deposit.enabled` off → `VALIDATION`, with no rows written (R3 probes this before the setting is turned on). Applying an existing deposit while the setting is off is **not tested**; the proposal is that it stays allowed, because it is the customer's money.
2. **CD-O2 Applying-bill document VAT (A5).** Ruling 3 says "VAT net", so A5 pins `vatAmount = 7000` with `depositDeducted = 107000`. The alternative is the account INVOICE convention (`vatAmount` 14000 full, with the deduction carried separately). Choose one; A5 changes only by ORACLE-EDIT.
3. **CD-O3 Race loser codes.** C1 uses two partial applies (300 + 300 on 500), so the loser is strictly `DEPOSIT_EXCEEDS` (deposit still OPEN). C4 (apply ∥ refund) accepts `DEPOSIT_CLOSED` or `DEPOSIT_EXCEEDS` from the loser.
4. **CD-O4 `registerRefundDeposit` refusals.** Permission: `PERMISSION_DENIED` is recommended (register vocabulary), and `NO_PERMISSION` is also accepted. Missing reason: `REASON_REQUIRED` (VALIDATION accepted). Non-cash method or Σ ≠ remaining: `VALIDATION`. Fully used: `DEPOSIT_CLOSED`.
5. **CD-O5 Where the register functions live.** `regCreateSale` is private in `register.ts:2691`. To keep L2 (caller registry 19/16) green, `deposit.ts` must reach `createSale` only through `regCreateSale`: either export that wrapper, or host the bodies in `register.ts` and re-export them from `deposit.ts`. A new `createSale(` call in `deposit.ts` turns L2 red, plus 7 registry pins in other suites (§7).
6. **CD-O6 Lookup by phone.** Only the masked phone is stored, so the oracle does not test a phone search (it tests receipt no + name + masking). Proposal: drop the phone search, or match the last 4 digits against `phoneMasked` (state which).
7. **CD-O7 Member-linked deposit on a walk-in bill** → `DEPOSIT_NOT_OWNER` (P4). The oracle reads ruling 4 literally: "only on that member's bill".
8. **No other existing pin is expected to turn red** besides the approved `qc-pos-p2.9` ST1 `:275` (and possibly R2). Possible gates to watch, not seen as pins: `qc-pos-p1.18` ST6 (a ratchet: the 4 new codes need `errors.*` keys, which ST3 also requires) and the fitness scope registry (the new models need `scope.ts`).

## Red-before (forced, QC4, base e7b05787) — `ledger/wo-notes/P2.9b-red.txt`
`8/41` green: L1 L2 L3 L4 (PAR) · A6 (legacy booking PAR) · P6 (payOrder/API already refuse DEPOSIT — positive control) · Z1 Z2. **33 red** (X8 included): ST1–ST5 (no migration/schema/scope/exports/codes/lock/guard) and every R/A/P/C/X check that needs P2.9b code (`MISSING:registerTakeDeposit` → no deposits). P4 also shows base `createSale` accepting fake/foreign `refSaleId` (bills created). Residue 0, no crash, guard hits 0.
`--no-db`: 3/8 (L1 L2 L3 green). Static positive control: a sample migration, schema and `createSaleOnce` written to scratch turn ST1 and ST4 green.
Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → rc 0, run twice (40-check version, then the X8 version). After that came two small edits (R2 counts receipts by `sourceId`; P7 checks the exact walk-in phone). They were verified with a single-file `tsc -p <scratch>/tsconfig.one.json` (rc 0; a positive control with a planted type error fails as expected), and the forced run was repeated (8/41, residue 0).

## `--list`
```
qc-pos-p2.9b — 41 ข้อ (id · X · หัวข้อ)
P2.9b-ST1 S
P2.9b-ST2 S
P2.9b-ST3 S
P2.9b-ST4 S
P2.9b-ST5 S
P2.9b-R1 X4
P2.9b-R2 X1
P2.9b-R3 X3
P2.9b-R4 X5
P2.9b-R5 -
P2.9b-A1 X4
P2.9b-A2 X4
P2.9b-A3 X4
P2.9b-A4 X4
P2.9b-A5 X4
P2.9b-A6 PAR
P2.9b-P1 X4
P2.9b-P2 X4
P2.9b-P3 X5
P2.9b-P4 X2
P2.9b-P5 X5
P2.9b-P6 X5
P2.9b-P7 X2
P2.9b-C1 X1
P2.9b-C2 X1
P2.9b-C3 X1
P2.9b-C4 X1
P2.9b-X1 X5
P2.9b-X2 X4
P2.9b-X3 X4
P2.9b-X4 X4
P2.9b-X5 X3
P2.9b-X6 X4
P2.9b-X7 X5
P2.9b-X8 X4
P2.9b-L1 PAR
P2.9b-L2 PAR
P2.9b-L3 PAR
P2.9b-L4 PAR
P2.9b-Z1 -
P2.9b-Z2 -
X-coverage: S=5 X4=13 X1=5 X3=2 X5=6 -=3 PAR=5 X2=2
```
