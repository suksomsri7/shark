# POS P2.5 — oracle notes (`scripts/qc-pos-p2.5.mts`)

Oracle writer · VPS (account B) · 14 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.5-oracle` from `session/pos` **c1a256ef** (code = 4449123f, P2.6U merged).
Contract: `ledger/pos-briefs/pos-brief-P2.5.md` §0–§9 + **§10 controller rulings 1–12 (binding)**. U half (15B/15C modal, 03 buttons/drag, pre-bill preview, visual states §9) is not tested here (P2.5U).

**40 checks** = ST (3 static) · M (7 money: M1–M5, M7 DB · **M6 pure**) · P (6 plan lifecycle) · S (3 stock/accounting) · X (4 void/refund) · **C (6 concurrency, third tx holds the lock)** · T (3 move/merge) · B (3 pre-bill: B1 B2 DB · **B3 pure**) · L (3 **PAR**) · Z (2).
Modes: `--list` (no DB, no imports) · `--no-db` (ST1–ST3 + L1 L2 static + M6 B3 pure; never loads prisma) · DB run SKIPs (exit 0 + reasons) until every P2.5 file/export/delegate/table exists · `QC_FORCE=1` runs anyway (red by reason, no crash; every check wrapped) · `QC_ALL=1` prints every reason.

Fixtures (module functions only; Prisma direct only for Tenant/BusinessUnit/User/Membership/AccountSystemLink; raw SQL only for locks, `pg_blocking_pids`, fingerprint, cleanup): temp tenant `posqc-p25-<rand>` (+ `-t2` with unit X, table X1 and an OPEN session = foreign scope), users `posqc-p25-<rand>-{owner,mgr,cashier,waiter,noperm}@qc.invalid` — OWNER `*` · MANAGER [A] · CASHIER [A] `pos.sale.create` (STAFF cap 1000 bp) · WAITER [A] `pos.sale.read restaurant.session.move restaurant.session.merge` · NOPERM [A] `{}`. Unit **A** = RESTAURANT linked to POS + INVENTORY + MEMBER, POS linked to a VAT-registered book (7 % INCLUDED), POS service charge 10 %. Unit **B** = SHOP on the same POS, no tables. **Menu of 03/15 (table A5)**: ต้มยำกุ้ง 18000 · กะเพราไก่ไข่ดาว ×2 9900 · ข้าวสวย ×4 1500 (**PRODUCT, tracked InvItem**) · ปลาหมึกผัดไข่เค็ม 23000 · ยำวุ้นเส้น 15000 (**MENU with P2.3 recipe → InvItem วุ้นเส้น ×1**) · ชาไทยเย็น ×3 6900 · ลาเต้เย็น ×2 7500 · บราวนี่ 6500 (MenuItem `stockQty 500`) ⇒ Σ 124,000 + service 12,400 = **136,400** (8 item rows, one round sent through P2.4 `holdRegisterCart`+`registerSendTableRound`). Member คุณวิภา Silver (DISCOUNT_PCT 10 %). Devices DEV1/DEV2 with open shifts. Tables are created on demand (`A5` 15B · `A1` EQUAL · `A2` SEAT · `A3` discount · `A4` member · `A6` INACTIVE · `B4–B9` lifecycle · `C1–C5` races · `M1–M4` move races · `G1/G2` merge race · `N1–N6` move · `K1–K10` merge · `L1–L5` legacy PAR). `finally` wipes both tenants (every table with `tenantId`, incl. `PosTableSplit*`) + users.

## Names table (exactly as the oracle calls them — builder S must match)
| # | name | shape / where |
|---|---|---|
| 1 | enums | `PosTableSplitMode {ITEM EQUAL SEAT}` · `PosTableSplitStatus {OPEN DONE CANCELLED}` · `PosTableSplitPartStatus {OPEN PAID}` |
| 2 | `model PosTableSplit` | `id String @id · tenantId String · systemId String · unitId String · sessionId String (loose) · mode PosTableSplitMode · status PosTableSplitStatus (default OPEN allowed) · partCount Int · itemsHash String · billDiscount Json? · serviceChargeBp Int · baseSatang Int · discountSatang Int · serviceChargeSatang Int · totalSatang Int · version Int @default(1) · createdByUserId String(?) · createdAt DateTime @default(now()) · updatedAt DateTime @updatedAt · doneAt DateTime? · cancelledAt DateTime?` · extras only optional/defaulted/list or relations to `PosTableSplitPart/Line` |
| 3 | `model PosTableSplitPart` | `id · tenantId · splitId · no Int · label String? · memberId String? · baseSatang · discountSatang · serviceChargeSatang · totalSatang (Int) · status PosTableSplitPartStatus · saleId String? · paidAt DateTime?` · `@@unique([splitId, no])` |
| 4 | `model PosTableSplitLine` | `id · tenantId · splitId · partId · itemId String (loose) · qty Int? · shareNum Int? · shareDen Int? · amountSatang Int · stockOwner Boolean` |
| 5 | no restaurant/PosSale coupling | no `@relation`/FK to `TableSession`/`RestaurantOrderItem`/`RestaurantTable`/`RestaurantOrder`/`PosSale`; `TableSession` = P2.4 `TS_FIELDS`, `RestaurantOrderItem` = `ROI_FIELDS`, `PosSale` block mentions no `PosTableSplit` |
| 6 | migration | one dir **`20261210100000_pos_p25_split`**: `SET/RESET lock_timeout` · `CREATE TYPE "PosTableSplit…" AS ENUM` (bare or `DO $$ … duplicate_object $$`) · `CREATE TABLE IF NOT EXISTS "PosTableSplit" / "PosTableSplitPart" / "PosTableSplitLine"` · `CREATE [UNIQUE] INDEX IF NOT EXISTS … ON "PosTableSplit*"` (incl. **`"PosTableSplit_session_open_key" ON "PosTableSplit"("sessionId") WHERE "status" = 'OPEN'`** and a unique `ON "PosTableSplitPart"("saleId") WHERE "saleId" IS NOT NULL`) · `ALTER TABLE "PosTableSplit*" ADD CONSTRAINT … FOREIGN KEY/CHECK` (only between the three tables) · nothing else |
| 7 | registrations | `core/scope.ts` `PosTableSplit: sys()` (Part/Line: `sys()`/`unit`/`tenant` — CONTROLLER-DECISION 3) · `pos-qc-env` `POS_MODELS.posTableSplit / posTableSplitPart / posTableSplitLine {model: "…"}` |
| 8 | refusal codes | `TABLE_SPLIT_OPEN TABLE_SPLIT_EXISTS TABLE_SPLIT_LOCKED TABLE_SPLIT_PART_PAID TABLE_SPLIT_NOT_FOUND TABLE_BUSY TABLE_HAS_DRAFT` in `RegisterRefusalCode` + `REFUSAL_KEY` → `errors.tableSplitOpen errors.tableSplitExists errors.tableSplitLocked errors.tableSplitPartPaid errors.tableSplitNotFound errors.tableBusy errors.tableHasDraft` · `src/messages/{th,en}/pos.json` `register.errors.<those>` (th Thai, en no Thai) + non-empty **`tables.split.* tables.move.* tables.merge.* tables.preBill.*`** (same key set th/en) |
| 9 | pure `pos/table-split-shared.ts` | `allocateTableSplit(input)` · `TABLE_SPLIT_MODES = ["ITEM","EQUAL","SEAT"]` · `TABLE_SPLIT_MIN_PARTS = 2` · `TABLE_SPLIT_MAX_PARTS = 20` · imports no prisma/server/`node:` · no `Date.now()`/`new Date()`/`Math.random()` |
| 10 | `allocateTableSplit` input | `{ mode, partCount, items: [{id, qty, unitSatang /* unitPrice+optionsTotal */}], allocations?: [{itemId, partNo: number \| null /* null = กลางโต๊ะ (SEAT only) */, qty}] (EQUAL: none), billDiscount?: {type: "PERCENT" (bp) \| "AMOUNT" (satang), value} \| null, serviceChargeBp, vatRateBp? }` |
| 11 | `allocateTableSplit` result | `{ ok: true, baseSatang, discountSatang, serviceChargeSatang, totalSatang, parts: [{ no, baseSatang, discountSatang, serviceChargeSatang, totalSatang, vatSatang, lines: [{ itemId, qty: number \| null, shareNum: number \| null, shareDen: number \| null, amountSatang, stockOwner }] }] }` · refusals `{ok:false, code: "VALIDATION" \| "TOO_MANY_LINES" \| "BILL_DISCOUNT_EXCEEDS_TOTAL", message}` (1 or 21 parts · empty part · unallocated/over-allocated item · ITEM with a shared unit · partNo out of range · EQUAL with allocations · > 200 items ⇒ TOO_MANY_LINES) |
| 12 | allocation rule (oracle reference `refAlloc`) | whole units: one line per (item, part) `qty k · amount k×unit · stockOwner true` · shared units u of an item (SEAT กลางโต๊ะ / EQUAL every item): every part gets a share line `qty null · shareNum u · shareDen N · amount q (+1 for parts 1..r of u×unit = qN+r) · stockOwner = (part 1)` · `D = discountOf(billDiscount, Σb)` (priceCart rule) · `d = LR(D, b)` · `S = halfUp((Σb−D)·bp, 10000)` · ITEM/SEAT: `s = LR(S, b−d)`, `t = b−d+s` · **EQUAL: `T = Σb−D+S = qN+r`, `t_i = q+1` for i ≤ r, `s_i = t_i − b_i + d_i`** (CONTROLLER-DECISION 1) · `vat_i = splitIncludedVat(t_i, vatRateBp)` · `LR` = floor then +1 by largest remainder, **ties → lower part number** |
| 13 | `pos/table-split.ts` | `registerSplitTable(ctx, actor, {tableSessionId, mode, partCount, expectedItemsHash, allocations?, billDiscount?, parts?: [{no, label?, memberId? /* null = none */}], splitId?, expectedVersion?, managerPin?, managerUserId?})` → `{ok:true, split: SplitPlanView}` · without `splitId` while an OPEN plan exists ⇒ `TABLE_SPLIT_EXISTS` with top-level `splitId` + `version` of the current plan · replace = `splitId + expectedVersion` (stale ⇒ `VERSION_CHANGED`, any PAID part ⇒ `TABLE_SPLIT_LOCKED`; same `splitId`, `version + 1`) · `expectedItemsHash` ≠ `tableItemsHash` of the session's unpaid items ⇒ `TABLE_ITEMS_CHANGED` · foreign/other unit ⇒ `TABLE_NOT_FOUND` · `pos.sale.create` (WAITER with read only ⇒ `PERMISSION_DENIED`) · discount cap P1.15 at save (`DISCOUNT_EXCEEDS_LIMIT`) · session member → part 1 by default · `registerCancelSplit(ctx, actor, {splitId, expectedVersion})` → `{ok:true}` (status CANCELLED + cancelledAt; any PAID part ⇒ `TABLE_SPLIT_LOCKED`; unknown ⇒ `TABLE_SPLIT_NOT_FOUND`) · `registerSplitDetail(ctx, actor, {tableSessionId})` → `{ok:true, split: SplitPlanView \| null, outsideItemIds: string[]}` (`pos.sale.create` or `pos.sale.read`) |
| 14 | `SplitPlanView` | `{ splitId, version, mode, status, partCount, itemsHash, serviceChargeBp, baseSatang, discountSatang, serviceChargeSatang, totalSatang, parts: [{ id, no, label, memberId, baseSatang, discountSatang, serviceChargeSatang, totalSatang, vatSatang, status, saleId, lines: [{ itemId, name /* share: "<item> (1/4)" */, qty, shareNum, shareDen, amountSatang, stockOwner }] }] }` · stored rows = pure result |
| 15 | register quote/submit | `REG_QUOTE_KEYS` + `"tableSplitPartId"` · `REG_SUBMIT_KEYS` + `"expectedSplitVersion"` · with `tableSplitPartId`: `lines` must be `[]`, `tableSessionId`/`billDiscount`/`heldCartId`/`channelId` ⇒ `VALIDATION` · unknown part ⇒ `TABLE_SPLIT_NOT_FOUND` · coupon on a part without member ⇒ `VALIDATION` · quote = normal totals (`subtotalSatang = b_i`, `billDiscountSatang = d_i`, `serviceChargeSatang = s_i`, `grandTotalSatang = t_i − member rights`) + `table {…}` + **`split: {splitId, partId, partNo, partCount, version}`** · submit: replay same key ⇒ same sale `duplicated:true` · same part paid by another key ⇒ `TABLE_SPLIT_PART_PAID` · session not OPEN ⇒ `TABLE_SESSION_CLOSED` · plan item cancelled/paid outside ⇒ `TABLE_ITEMS_CHANGED` (nothing written) · whole-table quote/submit (`tableSessionId`) while a plan is OPEN ⇒ `TABLE_SPLIT_OPEN` |
| 16 | part sale | `PosSale` `sourceModule "POS"`, `sourceId` = session, `channelCode STORE` (QR_TABLE when guest-opened), `subtotalSatang = b_i`, `discountSatang = d_i` (+ member), `serviceChargeSatang = s_i`, `vatSatang = vat_i`, `memberId` only on the member part · whole-unit lines = `regTableLines` shape with `qty k` (PRODUCT keeps `itemId`) · share lines `name "<item> (n/N)"`, `qty 1`, `unitPriceSatang = share`, `productId` kept, **no `itemId`**, stock via `components` on the owner part only · no `ticketForSale`, no `RestaurantOrder` |
| 17 | settlement | part PAID + `saleId` + `paidAt` · item `saleId` = sale of the part that completes it (all parts holding it PAID) · all parts PAID ⇒ plan DONE + `doneAt` · then P2.4 rule: no unpaid item and no HELD draft ⇒ session CLOSED + table `dirtySince` |
| 18 | void consumer | `pos/table.ts tableSaleVoided` gains one `// POS P2.5 ▸ … ◂` hunk: voided part ⇒ part OPEN/`saleId null`, plan DONE→OPEN, every item with a line in that part unlinked (facade `unlinkTableItemsInTx`), session reopened per P2.4 rule (CLOSED ∧ no other OPEN session on the table) · replay = no change |
| 19 | `pos/table.ts` move/merge | `registerMoveTable(ctx, actor, {tableSessionId, toTableId})` → `{ok:true, changed: boolean, reservationOverridden?: true}` (VIEW perms + `restaurant.session.move`) · `TABLE_BUSY` / `TABLE_INACTIVE` / `TABLE_NOT_FOUND` (T2 table, unknown id, ctx unit B, foreign session) / `TABLE_SESSION_CLOSED` · source table `dirtySince = now`, target `dirtySince = null` · same table ⇒ `changed:false` · `registerMergeTables(ctx, actor, {intoSessionId, fromSessionIds /* 1..5, distinct, ≠ into */})` → `{ok:true, changed: boolean}` (VIEW perms + `restaurant.session.merge`) · orders + service requests moved · `guestCount = Σ` · member = into ?? first from with one · froms MERGED + `mergedIntoId` + from tables `dirtySince` · one HELD draft ⇒ re-pointed to into; drafts in two sessions ⇒ `TABLE_HAS_DRAFT` · OPEN plan in any session ⇒ `TABLE_SPLIT_OPEN` · 6 froms / into in froms ⇒ `VALIDATION` · replay ⇒ `changed:false` |
| 20 | facade | `restaurant/index.ts` block `// POS P2.5 ▸ … ◂` re-exporting `moveTableSessionInTx`, `mergeTableSessionsInTx`, `unlinkTableItemsInTx` (defined in `restaurant/pos-tables.ts` or new `restaurant/pos-split.ts`) |
| 21 | pre-bill | `registerTablePreBill(ctx, actor, {tableSessionId} \| {tableSplitPartId}, + {locale?, copy?})` → `{ok:true, payload}` (`pos.sale.create` or `pos.sale.read`) · `payload = {kind:"PRE_BILL", shop {name, branch}, tableName, guestCount, openedAt, printedAt, staffName, part {no, of} \| null, member \| null, lines [{qty, name, options[], amountSatang}], subtotalSatang, discountSatang, serviceCharge {rateBp, satang}, vatIncludedSatang, totalSatang, itemsHash, notReceipt: true, copy, locale}` · no key `receiptNo receiptNumber abbNo abbNumber taxId taxInvoiceNo docNo documentNo seq` at any depth · AuditLog `action "pos.table.preBill"`, `after {sessionId, partId?, totalSatang, itemsHash}` per call · no state change, no receipt seq/JV/outbox · refusals `PERMISSION_DENIED TABLE_NOT_FOUND TABLE_SESSION_CLOSED TABLE_SPLIT_NOT_FOUND` |
| 22 | pure `pos/pre-bill-render.ts` | `renderPreBillHtml(payload, {paper, locale})` → string · `renderPreBillEscPos(payload, {paper, thaiText, locale?})` → `{bytes, rasterSlots}` (= `EscPosResult`) · `PRE_BILL_LABELS {th: {title: "ใบรายการ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี", footer: "ตรวจรายการแล้วแจ้งพนักงานเพื่อชำระเงิน", copy: "สำเนา"}, en: {title ⊇ "PRE-BILL — NOT A RECEIPT", copy: "COPY"}}` · part header "บิล N จาก M" · value imports only `./*-shared` or `./receipt-render` · no clock |
| 23 | actions | any `"use server"` file(s) in `modules/pos` (async-only exports) whose actions together call all six new functions, each with `catch` (names free) |
| 24 | owner line | `ledger/POS-OWNER-PENDING.md` ≥ 1 line containing `P2.5` (§4 known effects) |
| 25 | unchanged (PAR) | `pos-sale-contract.json` sha `7a418de1…97cd` · createSale call-site registry · `register.ts` has exactly 2 `ticketForSale(` · restaurant export signatures (P2.4 L3 table incl. `moveSession`/`mergeSession`) · legacy move/merge results byte-identical |

