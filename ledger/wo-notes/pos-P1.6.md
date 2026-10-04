# POS P1.6 — builder S notes (branch wip/pos-p1.6 · base origin/session/pos cb1a2331)

## (history) QUOTA STOP after step 1 — superseded by "S-cloud" below
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


## S-cloud — builder S continuation (cloud · 4 Oct 2026 · branch wip/pos-p1.6 · no DB in this container)

Commits (pushed to `wip/pos-p1.6`): 78a4cd36 step 1 (createSale) · 96fe39e7 + f023fc67 step 2 (payment settings) · 8a0d7799 step 3 (register) · 75d038e1 step 4 (restaurant I6).
**The migration `20261122000000_pos_p16_payment` is still NOT deployed anywhere.** `prisma generate` was run here (container-local client only).

### What was built
- **createSale** (`pos/service.ts`, additive only · F15.2 snapshot `scripts/pos-sale-contract.json` updated with `--update-pos-contract`: 8 additive fields incl. the P1.3 `lines[].productId?` that was never snapshotted):
  - New input: `note`, `lines[].note`, `serviceChargeSatang`, `tipSatang`, `payMethods[].cashTenderedSatang`, `payMethods[].reference`. Output: `status`.
  - Typed refusals `PosSaleError` (`.code` + Thai message; PAYMENT_MISMATCH keeps its `"PAYMENT_MISMATCH: …"` message prefix for old `startsWith` callers): VALIDATION · SPLIT_INVALID (> 10 payMethods) · PAYMENT_MISMATCH · IDEMPOTENCY_CONFLICT · UNIT_SYSTEM_MISMATCH · STOCK_INSUFFICIENT.
  - Order inside the tx: dup lookup → field validation → **O21 guard** → coupon → VAT rate → early Σpay check → **BLOCK lock + stock check** → receipt counter → … So every refusal happens before the counter.
  - R1 VAT: `posVatRateBp(tx, …)` (enabled AccountSystemLink + AccountSettings, defaults registered/700, same rule as the bridge `vatConfigOf` / register `regVat`), `vatSatang = splitIncludedVat(grand)`, recomputed when member discounts change grand.
  - R4: grand = subtotal − discounts + serviceCharge (SC inside the VAT base); Σpay = grand + tip (§8.1). Columns `serviceChargeSatang`, `tipSatang`, `note`, `PosSaleLine.note` stored.
  - R3: `tenderedSatang`/`changeSatang` on the CASH `PosPayment` row (§8.2); tendered < row amount ⇒ PAYMENT_MISMATCH before the counter. `reference` stored on `PosPayment.reference`.
  - R6: duplicate key ⇒ compare unit/system, SC, tip, lines bag (price|qty|disc), payments bag (type|amount). Same ⇒ stored sale + `status` (PAID or VOIDED). Different ⇒ IDEMPOTENCY_CONFLICT. I7: when createSale owns the tx, a P2002 is retried (≤3) and lands on the dup path. Inside a caller tx the P2002 still surfaces (the tx is dead).
  - R7/O21 guard `assertUnitOfSystem`: unit linked to this POS ⇒ ok; linked to another POS ⇒ refuse; unlinked ⇒ ok only when the tenant has exactly 1 active POS, else refuse with "เลือกจุดขายก่อน …".
  - R8 BLOCK: `BusinessUnit.settings.pos.stock.oversellPolicy === "BLOCK"` and the unit has an INVENTORY system ⇒ `inventory.lockItemsInTx` (sorted ids) + onHand check (aggregated per item) ⇒ STOCK_INSUFFICIENT, else `consumeInTx` per line with key `pos-consume-<saleId>-<lineId>` inside the sale tx. The post-commit `consumeSaleInventory` still runs; it hits the same keys (no second OUT) and posts COGS GL + account-product sync as before. ALLOW_NEGATIVE / unset = unchanged path.
  - Interactive tx timeout raised to 20 s / maxWait 10 s (BLOCK queues on the item lock).
  - closeDay: CARD in `PAY_TYPE_ORDER` + label "บัตร" (T7).
