# P5.1 FIX batch B — builder (account B · 23 Oct 2026 · tree p11 · branch `wip/pos-p5.1-fix-b`)
Base: `origin/session/pos` 8c7ccad9 (oracle + batch A/C/D merged). Scope: MA2 MA4 MA5 MA6 MA7 + MA1b (R1 (4) register quote mirror) + R1 F2 (restaurant negative option price).
Constraints kept: no migration · no `prisma/` · no contract JSON · no new error code · **no new `createSale(` call site** (U4/L2/HT6.4 unchanged — p1.6 48/48 · p2.4 50/50 · hf-tx 22/22) · every hunk marked `POS P5.1 ▸ MAn ◂` · OP lines per module owner in `POS-OWNER-PENDING.md` (last section).

## 1. Check → commit → change
| check | commit | change |
|---|---|---|
| MA6 | 8b1a9a02 | `member/subscription.ts subscribe`: ACTIVE check + plan + create inside `tenantDb(ctx).$transaction` under `pg_advisory_xact_lock(hashtext(tenant:subscription-active:system:customer))` · same error order/texts · createSale stays outside the tx |
| MA5 + MA7 ticket | 02d21531 | `ticket/service.ts markPaid`: createSale throws and `saleStatusByKey(ticket-sale-<id>)` = null ⇒ PAID → PENDING (conditional) then rethrow (clinic pattern) · after createSale re-read the order; not PAID ⇒ `voidSale` (a concurrent void = tolerated) |
| MA7 shop/clinic | d41745b0 | `shop confirmOrderPaid`: bind posSaleId only `WHERE status = PAID` (same tx as webSaleBound + shop.order.paid) · 0 rows ⇒ void bill, `{ok:false}`, no event, no stock cut · `clinic billVisit`: bind only `WHERE status = BILLED` · 0 rows ⇒ void, `{ok:false}` |
| MA2 MA4 (+MA5 hotel) | 61453bf2 · 5aab7fe7 · 950ba711 | `pos/deposit.ts`: **moduleTakeDeposit** (one tx: module's own createSale call site with `callerTx(tx)` → receipt `sourceModule POS_DEPOSIT` + PosDeposit + RECEIVE + audit SYSTEM · afterSaleCommitted · P2002/P2034/P2028 retry ×3 · keyed receipt not PAID ⇒ `<key>-r<n>` (pattern restaurant/order.ts) · a pre-P5.1 PAID deposit bill on the key = kept as is) · **moduleDepositForBill** (OPEN deposit of the receipt, same unit ⇒ `{refSaleId, min(remaining, bill)}` else null = old full-cash path) · **moduleRefundDeposit** (refund the remaining with the receipt's real-money type or TRANSFER · shift via `resolveApiRefundShift` · key `dep-ref:mod:<receiptId>`) · `registerRefundDeposit` tx body moved **verbatim** into `refundDepositInTx` (only `sc.actor.userId` → `requestedByUserId`, `actorType` param; `git diff -w` = +36 −19) · hotel/rental/booking `recordDeposit` → moduleTakeDeposit (pay type as passed, default `DEPOSIT` row ⇒ GL channel TRANSFER as before) · final bills (`hotel checkOut`, `rental returnAsset`, `actions/booking setStatusAction DONE`) pay `{DEPOSIT, refSaleId}` + rest CASH · booking DONE re-click: bill on `booking-sale-<id>` exists ⇒ no createSale (the deposit is used, a new payload would conflict) · `booking refundDeposit`: refund receipt (CN) **before** clearing flags (claim also `depositSaleId = <receipt>`), DEPOSIT_CLOSED ⇒ "มัดจำนี้ถูกใช้กับบิลหรือคืนไปแล้ว", legacy bill ⇒ old void path · `hotel checkOut`: createSale throws, no bill ⇒ CHECKED_OUT → CHECKED_IN + room CLEANING → OCCUPIED |
| MA1b | eb4884fe | `register.ts` quote: memberCap = max(0, grand − serviceCharge) (= service.ts:1144 `beforeMember − serviceCharge`) · excess cut from tier (first TIER line) · still over ⇒ `BENEFITS_EXCEED_TOTAL` (createSale: VALIDATION) ⇒ screen total = createSale total |
| R1 F2 | 7ddcb1c3 | `restaurant/order.ts resolveLines`: basePrice + Σ option deltas < 0 ⇒ `BAD_OPTIONS` "ราคาต่อชิ้นรวมตัวเลือกต้องไม่ติดลบ — แก้ราคาตัวเลือกในเมนูก่อน" at order time (V2 priceCart rule) · ITEM_UNAVAILABLE keeps precedence · menu save not checked (a negative delta is valid when the base covers it) |

