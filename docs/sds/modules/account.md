# Account / บัญชี (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
ระบบบัญชีเต็มรูป CPA-grade: เอกสารรายรับ/รายจ่าย · double-entry GL · VAT (ภ.พ.30) · WHT (ภ.ง.ด.3/53) · เช็ค · สินทรัพย์+ค่าเสื่อม · การเงิน (เงินสด/ธนาคาร) · งบการเงิน (TB/P&L/BS/Cashflow) · ปิดงวด. เป็น**ปลายทางเส้นเงิน**ของทุกโมดูล (ผ่าน PosSale→outbox→bridge). ผู้ใช้: เจ้าของ/ผู้ทำบัญชี. **Layer 4: Advanced** (feature no.12) — scope=system (AppSystem type ACCOUNT). เงิน Int สตางค์ · เอกสารเงิน immutable (พ้น DRAFT → void/reissue).
โค้ด: `src/lib/modules/account/*.ts` (23 ไฟล์) · schema `prisma/schema/account.prisma` + `account_gl.prisma`.

## Data model (account.prisma + account_gl.prisma) — tenantId+systemId
- **AccountDocument** (แกน polymorphic docType 22 ชนิด: QUOTATION/INVOICE/RECEIPT/TAX_INVOICE/DEPOSIT_RECEIPT/CREDIT_NOTE/DEBIT_NOTE/BILLING_NOTE + ฝั่งจ่าย PURCHASE/EXPENSE/PURCHASE_ORDER/ASSET_*/PURCHASE_TAX_INVOICE/... /WHT_CERT) — `docNo?`(จองตอน issue, NULL distinct ใน DRAFT) `status`(AccountDocStatus ~17 ค่า) `direction`(IN/OUT/INTERNAL) `vatMode`(INCLUDE/EXCLUDE/NONE) `vatTiming`(ON_ISSUE/ON_PAYMENT) `subTotal/discountAmount/vatAmount/whtAmount/depositDeducted/grandTotal/paidTotal` `sourceDocId?` `sourcePaymentId?`(1 payment=1 ใบกำกับบริการ) `taxPointBasis?` `refSystemId/refType/refId`(เมื่อไหลจาก link) `publicToken?`(unique) `replacedById?`(REPLACE). unique `[systemId,docType,docNo]`.
- **AccountDocumentLine** — `qty`(Decimal 12,4) `unitPrice` `discount` `vatRateBp`(700=7%/0/-1=ยกเว้น) `amount` `productId?` `accountId?`(override GL) `assetId?`.
- **AccountDocumentPayment** — `channel`(AccountPayChannel) `financeAccountId?` `amount` `whtAmountSatang/whtRateBp/whtCertDocId?` `feeAmount` `chequeId?` `entryId?`(1 entry หลาย payment ได้). 
- **AccountDocumentRelation** — `type`(CONVERT/DEPOSIT_APPLY/ADJUST/BILL/PAY_GROUP/TAX_FOR/REPLACE) unique `[fromId,toId,type]`.
- **AccountDocSequence** — เลขรัน (จองใน tx) unique `[systemId,docType,periodKey]`.
- **AccountContact** (ลูกค้า/ผู้ขาย: kind CUSTOMER/VENDOR/BOTH, taxId 13 หลัก, branchCode) · **AccountSettings** (1/ระบบ: orgName/taxId/vatRegistered/vatRateBp/prefix config).
- GL (account_gl): **AccountLedger** (ผังบัญชี: code/type ASSET/LIABILITY/EQUITY/INCOME/COGS/EXPENSE, tree parentId) · **AccountMapping** (key→account เช่น AR/AP/VAT_OUTPUT/VAT_INPUT/SUSPENSE/DOC:{docType}) · **AccountJournalEntry** (immutable, book SALES/PURCHASES/RECEIPTS/PAYMENTS/GENERAL, Σdebit==Σcredit, idempotencyKey unique `[tenantId,idempotencyKey]`, reversalOfId) · **AccountJournalLine** (debit/credit, systemId denormalized) · **AccountPeriod** (periodKey status OPEN/CLOSED).
- การเงิน/เช็ค: **AccountFinance** (CASH/BANK/E_WALLET/PETTY_CASH, openingBalance, ledgerAccountId) · **AccountCheque** (direction IN/OUT, status ON_HAND/DEPOSITED/CLEARED/BOUNCED/ISSUED/VOIDED).
- สินทรัพย์: **AccountFixedAsset** (cost/salvageValue/usefulLifeMonths/asset·accum·expense account) · **AccountDepreciation** (periodKey unique `[assetId,periodKey]`).
- **AccountProduct/AccountUnit/AccountCategory** (ทะเบียนสินค้า) · **AccountAttachment** (คลังเอกสาร) · **AccountSystemLink** (linkedKind POS/BUSINESS/CRM, unique `[systemId,linkedKind,linkedId]`).

