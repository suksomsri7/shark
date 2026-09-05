# Account / บัญชี (AS-BUILT 2026-07-16 · 🆕 อัปเดต 2026-09-05 หลัง V2 redesign WO 0.1–9.4)

> **V2 คือหน้าตา/เมนู/ของที่เพิ่ม ไม่ใช่ rewrite แกน** — architecture ด้านล่าง (double-entry, `AccountDocument` polymorphic, posting engine) ยังถูกต้อง 100% ส่วนที่เพิ่มจริงคือ `Party`/`InvItem` canonical, เมนู 9 หมวด, กระทบยอดธนาคาร, PromptPay, กล่องขาเข้า+AI, นโยบายบัญชี, สิทธิ์ matrix 36 คีย์, ⌘K/undo/help — รายละเอียดเต็มดู `docs/modules/12-account.md` (§3.9/§4.15/§6.1/§8.4/§11) และ `ledger/ACCOUNT-V2-RUN.md`

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
- object storage โลโก้/แนบไฟล์ยังพึ่ง URL-paste (SHARK_BUNNY_* รอ creds) — **V2 แก้แล้วสำหรับคลังเอกสาร/กล่องขาเข้า** (อัปโหลดจริงผ่าน Bunny, WO 7.1/7.2) ส่วนโลโก้/ตราประทับ/ลายเซ็นองค์กรยังเป็น URL-paste
- **WO-0035** ภาษีขาย/ซื้อยื่นจริง (ภ.พ.30 export xlsx + ภ.ง.ด.3/53 ครบ) · **WO-0039** บัญชีลึก (aging AR/AP · cashflow ทางอ้อม · ปิดงวดอัตโนมัติ cron) · **WO-0040** หนี้เส้นเงิน (ลด query/flow, DEPOSIT/ROOM_CHARGE map) — **ทั้ง 3 WO นี้ทำจริงใน V2 run** (aging/cashflow/ปิดงวดอัตโนมัติ = เฟส 6, ภ.พ.30/ภ.ง.ด. export CSV = เฟส 5)
- 🕓 **ยังไม่ทำ (ประกาศไว้ล่วงหน้า ไม่ใช่ของหลุด)**: e-Tax Invoice จริง · bank feed อัตโนมัติจากธนาคาร (มีแค่อัปโหลด statement มือ) · FIFO inventory valuation เต็มรูป · e-WHT (ยื่นอิเล็กทรอนิกส์) · DBD e-Filing จริง · Smart Insight (AI แนะนำเชิงรุก) — ดู `docs/modules/12-account.md` §1.3

## 🆕 V2 — โมดูล/ไฟล์ตามหน้าที่ (`src/lib/modules/account/*.ts`, 70+ ไฟล์)

| กลุ่ม | ไฟล์ | หน้าที่ |
|---|---|---|
| แกนเอกสาร | `service.ts`, `doc-detail.ts`, `doc-numbering.ts`, `list-tabs.ts`, `totals.ts`, `errors.ts` | CRUD/issue/void เอกสาร 22 ชนิด, เลขรัน pattern+reset, แท็บ/ตัวกรอง list, คำนวณยอด |
| GL/บัญชี | `gl.ts` (posting engine — chokepoint `commitEntry`), `coa.ts`/`coa-v2.ts`, `journal-v2.ts`, `period-close.ts`, `period-sweep.ts`, `reports.ts`, `report-drill.ts`, `asset.ts`/`asset-v2.ts` | double-entry, ผังบัญชี, สมุดรายวัน+JV, ปิดงวด(มือ+cron sweep), งบ 5 ตัว+drill-down, สินทรัพย์/ค่าเสื่อม |
| ผู้ติดต่อ | `contacts-list.ts`, `contact-profile.ts`, `contact-merge.ts`, `contact-links.ts`, `contacts-overview.ts` | list+ค้นหา, โปรไฟล์ 360°, รวมซ้ำ (คู่กับ `Party` ใน `prisma/schema/party.prisma`) |
| สินค้า/คลัง | `product.ts`, `product-actions.ts`, `bundle.ts`, `inventory-link.ts` | CRUD สินค้า, จัดชุด, ผูก `AccountProduct.invItemId` → `InvItem` canonical (`prisma/schema/inventory.prisma`) |
| การเงิน | `finance.ts`, `finance-overview.ts`, `payment.ts`/`payment-actions.ts`, `payment-request.ts`, `reconcile.ts`, `bank-statement-csv.ts`, `cheque.ts`, `wht.ts`, `pay-channel-label.ts` | ช่องทางเงิน/โอน/petty cash, รับ/จ่ายชำระ(row-lock), PromptPay (`AccountPaymentRequest`), กระทบยอดธนาคาร(parser CSV), เช็ค, WHT 2 ขา |
| คลังเอกสาร/AI | `attachment.ts`, `attachment-shared.ts`, `inbox.ts`, `inbox-ai.ts` | อัปโหลด+dedupe sha256, กล่องขาเข้า, AI อ่านบิล (vision) |
| ตั้งค่า/นโยบาย | `settings-actions.ts`, `settings-nav.ts`, `settings-schema.ts`, `policy.ts`/`policy-actions.ts`/`policy-labels.ts`, `doc-settings.ts`, `print-options.ts`, `email-report.ts` | 3 หน้าตั้งค่า, นโยบายบัญชี(ล็อกก่อนวันที่/ปีบัญชี/default), รายงานอีเมล cron |
| สิทธิ์/เชื่อมต่อ | `access.ts`, `permissions-matrix.ts`, `permissions-service.ts`, `permissions-actions.ts`, `approval-cap.ts`, `connections.ts`/`connections-actions.ts`, `guard.ts` | `assertAccountCan`, matrix 36 คีย์, เพดานอนุมัติ, `AccountSystemLink` 7 ชนิด, ด่าน guard ทุกหน้า |
| อื่น ๆ | `dashboard*.ts`, `overview.ts`, `recurring-actions.ts`/`recurring-shared.ts`, `import-actions.ts`/`import-shared.ts`, `group.ts`/`group-actions.ts`, `undo-stack.ts`, `quick-create-*.ts`, `rate-limit.ts`, `unique-conflict.ts`, `dbd.ts`, `search-input.ts`, `help-texts.ts`, `nav.ts` | หน้าหลัก+ภาพรวม, เอกสารประจำ(cron), นำเข้า CSV, ใบวางบิล/ใบรวมจ่าย, soft-undo, ⌘K parser, rate limit, DBD lookup, `HELP_TEXTS`, เมนู 9 หมวด |