- **Bridge** (`pos/account-bridge.ts`, pos side only — `account/index.ts` unchanged since step 1): SC becomes a document line "ค่าบริการ" so Σlines = grand; tip is removed from the Dr lines (from the last payment row backwards) so the JV balances at grand. The consumer already passes the full PosSale row, so `outbox-consumers.ts` is untouched.
- **Payment settings** `pos/payment-settings.ts` (`posPaymentSettings`, `updatePosPaymentSettings`, `parsePosPaymentSettings`, `serviceChargeOf`) + `pos/payment-settings-actions.ts` (`posPaymentSettingsAction`, `updatePosPaymentSettingsAction`; `assertCan pos.settings.payment` for fitness F6.1). Storage `AppSystem(POS).settings.pos.{serviceCharge:{enabled,rateBp}, tip:{enabled,ledgerAccountId}}`, partial merge under `SELECT … FOR UPDATE`. OWNER only. Tip ON needs a non-archived AccountLedger of the book linked (enabled link) to that POS, else TIP_ACCOUNT_REQUIRED (K4/K9). All refusals returned as data.
- **Register** (`register.ts`, `register-shared.ts`, `pricing-shared.ts`): `REGISTER_PAY_TYPES` = CASH, PROMPTPAY, TRANSFER, CARD; 0…10 methods (11 ⇒ SPLIT_INVALID), duplicate types allowed except a second CASH row; `reference` on CARD/TRANSFER (≤100); `tipSatang` (VALIDATION when malformed or tip is off); bill `note` + line notes stored; quote returns `serviceChargeSatang`; `priceCart({serviceChargeBp})` (half-up on net after all discounts, inside the VAT base). createSale refusals are mapped to `regRefuse(code)`; IDEMPOTENCY_CONFLICT from createSale re-reads the row and answers through `regDuplicate`. New codes + `errors.unitSystemMismatch|splitInvalid|tipAccountRequired` in `src/messages/{th,en}/pos.json` (append-only).
  - `RegisterScreen.tsx`: one line, passes `serviceChargeSatang` through on PRICE_CHANGED (type compat only, no visual change — UI is builder U).
- **Restaurant** (`restaurant/order.ts`): when createSale answers `status:"VOIDED"`, re-call with `rest-<hash>-r1`, `-r2`, … (deterministic, so a retry after a crash finds the same PAID bill). Still a single `createSale(` call site (U4 inventory unchanged: 18/15).