## 2. Results (QC4 · ISO_MEM 3G · POS gate lock · logs `scratchpad/p51-fix-b/reg-950ba711-b/`)
| suite | result |
|---|---|
| qc-pos-p5.1 run 1 / run 2 @950ba711 | **15/15 · 15/15** (residue 0 · guardHits 0 · pumpErrors 0) · `--no-db` 2/2 · (dirty run @8b1a9a02 also 15/15) |
| qc-pos-p1.6 (actions) · p3.6 · hf-tx · p2.4 (L2 registry) | 48/48 · 52/52 · 22/22 · 50/50 |
| qc-money-mapping · qc-account-cpa | 5/5 · 107/107 (findings 0) |
| module money/regression | hotel-money 5/5 · hotel-refund · ticket-money · ticket-cancel · subscription-money · subscription · rental · rental-refund · rental-race · booking-race · shop · shop-refund · clinic · clinic-refund · restaurant-money · restaurant-pay · restaurant-void · restaurant — **all green** |
| qc-pos-p2.9b | **51/53 — L3 + A6 red = conflict with ruling มติ 7 / CD7** (§3) |
| qc-booking-deposit | **red BD-3.4 4.1 4.2 5.2 5.4 6.2 = the legacy F2 accounting** (§3) |
| qc-pos-p2.10 --no-db | 1/2 — ST2 lane pin only (`register.ts` hunk +11 −1) |
| qc-hf-fu --no-db · qc-hf-fu2 --no-db | ST1 lane pins only (restaurant/ · pos/deposit.ts · pos/register.ts changed vs base; hunks without HF-FU2 tag) |
| pre-submit core @09d567a3 (`presubmit-09d567a3`) | wo run1/run2 15/15 · nodb 2/2 · p1.1 180/180 · p1.3 128/128 · p1.6 48/48 · p1.18 81/81 · hf-tx 22/22 · fitness ±env 53/53 · fitness-pos 8/8 · gen-check ok · hf-fu 28/29 + hf-fu2 30/31 = ST1 lane pins only (unexpected red: none) |