## 🆕 V2 — GL chokepoints (ที่เดียวที่ทุกทางเข้าบัญชีต้องผ่าน)
- **`gl.ts: commitEntry()`** (private, บรรทัด ~219) — ทุก `post*` function (postDocument/postPayment/postTaxInvoice/postManualJV/postChequeEntry/postDepreciation/postOpening/postFinanceOpening/postFinanceTransfer/postBankReconcileEntry/postExternalSale/postPayrollJV ฯลฯ) เรียกผ่านจุดนี้ทางเดียว — ตรวจ Σdebit=Σcredit, เรียก `assertPeriodOpen` + `assertNotLockedGl` (นโยบาย `lockBeforeDate`) ก่อนเขียนทุกครั้ง, จอง `nextJournalNo`, ตั้ง idempotencyKey `{refType}#{refId}#{event}`
- **`assertNotLockedGl(ctx, date, db)`** — อ่าน `AccountSettings.lockBeforeDate` เช็คว่า `date` (issueDate/paidAt ฯลฯ) อยู่ก่อนวันล็อกหรือไม่ ก่อนโพสต์ทุกครั้ง (WO 8.2)
- **`service.ts` ล็อกแถวเอกสาร** (~บรรทัด 2344-2404, WO 9.2 ข้อ 12/14): `recordPayment` ทำ `SELECT … FOR UPDATE` บนแถว `AccountDocument` ภายใน tx ก่อนอ่าน/อัปเดตยอด — ปิดช่องโหว่รับชำระซ้อน (เดิมยิงพร้อมกัน 2 ครั้งจ่ายเงินซ้ำ 2 เท่า)

## 🆕 V2 — QC harness (ไม่ใช่แค่ suite รายชุด)
- **`scripts/acc-v2-env.mts`** — โหลด `.env.qc` (Neon branch `wo-acc-v2-qc`) แทน `.env` (prod) ให้สคริปต์ตระกูล `*-acc-v2-*` ทั้งหมด — fitness มีกฎห้าม import `.env` ตรง
- **`scripts/seed-acc-v2-qc.mts`** — seed tenant QC (ผู้ติดต่อ/สินค้า/เอกสาร/JV ตามตัวเลขที่รู้คำตอบล่วงหน้า) + **generator เฉลย** แยกตามโดเมน (`acc-v2-expected-dashboard.mts`, `-contacts.mts`, `-contact-profile.mts` ฯลฯ) เขียนรวมเป็น `acc-v2-expected.json` (ไฟล์เดียว = "เฉลย" ที่ทุกด่านเทียบ)
- **`pnpm qc:all`** — รัน 46 suite `qc-acc-v2-*.mts` (ดู `ls scripts/qc-acc-v2-*.mts`) + suite เก่าที่เกี่ยวข้อง — ต้องผ่าน with-gate-lock (ล็อกงานหนักทีละ 1 อย่างทั้งเครื่อง ห้ามครอบซ้อน)
- **`scripts/acc-v2-serve.sh`** — `next build` (heap `NODE_OPTIONS=--max-old-space-size=3584` กัน OOM) → `next start -p 3215` บน DB QC — ใช้ build จริงเสมอ (dev server ไม่ hydrate ใน headless)
- **`scripts/visual-acc-v2.mts <WO|all>`** — puppeteer ถ่ายทุกหน้าที่ WO แตะ (1440 desktop + 390 mobile) ลง `.qc-shots/acc-v2/<WO>/` + อ่านตัวเลขจาก DOM (`data-testid`) เทียบ `acc-v2-expected.json` พิมพ์ ✅/❌ — **ภาพต้องให้คนดูจริงก่อนปิด WO** ผลจาก sub-agent ไม่นับเป็นหลักฐานเพียงพอ
- **prod gate**: สคริปต์ตระกูลนี้ทั้งหมดมีด่านกัน host prod (เคยมี migration หลุดลง prod ตอนต้น run เพราะ URL มี `&` ทำ `set -a; . .env.qc` fallback ไป `.env` — แก้แล้วด้วยด่าน + `scripts/acc-v2-env.mts`)