### Callers table (O21)
| caller | how system is chosen | under the guard |
|---|---|---|
| actions/pos.ts (old screen) · pos/api/ops/sales.ts · pos/register.ts | explicit + `posUnitIsLinked` / regScope | always linked ⇒ unaffected |
| actions/booking.ts · booking/service.ts · ticket · hotel ×2 · rental deposit · restaurant/order.ts | `systemForUnit(unit,"POS")` | linked ⇒ unaffected |
| giftcard ×2 · member/subscription.ts | `resolvePosForMember` (unit-linked POS) | linked ⇒ unaffected |
| **shop/service.ts · clinic/service.ts · school/service.ts · rental returnAsset · ai/proposals.ts** | **first POS of the tenant** | **O21**: works when the unit is linked to that POS or the tenant has exactly 1 active POS; otherwise UNIT_SYSTEM_MISMATCH "เลือกจุดขายก่อน" (thrown, surfaces as each caller's error text) |

### ORACLE-EDIT
- `scripts/qc-pos-p1.3.mts` **S3.38** only (approved §8.7): TRANSFER and CARD now expected PAID with one payment row of that type; DEPOSIT / ROOM_CHARGE / garbage still VALIDATION with no bill. Registry title updated to match. No other assertion touched; `qc-pos-p1.6.mts` untouched.

### FIXTURE fixes (legacy suites that sold through an unlinked or wrongly linked pair — guard not weakened)
- `scripts/qc-pos-account.mts`: tenant has POS + POS2 and the unit was linked to neither ⇒ unit linked to POS, new unit "kiosk" linked to POS2, `sale()` picks the unit by system.
- `scripts/qc-pos-closeday.mts`: the same unit was linked to posSys and then posSys2 (`linkUnit` replaces, so posSys sales were a wrong pair) ⇒ unit ↔ posSys, new "สาขา 2" ↔ posSys2.
- Static scan only (no DB here). Suites I could not decide statically: CRM lane `qc-crm-c2.7` / `c2.9` (they sell through `POS.createSale` on their own fixtures — not my lane, flag to CRM if red); member suites use the member-QC seed (`seed-member-qc` links units to POS ⇒ expected fine).

### Verified here (no DB)
- `pnpm exec tsx scripts/qc-pos-p1.6.mts --list` → 48 ids, exit 0 (oracle has no `--no-db` mode; it connects at startup).
- Scratch harness of the oracle's pure groups (outside the repo): **V1 V2 U4 R2 R3 all green**.
- `qc-pos-p1.4 --no-db` 13/13 · `qc-pos-p1.5 --no-db` 5/5 · `qc-pos-p1.3 --list` exit 0.
- `pnpm fitness` with DATABASE_URL/DIRECT_URL unset: 41/41, exit 0 (F15.2 additive). Typecheck (`NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck`): exit 0 after every step.

### CONTROLLER-RUN (VPS, QC4) — in this order
1. `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` (then the client generate the lane rules allow).
2. P1.6 oracle ×2: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.6.mts` (expect 48/48, Z1/Z2 green).
3. All POS suites: qc-pos-p0.2 · qc-pos-p1.1 · qc-pos-p1.3 (S3.38 edited; **S6.1 should turn green**) · qc-pos-p1.4 · qc-pos-p1.5 · qc-pos-account · qc-pos-closeday · qc-pos-coupon · qc-pos-inventory · qc-pos-products · qc-pos-register.
4. COMMON §7 money set: qc-account-cpa · qc-restaurant-money · qc-shop-refund · qc-hotel-money · qc-ticket-money · qc-subscription-money.
5. Every createSale caller's suite: qc-booking-deposit · qc-booking-edit-schedule · qc-booking-race · qc-hotel-refund · qc-ticket-cancel · qc-rental · qc-rental-race · qc-rental-refund · qc-restaurant · qc-restaurant-pay · qc-restaurant-void · qc-shop · qc-clinic · qc-clinic-refund · qc-school · qc-school-refund · qc-subscription · qc-member-m2.6 (giftcard) · qc-member-m1.7 · m1.9 · m2.3 · m2.8 · m3.2 · m3.3 · m3.5 · m3.7 · qc-member-fix-s2 · qc-money-mapping · qc-hf-inventory-atomic · qc-hf-pos-page-authz · qc-ai-phase-a · qc-ai-phase-b1 (+ CRM-lane qc-crm-c2.7 / c2.9 for information).
6. `pnpm fitness` with and without .env · typecheck · build.

### Open questions
1. **Tip ledger posting.** The bridge now excludes tip from the JV (balanced at grand), but the tip cash itself is not booked (Dr cash / Cr tip-liability ledger). Posting it needs a GL entry with an arbitrary ledger id (`gl.ts`, outside "applyExternalSale only"). Rule: follow-up WO, or allow a minimal `postExternalSale` extension?
2. **R6 for legacy callers.** A legacy retry with the same key but a changed payload (e.g. a re-recorded deposit amount) used to get the old sale silently; it now throws IDEMPOTENCY_CONFLICT. That is the ruling, but watch the booking/rental deposit suites.
3. **BLOCK inside a caller's tx** (createSale called with a tx client): stock is cut in-tx, but COGS GL is not posted (the post-commit path only runs when createSale owns the tx). No current BLOCK caller does this (giftcard lines have no itemId).
4. createSale (not the register) does not check the tip/SC *settings*: legacy callers pass amounts they computed themselves (K8 relies on that). OK?
5. Register refuses a second CASH row (tendered/change lives on one CASH row). OK?

## R2 — reviewer MERGEABLE-AFTER-FIXES · controller rulings F1–F6 (cloud · 4 Oct 2026)
- **F1** `posSystemForSale(tenantId, unitId, systemId?)` in `pos/service.ts` (re-exported from `pos/index.ts`): linked POS ⇒ that POS · unlinked + exactly 1 active POS ⇒ that POS · 0 ⇒ `NO_POS` · 2+ ⇒ `UNIT_SYSTEM_MISMATCH` "เลือกจุดขายก่อน". createSale's guard now calls the same function. Used as the PRE-claim POS gate in shop (`confirmOrderPaid`, gate moved before the claim; the claim is reverted if createSale throws), clinic (`billVisit`, fee > 0 only), school (`markPaid`), rental (`returnAsset`). The old Thai "no POS" texts are kept for NO_POS. Side effect: these callers now file the sale to the unit's linked POS instead of "first POS of the tenant". AI (`ai/proposals.ts`) does not claim before createSale and is a frozen file ⇒ unchanged (a refused sale commits nothing there).
- **F2** `restaurant/order.ts`: reads `saleStatusByKey` first; while the stored sale is VOIDED, moves to `rest-<hash>-rN` (≤ 50), then one createSale. A changed pay method/qty after a void now works.
- **F3** BLOCK in-tx `consumeInTx` only for items in the locked set that are not SERVICE; missing/SERVICE items go the legacy post-commit path and never fail the sale.
- **F4** `pg_advisory_xact_lock(hashtext(tenantId || ':' || key))` before the duplicate lookup, in both modes (own tx and caller tx). The P2002 retry is NOT dead and stays (own tx only): two different keys can still race the `upsert` of a brand-new (unit, month) receipt-counter row.
- **F5** `updatePosPaymentSettings` refuses any patch that would leave tip enabled with `TIP_NOT_AVAILABLE` (data, th message; en/th key `pos.register.errors.tipNotAvailable`, mapped in `refusalMessageKey`). Checked AFTER the ledger check, so a missing/wrong ledger still answers TIP_ACCOUNT_REQUIRED. Switch: `TIP_POSTING_READY = false` (P1.6b flips it). Rest of the tip plumbing unchanged.
  - **Oracle checks that go red because of F5 (no ORACLE-EDIT made, controller to rule):** **P1.6-K4** (the valid-ledger leg expects ok + tip enabled; gets TIP_NOT_AVAILABLE) and **P1.6-K5** (tip sale needs tip on; the register answers VALIDATION "tip not enabled"). K6 stays green (malformed tips are VALIDATION by parse; "tip off + 500" is VALIDATION). K9 stays green (unlinked POS ⇒ TIP_ACCOUNT_REQUIRED first). R1 unaffected (its K4 entries are the two TIP_ACCOUNT_REQUIRED legs).
- **F6** legacy dup compare adds itemId/productId/serviceId per line + memberId · the unlinked exactly-1-POS branch requires `input.systemId` to be that POS (0 active POS + explicit systemId keeps legacy behaviour) · th/en `stockInsufficient` copy no longer says "you can still sell".
- Not touched (rulings): CRM commission base; closeDay tip line (P1.9).
- Verified (no DB): pure oracle groups V1 V2 U4 R2 R3 green · `qc-pos-p1.6 --list` exit 0 · p1.4/p1.5 `--no-db` exit 0 · fitness (DB env unset) 41/41 · typecheck exit 0.
- Extra suites for the controller because of F1: qc-shop (no-POS case now refuses before the claim; order stays PENDING_PAYMENT) · qc-clinic · qc-school · qc-rental · qc-shop-refund.

## R3 — qc-subscription-money SM-4.1 (VPS run at 3341c290)
- Diagnosis: the test's idempotent retry (`scripts/qc-subscription-money.mts` ~75) sent `payMethods [CASH 59900]`, but the original subscription sale was paid with **PROMPTPAY** (`sub.subscribe(... payMethod: "PROMPTPAY")`, asserted by SM-2.6). Pay type is a money field ⇒ IDEMPOTENCY_CONFLICT is correct per R6 (oracle I2 "paytype" requires it). Every other field matched: unit/system, memberId, lines price|qty|disc with no item/product/service, SC/tip 0. The line name and pointSystemId are not compared.
- Case (b) FIXTURE: the retry now sends PROMPTPAY 59900 (same payload as the original). No assertion changed.

## R4 — money-lane hunter fixes (cloud · 4 Oct 2026)
- **H1** `restaurant/order.ts`: one bounded loop (≤ 50 key moves). A key whose stored sale is VOIDED is skipped (the pre-read), and the createSale result is also checked: a status other than PAID moves to the next `rest-<hash>-rN` and retries. Items are linked and the session closed only for a PAID sale. Still exactly one `createSale(` call site (U4).
- **H2** `shop/service.ts`: the catch around createSale reverts the claim only when `saleStatusByKey(tenantId, "ecom-"+orderId) === null` (no bill committed).
- **H3** clinic `billVisit` / school `markPaid` / rental `returnAsset`: the same guarded undo (BILLED→OPEN · PAID→ENROLLED · RETURNED→PICKED_UP, only while `posSaleId` is null and no bill exists for the key). The claim's outbox event (clinic.visit.done / school.enrolled / rental.returned) is already committed and stays, as before C2.9.
- **H4** `giftcard/service.ts` (sell + reload): `vatSatang: 0` is set in the same tx update that sets `giftCardId` (the consumer skips gift-card bills, so nothing is posted to the ledger).
- **H5** `parsePosPaymentSettings` ANDs `TIP_POSTING_READY` into `tip.enabled` on read. createSale refuses `tipSatang > 0` with VALIDATION when the POS tip setting reads off (before the counter), so legacy callers cannot bypass it.
- Verified (no DB): pure oracle groups V1 V2 U4 R2 R3 green · `qc-pos-p1.6 --list` exit 0 · p1.4/p1.5 `--no-db` exit 0 · fitness (DB env unset) 41/41 · typecheck exit 0.
- DB checks for the controller run. The hunter's own SQL did not reach this session, so these are mine, written from the hunter's findings:
  - no PAID restaurant session closed on a VOIDED bill: `SELECT i.id FROM "RestaurantOrderItem" i JOIN "PosSale" s ON s.id = i."saleId" WHERE s.status <> 'PAID' AND i."settledAt" IS NOT NULL;` → expect 0 rows (after voidCheckout these items are reset to saleId null).
  - no claimed caller row without a bill: `SELECT id FROM "ShopOrder" WHERE status='PAID' AND "posSaleId" IS NULL;` · `SELECT id FROM "ClinicVisit" WHERE status='BILLED' AND "posSaleId" IS NULL AND "feeSatang" > 0;` · `SELECT id FROM "SchoolEnrollment" WHERE status='PAID' AND "posSaleId" IS NULL;` · `SELECT id FROM "RentalBooking" WHERE status='RETURNED' AND "posSaleId" IS NULL;` → expect 0 rows (in tenants with a POS).
  - gift-card bills carry no VAT: `SELECT id FROM "PosSale" WHERE "giftCardId" IS NOT NULL AND "vatSatang" <> 0;` → 0.
  - no tip while tip is unavailable: `SELECT id FROM "PosSale" WHERE "tipSatang" <> 0 AND "createdAt" > <deploy time>;` → 0.
