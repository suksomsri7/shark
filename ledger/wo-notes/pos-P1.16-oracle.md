# POS P1.16 — oracle notes (`scripts/qc-pos-p1.16.mts`) · server half (S)

Oracle writer · tree `/root/projects/shark-pos-c` · branch `wip/pos-p1.16-oracle` from `origin/session/pos` 5cec1607 (= acceptance a1fa7514 + prompt) · 8 Oct 2026.
Contract: `ledger/pos-briefs/pos-brief-P1.16.md` §2 R1–R6 (+R5b) and §4 (binding), §5 CD1–CD5. §3 (UI) is not tested here.
DB: QC4 only (`ep-frosty-lab-aoylqlv8-pooler…neon.tech`) through `iso.sh → qc4.sh → with-gate-lock.sh`.

## CONTROLLER-DECISION (read first — the oracle picks the option marked ▶; overrule = ORACLE-EDIT)

| # | question | ▶ oracle encodes | alternative |
|---|---|---|---|
| CD-O1 | R1 says "permission `pos.sale.read` **at the unit**", §4 says "other unit → **empty, not refused**". | ▶ NO_PERMISSION only when the actor can read bills **nowhere** (same rule as `receiptReadScope`: `pos.sale.read` OR `pos.sale.create`, P1.10 CD3). A unit outside the actor's scope, or a unit of another POS under this `systemId`, returns `ok:true` with 0 rows/0 counts (B1). | refuse NO_PERMISSION per unit |
| CD-O2 | `summary.billCount` — all SALE rows, or non-voided? | ▶ `billCount = paid + refunded` (non-voided), `storeCount + onlineCount = billCount` (the card says "บิล N · หน้าร้าน a · ออนไลน์ b" next to net/avg that exclude voids). Fixture: 11 = 10 + 1. | all rows (13) |
| CD-O3 | `avgSatang` rounding when net / count is not whole. | ▶ fixture divides exactly (61,600 / 11 = 5,600 · 15,000 / 2 = 7,500), so no rounding is asserted. Proposed rule for the builder: half-up integer satang. | — |
| CD-O4 | `summary` under a status filter. | ▶ summary is for the date like `counts` (unchanged when `status=VOIDED`, B6). | follow the filter |
| CD-O5 | `items` order. | ▶ time (paidAt ?? createdAt) **newest first** (B8 asserts page 1 + page 2 order). | oldest first |
| CD-O6 | `payMethods` "ordered distinct types" — ordered by what? | ▶ `PAY_TYPE_ORDER` of `service.ts` (CASH, PROMPTPAY, TRANSFER, CARD, DEPOSIT, ROOM_CHARGE), joined with "+". Fixture pays PROMPTPAY first then CASH ⇒ expects `"CASH+PROMPTPAY"`. | payment-row order |
| CD-O7 | `voidBlockedReason` precedence when several apply (e.g. cashier on a refunded bill). | ▶ not asserted; D4 uses single-cause cases only. Suggested order: NO_PERMISSION → NOT_POS → HAS_REFUNDS → SHIFT_CLOSED. VOIDED / REFUNDED bills: `can.void false`, reason not asserted. | — |
| CD-O8 | R5b(a) "Σ CN VAT = sale VAT": POS refund docs (`PosSale.vatSatang`) already sum to the bill VAT (P1.8 F6); the **accounting CREDIT_NOTE documents** get VAT from `computeTotals` in `account/service.ts upsertExternalCreditNoteDocument` (run: 393 + 393 = 786 ≠ 785) — that file is outside R5b's "account/index.ts applyExternalRefund". | ▶ R5b-1 asserts Σ POS refund VAT = 785 **and** account 2200 (JV) net 0 for bill + both CNs; the document-layer VAT is printed (`VAT เอกสาร CREDIT_NOTE`) but not asserted. | also assert doc `vatAmount` sum (builder must touch `account/service.ts`) |
| CD-O9 | R2 `totals` keys have no `Satang` suffix (`subtotal, lineDiscount, …, refunded`) except `vatSatang`. | ▶ names exactly as the brief (table below). `subtotal` = Σ qty × unitPrice (gross, = `receiptPayload.totals.subtotalSatang`); `billDiscount` = `discountSatang − coupon − tier` (points/voucher/gift card stay inside it, as P1.10 F7 deferred). There is no `vatBase` key; the identity "vatBase + vat = grand" is checked as `grandTotal − vatSatang = receiptPayload.totals.vatBaseSatang`. | add `…Satang` names / `vatBase` |
| CD-O10 | Date under test. | ▶ D0 = **yesterday** in BKK from the clock, D0−1 = the day before; every fixture bill is moved (`createdAt` + `paidAt`) into D0 / D0−1 so all rows are in the past, refunds/reprints (now) always come after their bill, and a run that crosses midnight cannot change the answer. "Today" is never queried with live times. | today with live times |
| CD-O11 | `q` on a customer name: prefix or contains? case-insensitive receiptNo? | ▶ fixture uses the name's first word (prefix ⊂ contains) and the full phone; receiptNo prefix is sent lower-cased (digits only here — case is not discriminated). REFUND (CN…) numbers are not searched. | — |
| CD-O12 | Brief §4 says "Static (3)" but lists 4 items; ~22 checks. | ▶ 5 static + 8 B + 4 D + 7 V + 2 R5b + NC + Z1 = **28**. V4 adds "new key on a VOIDED bill → SALE_NOT_VOIDABLE" (follows the R3 list: status ≠ PAID) — this forces the builder to recognise the replay **by key**, not by "the row is already VOIDED". V5 adds SHIFT_CLOSED (an R3 code). | drop the extras |
| CD-O13 | Should `billDetail` serve REFUND documents (it has a `docType` field)? | ▶ not asserted. | — |