## 🆕 V2 — cron entries (ติดตั้งจริงบน VPS, `crontab -l`)
```
10 23 * * * cd /root/projects/shark-accounting && flock -n /tmp/shark-acc-recurring.lock pnpm exec tsx scripts/acc-v2-cron-recurring.mts recurring >> /var/log/shark-acc-cron.log 2>&1
0  1  * * * cd /root/projects/shark-accounting && flock -n /tmp/shark-acc-reminders.lock pnpm exec tsx scripts/acc-v2-cron-recurring.mts reminders >> /var/log/shark-acc-cron.log 2>&1
```
(23:10 UTC = สร้างร่างเอกสารประจำ WO 1.9 · 01:00 UTC = ส่งเตือนครบกำหนด/ค่าเสื่อม) — **ยังไม่ติดตั้ง**: บรรทัด cron สำหรับรายงานอีเมล (`email-report.ts`, WO 8.2 — เขียนโค้ดแล้วแต่ไม่มี crontab เรียก) ต้องเพิ่มเองบน VPS

## 🆕 V2 — env vars ที่ต้องมีบน prod (ยืนยันจาก grep source จริง)
| ตัวแปร | ใช้ที่ไหน | ถ้าไม่ตั้ง |
|---|---|---|
| `BEAM_MERCHANT_ID` / `BEAM_API_KEY` / `BEAM_WEBHOOK_SECRET` / `BEAM_API_BASE` | `payment-request.ts` (PromptPay auto-reconcile, WO 5.5) | fallback เป็น QR PromptPay static ต้องยืนยันมือ |
| `DBD_API_KEY` / `DBD_API_URL` | `dbd.ts` (ตรวจนิติบุคคลกรมพัฒน์ฯ, WO 3.3) | ปุ่มตรวจเลขผู้เสียภาษีจางในหน้าเพิ่มผู้ติดต่อ |
| `RESEND_API_KEY` | `src/lib/core/email.ts` (ใช้ร่วมทั้งแพลตฟอร์ม รวมส่งเอกสาร PDF/รายงานอีเมลบัญชี) | อีเมลไม่ส่งจริง (log เฉย ๆ) |
| `SHARK_BUNNY_ZONE` / `SHARK_BUNNY_KEY` / `SHARK_BUNNY_CDN` | `attachment.ts`/`attachment-shared.ts` (อัปโหลดคลังเอกสาร/กล่องขาเข้า, WO 7.1/7.2) | อัปโหลดไฟล์ล้มเหลว |
| `APP_URL` | ลิงก์สาธารณะ (`/pay/[token]`, ขอใบกำกับ) | ลิงก์ที่ส่งอีเมล/LINE ผิด host |

## 🆕 V2 — deployment
- Vercel build ปกติ (`vercel.json`/build command ของ repo) **รัน `prisma migrate deploy` เป็นส่วนหนึ่งของ build step** — migration ทั้ง 24 ตัวของ V2 (`20260902160000`–`20260916000000`) เป็น additive ล้วน (ไม่มี DROP/RENAME ที่ทำลายข้อมูล) จึง deploy ได้โดยไม่ต้อง downtime window
- ไม่มีขั้นตอน manual migrate แยกสำหรับโมดูลนี้ — สิ่งที่ต้องทำเองหลัง deploy คือ **ตั้ง env vars ด้านบนใน Vercel project settings** (build ไม่ fail ถ้าไม่ตั้ง แต่ฟีเจอร์ที่พึ่งค่านั้น fallback แบบ degrade ไม่ crash) + เพิ่มบรรทัด cron รายงานอีเมลบน VPS เอง (ไม่ผ่าน Vercel)