## CONTROLLER-DECISION (read first — the oracle encodes my proposal for each)
1. **EQUAL rounding (CD4 vs M2 numbers).** Brief R2 steps (1)–(5) applied to EQUAL (per-item shares, then service by largest remainder) give 45468 / 45467 / 45465 for EQUAL 3 — not the 45467 / 45467 / 45466 that R2's own "EQUAL T = qN + r ⇒ parts 1..r get q+1" and §6 M2 require. Oracle: **EQUAL pins the totals** (`t_i = q+1` for i ≤ r), item shares stay per item (+1 to lower parts), `d_i = LR(D, b_i)`, and **`s_i = t_i − b_i + d_i`** (Σ s = S exactly; each s within a few satang of proportional). EQUAL 3 ⇒ bases 41334/41334/41332, service 4133/4133/4134. ITEM/SEAT use R2 unchanged.
2. **Lock order of move/merge (ruling 8 "sessions → items") vs pay (R4 "items → part → session", P2.4 settle = claimed items then session `FOR UPDATE`).** If move/merge lock item rows after the session, a concurrent pay (holding the items, waiting for the session) deadlocks (40P01). Oracle C5(b)/C6 demand both orders finish without deadlock. Recommendation: move/merge lock **table advisory locks (sorted) → sessions FOR UPDATE (id order)** only (brief R7/R8 text), never item rows; pay keeps items → part → session.
3. **Scope axis of `PosTableSplitPart`/`PosTableSplitLine`.** §3 says "three `sys()` entries" but gives Part/Line no `systemId`. Oracle accepts `sys()`, `unit` or `tenant` per model (the builder must keep the axis consistent with the columns; `PosTableSplit` has `systemId`).
4. **Pre-bill label.** Ruling 9 (binding) "ใบรายการ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี" replaces R9's "ใบรายการ — ยังไม่ใช่ใบเสร็จ"; oracle pins ruling 9 for th and "PRE-BILL — NOT A RECEIPT" (contained) for en (ruling silent on en).
5. **"open-round checks" (ruling 8).** Not defined in R7/R8 (R7: rounds follow the session; T1 moves while a round is NEW). Oracle encodes **no refusal**; move/merge simply serialize with an in-flight round through the session row lock (P2.4 `lockOpenSessionInTx` FOR SHARE).
6. **CD11 `TOO_MANY_LINES`.** With ≤ 200 plan items no part can exceed 200 sale lines (except SEAT whole + share of the same item). Oracle pins only the pure allocator (201 items ⇒ `TOO_MANY_LINES`); no DB check.
7. **M4 manager path.** Oracle exercises the cap with a MANAGER **actor** (20 % ok) and CASHIER (20 % ⇒ `DISCOUNT_EXCEEDS_LIMIT`, plan untouched); the `managerPin` path is not exercised (no PIN fixture). Accept, or add a PIN fixture as ORACLE-ADD.
8. **Refusal payload of `TABLE_SPLIT_EXISTS`.** Oracle reads `splitId` + `version` at the top level of the refusal object (`{ok:false, code, message, splitId, version}`).
9. **Full tax invoice on a part (S3)** is issued on part 2 of the member table A4 (`taxInvoice` at submit) — not on the 15B table, because X1 voids 15B part 2 and a voided sale with a full tax invoice is out of P2.5 scope.
10. **Owner-pending line** (ST3) — the builder or the controller adds ≥ 1 `P2.5` line in `POS-OWNER-PENDING.md` (share qty in product reports → P2.12 · share-line refund with restock restocks the whole item · per-part VAT may differ by ≤ ⌊(N+1)/2⌋ · guest QR of a moved/merged table opens a new session → P2.7 · item unpaid on a CLOSED session after a part void when the table has new guests).
11. **Known pin risk (not an edit):** `qc-pos-p2.8` ST6 PAR compares `register.ts` sha with the merge-base of `origin/session/pos` — green on the wip branch, re-run at merge (P2.6 precedent). `qc-pos-p2.4` floor/detail DTO checks are "missing keys" only ⇒ additive `split` keys are safe. No other pin is expected to turn red.
12. **P2.4 F2 orphan HELD drafts sweep** (brief §0 "still unswept") has no R-line and is not tested.