## Names table (exactly as the oracle calls them — the builder uses these names)

Service — `src/lib/modules/pos/bills.ts`:
| name | signature / shape |
|---|---|
| `billsPageData` | `(ctx: RegisterCtx {tenantId, systemId, unitId}, actor: RegisterActor, q) → Promise<BillsPageDataResult>` · `q = { unitId, date: "YYYY-MM-DD", status?: "ALL"\|"PAID"\|"VOIDED"\|"REFUNDED"\|"OFF_SHIFT_CASH", q?: string ≤60, channel?: string, staffUserId?: string, page?: number (1-based), pageSize?: 10\|20\|50 }` — `q.unitId` decides the unit (ctx.unitId may equal it) |
| ok | `{ ok:true, date, counts:{all, paid, voided, refunded, offShiftCash}, summary:{netSatang, billCount, storeCount, onlineCount, avgSatang, yesterdayAvgSatang}, items: BillRow[], total, page, pageSize, channels: string[], staff: [{userId, name}] }` |
| `BillRow` | `{ id, receiptNo, time (ISO = paidAt ?? createdAt), sourceModule, customer: {name, sub} \| null, payMethods: "CASH+PROMPTPAY" (PAY_TYPE_ORDER), staffName ("ระบบ" when soldByUserId null), grandTotalSatang, refundedSatang, status, offShiftCash: boolean, voidApprovedBy?: string (name of the void audit's actor; absent/null without audit), refunds: [{id, receiptNo, grandTotalSatang}] }` · `customer.sub` contains `Customer.memberCode`, never an id |
| refusals | `{ok:false, code, message(Thai)}` · `NO_PERMISSION` (no read anywhere) · `VALIDATION` (date not a real `YYYY-MM-DD` incl. `""`; `status` outside the list e.g. `HELD`; `q` > 60; `pageSize` ∉ {10,20,50}) · `UNKNOWN` |
| `billDetail` | `(ctx, actor, { unitId, saleId }) → { ok:true, bill } \| refusal` (`NO_PERMISSION · SALE_NOT_FOUND · VALIDATION · UNKNOWN`) · other unit / unknown id / unit outside the actor's scope = `SALE_NOT_FOUND` |
| `bill` | `{ id, receiptNo, status, docType, time, staffName, deviceName, shiftNo, sourceModule, lines:[{name, qty, unitPriceSatang, discountSatang, lineTotalSatang, options: string[]}], totals:{subtotal, lineDiscount, billDiscount, coupon, tier, serviceCharge, vatSatang, vatRateBp, grandTotal, tip, refunded}, payments:[{type, amountSatang, tenderedSatang?, changeSatang?, reference?}], member:{name, memberCode, tierName?, pointsEarned, customerId} \| null, accounting:{docNo, docId} \| null, receiptKind:"TAX_INVOICE_ABB"\|"RECEIPT", refunds:[{id, receiptNo, grandTotalSatang, time, reasonCode, reason, byName, accounting:{docNo} \| null}], timeline:[{time, text}], can:{void, refund, reprint}, voidBlockedReason?: "SHIFT_CLOSED"\|"HAS_REFUNDS"\|"NOT_POS"\|"NO_PERMISSION" }` · `deviceName` = `receiptPayload.device.name` rule (PosDevice.name ?? shift.deviceLabel) · `accounting` = `posSaleAccountingRef` (ABB) · `refunds[].accounting.docNo` = the CREDIT_NOTE `docNo` · `billDetail` must not write AuditLog (never call `receiptPayload`) |
| timeline texts | `"เปิดบิลและชำระครบ · <staff>"` · `"ลงบัญชีอัตโนมัติ <ABB docNo>"` + `" · ให้แต้มสมาชิก"` when `pointEarned > 0` · `"คืนเงิน <moneyText(grand)> · <byName> · <reason label>"` + the CN receiptNo somewhere in the same text · `"ยกเลิกบิล · <byName> · <reason>"` · `"พิมพ์สำเนา · <byName>"` — sorted by time (non-decreasing); the oracle checks `startsWith` of the first word + `includes` of each fragment; reason labels `DAMAGED สินค้ามีปัญหา · WRONG_ITEM ส่งผิดรายการ · CHANGED_MIND ลูกค้าเปลี่ยนใจ · OTHER อื่น ๆ`; money = `register-shared moneyText` (฿100) |
| `voidSaleByActor` | `(ctx, actor, { unitId, saleId, reason, idempotencyKey })` → same result as the action |

