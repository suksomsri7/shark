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

## Step 3 — U page `/pos/sales` (commit 8a70758c + touch-target fix in the final commit)
Files: `src/app/app/sys/[id]/pos/sales/page.tsx` (server: POS + `posSalesScope` gate (literal kept for qc-hf-pos-page-authz S-8) · units in scope · `?unit=` · `?date=` deep link ≤ today · "ever had a bill" via `posSaleWhere` → empty-state wording · `posAccountSystemId` for the accounting link) ·
`BillsClient.tsx` (client) · `bills-ui.tsx` (chips · icons · formatters · CSV). Messages `pos.bills.*` th+en (F15.4 898 keys). 47 rows in `scripts/pos-ui-inventory.json` (F15.3a/b green).
Screens built: top bar (date ‹ › + native date input · debounced search · unit select when > 1 · channel/staff selects · "ส่งออก (หน้านี้)" CSV of the loaded page) ·
status chips with day counts (เงินสดนอกกะ red outline) · 3 summary cards · table (md+) / cards (390) with every U4 column, muted+struck voided rows, "อนุมัติ …" and "คืน ฿x" sub-lines,
⋯ row menu (opens the drawer first, items by `can.*`) · pagination "แสดง n จาก N บิล" · right drawer (lg 360 / xl 420, < lg full-screen sheet) per U5 ·
void dialog (U6, key per open) · refund modal (U7: line checkbox + stepper ≤ refundableQty, weighed whole, "คืนครบแล้ว", restock toggle per stocked line, reason select + OTHER text,
method cards เงินสด "จากลิ้นชักกะ #N" (currentShiftAction of this device) / PromptPay-or-transfer original / card / เครดิตร้าน disabled, blue summary with ticks, audit note,
PAYMENT_MISMATCH → re-fetch + new key + "ยอดเปลี่ยน…", SHIFT_REQUIRED under the cash card, UNKNOWN → retry same key) · reprint via `reprintReceiptAction` → `renderReceiptHtml(paper "80")` → hidden iframe `print()` (no `src/components/pos/print/` in the tree, CD4) · toasts · Esc closes menu/drawer/dialogs.

## Step 4 — visual harness (commit cc2e31dd)
`scripts/visual-pos.mts --page sales --states` (or wo `p1.16*`, coffee only): `bills-list · bills-drawer · bills-void · bills-refund · bills-empty` × 1440/1024/390 → `.qc-shots/pos/<wo>/sales-<state>-<user>-<w>x<h>.png`.
Fixture (before chromium, owner actor through the services the actions wrap): own device `posqc-vis-bills-<pid>` + `openShift` · 7 bills via `quoteRegisterCart`/`submitRegisterSale`
(mixed PROMPTPAY+CASH · partial-refund target · full-refund · void · cash · drawer target) + 1 off-shift cash bill via `createSale(shiftId:null)` (the QC shop requires a shift for register sales) ·
`refundSale` ×2 (amounts from `saleForRefund` + `refund-math`) · `voidSaleByActor` (= `voidSaleAction` minus the session shell; actions cannot run outside a request) · `drainAll`.
Cashier run reuses today's tagged set when complete (no writes). finally/signal: close the bills shift (counted = expected). Cashier states show the disabled void + hint and no refund button.
`--dry` owner rc 0 · cashier rc 0 (15 shots each). Real shots = CONTROLLER-RUN on p11.

## Deviations from mockup 12 (rulings)
| mockup element | here | ruling |
|---|---|---|
| chip "รอเงินเข้า" | omitted | U2/CD3 — no pending-online state before P1.7 |
| drawer "ส่ง LINE" button + timeline "ส่งใบเสร็จทาง LINE" | omitted | CD3 (P1.11) — no dead button, no invented row |
| "ขอใบเต็มรูป" link | omitted | CD3 (P1.13) |
| refund card "เครดิตร้าน" | disabled "รอบถัดไป (กระเป๋าสมาชิก)" | R4/CD3 — not a P1.8 pay type |
| timeline "…กำลังทำรายการคืนเงิน" | omitted | CD3 (presence) |
| summary tick "ออกใบลดหนี้ CN2609-000004" | "ออกใบลดหนี้ (เลขรันอัตโนมัติ)" | U7 — CN number unknown before confirm |
| PromptPay "ยืนยันจากธนาคาร 09:41" | reference only when present | U5 — no bank confirmation exists |
| app rail / top shift chip / online-orders tab | app shell as is (ModuleTabs) | outside this card |
| per-line "฿85 / ชิ้น" unit names | unit price only | no unit name on PosSaleLine |
| channel chips "LINE MAN / Grab / เว็บร้าน / QR โต๊ะ" | POS → "หน้าร้าน", known modules → `pos.shift.source.*`, unknown → raw module | U4 |
| export | "ส่งออก (หน้านี้)" CSV of the loaded page | U1 |
| walk-in customer | "ลูกค้าทั่วไป" (mockup text) when `customer` null | — |