## Service API (คัดกลุ่มหลัก — path เต็มในวงเล็บ)
- **service.ts** (เอกสารรายรับ): totals `computeTotals/lineAmount/allocateProportional` · `getSettings/saveSettings/vatConfigOf` · contact `listContacts/createContact/updateContact/archiveContact` · doc `listDocuments/getDocument/createDocument/updateDocument/issueDocument`(จอง docNo+post GL) · `convertDocument`(QT→IV→RE) · `setQuotationResponse` · payment `recordPayment`(post GL รับเงิน+WHT+deposit)/`voidPayment` · `voidDocument` · มัดจำ `listDeductibleDeposits` · public tax `ensurePublicTaxInvoiceLink/getPublicTaxContext/issuePublicTaxInvoice` · link `findAccountLinkForPos/findAccountLinkFor/findDocByRef/findOrCreateCustomerContact/setDocExternalRef` · `overviewStats`.
- **gl.ts** (posting engine): `resolveMapping` · `nextJournalNo` · `ensureAccounting`(seed) · `postDocument/postPayment/postTaxInvoice/reverseFor/postManualJV/postChequeEntry/postDepreciation/postOpening` · `closePeriod/reopenPeriod` · **`postExternalSale`**(ปลายทาง PosSale จาก bridge).
- **coa.ts**: `seedChartOfAccounts` · `listLedgers/listMappings/createLedger/updateLedger/archiveLedger/setMapping`.
- **expense.ts** (รายจ่าย): `createExpenseDoc/updateExpenseDoc/issueExpenseDoc` · `receivePurchaseTaxInvoice/markAssetReceived` · `recordVendorPayment/voidVendorPayment/voidExpenseDoc` · PO `createPurchaseOrder/submitForApproval/approvePurchaseOrder/rejectPurchaseOrder/convertPurchaseOrder` · `payableStats`.
- **wht.ts**: `listWhtCredits/listWhtDeductions/issueWhtCert/getWhtCert/pnd/pndCsv/whtCreditsCsv` (ภ.ง.ด.3/53).
- **cheque.ts**: `createCheque/depositCheque/clearCheque/bounceCheque/voidCheque` + `chequeSummary`.
- **asset.ts**: `registerAsset/runDepreciation/disposeAsset` + `nextDepreciationAmount`.
- **finance.ts**: `financeBalances/createFinanceAccount/transferBetweenFinance/pettyCashReplenish/financeStatement`.
- **product.ts**: unit/category/product CRUD + `createGoodsMovement/productMovements`.
- **reports.ts**: `trialBalance/profitLoss/balanceSheet/cashFlow/pp30` (ภ.พ.30) + `fiscalYearStartKey`.
- **index.ts** (facade ให้ bridge/CRM): `applyExternalSale/reverseExternalSale/createExternalQuotation`.
- **access.ts**: `assertAccountCan(auth, action)` — RBAC เฉพาะบัญชี · `writeAudit(...)`.
- ข้อผิดพลาด: โยนไทยเมื่อ period CLOSED / เอกสารพ้น DRAFT / มัดจำหักเกิน / VAT ไม่ balance ฯลฯ.

## การเชื่อมต่อ
- **ขาเข้า จาก POS (Outbox #1 + ตารางเชื่อม #3)**: pos/account-bridge → `applyExternalSale`/`postExternalSale` เมื่อมี AccountSystemLink(POS). void → `reverseExternalSale`.
- **CRM**: `createExternalQuotation` (linkedKind=CRM) ออก QUOTATION.
- **Inventory**: AccountProduct ↔ InvItem.accountProductId · GOODS_ISSUE.
- **Storage**: AccountAttachment (คลังเอกสาร) — URL/แนบไฟล์.
- ทุก mutation เขียน AuditLog (writeAudit).

## Permissions (assertAccountCan / access.ts)
`account.doc.create` · `account.doc.issue` · `account.doc.approve` · `account.doc.void` · `account.doc.public_link` · `account.payment.record` · `account.payment.void` · `account.contact.manage` · `account.product.manage` · `account.settings.manage`.

## UI (`/app/sys/[id]/account/...`)
เอกสาร `documents` + `docs/[docType]/[docId]` · ค่าใช้จ่าย `expense` · ซื้อ `purchase` · PO `po` · สินทรัพย์ `assets` + `asset-buy` · เช็ค `cheque` · WHT `wht/[certId]/print` · การเงิน `finance/[financeId]/statement` · ผังบัญชี `accounts` · สมุดรายวัน `journal/[entryId]` + `journal/new` · แยกประเภท `ledger` · งวด `periods` · รายงาน `reports/{trial-balance,profit-loss,balance-sheet,cash-flow,pp30}` · ภาษี `tax` + `tax/export`(route) · พิมพ์ `print/[docId]` · สินค้า `products` · ผู้ติดต่อ `contacts` · ตั้งค่า `settings` · goods-issue. nav สร้างโดย `nav.ts ACCOUNT_NAV(base, vatRegistered)`.

## การทดสอบ (เส้นเงินหนักสุด — ต้องเขียวเสมอ)
- `scripts/qc-account-cpa.mts` (QC6, **107 ข้อ regression ถาวร**) — ทำบัญชีร้าน 1 เดือนเต็มผ่าน service จริง → ปิดงบแบบ CPA: ไล่ยอดทุกบัญชี + P&L + งบดุล + ภ.พ.30 + ภ.ง.ด.53 + ปิดงวด.
- `scripts/qc-account-gatea.mts` (QC5 Gate A) — double-entry + VAT routing ผ่าน posting engine.
- `scripts/qc-account-p2p3.mts` · `scripts/qc-account-qc7.mts` (R-A..R-D + C1..C7 + M1..M8) · `scripts/qc-cheque-audit.mts` (เช็ค+tax point+WHT+net-zero) · `scripts/qc-tax-print-audit.mts` (พิมพ์ใบกำกับ + CSV ภ.ง.ด.) · `scripts/qc-pos-account.mts` (M1 เส้นเงิน POS).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- object storage โลโก้/แนบไฟล์ยังพึ่ง URL-paste (SHARK_BUNNY_* รอ creds).
- **WO-0035** ภาษีขาย/ซื้อยื่นจริง (ภ.พ.30 export xlsx + ภ.ง.ด.3/53 ครบ) · **WO-0039** บัญชีลึก (aging AR/AP · cashflow ทางอ้อม · ปิดงวดอัตโนมัติ cron) · **WO-0040** หนี้เส้นเงิน (ลด query/flow, DEPOSIT/ROOM_CHARGE map).