## Drift (brief vs code at 4449123f)
- Confirmed: no `PosTableSplit*`, no `allocateTableSplit`, no move/merge/pre-bill doors, no `tableSplitPartId` key, no P2.5 codes/messages; `TablePanel` PLANNED buttons only.
- `moveSession`/`mergeSession` are table-blind exactly as §0 says: move sets no `dirtySince`; merge does not sum `guestCount` and does not dirty the from table (L3 pins both, green on base).
- `restaurant/pos-tables.ts` `unlinkTableSaleInTx` unlinks by `saleId` only; with CD7 (item `saleId` = completing part's sale) voiding a non-completing part needs the new `unlinkTableItemsInTx(itemIds)` (R6) — the existing function would unlink nothing for that part.
- `settleTableItemsInTx` closes only when `closeWhenPaid` and 0 unpaid items; after a legacy/new merge the from-session is MERGED ⇒ a pay that commits after the merge settles its items without closing anything (C6 accepts this "pay then merge" outcome).
- `kdsBoard` ticket `label` reads `session.table.name` live (`restaurant/kitchen.ts:215`) ⇒ T1 expects the new table name after a move with no reprint.
- Register VAT is book-level (not unit-level); a "VAT NONE unit" fixture would need a second POS system — M5 covers VAT 0 through the pure allocator (`vatRateBp 0`).
- Ruling 10 "move/merge/pre-bill = the P2.4 table keys" = P2.4 `VIEW_PERMS` (`pos.sale.create|read`) + the restaurant key; pre-bill = VIEW_PERMS only (WAITER with `pos.sale.read` may print; NOPERM refused).
- Brief prompt families list "split while a round is COOKING" under C; it is not a race (no lock contention) ⇒ P6.

## Positive / negative controls (scratch only, not committed)
A copy of `src/` with a reference `table-split-shared.ts` (the algorithm of row 12) and a minimal `pre-bill-render.ts` turns **M6 and B3 green** under `--no-db`; the same allocator with ties → *higher* part number turns M6 red at random plan #0 (`serviceChargeSatang 2062 (คาด 2063)`).

## Expected red on c1a256ef (forced run, QC4)
`QC_FORCE=1` on QC4 `ep-frosty-lab-aoylqlv8-pooler…` (14 Oct ~18:1xZ, saved as `ledger/wo-notes/P2.5-red.txt`) → **5/40 green: L1 L2 L3 (PAR 3/3) + Z1 Z2**; residue 0 (329 tables, Tenant 0, users 0); no harness crash; exit 1. Fixture (tenant, menu, recipe, member, devices/shifts, 60+ table sessions via P2.4 doors) built without a warning.
- ST1–ST3: enums/models/migration · scope/POS_MODELS · 7 codes + keys + messages · facade P2.5 block · `table-split*.ts`/`pre-bill-render.ts` · actions · void-consumer marker · owner line — all missing.
- M6 / B3 (pure): `table-split-shared.ts` / `pre-bill-render.ts` missing (positive control turns both green, see above).
- M1–M4, M7, P1–P6, C1–C4: `MISSING:registerSplitTable/registerCancelSplit/registerSplitDetail`; every part quote/submit with `tableSplitPartId` = `VALIDATION` (unknown key); C1–C4 "nobody waited on the held lock" because no creator runs (C4 base: whole pay wins, no plan).
- M5 S1–S3 X1–X4: no part sales ⇒ no VAT/stock/GL/tax-invoice evidence; X1/X3 stop with "no part-2 sale"; X4 void → `SALE_NOT_FOUND`. S1 base shows rice onHand unchanged (296 → 296) — no cross-step interference.
- B1 B2: `MISSING:registerTablePreBill`.
- C5 C6 T1–T3: `MISSING:registerMoveTable/registerMergeTables` (C6 base: whole pay of the from-session OK, merge missing).
- A first forced run (red1) showed rice −2 leaking into S1 from the P4/P2 helper tables; fixed (those tables no longer order rice; X2 measures its own delta) before this run.

## `--list`
```
qc-pos-p2.5 — 40 ข้อ (id · X · หัวข้อ)	
P2.5-ST1	S
P2.5-ST2	S
P2.5-ST3	S
P2.5-M1	X4
P2.5-M2	X4
P2.5-M3	X4
P2.5-M4	X3
P2.5-M5	X4
P2.5-M6	P
P2.5-M7	X4
P2.5-P1	X1
P2.5-P2	-
P2.5-P3	X5
P2.5-P4	X1
P2.5-P5	X3
P2.5-P6	-
P2.5-S1	X4
P2.5-S2	X5
P2.5-S3	X4
P2.5-X1	X1
P2.5-X2	X1
P2.5-X3	X5
P2.5-X4	-
P2.5-C1	X1
P2.5-C2	X1
P2.5-C3	X1
P2.5-C4	X1
P2.5-C5	X1
P2.5-C6	X1
P2.5-T1	-
P2.5-T2	X2
P2.5-T3	X1
P2.5-B1	X5
P2.5-B2	X2
P2.5-B3	P
P2.5-L1	PAR
P2.5-L2	PAR
P2.5-L3	PAR
P2.5-Z1	-
P2.5-Z2	-
X-coverage: S=3 X4=7 X3=2 P=2 X1=11 -=6 X5=4 X2=2 PAR=3	
```

## Commands
- `pnpm exec tsx scripts/qc-pos-p2.5.mts --list` · `… --no-db` (7 checks; on base 2/7: L1 L2 green, exit 1)
- DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.5.mts` (drop `QC_FORCE=1` after build: the SKIP gate opens when every file/export/delegate/table exists)
- Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → **exit 0** (18:05→18:06Z, on the oracle before the final 4-line S1/X2 fixture fix) · single-file `tsc -p <scratch>/tsconfig.p25.json` on the final file → exit 0
- Runs at commit: `--list` 40 ids · `--no-db` 2/7 (L1 L2) · forced QC4 ×2 (final = P2.5-red.txt) 5/40, PAR 3/3, residue 0
