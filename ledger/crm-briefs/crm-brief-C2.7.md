# C2.7 — Account & POS bridges (money path)
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.7". Spec: blueprint §7.2, §9 rows ACCOUNT/POS, decisions C3, C29.

## Facts
- Account events: `account.quotation.responded {documentId, docNo, accepted}` · `account.document.issued {documentId, type, docNo, status, contactId, grandTotalSatang, issueDate, source}` · `account.payment.recorded {documentId, paymentId, amountSatang, docType}` · `account.invoice.paid {documentId, docNo, grandTotalSatang}` · `account.payment.voided {paymentId, documentId, amountSatang, reason}` · `account.document.voided {documentId, type, docNo, reason}`. None carries partyId/sourceDocId → use `account.docLinkInfo` (C0.3).
- POS: `createSale(input)`; `pos.sale.paid {saleId}` / `pos.sale.voided {saleId}`; `PosSale` has `memberId`, `sourceModule`, `sourceId` — and gets NO new column (C29). Sell screen: `src/lib/modules/pos/register-ui.tsx` (member select at :674–687, payload built at :185–201); page `src/app/app/sys/[id]/pos/register/page.tsx`.
- The member fix-run established the money rules: **flag first, then atomic increment; reverse only what was counted; CRM consumers are extras of `pos.sale.paid`/account events and must never block accounting or member steps.**

## Deliverables
- `deals.issueQuotation` with lines through `account.createExternalQuotation({lines…, createdById})`; "differs from quotation" badge when lines changed after issue; `issueInvoice` via `convertQuotationToInvoice`; `pipeline.autoInvoiceOnWon`.
- Consumers: quotation responded → stage per `pipeline.stageOnQuoteAccepted/Rejected` + activity + notify owner · document issued with `sourceDocId` = deal's quotation → `invoiceDocId` · **`recordPayment`**: on `account.payment.recorded` for a doc linked to a deal (invoice or its chain) → insert `CrmDealPayment(dealId, "PAYMENT", paymentId)` under the unique key FIRST; only when inserted: `paidSatang` `increment`, recompute `wonValueSatang`, lifecycle CUSTOMER, company cache, emit follow-ups (commission hook is a no-op until C3.3) · `account.payment.voided`/`document.voided` → mark the payment row REVERSED and decrement ONLY if it was COUNTED · deal flag "document voided".
- POS: server action `linkSaleToDeal(dealId, saleId)` called right after a successful sale when the cashier picked a deal (writes `CrmDealPayment(dealId, "POS_SALE", saleId, status LINKED)`); "select deal" control next to the member select showing open deals of the selected member's party (edge `pos→crm` read facade `openDealsForParty`); consumer of `pos.sale.paid` counts a LINKED row → COUNTED; `pos.sale.voided` reverses; optional auto-WON when paid ≥ value (pipeline setting).
- Account document page shows a "ดีล" link via `crm.dealForDoc(docId)` (existing `account→crm` edge).

## Files you own
crm `deals*.ts`, `payments.ts` (new), `crm-bridges.ts` money consumers · ONE hunk in `pos/register-ui.tsx` + its page/action for the deal select · the deal link block on the account document page · NO edit to `pos/service.ts` or account transactions.

## Acceptance (oracle `qc-crm-c2.7`)
CRM-RUN S1–S8 (28).
X4 every money consumer twice AND twice in parallel → counted once; void before paid → nothing subtracted; void after paid → subtracted once; re-void → no change · X3 10 different payments of one deal in parallel → `paidSatang` = exact sum (BigInt) · compose contract: CRM extra throwing does not fail `pos.sale.paid`/account consumers; failing accounting base still lets CRM run · X1 deal select lists only deals the cashier can see, of the same tenant; `linkSaleToDeal` with a foreign sale/deal → 404 · X9 auto-WON and auto-invoice audited.
Regressions (FULL): every `qc-acc-v2-*`, every `qc-account-api-*`, `qc-pos-account`, `qc-pos-register`, `qc-pos-products`, `qc-pos-inventory`, `qc-pos-closeday`, `qc-pos-coupon`, `qc-acc-v2-pos-lines`, `qc-restaurant*`, `qc-member-m2.8`, `qc-member-fix-s2`, `qc-kanban-k3.3`.