Actions — `src/lib/modules/pos/bills-actions.ts` (`"use server"` first statement · only `export async function` · each calls `requireTenant` + try/catch + `unstable_rethrow` · no `throw`; `revalidatePath` must be wrapped in try/catch — outside a request it throws, see `refund-actions.ts`):
| name | input | calls |
|---|---|---|
| `billsPageDataAction` | `{ systemId, unitId, date, status?, q?, channel?, staffUserId?, page?, pageSize? }` | `billsPageData` — result must be byte-identical to the service for the same actor (B1) |
| `billDetailAction` | `{ systemId, unitId, saleId }` | `billDetail` |
| `voidSaleAction` | `{ systemId, unitId, saleId, reason, idempotencyKey }` | `voidSaleByActor` → `{ok:true, sale:{id, status:"VOIDED"}, duplicated?: true}` · refusal codes `NO_PERMISSION · SALE_NOT_FOUND · SALE_NOT_VOIDABLE · HAS_REFUNDS · SHIFT_CLOSED · REASON_REQUIRED · VALIDATION · UNKNOWN` (Thai `message`) |

Shared (client-safe; no `@/lib/core/*`, no value import of `@prisma/client`, no `server-only`/`next/headers|cache|navigation`, no server pos module, no `"use server"`):
| file | export |
|---|---|
| `bills-shared.ts` | types + `BILLS_ERROR_KEYS = { NO_PERMISSION:"noPermission", SALE_NOT_FOUND:"saleNotFound", SALE_NOT_VOIDABLE:"saleNotVoidable", HAS_REFUNDS:"hasRefunds", SHIFT_CLOSED:"shiftClosed", REASON_REQUIRED:"reasonRequired", VALIDATION:"validation", UNKNOWN:"unknown" }` (exactly these 8) |
| `receipt-shared.ts` | `receiptKindOf({ vatRegistered, posAbbreviatedInvoice, taxId, vatSatang }) → "TAX_INVOICE_ABB" \| "RECEIPT"` (ABB iff all four: VAT book · ABB switch · trimmed non-empty taxId (null/""/"   " = no) · vatSatang > 0) · `receipt.ts` imports it from `"./receipt-shared"` and calls it |