## 3. Oracle conflicts → ORACLE-EDIT under controller ruling CD-P51-O6 (23 Oct · commits 2b377f5a + f7f088a0)
Ruling: มติ 7 / CD7 of P2.9b was a P2.9b scope rule; hunt M-A F2 + oracle MA2 supersede it for the five deposit functions and qc-booking-deposit. Red-before = edited oracles run on the pre-batch-B product (`src/` of 8c7ccad9, logs `reg-f7f088a0-redbefore-o6/`) · green-after = head f7f088a0 (`reg-f7f088a0-o6/`).
| check | edit | red-before (product 8c7ccad9) | green-after (f7f088a0) |
|---|---|---|---|
| p2.9b A6 | receipt POS_DEPOSIT · row DEPOSIT (no ref) · JV Dr 1010 50,000 / Cr 2110 46,729 / Cr 2200 3,271 · no 4xxx · PosDeposit + RECEIVE | bill BOOKING · JV Dr 2110 / Cr revenue | ✅ |
| p2.9b L3 | 5 functions + qc-booking-deposit pinned to `L3_PIN = process.env.P29B_L3_PIN \|\| "2b377f5a"` (movable by pos-repin-lane.sh `qc-pos-p2.9b:L3_PIN`) · hotel/rental-public keep "not modified vs BASE_REV" | 5 functions differ from pin | ✅ · suite **53/53** |
| BD-3.4 | receipt JV Cr 2110 46,729 + Cr 2200 3,271 (= 50,000), Dr 2110 0 | dr2110 50,000 · cr2110 0 · cr2200 3,271 | ✅ |
| BD-4.1 | repeat recordDeposit ok + noop · exactly 1 PAID POS_DEPOSIT receipt | true/true/0 | ✅ |
| BD-4.2 | Cr 2110 46,729 + Cr 2200 3,271 unchanged after repeat | dr2110 50,000 | ✅ |
| BD-5.2 | receipt REFUNDED + depositPaidAt null | VOIDED/null | ✅ |
| BD-5.4 | outbox pos.sale.refunded ≥ 1 | 0 | ✅ |
| BD-6.2 | 2nd refund ok:false · exactly 1 credit note (docType REFUND, refSaleId = receipt) · receipt still REFUNDED | 0/VOIDED | ✅ · suite **18/18** |
Also green after: qc-pos-p5.1 15/15 · fitness (iso) 53/53. qc-pos-p2.10 --no-db 1/2 — ST2 lane pin only (`register.ts` hunk +11 −1 · `qc-pos-p2.9b.mts` edited, CONTROLLER-DECISION).

**CD-P51-O6b (23 Oct · commits c82ee447 + c2c34bd8)** — the four hotel/rental-public reds were the same MA2 semantics ⇒ ORACLE-EDIT; p2.9b L3 now pins all 3 deposit suites + 5 functions to `P29B_L3_PIN` default **c82ee447** (group "not modified vs BASE_REV" empty). Red-before = product `src/` of 8c7ccad9 (`reg-c2c34bd8-redbefore-o6b/`) · green-after = c2c34bd8 (`reg-c2c34bd8-o6b/`).
| check | edit | red-before | green-after |
|---|---|---|---|
| HP-4.3 | one receipt POS_DEPOSIT, sourceId = PosDeposit.id, PAID · Cr 2110 46,729 + Cr 2200 3,271 · no Dr 2110 · no 4xxx line | HOTEL/PAID/no PosDeposit · dr2110 50,000 · cr2200 3,271 · 4xxx 1 | ✅ 15/15 |
| HP-4.4 | repeat ok · exactly 1 PAID POS_DEPOSIT receipt · Cr 2110/2200 unchanged | 0 · dr2110 50,000 | ✅ |
| RP-4.3 | same as HP-4.3 for rental | RENTAL/PAID/no PosDeposit · dr2110 50,000 · 4xxx 1 | ✅ 16/16 |
| RP-4.4 | same as HP-4.4 for rental | 0 · dr2110 50,000 | ✅ |
Final-bill assertions of both suites untouched.
All at c2c34bd8: qc-hotel-public 15/15 · qc-rental-public 16/16 · qc-pos-p2.9b 53/53 · qc-booking-deposit 18/18 · qc-pos-p5.1 15/15 · fitness (iso) 53/53 · qc-pos-p2.10 --no-db 1/2 = ST2 lane pin only (register.ts hunk · qc-pos-p2.9b.mts CONTROLLER-DECISION).