## Addendum (written by the C2.7 oracle author, 23 Sep · **needs the controller's ruling**)
Oracle: `scripts/qc-crm-c2.7.mts` (**55 checks** · S0 6 · S1–S8 = the 28 of CRM-RUN §2 · U 4 uiVersion-1 · X1 3 · X3 3 · X4 4 · X6 1 ·
X8 2 · X9 2 · FATAL · CLEAN · **the CONTRACT BLOCK A–F at the top of that file is authoritative** for every name, signature and shape;
where it and this brief differ, the contract block wins). X2 · X5 · X7 · X10 are N/A with a reason each (no REST op / AI tool, no
scheduled job, no public endpoint, no file or secret). Points that no document settled and that the controller must rule on:
1. **No migration, no new column, no new event** (R-C.1 · C29 win over the CRM-RUN §1 row that still says `crm_v2_c (PosSale.dealId)`):
   the sale↔deal link lives in `CrmDealPayment(dealId, "POS_SALE", saleId)` only, and the money path emits already-registered events.
   `C2.7-S0.4` checks this mechanically (registries + `information_schema` + the migrations folder).
2. 🔴 **`linkSaleToDeal` must COUNT an already-PAID sale in the same transaction.** The brief's order ("called right after a successful
   sale") loses the money otherwise: `createSale` emits `pos.sale.paid` inside its transaction and drains right after commit, so the
   consumer usually runs BEFORE the link row exists and finds nothing. Both paths converge on the unique key
   `(dealId, "POS_SALE", saleId)`; whichever arrives first counts, the other is a no-op. Checks `C2.7-S5.1` · `C2.7-S5.2`.
3. **"deal flag: document voided" = `CrmDeal.tags` gains `DEAL_VOIDED_TAG = "เอกสารถูกยกเลิก"` (idempotent) + ONE AUTO activity +
   `dealMoney().documentVoided`** — there is no column and C2.7 may not add one. **Oracle-proposed**; the controller may pick another
   carrier, which is an ORACLE-EDIT of `C2.7-S4.2`.
4. **`dealForDoc(tenantId, docId, actor?)`** — the brief writes `crm.dealForDoc(docId)`, but a tenant-less lookup cannot satisfy X1 and
   an actor-less one leaks a deal the reader may not see. Signature **oracle-proposed**.
5. **`recordDocPayment` resolves the deal through the document CHAIN** (`invoiceDocId`, `quotationDocId`, or any document whose
   `sourceDocId` chain reaches one of them) because account events carry no `sourceDocId` and no `partyId` (COMMON). `C2.7-S3.3` pays a
   RECEIPT of the invoice and demands it counts.
6. **uiVersion 1 (every real shop today) is skipped by the money bridge and NOT caught up later**: a payment that arrives while the shop
   is on v1 is never counted retroactively when the shop is switched to 2 (`C2.7-U.4` pins this as the accepted semantics and the
   positive control proves the gate is read live). If the owner wants a catch-up, it needs a recompute step nobody owns yet — controller
   decision.
7. **S7 (6 items) proves the invariants the FULL regression list protects** — `pos/service.ts` and the account transaction functions
   byte-identical, no new column, the consumer chains of `pos.sale.paid`/`pos.sale.voided` keeping every existing step with CRM appended
   LAST, the member/stamp steps still running when the CRM extra throws (trigger lab), and the `linkSaleToDeal` call in
   `registerSaleAction` wrapped so a CRM failure never fails a paid bill. The suites themselves stay the controller's D4 duty.
8. **Permission keys used**: `crm.deal.update` for `linkSaleToDeal`, `crm.deal.read` for the deal select (an actor without it gets `[]`,
   never an exception — the POS screen must keep selling). Testids: `pos-deal-select` · `pos-deal-hint` · `acc-doc-crm-deal`.