Messages: `src/messages/{th,en}/pos.json` → `bills.errors.{noPermission, saleNotFound, saleNotVoidable, hasRefunds, shiftClosed, reasonRequired, validation, unknown}` (th has Thai, en has none).
Service change: `voidSale(tenantId: string, unitId: string, saleId: string, <name>?: { actorUserId, reason, … })` — 4th param optional, return type stays `Promise<void>` (F15.2 output). With the 4th arg it writes AuditLog `{action:"pos.sale.void", targetType:"PosSale", targetId:saleId, actorId, after:{reason, …}}` in the same transaction; the 3-arg form writes no audit (V7).
Audit rows read by the oracle: `AuditLog.action = "pos.sale.void"` (actorId = voider, `after.reason`) · `"pos.receipt.reprint"` (P1.10).
Tab label: every `/pos/sales` line in `tabs.ts` and `src/app/app/layout.tsx` carries `"บิลวันนี้"`.

## Check list (28 · X: S=5 X1=2 X2=3 X3=2 X4=5 X5=2 functional=9)

| id | what | expected |
|---|---|---|
| ST1 | files · exports · `receiptKindOf` shared · `voidSale(…, opts?)` `Promise<void>` · tab label | all present |
| ST2 | `bills-actions.ts` shape | 3 actions, requireTenant+catch+unstable_rethrow, no throw |
| ST3 | shared files pure | no server import |
| ST4 | `pos.bills.errors.*` th+en + `BILLS_ERROR_KEYS` | 8 keys, exact map |
| ST5 | `receiptKindOf` matrix | 7 cases |
| B1 | scope/permission + action = service | empty ×2 · NO_PERMISSION · owner sees B (1) |
| B2 | BKK day window | D0 has the 00:00:30 bill, not the D0−1 23:30 bill · D0−1 = 2 · VALIDATION ×3 |
| B3 | counts + status filters | `{all 13, paid 9, voided 2, refunded 2, offShiftCash 1}` · 5 filters exact id sets · `HELD` → VALIDATION |
| B4 | REFUND docs never rows; refunds[]; chips | per-row model compare |
| B5 | row fields | time · receiptNo · payMethods · staffName/"ระบบ" · customer · voidApprovedBy |
| B6 | summary | `{netSatang 61600, billCount 11, storeCount 10, onlineCount 1, avgSatang 5600, yesterdayAvgSatang 7500}` |
| B7 | q | full receiptNo 1 · prefix = set from DB (9 in the run) · name/phone 1 · `%`/`_` 0 · 61 chars VALIDATION |
| B8 | channel/staff/pagination | BOOKING 1 · POS 12 · manager 2 · page1 10 + page2 3 newest first · page3 0 · size 20 → 13 · size 15 VALIDATION |
| D1 | shape + totals identity + payload equality (bP) + bR member/accounting/refunds + no audit + SALE_NOT_FOUND ×3 | — |
| D2 | `receiptKind` = `receiptPayload.kind` | ABB (POS-A) · RECEIPT (POS-N) |
| D3 | timeline after refund + reprint | exactly 4 rows in order |
| D4 | can matrix | 5 single-cause cases |
| V1–V7 | voidSaleAction | see check titles (`--list`) |
| R5b-1 | VAT full refund in 2 partials | Σ POS refund VAT 785 · 2200 net 0 · JV balanced |
| R5b-2 | `saleStatusByKey` | refund key → null · sale key (`reg2:` + client key, read from the row) → "PAID" · unknown → null |
| NC | negative control (pure) | comparator rejects 3 wrong answers · fixture discriminates |
| Z1 | cleanup | temp tenant 0 rows · seed tenants unchanged |

## Fixture layout (temp tenant `qc-p116-<rand>`, deleted in `finally`)

- Systems: POS-A (units A, B) linked to ACCOUNT book (VAT 7 %, taxId 0105561177639, ABB switch default on) · POS-N (unit N, no book) · MEMBER + POINT (unit A, 1 point / ฿10). Shifts on unit A: S1 (device `qc116<rand>d1`, label "เครื่อง QC 1", stays OPEN) and S0 (device d2, CLOSED after bill bC).
- Actors (seed users, synthetic memberships): owner = coffee owner (OWNER `*`) · manager = resto owner (MANAGER, units A B N) · cashier = coffee cashier (STAFF unit A, `pos.sale.create` `pos.sale.read` `pos.shift.operate`) · no-read = same user with only `pos.shift.operate`.
- Bills via `quoteRegisterCart` → `submitRegisterSale` (custom-name lines), except bX (`createSale`, sourceModule BOOKING, TRANSFER, no seller/shift). Times moved to D0 / D0−1 (BKK):