## 4. Notes / behaviour changes the module owners should know (also as OP lines)
- After `refundStay` (hotel) / rental refund the final bill is voided ⇒ `depositSaleVoided` restores the deposit to OPEN (a liability refundable at the register/deposit screen) — before, the deposit bill stayed as revenue.
- Module deposits appear in the register deposit lookup (customerName = guest/customer name, member deposits only usable by that member). A walk-in module deposit could be applied at the register; the final module bill then pays cash in full (moduleDepositForBill = null).
- Old data: deposits taken before this change (no PosDeposit) keep the old path (final bill full cash, booking refund = void).
- Not done (out of scope): subscription createSale failure still leaves an ACTIVE row without a bill (pre-existing); shop `refundOrder` restocks lines that were never cut when it races confirm (pre-existing, OP line).
- **Typecheck not run**: strict tsc of the 11 touched files OOMs at a 2.9 G heap (`tsc1.log`, whole import graph); full typecheck at merge (controller). Types self-reviewed (callback client = `Prisma.TransactionClient`, `PosPayType` for module pay type, union narrowing in refund results).

## 5. R1 round 1 (R1 report `scratchpad/p51-fix-b-r1/REPORT.md` · controller ruling CD-P51-O7 · 23 Oct)
| item | commit | change | red-before (product src 2eb58214 · `reg-7289034f-redbefore-o7/`) | green-after (`reg-7289034f-o7/`) |
|---|---|---|---|---|
| R1 F1 MED → **MA4b** | f882547b (fix) · 7289034f (oracle) | `moduleTakeDeposit`: pre-tx PAID branch also reads `refundedSatang` (> 0 ⇒ next `-r<n>`); in the tx `prior` PosDeposit with `refundedSatang > 0` or status REFUNDED/EXPIRED = stale ⇒ next key (a real retry/race has refunded 0 ⇒ still dup) | control no-op/same receipt ✓ · re-take = **old receipt** R0 PAID · appointment points to R0 · deposit REFUNDED (= probe PA) | ✅ new receipt PAID 50,000 · appointment → new receipt (OPEN) · old REFUNDED · control still no-op |
| R1 F2 LOW-MED → **MA2b** | f882547b · 7289034f | new `moduleRefundDepositAfterVoid` (deposit.ts): after the final-bill void → `depositSaleVoided` now (keyed restore ⇒ the queued run is a no-op) → `moduleRefundDeposit` for all that is left (CN on the receipt) · called by `hotel refundStay` and `rental refundRental`; failure ⇒ `{ok:false}` "…แต่คืนมัดจำไม่สำเร็จ … คืนมัดจำที่หน้าขาย" | hotel + rental: refund ok · bill VOIDED · **CN 0 · deposit OPEN 50,000** (= probe PB) | ✅ both: bill VOIDED · 1 CN = 50,000 · deposit left 0 REFUNDED (after the queue drain) |
- Deviation from the ruling text (2 points): (a) **CN = 50,000, not 20,000**: voiding the 30,000 final bill releases its 30,000 back into the deposit (that is what `depositSaleVoided` does, and the queued consumer would do it anyway), so the only state with "deposit left 0" after the queue is one CN for the whole 50,000 = everything the customer paid. A 20,000 CN would leave 30,000 OPEN again once the queue restores the APPLY. (b) **Not one transaction**: `voidSale` opens its own transaction and its signature is pinned by `pos-sale-contract.json`, so the steps are void → restore → CN in sequence; each step has its own idempotency key, so a retry cannot double them.
- Not touched (batch C / W39): R1 F3 forfeit of no-show/cancelled deposits · R1 F4 receipt pay type. A6/BD/HP/RP assertions unchanged.
- Runs at 7289034f (product f882547b): qc-pos-p5.1 **17/17 ×2** · `--no-db` 2/2 (registry 17 · self-test covers MA2b MA4b) · qc-pos-p2.9b 53/53 · qc-booking-deposit 18/18 · qc-hotel-public 15/15 · qc-rental-public 16/16 · qc-hotel-refund 15/15 · qc-rental-refund 11/11 · qc-pos-p1.6 48/48 · qc-hf-tx 22/22 · fitness (iso) 53/53 · qc-pos-p2.10 --no-db 1/2 = ST2 lane pin only (register.ts hunk · p2.9b + p5.1 oracle files CONTROLLER-DECISION).