## Contract summary (S)
- `billsPageDataAction({systemId, unitId, date, status?, q?, channel?, staffUserId?, page?, pageSize?})` → `BillsPageDataResult` (= `billsPageData`; byte-identical, B1). Refusals NO_PERMISSION · VALIDATION · UNKNOWN; scope outside = empty ok.
- `billDetailAction({systemId, unitId, saleId})` → `{ok:true, bill}` (names table) · SALE docs only · NO_PERMISSION · SALE_NOT_FOUND · VALIDATION · UNKNOWN · never writes audit.
- `voidSaleAction({systemId, unitId, saleId, reason, idempotencyKey})` → `{ok:true, sale:{id,status}, duplicated?}` · codes NO_PERMISSION · SALE_NOT_FOUND · SALE_NOT_VOIDABLE · HAS_REFUNDS · SHIFT_CLOSED · REASON_REQUIRED · VALIDATION · UNKNOWN (`BILLS_ERROR_KEYS` → `pos.bills.errors.*`).
- Order inside `voidSaleByActor`: actor → shape/key → unit access (SALE_NOT_FOUND) → `pos.sale.void` (NO_PERMISSION) → reason → row (SALE_NOT_FOUND) → VOIDED: same key ⇒ duplicated, new key ⇒ SALE_NOT_VOIDABLE → REFUND/non-POS ⇒ SALE_NOT_VOIDABLE → refunded ⇒ HAS_REFUNDS → shift closed ⇒ SHIFT_CLOSED → `voidSale(…, {actorUserId, reason, idempotencyKey})`; a race re-reads the row.
- `voidSale` 4th arg `VoidSaleAudit` (F15.2 info: new optional param + new caller `bills.ts` → controller `--update-pos-contract`).
- Summary rules: counts/summary for the whole date regardless of filters (CD-O4); billCount = paid+refunded (CD-O2); avg half-up (CD-O3); items newest first (CD-O5); payMethods by `PAY_TYPE_ORDER` (CD-O6); offShiftCash = CASH payment + `shiftId` null; `q` = receiptNo prefix (case-insensitive) or customer name contains / memberCode prefix / phone — matched in memory over the day's rows (no LIKE, `%`/`_` literal).
- `can.refund` = `pos.sale.refund` AND POS AND PAID AND not gift card AND `saleForRefund` refundable with qty left (drift 6); `voidBlockedReason` precedence per CD-O7.

## Follow-ups
- ORACLE-EDIT? **P1.8-S8** (static 3-param regex vs the mandated 4th arg) — see step 2.
- F15.2 snapshot: controller `fitness-pos.mts --update-pos-contract` (voidSale(…, audit?) + caller bills.ts; refund-actions caller already pending from P1.8).
- Hardware print: when P1.10U lands `src/components/pos/print/printReceipt`, replace the iframe in `BillsClient.reprint` (CD4 one-line wiring).
- Customer "sub" has no platform ref for online orders (no column) — add when P1.7/P2 bring channel refs.
- Visual shots on p11 (CONTROLLER-RUN); the bills fixture leaves 7 tagged bills + 2 CNs in the QC coffee shop per owner run (same policy as `sale-done`).

## Gates (final code = this commit · QC4 `ep-frosty-lab` · 8 Oct 2026)
| gate | exit · result |
|---|---|
| typecheck (`iso … flock /tmp/pos-gate.lock pnpm typecheck`) | 0 (before every push · final after the touch-target fix) |
| qc-pos-p1.16 forced #1 / #2 / unforced | 0 · 28/28 / 0 · 28/28 / 0 · 28/28 · cleanup `314 ตาราง · แถวค้าง 0 · Tenant 0` · a5 drift [] |
| qc-pos-p1.8 | 1 · 48/49 — only P1.8-S8 (static signature regex · ORACLE-EDIT?) |
| qc-pos-p1.10 | 0 · 40/40 |
| money set: qc-pos-account · qc-account-cpa · qc-restaurant-money · qc-shop-refund · qc-hotel-money · qc-ticket-money · qc-subscription-money | 0 · 16/16 · 0 · 107/107 · 0 · 6/6 · 0 · 12/12 · 0 · 5/5 · 0 · 6/6 · 0 · 14/14 — identical to pos-P1.8 §9 |
| unchanged: qc-pos-p1.3 · p1.6 · p1.9 · p1.9b · p1.14 · p1.17 · p1.1 · qc-pos-closeday | 0 · 128/128 · 0 · 48/48 · 0 · 53/53 · 0 · 22/22 · 0 · 30/30 · 0 · 40/40 · 0 · 178/178 · 0 · 22/22 |
| qc-hf-pos-page-authz · qc-nav-functions | 0 · 56/56 · 0 · 11/11 |
| `pnpm fitness` with env / without env | 0 · 41/41 / 0 · 41/41 |
| `scripts/fitness-pos.mts` | 0 · 8/8 (F15.2 info: `voidSale(…, audit?)` + new caller `bills.ts` → controller `--update-pos-contract`) |
| `visual-pos.mts p1.16 --page sales --states --dry` owner / cashier | 0 / 0 (15 shots each) |
Not run (rules): next build, server, real visual shots (CONTROLLER-RUN on p11), deploy.