| key | D0 time | status at query | grand | refunded | seller | pay | note |
|---|---|---|---|---|---|---|---|
| f1 | 00:00:30 | PAID | 1,000 | 0 | owner | CASH | day-boundary bill |
| bP | 10:00 | PAID | 15,000 | 0 | owner | CASH (tendered 20,000) | D1/D2/D4 |
| bR | 10:10 | PAID | 20,000 | 10,000 | owner | PROMPTPAY | member C1 · refund PROMPTPAY ฿100 CHANGED_MIND · reprint by cashier |
| bF | 10:20 | REFUNDED | 7,500 | 7,500 | manager | CASH | |
| bV | 10:30 | VOIDED | 4,500 | 0 | owner | CASH | voided by manager through `voidSaleAction` |
| bO | 10:40 | PAID | 3,000 | 0 | owner | CASH | no device ⇒ shiftId null ⇒ offShiftCash |
| bX | 10:50 | PAID | 20,000 | 0 | — ("ระบบ") | TRANSFER | BOOKING (online) |
| bC | 11:00 | PAID | 5,000 | 0 | owner | CASH | shift S0 closed |
| bL | 11:10 | VOIDED | 2,500 | 0 | owner | CASH | voided by 3-arg `voidSale` (no audit) |
| bT | 11:20 | REFUNDED | 12,000 | 12,000 | owner | CASH | R5b: 6,000 + 6,000 refunded in 2 docs |
| f2 / f3 / f4 | 12:00 / 12:10 / 12:20 | PAID | 2,000 / 3,000 / 2,600 | 0 | owner / manager / owner | CASH / CASH / PROMPTPAY 1,600 + CASH 1,000 | |
| bY1 / bY2 | D0−1 23:30 / 12:00 | PAID | 10,000 / 5,000 | 0 | owner | CASH | yesterday avg 7,500 |
| bB | 13:00 (unit B) | PAID | 4,000 | 0 | owner | CASH | scope |
| bN | 13:10 (unit N, POS-N) | PAID | 10,700 | 0 | owner | CASH | RECEIPT kind |

Order of work: shifts → bills (+ move times) → close S0 → drain → refunds (P1.8 `refundSale`) → drain → reprint (`reprintReceiptAction`, cashier session) → R5b → D → V → B (final state) → wipe.
Actions are called for real through a fake session: `src/lib/core/context.ts` is replaced in the require cache only while `bills-actions` and `receipt-actions` load (pattern of `qc-pos-p1.17`). Modules that do not exist yet load with `import(path as string)` + catch → every dependent check reports `ยังไม่มีโมดูล …` (no throw).

## Drift list (brief vs the tree at a1fa7514)