## Controller ruling (24 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–8 ก่อน spawn builder)
- **CONFIRMED ทั้ง 8 ข้อ**: ไม่มี migration/คอลัมน์/event ใหม่ (R-C.1 · C29 ชนะ CRM-RUN §1 ที่ยังเขียน `PosSale.dealId`) — สายโยง sale↔deal อยู่ที่ `CrmDealPayment(dealId,"POS_SALE",saleId)` · **`linkSaleToDeal` ต้องนับบิลที่จ่ายแล้วใน tx เดียวกัน** (consumer `pos.sale.paid` มักวิ่งก่อนแถวลิงก์ — ใครมาก่อนนับ อีกฝ่าย no-op บน unique เดียวกัน) · ธง "เอกสารถูกยกเลิก" = `CrmDeal.tags` += `DEAL_VOIDED_TAG` + AUTO activity 1 + `dealMoney().documentVoided` · `dealForDoc(tenantId, docId, actor?)` (scoped + visibility) · `recordDocPayment` ไล่ตาม chain `sourceDocId` ถึง quotation/invoice (event บัญชีไม่มี partyId/sourceDocId) · **ร้าน v1 ถูกข้ามและไม่ catch-up ทีหลัง** (U.4) — ถ้าเจ้าของต้องการ recompute ตอนเปิด v2 = งานใหม่ (บันทึกใน CRM-OWNER-QUESTIONS Q8) · S7 invariants: `pos/service.ts` + ฟังก์ชันธุรกรรมบัญชีเหมือนเดิมทุกไบต์ · CRM ต่อท้าย consumer chain เป็น "ของแถม" · `linkSaleToDeal` ใน `registerSaleAction` ห่อไว้ (CRM ล้ม = บิลไม่ล้ม) · คีย์ `crm.deal.update` (link) / `crm.deal.read` (select · ไม่มีคีย์ = `[]` ไม่ throw) · testid `pos-deal-select` `pos-deal-hint` `acc-doc-crm-deal`
- ถอยหลังบังคับ: ทุกชุด POS/บัญชี/บอร์ดงาน/สมาชิก M2.8 ตาม S7 · `qc-crm-c1.5` (ดีล) · `qc-crm-c1.8` · `qc-crm-c2.1` · **`qc-crm-c1.11`** · `qc-acc-v2-*` ที่แตะเอกสาร/การจ่าย · `qc-pos-*`

## Controller ruling round 2 (24 ก.ย. 2569 · Fable · binding — หลังผู้ตรวจของผู้คุมงาน)
ผู้ตรวจยืนยัน (a)–(k) (k บางส่วน) · ยืนยันว่า ORACLE-EDIT 3 จุดเป็นของผู้คุมงาน (`5e21a878`) · ชี้ว่า 55/55 มาจากสำเนา ไม่ใช่ข้อสอบจริง ⇒ **builder ต้องรันไฟล์จริง 2 ครั้งติดบนโค้ดสุดท้าย**:
- **B1** บิล POS เดียวนับได้ 2 ดีล (unique ต่อดีล · `findFirst`) แต่ void คืนแค่แถวเดียว → link ครั้งที่สองบนดีลอื่น = CONFLICT ใต้ล็อกระดับบิล · count/reverse วนทุกแถวของ `(refType, refId)`
- **B2** ประตู `isV2`/`bridgesEnabled` กั้นการถอนเงิน ⇒ ปิดสะพานหรือกลับ v1 หลังนับ = ดีลเงินเกินตลอดกาล → **ประตูหยุด "นับ" ได้ แต่ห้ามหยุด "ถอน"** (reverse ทำงานเมื่อมีแถวอยู่เสมอ) · `linkSaleToDeal` ต้อง v2 + bridgeOpen
- SF-1 void ใบแจ้งหนี้ถอนทุกแถว COUNTED ของดีล (รวมมัดจำ) → ถอนเฉพาะแถวของเอกสารนั้น (ไล่ผ่าน account facade) · **SF-2 ภาษีหัก ณ ที่จ่าย**: `amountSatang` ไม่รวม WHT ⇒ paidSatang ต่ำกว่าจริงและ auto-WON ไม่เคยยิง → เมื่อ `account.invoice.paid` ให้ settle เงินของเอกสารนั้นเท่ากับ `grandTotal` ด้วยแถว `DOC_SETTLE#<docId>` (idempotent) แล้วประเมิน auto-WON · SF-3 `moveCore` อ่าน countedWonValue นอกล็อก → ย้ายเข้าล็อก + gate v2 · SF-4 หลายดีลต่อเอกสาร → ดีลเก่าสุดได้เงิน + WARN · SF-5 อนุญาตเฉพาะ `INVOICE`/`DEPOSIT_RECEIPT` · `BILLING_NOTE` ไม่ attribute (WARN + หนี้ C3) · N1 ซ่อน select เมื่อไม่มี `crm.deal.update` · N3 บิล gift card ไม่ใช่รายได้ดีล · N4 emit `crm.deal.updated` เมื่อแถว LINKED เดิมถูกนับ · N7 รับ (R-E.7) · N11 expected.json ไม่ semantic · N12 CRM อ่าน `PosSale` ตรงผ่าน prisma = ทิศทางที่ตั้งใจ (บันทึก)
- ORACLE-EDIT (ผู้เขียนข้อสอบ ใน c23): `S9.1–S9.8` + X8/inventory tighten · หลักฐาน mobile 390/ภาพ = ผู้คุมงานถ่ายตอน verify (spec "2.7")
