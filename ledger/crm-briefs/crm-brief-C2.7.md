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