1. **`writeAudit` cannot join a transaction** (`src/lib/core/audit.ts` uses the global `prisma` and swallows errors). R3 wants the audit "inside the same transaction" ⇒ inside `voidSale` write `tx.auditLog.create({ data:{ tenantId, actorType:"USER", actorId, action:"pos.sale.void", targetType:"PosSale", targetId, after:{ reason, idempotencyKey? } } })` directly (as `refund.ts` does), not `writeAudit`.
2. **4th arg of `voidSale` is safe**: today it has exactly 3 params and no `client`; all 10 callers (`ai/proposals.ts`, `api/ops/sales.ts`, booking, clinic, hotel, rental, restaurant/order, school, shop, ticket) pass 3. F15.2 (`fitness-pos.mts diffParams`) treats an extra **optional** param as an addition (info) but turns red on any change of the return type text — keep `Promise<void>`; the result for the action must come from re-reading the row. `scripts/pos-sale-contract.json` will list `bills.ts` as a new caller (controller `--update-pos-contract` at merge).
3. **`voidSale` accepts non-POS bills on purpose** (P1.9 R2 F4: hotel/booking/… void their own bills) ⇒ `SALE_NOT_VOIDABLE` for `sourceModule ≠ "POS"` must be a pre-check in `voidSaleByActor`, never inside `voidSale`.
4. **`voidSale` errors are mixed**: not-PAID / REFUND doc / missing row = plain `Error("บิลนี้ void ไม่ได้")`; the conditional flip failing (`flipped.count !== 1`) throws `HAS_REFUNDS` even when the real cause is a concurrent void ⇒ the idempotent replay must be detected **before** calling `voidSale` (VOIDED row + its `pos.sale.void` audit carrying the same key), otherwise the second call surfaces HAS_REFUNDS/SALE_NOT_VOIDABLE.
5. **`receiptPayload` writes an audit for any bill older than 30 min** (P1.10 F3 upgrades to copy) — using it for display would add "พิมพ์สำเนา" rows to the timeline; the brief already forbids it, D1 asserts no `pos.*` audit from `billDetail`.
6. **`saleForRefund().canRefund` is the permission only** (`s.canRefund`), not eligibility; `can.refund` must combine permission with `sale.refundable` (P1.8 `notRefundable`: PAID/REFUNDED with refundable qty > 0, POS source, not a gift-card sale).
7. **`pos.sale.read` is implied by `pos.sale.create`** (P1.10 CD3, `receipt.ts canRead`) while `posSalesScope` (`access.ts`) still keys on `pos.sale.create` only — reuse `receiptReadScope` (or the same rule) so the two pages agree; see CD-O1 for the "empty, not refused" rule.
8. **Register idempotency keys are stored as `reg2:<client key>`** and must match `/^[A-Za-z0-9_-]{8,100}$/` — `saleStatusByKey` callers pass the stored key; R5b-2 reads the stored key from the row.
9. **CN document VAT** (`AccountDocument.vatAmount` of CREDIT_NOTE) is computed in `account/service.ts`, not `account/index.ts` — see CD-O8 (run: POS 393 + 392, documents 393 + 393, JV 2200 net +1).
10. Brief §1 "Static (3)" lists four items (CD-O12).

## Expected red run (now, code at 5cec1607 = a1fa7514 + prompt) — observed

`bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.16.mts` (DB host `ep-frosty-lab-aoylqlv8-pooler.c-2.ap-southeast-1.aws.neon.tech`, D0 2026-10-07):
- forced run A: exit 1 · `ผ่าน 3/28` · green = NC, V7 (3-arg `voidSale` still VOIDED · outbox 1 · no audit), Z1 · cleanup `314 ตาราง · แถวค้าง 0 {} · Tenant 0` · ~25 s.
- forced run B: identical id/result list (diffed) · cleanup 0.
- fixture line both runs: `bR 202610-0002 แต้ม 20 VAT 1308 · ABB 202610-0002 · CN POS CN202610-0001 / เอกสาร CN202610-0001` · 17/17 bills · 4/4 refunds · reprint OK · S1 #1 — so every precondition D/B rely on exists today.
- reds and why:
  - ST1–ST5: files/exports/messages/`receiptKindOf`/tab label missing.
  - B1–B8, D1–D4: `ยังไม่มีโมดูล bills.ts` (`MISSING:billsPageData` / `MISSING:billDetail`).
  - V1–V6: `ยังไม่มีโมดูล bills-actions.ts` (`MISSING:voidSaleAction`).
  - R5b-1: real behaviour — `2200 สุทธิ 1 (คาด 0)` (POS refund VAT 393 + 392 = 785 ✓, JV uses `splitIncludedVat(6000)` = 393 twice).
  - R5b-2: real behaviour — refund key → `"PAID"` (expected null); sale key → `"PAID"` ✓; unknown → null ✓.
- unforced: exit 0 · `⏭️ SKIPPED` (4 missing files) · `JSON_SUMMARY {"skipped":true,…}` — no DB writes.
- `--no-db`: exit 1 · 1/6 (NC green, ST1–ST5 red).

## Typecheck

`env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → `TYPECHECK_EXIT 0` with the oracle present (new modules loaded only via `import(path as string)`; no static `lib/env` import).
