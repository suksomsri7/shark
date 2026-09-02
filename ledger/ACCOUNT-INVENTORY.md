# ACCOUNT-INVENTORY — สำรวจโมดูลบัญชี (read-only) เพื่อวางแผน redesign เทียบ PEAK

> วันที่สำรวจ: 2026-09-02 · worktree `/root/projects/shark-accounting` (HEAD `2b04e4e`)
> ขอบเขต: `src/lib/modules/account/**`, `src/app/app/sys/[id]/account/**`, `prisma/schema/account.prisma` + `account_gl.prisma`, `docs/UI_STANDARD.md §4`
> เทียบกับโครงเมนู PEAK 9 หมวด (หมวด 6-9 อ้างจากภาพหน้าจอชุดที่สองของเจ้าของ)
> เอกสารนี้เป็น **inventory เท่านั้น** — ไม่มีการแก้ซอร์สใด ๆ

---

## A. ตารางเส้นทาง (Route table)

เส้นทางทั้งหมดอยู่ใต้ `base = /app/sys/[id]/account` · layout กลาง = `src/app/app/sys/[id]/account/layout.tsx:8`
(desktop = `SubNav` sidebar 200px จาก `ACCOUNT_NAV` · mobile = ไม่มี sidebar ใช้ back-link ต่อหน้า)

**หมายเหตุสำคัญ:** ไม่มีไฟล์ `account/page.tsx` — "หน้าแรกบัญชี" ถูก render จาก
`src/app/app/sys/[id]/page.tsx:90` → `<AccountContent>` ใน `src/lib/modules/account/ui.tsx:44`

| # | Route | ชนิด | จุดประสงค์ | ปุ่ม/action หลัก | คอลัมน์ / ตัวกรอง / แท็บ | สถานะที่แสดง | service ที่รองรับ |
|---|---|---|---|---|---|---|---|
| 1 | `/app/sys/[id]` (ACCOUNT) | hub | หน้าแรกบัญชี | `+ สร้างใบเสนอราคา`, `+ บันทึกค่าใช้จ่าย` (`ui.tsx:94-100`) · ทางลัด 4 ใบ (`ui.tsx:147-154`) · แบนเนอร์ "ตั้งค่ากิจการ" ถ้า `orgName` ว่าง (`ui.tsx:68-77`) | การ์ดสถิติ 4 ใบ: ค้างรับ / พ้นกำหนด / เอกสารทั้งหมด / ผู้ติดต่อ (`ui.tsx:80-90`) · เอกสารล่าสุด 8 รายการ (`ui.tsx:55-60`) | `StatusBadge` ทุกแถว (`ui.tsx:32`) | `overviewStats` (`service.ts:1539`), `getSettings` (`service.ts:384`) |
| 2 | `/docs/[docType]` | list + form | รายการเอกสารฝั่งรายรับ 8 ชนิด + ฟอร์มสร้างในหน้าเดียวกัน | `DocEditor` inline (`docs/[docType]/page.tsx:149`) · RECEIPT/TAX_INVOICE สร้างตรงไม่ได้ (`:114`) | แท็บต่อ docType (`:23-79`): QT=ยอมรับ/รอตอบรับ/พ้นกำหนด/ทั้งหมด/ล่าสุด · IV=รอชำระ/ชำระแล้ว/พ้นกำหนด · RE=ชำระแล้ว · TX=ออกแล้ว · DR=รอชำระ/พ้นกำหนด/รอหักมัดจำ · CN/DN/BN=ทั้งหมด/ล่าสุด · **ไม่มีช่องค้นหา / ไม่มี filter วันที่ / ไม่มี filter ผู้ติดต่อ** · แถว = `docNo · วันที่` + ยอด + สถานะ | `STATUS_LABEL` (`service.ts:50`) + overdue สีแดง | `listDocuments` (`service.ts:681`, take 500 แล้ว filter ฝั่ง UI), `listContacts`, `getSettings` |
| 3 | `/docs/[docType]/[docId]` | detail (+form เมื่อ `?edit=1`) | เอกสารรายรับ 1 ใบ | ออกเอกสาร (`issueDocumentAction`) · แก้ไข (DRAFT) · ยกเลิก (`voidDocumentAction`) · แปลงเอกสาร (`convertDocumentAction`) · ลูกค้ายอมรับ/ปฏิเสธ (QT) · บันทึกรับชำระ (`recordPaymentAction`, IV/DR) · ยกเลิกการรับชำระ · สร้างลิงก์ขอใบกำกับ (`ensurePublicLinkAction`) · พิมพ์/PDF | ผู้ติดต่อ · บรรทัดสินค้า · รวม/ส่วนลด/VAT/สุทธิ/ชำระแล้ว/คงเหลือ · ประวัติรับชำระ (วันที่/ช่องทาง/WHT) · เอกสารที่เกี่ยวข้อง (relationsFrom/To) | `StatusBadge` + `PAY_CHANNEL_LABEL` | `getDocument` (`service.ts:706`), `visibleConvertTargets` (`service.ts:124`), `actions.ts:143/163/190/220/241/262/366` |
| 4 | `/expense`, `/expense/[docId]` | list+form / detail | บันทึกค่าใช้จ่าย (docType `EXPENSE`) | ผ่าน `ExpenseListPage`/`ExpenseDetailPage` (`expense-page.tsx:43/90`) | แท็บ: ล่าสุด/รอชำระ/ชำระแล้ว/พ้นกำหนด/ทั้งหมด (`expense.ts:152-159`) | เหมือนฝั่งรายรับ | `listExpenseDocs` (`expense.ts:196`), `getExpenseDoc` (`expense.ts:237`), `listExpenseAccounts` (`expense.ts:251`) |
| 5 | `/purchase`, `/purchase/[docId]` | list+form / detail | บันทึกซื้อสินค้า (`PURCHASE`) | เหมือน #4 | แท็บเดียวกับ EXPENSE | — | เดียวกัน |
| 6 | `/po`, `/po/[docId]` | list+form / detail | ใบสั่งซื้อ `PURCHASE_ORDER`; **`?docType=ASSET_PURCHASE_ORDER` เปลี่ยนเป็นใบสั่งซื้อสินทรัพย์** (`po/page.tsx:13`) | ส่งอนุมัติ / อนุมัติ / ไม่อนุมัติ / แปลงเป็นบันทึกซื้อ (`expense-ui.tsx:262-314`) | แท็บ: ล่าสุด/รออนุมัติ/อนุมัติแล้ว/ทั้งหมด (`expense.ts:180-186`) | AWAITING_APPROVAL / APPROVED / REJECTED | `submitForApproval`/`approvePurchaseOrder`/`rejectPurchaseOrder`/`convertPurchaseOrder` (`expense.ts:843/877/898/915`) |
| 7 | `/asset-buy`, `/asset-buy/[docId]` | list+form / detail | ซื้อสินทรัพย์ `ASSET_PURCHASE`; **`?docType=PURCHASE_TAX_INVOICE` = ใบกำกับภาษีซื้อ** (`asset-buy/page.tsx:13`) | รับใบเสร็จแล้ว (`markAssetReceivedAction`) · รับใบกำกับแล้ว (`receivePtxAction`) · บันทึกจ่ายชำระ + WHT | แท็บ ASSET_PURCHASE: ล่าสุด/รอชำระ/พ้นกำหนด/รับใบเสร็จแล้ว · PTX: ล่าสุด/รอรับ/รับแล้ว (`expense.ts:161-179/187-192`) | AWAITING_RECEIVE / RECEIVED | `receivePurchaseTaxInvoice` (`expense.ts:573`), `markAssetReceived` (`expense.ts:596`) |
| 8 | `/contacts` | list + form | ลูกค้าและผู้ขาย | เพิ่มผู้ติดต่อ (`createContactAction`) · ลบ/ซ่อน (`archiveContactAction`) — **ไม่มีปุ่มแก้ไขในหน้า** ทั้งที่ `updateContactAction` มีอยู่ (`actions.ts:317`) | รายการเดียวไม่มีแท็บ/ค้นหา/pagination · แสดง: ชื่อ · ประเภท(ลูกค้า/ผู้ขาย/ทั้งคู่) · เลขภาษี · เบอร์ · เครดิตเทอม | — (`archivedAt` ซ่อนแถว) | `listContacts` (`service.ts:530`), `createContact` (`service.ts:550`) |
| 9 | `/products` | list + form (3 แท็บ) | สินค้า/บริการ · หน่วย · กลุ่มจัดประเภท | เพิ่ม/แก้/เก็บเข้าคลัง สินค้า · เพิ่ม/เปลี่ยนชื่อ/ลบ หน่วย · เพิ่ม/แก้/ลบ กลุ่ม (`product-actions.ts`) | แท็บ `catalog`/`units`/`categories` (`products/page.tsx:76-80`) · แถวสินค้า: ชื่อ (SKU) · ชนิด · หน่วย · คงเหลือ · ราคาขาย — **เป็นข้อความบรรทัดเดียว ไม่ใช่คอลัมน์** · ไม่มีค้นหา/pagination · archived แสดงปนกับ active (ขีดฆ่า) | — | `listProducts` (`product.ts:138`), `listUnits` (`product.ts:37`), `listCategories` (`product.ts:79`) |
| 10 | `/goods-issue` | form + list | ใบเบิกสินค้า / ใบส่งคืน (toggle ในฟอร์มเดียว) | `GoodsIssueEditor` — สลับ `GOODS_ISSUE` / `GOODS_ISSUE_RETURN` (`GoodsIssueEditor.tsx:22,52-65`) · checkbox "อนุญาตสต็อกติดลบ" | สต็อกคงเหลือรายสินค้า + ความเคลื่อนไหวใน `<details>` · เอกสารล่าสุด 100 รายการ | — | `createGoodsMovement` (`product.ts:296`), `listGoodsMovements` (`product.ts:390`) |
| 11 | `/assets` (+ `/assets/actions.ts`) | list + form + report | ทะเบียนสินทรัพย์ & ค่าเสื่อม | ขึ้นทะเบียน (`registerAssetAction`) · คิดค่าเสื่อมงวด (`runDepreciationAction`) · ขาย/ตัดจำหน่าย (`disposeAssetAction`) | สถิติ 4 ใบ: ใช้งาน/ต้นทุนรวม/NBV/ค่าเสื่อมงวดนี้ · การ์ดต่อสินทรัพย์: ต้นทุน/ซาก/ค่าเสื่อมสะสม/NBV | ACTIVE / FULLY_DEPRECIATED / DISPOSED / WRITTEN_OFF (`assets/page.tsx:23-28`) | `listAssets`/`runDepreciation`/`disposeAsset` (`asset.ts:138/313/444`) |
| 12 | `/finance` (+ `actions.ts`) | list + form | บัญชีเงิน เงินสด/ธนาคาร/e-Wallet/สำรองจ่าย | เพิ่มบัญชี · ลบ · โอนระหว่างบัญชี (`transferAction`) · เติม/เบิกชดเชยเงินสำรองจ่าย (`pettyReplenishAction`) | รายการบัญชี + ยอดคงเหลือ + ลิงก์ "ความเคลื่อนไหว" | — | `financeBalances` (`finance.ts:47`), `transferBetweenFinance` (`finance.ts:297`), `pettyCashReplenish` (`finance.ts:342`) |
| 13 | `/finance/[financeId]/statement` | report | ความเคลื่อนไหวบัญชีเงิน | filter ช่วงวันที่ (`from`/`to`) | คอลัมน์: วันที่ · เลขที่ · รายการ · รับ · จ่าย · คงเหลือ + ยอดยกมา/ยกไป | — | `financeStatement` (`finance.ts:232`) |
| 14 | `/cheque` (+ `actions.ts`) | list + form | ทะเบียนเช็ครับ/เช็คจ่าย | เพิ่มเช็ค · นำฝาก · เรียกเก็บได้ · เช็คเด้ง · ยกเลิก (`cheque/actions.ts:72-83`) | แท็บ `dir=IN` / `dir=OUT` · สรุปยอดรอเรียกเก็บ · แถว: เลขที่/ธนาคาร/สาขา/วันหน้าเช็ค/เรียกเก็บ/หมายเหตุ/ยอด | ON_HAND/DEPOSITED/CLEARED/BOUNCED/ISSUED/VOIDED (`cheque.ts:27`) | `listCheques`/`chequeSummary`/`depositCheque`/`clearCheque`/`bounceCheque`/`voidCheque` (`cheque.ts:44/65/247/261/321/375`) |
| 15 | `/wht` (+ `actions.ts`) | report + action | ภาษีหัก ณ ที่จ่าย 2 ขา | ออก 50 ทวิ (`issueWhtCertAction`) · ลิงก์ไป `/tax` | filter งวด (`period`, type=month) · แท็บ `deduct` (เราหักผู้ขาย) / `credit` (ถูกหัก) · คอลัมน์: วันที่ · ผู้รับ/ผู้หัก + เลขภาษี · ฐาน · อัตรา · ภาษี · 50 ทวิ/สำเนา | — | `listWhtCredits`/`listWhtDeductions`/`issueWhtCert` (`wht.ts:62/140/222`) |
| 16 | `/wht/[certId]/print` | print | ฟอร์ม 50 ทวิ B&W A4 | Ctrl+P | — | — | `getWhtCert` (`wht.ts:288`) |
| 17 | `/tax` | report | ภ.ง.ด.3/53 + เครดิตภาษีถูกหักสะสมทั้งปี | ดาวน์โหลด CSV ภ.ง.ด. / CSV เครดิต | filter แบบ (3/53) + งวด · ตารางสรุปตามประเภทเงินได้ + รายใบ 50 ทวิ | — | `pnd` (`wht.ts:317`), `listWhtCredits` |
| 18 | `/tax/export` (route.ts) | API | CSV: `kind=pnd|credits|pp30` (UTF-8 BOM) | — | — | — | `pndCsv`/`whtCreditsCsv` (`wht.ts:398/442`), `pp30Csv` (`reports.ts:630`) · guard `account.tax.view` |
| 19 | `/journal` | list | สมุดรายวัน | `+ บันทึกด้วยมือ` | แท็บ: ทั้งหมด/ซื้อ/ขาย/จ่าย/รับ/ทั่วไป/ล่าสุด (`journal/page.tsx:12-20`) · take 100 · คลิกทะลุไปเอกสารต้นทางถ้า `refType=AccountDocument` | REVERSED, ⚑ needsReview | prisma ตรง + `assertAccountCan("account.journal.view")` |
| 20 | `/journal/new` | form | JV มือ 8 บรรทัด | `postJvAction` → `postManualJV` (`gl.ts:868`) | เลือกบัญชี/เดบิต/เครดิต/หมายเหตุ | — | `listLedgers` (`coa.ts:158`) · สิทธิ์ `account.journal.adjust` |
| 21 | `/journal/[entryId]` | detail | ใบสำคัญ 1 ใบ + บรรทัด | — | บัญชี/เดบิต/เครดิต + แถวรวม | POSTED/REVERSED · MANUAL/AUTO | prisma ตรง |
| 22 | `/ledger` | report | บัญชีแยกประเภท | filter บัญชี + ช่วงวันที่ | ยอดยกมา → บรรทัด (วันที่/ใบสำคัญ/เดบิต/เครดิต/running balance) → ยกไป | — | prisma `accountJournalLine` ตรง (`ledger/page.tsx:50-79`) |
| 23 | `/accounts` | list + form | ผังบัญชี + การผูกบัญชีอัตโนมัติ | เพิ่มบัญชี · ปิดใช้งาน (เฉพาะไม่ใช่ `isSystem`) · บันทึก mapping ต่อ key | จัดกลุ่มตาม type: สินทรัพย์/หนี้สิน/ส่วนของเจ้าของ/รายได้/ต้นทุนขาย/ค่าใช้จ่าย | (บัญชีระบบ) | `listLedgers`/`listMappings`/`createLedger`/`archiveLedger`/`setMapping` (`coa.ts:158/165/173/239/257`) |
| 24 | `/periods` | list + action | ปิด/เปิดงวดบัญชี | ปิดงวด · เปิดงวดใหม่ (server action inline `periods/page.tsx:33/43`) | รายการงวด (desc) | OPEN / CLOSED | `closePeriod`/`reopenPeriod` (`gl.ts:1135/1187`) |
| 25 | `/reports` | hub | ดัชนีงบ 5 ใบ | — | การ์ด: งบทดลอง · งบกำไรขาดทุน · งบแสดงฐานะการเงิน · งบกระแสเงินสด · ภ.พ.30 (`reports/page.tsx:5-11`) | — | `loadReport` → `account.report.view` (`reports/_shared.tsx:6`) |
| 26 | `/reports/trial-balance` | report | งบทดลอง | พิมพ์ / ดาวน์โหลด CSV (`ReportToolbar.tsx`) | filter from/to (month) · คอลัมน์ 8 ช่อง ยกมา/เคลื่อนไหว/คงเหลือ Dr-Cr · WarnBanner ถ้าไม่สมดุล | — | `trialBalance` (`reports.ts:107`) |
| 27 | `/reports/profit-loss` | report | งบกำไรขาดทุน | พิมพ์ / CSV | filter from/to + checkbox "เทียบงวดก่อน" · หมวด รายได้/ต้นทุนขาย/ค่าใช้จ่าย + กำไรขั้นต้น/สุทธิ | — | `profitLoss` (`reports.ts:224`) |
| 28 | `/reports/balance-sheet` | report | งบแสดงฐานะการเงิน | พิมพ์ / CSV | filter `asOf` (YYYY-MM) · WarnBanner ถ้าไม่สมดุล | — | `balanceSheet` (`reports.ts:264`) |
| 29 | `/reports/cash-flow` | report | งบกระแสเงินสด (วิธีตรง) | พิมพ์ / CSV | filter from/to · แยก OPERATING/INVESTING/FINANCING · เตือน unclassified | — | `cashFlow` (`reports.ts:358`) |
| 30 | `/reports/pp30` | report | ภ.พ.30 + รายงานภาษีขาย/ซื้อ | พิมพ์ / CSV (client) + "ดาวน์โหลด CSV ยื่น" (server route) | filter งวด + เครดิตยกมา · สรุป 3 ช่อง (ภาษีขาย/ภาษีซื้อ/ต้องชำระ) + ตารางแยกอัตรา | — | `pp30` (`reports.ts:590`) |
| 31 | `/aging` | report | ลูกหนี้/เจ้าหนี้ค้างชำระ | — | แท็บ `direction=OUT` (AR) / `IN` (AP) · bucket: ยังไม่ครบกำหนด/1-30/31-60/61-90/90+ | — | `agingReport` (`reports.ts:702`) |
| 32 | `/documents` (+ `actions.ts`) | list + form | คลังเอกสาร (ไฟล์แนบ + ไฟล์ลอย) | เพิ่มไฟล์ด้วย **วาง URL** · ลบ (`moveAttachmentAction` มีแต่ไม่มีปุ่ม) | ชิปโฟลเดอร์ + จำนวน · ค้นหาชื่อไฟล์ (`q`) | — | `listAttachments`/`listFolders`/`createAttachment` (`attachment.ts:50/72/89`) |
| 33 | `/settings` | form | ข้อมูลกิจการ + ภาษี + โลโก้/ตรา/ลายเซ็น + ตั้งค่ารายเอกสาร | บันทึกการตั้งค่า (`saveSettingsAction`) | ตาราง per-docType: prefix · ออกใบกำกับอัตโนมัติ (RECEIPT/INVOICE) · ลิงก์สาธารณะ (RECEIPT/TAX_INVOICE) | — | `getSettings`/`saveSettings` (`service.ts:384/414`), `ImageAssetField` + `storageEnabled()` |
| 34 | `/print/[docId]` | print | เอกสาร A4 B&W (ม.86/4) · `?copy=1` = สำเนา | Ctrl+P | ครบตาม ม.86/4 + ม.86/10 (CN/DN อ้างใบเดิม + เหตุผล) | — | `getDocument`, `getSettings` |
| 35 | `/(store)/r/[token]` (นอกโมดูล) | public form | ลูกค้ากรอกข้อมูลขอใบกำกับภาษีเอง | — | — | — | `getPublicTaxContext`/`issuePublicTaxInvoice` (`service.ts:1610/1666`) |
| 36 | `/app/audit` (นอกโมดูล) | list | ประวัติการแก้ไข (ใช้ `listAuditLogs` จาก facade บัญชี) | — | filter action prefix | — | `access.ts` ผ่าน `modules/account/index.ts:174` |

### สิทธิ์ (permissions) ที่ใช้จริง
กำหนดที่ `src/lib/core/permissions.ts:432-461` · บังคับผ่าน `assertAccountCan()` (`src/lib/modules/account/access.ts:19`) · guard โหลดระบบ = `guard.ts:6`

`account.doc.create/issue/approve/void/public_link` · `account.payment.record/void` · `account.contact.manage` · `account.product.manage` · `account.document.manage` · `account.settings.manage` · `account.chart.manage` · `account.mapping.manage` · `account.journal.view/adjust` · `account.period.close/reopen` · `account.tax.view` · `account.wht.manage` · `account.report.view` · `account.finance.manage` · `account.asset.manage/register/dispose/writeoff` · `account.cheque.manage/deposit/clear/bounce/void`

⚠️ ช่องโหว่ที่เจอ: หน้า `/contacts`, `/products`, `/goods-issue`, `/documents`(หน้า list), `/docs/*`, `/expense|purchase|po|asset-buy`, `/finance`(หน้า list), `/cheque`(หน้า list), `/wht`(หน้า list), `/aging` **ไม่เรียก `assertAccountCan` ที่ชั้น page** — ด่านอยู่ที่ server action เท่านั้น (ต่างจาก `/journal`, `/ledger`, `/accounts`, `/periods`, `/reports/*` ที่ตรวจตั้งแต่ page)

### เอกสารประกอบที่มีอยู่
- `docs/modules/12-account.md` (1,164 บรรทัด) — สเปคเต็ม: §3 ฟังก์ชัน, §4 data model, §5 API, §6 UI screens (~47 จอ), §7 flows + §7.10 posting rules, §9 permissions, §10 reports
- `docs/sds/modules/account.md` (as-built 2026-07-16) — สรุปสั้น + §"ข้อจำกัด/หนี้ที่รู้"
- `docs/UI_STANDARD.md §4` — โครง nav บัญชี (ดู §F)
- ❌ ไม่มีไฟล์แผนบัญชีใน `ledger/` มาก่อน (ไฟล์นี้เป็นใบแรก)

---

## B. สรุปโครงข้อมูล (Data model)

### B.1 `AccountDocument` — `prisma/schema/account.prisma:99`

**docType (`AccountDocType`, `account.prisma:7-31`) — 22 ค่า**

| ฝั่ง | docType | prefix | มี route? |
|---|---|---|---|
| รายรับ | `QUOTATION` QT · `INVOICE` IV · `RECEIPT` RE · `TAX_INVOICE` TX · `DEPOSIT_RECEIPT` DR · `CREDIT_NOTE` CN · `DEBIT_NOTE` DN · `BILLING_NOTE` BN (`service.ts:28`) | ✅ ทั้ง 8 (`VISIBLE_DOC_TYPES` `service.ts:108`) | ✅ `/docs/[docType]` |
| รายรับ | `TAX_INVOICE_ABB` (ใบกำกับอย่างย่อ POS) | — | ❌ ไม่มี label/route |
| รายจ่าย | `PURCHASE` PC · `EXPENSE` EX · `PURCHASE_ORDER` PO · `ASSET_PURCHASE_ORDER` APO · `ASSET_PURCHASE` AP · `PURCHASE_TAX_INVOICE` PTX (`expense.ts:37`) | ✅ | ✅ 4 route (APO/PTX ผ่าน query param) |
| รายจ่าย | `DEPOSIT_PAYMENT` DP · `CREDIT_NOTE_RECEIVED` CNR · `DEBIT_NOTE_RECEIVED` DNR | มี label + prefix + tabs + **posting rule ครบ** (`gl.ts:532/547/556`) | ❌ ไม่มี route/nav |
| รายจ่าย | `COMBINED_PAYMENT` CP (ใบรวมจ่าย) | มีแค่ label+prefix (`expense.ts:47,61`) | ❌ ไม่มี posting rule, ไม่มี route |
| คลัง | `GOODS_ISSUE` · `GOODS_ISSUE_RETURN` | `GOODS_PREFIX` (`product.ts:14`) | ✅ `/goods-issue` |
| ภาษี | `WHT_CERT` WHT (50 ทวิ) | สร้างอัตโนมัติจาก payment | ✅ `/wht/[certId]/print` |

**status (`AccountDocStatus`, `account.prisma:33-50`) — 16 ค่า** · label ไทยที่ `service.ts:50`
`DRAFT` · `AWAITING_ACCEPT` · `ACCEPTED` · `REJECTED` · `AWAITING_APPROVAL` · `APPROVED` · `AWAITING_PAYMENT` · `PARTIAL` · `PAID` · `AWAITING_DEDUCT` · `DEDUCTED` · `AWAITING_RECEIVE` · `RECEIVED` · `ISSUED` · `VOIDED` · `CANCELLED`

**ช่องเงิน (สตางค์ Int)** `account.prisma:114-122`: `vatMode` (INCLUDE/EXCLUDE/NONE) · `vatTiming` (ON_ISSUE/ON_PAYMENT) · `subTotal` · `discountAmount` · `vatAmount` · `whtAmount` (preview) · `depositDeducted` · `grandTotal` · `paidTotal`

**ช่องอื่น**: `docNo` (null ตอน DRAFT) · `direction` (IN/OUT/INTERNAL) · `issueDate`/`dueDate`/`validUntil` · `contactId` + `contactSnapshot` (freeze ตอน issue) · `sourceDocId` · `sourcePaymentId` · `taxPointBasis` · `refSystemId`/`refType`/`refId` (ไหลจากระบบอื่น) · `categoryId` · `note`/`internalNote`/`adjustReason` · `whtIncomeType`/`whtRateBp` · `etaxStatus`/`etaxMeta` (P4 ยังไม่ใช้) · `pdfUrl` · `publicToken` (unique) · `acceptedAt` · `approvedById` · `replacedById` · `voidedAt`/`voidReason` · `createdById`

**ความสัมพันธ์ (`AccountRelationType`, `account.prisma:64-72`)**

| type | ใช้จริงไหม | ที่ใช้ |
|---|---|---|
| `CONVERT` | ✅ | `service.ts` convertDocument, `expense.ts:972` (PO→PC/AP) |
| `DEPOSIT_APPLY` | ✅ | `service.ts:763/816/926/984/1094` |
| `TAX_FOR` | ✅ | `service.ts:1431`, `expense.ts:568` (PTX), `expense.ts:729` (50 ทวิ) |
| `ADJUST` | 🟡 | ประกาศใน `RELATION_FOR` (`service.ts:93`) สำหรับ CN/DN — แต่ CN/DN ใช้เส้น CONVERT ตอนแปลง |
| `BILL` | ❌ | **ไม่มี code ที่เขียน relation ชนิดนี้** — ใบวางบิลรวมหลายใบแจ้งหนี้ยังไม่ทำ |
| `PAY_GROUP` | ❌ | ไม่มี code ที่ใช้ — ใบรวมจ่ายยังไม่ทำ |
| `REPLACE` | ❌ | `replacedById` มีในตารางแต่ไม่มี code เขียน — void+ออกใบแทนยังไม่ทำ |

**เส้นแปลงเอกสารที่อนุญาต** (`CONVERT_MAP`, `service.ts:82`): QT→[IV, DR] · IV→[RE, TX, CN, DN] · RE→[TX] · DR→[TX] · TX/CN/DN/BN→[] (ปลายทาง)

- `AccountDocumentLine` (`account.prisma:165`): `qty` Decimal(12,4) · `unitName` (สตริงอิสระ ไม่ผูก `AccountUnit`) · `unitPrice` · `discount` · `vatRateBp` (700/0/−1) · `amount` · `productId` · `accountId` · `assetId`
- `AccountDocumentPayment` (`account.prisma:192`): `paidAt` · `channel` (9 ค่า `account.prisma:74-84`) · `financeAccountId` · `amount` · `whtAmountSatang` · `whtRateBp` · `whtCertDocId` (unique) · `feeAmount` · `chequeId` (unique) · `entryId` · `voidedAt`/`voidReason`
- `AccountDocSequence` (`account.prisma:242`): จองเลขใน tx เดียวกับ insert · `periodKey` รายเดือน

### B.2 `AccountContact` — `account.prisma:259`
`kind` = CUSTOMER / VENDOR / BOTH เท่านั้น · `legalType` = PERSON/COMPANY · `name` · `taxId` · `branchCode`/`branchName` · `address` · `phone` · `email` · `creditTermDays` · `note` · `archivedAt`

❌ **ไม่มี group / tag / custom field / รูป / ผู้ติดต่อย่อย / ที่อยู่หลายชุด / ลูกค้าประจำ** — และ `listContacts` (`service.ts:530`) ไม่รองรับ search/pagination

### B.3 การเงิน
- `AccountFinance` (`account_gl.prisma:172`): `type` CASH/BANK/E_WALLET/PETTY_CASH · `name` · `bankName` · `accountNo` · `promptpayId` · `openingBalance`/`openingDate` · `ledgerAccountId` (auto สร้างบัญชีลูก GL `finance.ts:createChildLedger`) · `showOnDocuments` · `archivedAt`
  ❌ ไม่มี flag "ติดตาม/ปักหมุด" สำหรับ dashboard
- `AccountCheque` (`account_gl.prisma:194`): `direction` IN/OUT · `chequeNo` · `bankName`/`bankBranch` · `chequeDate` · `amount` · `status` (6 ค่า) · `financeAccountId` · `clearedAt` · 1:1 กับ payment

### B.4 บัญชีแยกประเภท
- `AccountLedger` (`account_gl.prisma:217`): `code`/`name`/`nameEn` · `type` (ASSET/LIABILITY/EQUITY/INCOME/COGS/EXPENSE) · `cashflowActivity` · `parentId` (tree) · `isSystem` · `archivedAt`
  seed 41 บัญชี SME ไทย + 28 mapping key (`coa.ts:25-104`) — 1000/1010/1020/1030/1040/1100/1130/1150/1155/1160/1200/16xx/2100/2110/2130/2200/2205/2210/2300/3000/3800/3999/4000/4030/4800/4900/5000/5800/6xxx/9999
- `AccountMapping` (`account_gl.prisma:242`): key → accountId (AR, AP, VAT_OUTPUT, VAT_INPUT, WHT_ASSET, … , SUSPENSE + รองรับ `DOC:{docType}` override)
- `AccountJournalEntry` (`account_gl.prisma:257`): `docNo` (JV-YYYY-MM-NNNN) · `book` (SALES/PURCHASES/RECEIPTS/PAYMENTS/GENERAL) · `journal` (DOC/PAYMENT/ADJUST/REVERSAL/DEPRECIATION/OPENING) · `periodKey` · `refType`/`refId` · `source` AUTO/MANUAL · `status` POSTED/REVERSED · `needsReview` · `idempotencyKey` (unique ต่อ tenant) · `reversalOfId`
- `AccountJournalLine` (`account_gl.prisma:290`): `accountId` · `debit`/`credit` · `contactId` · `note` (`systemId` denormalized ให้ query งบตรง)
- `AccountPeriod` (`account_gl.prisma:308`): `periodKey` · `status` OPEN/CLOSED · `closedAt`/`closedById` · `reopenLog` (JSON)

### B.5 สินทรัพย์
- `AccountFixedAsset` (`account_gl.prisma:324`): `code` FA-NNNN · `name` · `category` (string อิสระ) · `acquiredDate`/`startDepDate` · `cost` · `salvageValue` (≥1 สตางค์) · `usefulLifeMonths` · 3 บัญชี GL (`assetAccountId`/`accumAccountId`/`expenseAccountId`) · `sourceDocumentId` · `status` · `disposedAt`/`disposalAmount`
- `AccountDepreciation` (`account_gl.prisma:353`): unique `(assetId, periodKey)` → รันซ้ำไม่คิดซ้ำ (เส้นตรง straight-line, เดือนสุดท้ายปรับเศษ)

### B.6 สินค้า
- `AccountProduct` (`account_gl.prisma:130`): `sku` (unique ต่อ system) · `name`/`nameEn` · `type` GOODS/SERVICE · `unitId` → `AccountUnit` · `salePrice`/`buyPrice` (สตางค์) · `vatRateBp` · `incomeAccountId`/`expenseAccountId` override · `imageUrl` · **`qtyOnHand` Decimal(12,4)** · `archivedAt`
- `AccountUnit` (`account_gl.prisma:118`): แค่ `name` unique ต่อ system — **ไม่มี conversion factor / หน่วยซื้อ-ขาย-คลัง แยก**
- `AccountCategory` (`account_gl.prisma:156`): กลุ่มจัดประเภทเอกสาร (`appliesTo` = array docType) — **ไม่ใช่หมวดสินค้า**
- ❌ **ไม่มี bundle/รายการจัดชุด · ไม่มีต้นทุนเฉลี่ย/ต้นทุนคงเหลือ (`qtyOnHand` เก็บจำนวนอย่างเดียว)** — หน้า `/goods-issue` ระบุเองว่า "ยังไม่ลงบัญชีมูลค่าคลัง" (`goods-issue/page.tsx:60`)
- ⚠️ ต้นทุน/มูลค่าคลังจริงอยู่โมดูล `inventory` แยก (`prisma/schema/inventory.prisma:100` `accountProductId` sync 1:1) และลง GL ผ่าน `postInventoryGl` (`gl.ts:930`)

### B.7 ไฟล์แนบ / เชื่อมระบบ
- `AccountAttachment` (`account_gl.prisma:369`): `documentId?` (null = ไฟล์ลอย) · `folder` (สตริงอิสระ) · `fileName`/`fileUrl`/`mimeType`/`sizeBytes` · `uploadedById`
  🟡 UI รับ **URL อย่างเดียว** (`documents/page.tsx:134` เขียนกำกับไว้เอง) ทั้งที่ platform มี `uploadFile()`/`storageEnabled()` (`src/lib/storage/service.ts:96,118`) และหน้า `/settings` ใช้ `ImageAssetField` อัปโหลดจริงได้แล้ว
- `AccountSystemLink` (`account_gl.prisma:387`): `linkedKind` POS/BUSINESS/CRM → `linkedId` · opt-in
- `AccountSettings` (`account.prisma:288`): ช่องจริงในตาราง + **`docConfig` JSON** ที่เก็บเพิ่ม `orgPrefix`, `stampUrl`, `signatureUrl`, `taxPointBasis`, `docTypes{prefix,autoTaxInvoice,publicLink}` (view type ที่ `service.ts:254-289`)

### B.8 ความสามารถนำเข้า (CSV import)
- ❌ **โมดูลบัญชีไม่มีการนำเข้า CSV ใด ๆ** — มีแต่ export (`wht.ts:398/442`, `reports.ts:630`, `ReportToolbar.tsx` ฝั่ง client)
- ✅ แพลตฟอร์มมีของกลางพร้อมใช้: `src/lib/core/csv.ts` (parser + `ImportSummary`) และ `src/components/CsvImport.tsx` — ใช้อยู่แล้วใน `modules/member` และ `modules/inventory`

---

## C. Gap matrix เทียบ PEAK

**สรุปรวม 119 หัวข้อ: ✅ มีแล้ว 37 · 🟡 มีบางส่วน 31 · ❌ ไม่มี 51**

| หมวด PEAK | ✅ | 🟡 | ❌ | รวม |
|---|---:|---:|---:|---:|
| 1. หน้าหลัก (dashboard) | 0 | 5 | 4 | 9 |
| 2. รายรับ | 7 | 1 | 3 | 11 |
| 3. รายจ่าย | 4 | 5 | 3 | 12 |
| 4. ผู้ติดต่อ | 0 | 2 | 9 | 11 |
| 5. สินค้า | 4 | 3 | 6 | 13 |
| 6. การเงิน | 5 | 5 | 3 | 13 |
| 7. บัญชี | 10 | 5 | 8 | 23 |
| 8. คลังเอกสาร | 2 | 3 | 8 | 13 |
| 9. ตั้งค่า | 5 | 2 | 7 | 14 |
| **รวม** | **37** | **31** | **51** | **119** |

> จุดที่เจ็บสุด 3 อันดับ: **ผู้ติดต่อ** (❌ 9/11 — ไม่มีค้นหา/กลุ่ม/นำเข้า/โปรไฟล์), **คลังเอกสาร** (❌ 8/13 — อัปโหลดไม่ได้, ไม่มี inbox), **หน้าหลัก** (0 ✅ — ไม่มีกราฟ/series/ยอดเงินรวมเลย)

### 1. หน้าหลัก (dashboard)

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| ภาพรวมรายรับ/รายจ่าย/กำไร 12 เดือน + YoY | ❌ | ไม่มีฟังก์ชันคืน series รายเดือน · `profitLoss(ctx, from, to)` (`reports.ts:224`) คืนก้อนเดียว/ช่วง — ทำได้โดยเพิ่ม groupBy `entry.periodKey` ใน `sumByAccount` (`reports.ts:51`) แล้วพับเป็น series (ไม่ต้องแก้ schema) |
| รอรับชำระ / รอชำระ + เกินกำหนด | 🟡 | ฝั่งรับ: `overviewStats` (`service.ts:1539`) คืน `receivable/overdueCount/overdueAmount` แสดงอยู่แล้ว (`ui.tsx:81-87`) · ฝั่งจ่าย: `payableStats` (`expense.ts:983`) คืน `payable/overdueCount/overdueAmount/pendingApproval/awaitingTaxInvoice` **แต่ยังไม่มีหน้าไหนเรียกเลย** |
| รายได้เดือนนี้ (donut) | 🟡 | ตัวเลขมี (`profitLoss().income.rows` แยกตามรหัสบัญชี) · ❌ ไม่มี component กราฟใด ๆ ในโมดูล |
| ค่าใช้จ่ายเดือนนี้ (donut) | 🟡 | เหมือนกัน (`.expense.rows`) |
| "เงินคุณอยู่ไหน" (ยอดรวมตามบัญชีเงิน) | 🟡 | `financeBalances` (`finance.ts:47`) พร้อม แต่เรียกเฉพาะหน้า `/finance` (`finance/page.tsx:28`) — ยกมาหน้าแรกได้ทันที |
| เงินสด/เงินฝากที่ติดตาม | ❌ | ต้องเพิ่ม flag บน `AccountFinance` (มีแค่ `showOnDocuments` `account_gl.prisma:184`) หรือเก็บใน `AccountSettings.docConfig` |
| บัญชีที่ติดตาม (GL) | ❌ | ต้องเพิ่ม flag บน `AccountLedger` หรือ list ใน settings JSON |
| ปุ่ม "+ สร้างเอกสาร" dropdown | 🟡 | มี 2 ปุ่มตายตัว (`ui.tsx:94-100`) — ยังไม่เป็น dropdown รวมทุก docType |
| ย่อ/ขยาย widget | ❌ | ไม่มี · แพลตฟอร์มมี `TenantDashboard.widgetsJson` (`prisma/schema/dashboard_custom.prisma`) แต่เป็นระดับ tenant ไม่ใช่ระบบบัญชี |

### 2. รายรับ

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| ดูภาพรวม | ❌ | ไม่มี route `/docs/overview` — ต้องสร้างใหม่ (ข้อมูลได้จาก `overviewStats` + `profitLoss` + `agingReport`) |
| ใบเสนอราคา | ✅ | `/docs/QUOTATION` (`nav.ts:10`) |
| ใบรับเงินมัดจำ | ✅ | `/docs/DEPOSIT_RECEIPT` (`nav.ts:17`) + `listDeductibleDeposits` (`service.ts:803`) |
| ใบแจ้งหนี้ | ✅ | `/docs/INVOICE` (`nav.ts:11`) — schema กำกับว่ารวม "ใบส่งของ" ไว้ในชนิดเดียว (`account.prisma:9`) |
| ⤷ ใบส่งของ / บันทึกลูกหนี้ (แยกใบ) | ❌ | ไม่มี docType แยก — PEAK แยกเป็น sub-document ของ IV |
| ใบเสร็จรับเงิน | ✅ | `/docs/RECEIPT` (สร้างจากการแปลงเท่านั้น `docs/[docType]/page.tsx:114`) |
| ใบกำกับภาษีขาย | ✅ | `/docs/TAX_INVOICE` (ซ่อนเมื่อ `!vatRegistered` `nav.ts:13-15`) + พิมพ์ตาม ม.86/4 (`print/[docId]/page.tsx:8-10`) |
| ใบลดหนี้ | ✅ | `/docs/CREDIT_NOTE` + cap ตามยอดค้าง (`service.ts:~800`) + ม.86/10 บนใบพิมพ์ |
| ใบเพิ่มหนี้ | ✅ | `/docs/DEBIT_NOTE` |
| ใบวางบิล | 🟡 | route มี (`nav.ts:16`) แต่ **สร้างเป็นเอกสารเดี่ยวเท่านั้น** — ไม่มี picker เลือกหลายใบแจ้งหนี้, `AccountRelationType.BILL` ไม่ถูกใช้ที่ไหนเลย, ไม่มีการกระจายตัดชำระ |
| นำเข้าเอกสาร | ❌ | ไม่มี · ใช้ `core/csv.ts` + `CsvImport.tsx` ต่อยอดได้ |

### 3. รายจ่าย

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| ดูภาพรวม (กราฟรายเดือน + จ่ายให้ใคร/ค่าอะไรมากสุด) | ❌ | `payableStats` (`expense.ts:983`) มีตัวเลขค้างจ่าย/พ้นกำหนด/รออนุมัติ/รอใบกำกับ แต่ไม่มีหน้าเรียก · "จ่ายให้ใครมากสุด" ทำได้จาก groupBy `AccountDocument.contactId` where `direction=IN` · "จ่ายค่าอะไรมากสุด" ทำได้จาก `AccountJournalLine` join `AccountLedger type EXPENSE/COGS` — **ทั้งคู่ยังไม่มีฟังก์ชัน** |
| ใบสั่งซื้อ | ✅ | `/po` (`nav.ts:27`) + flow อนุมัติครบ |
| ใบจ่ายเงินมัดจำ | 🟡 | model + label + prefix DP + tabs + **posting rule ครบ** (`gl.ts:532`) และ `isPayable` รองรับ (`expense-ui.tsx:144`) — ขาดแค่ route + nav (ทำได้เหมือน `/po?docType=`) |
| บันทึกซื้อสินค้า | ✅ | `/purchase` (`nav.ts:26`) |
| บันทึกค่าใช้จ่าย | ✅ | `/expense` (`nav.ts:25`) — บังคับเลือกหมวดบัญชี (`expense-page.tsx:73`) |
| ใบสั่งซื้อสินทรัพย์ | 🟡 | ใช้ได้ผ่าน `/po?docType=ASSET_PURCHASE_ORDER` (`po/page.tsx:13`) แต่ **ไม่มีในเมนู** |
| ซื้อสินทรัพย์ | ✅ | `/asset-buy` (`nav.ts:28`) + ต่อยอดขึ้นทะเบียนที่ `/assets` (`asset.ts:87` `listAssetSourceDocs`) |
| ใบกำกับภาษีซื้อ | 🟡 | ใช้ได้ผ่าน `/asset-buy?docType=PURCHASE_TAX_INVOICE` (`asset-buy/page.tsx:13`) แต่ **ไม่มีในเมนู** · VAT ซื้อ 3 โหมด CLAIM/AWAITING/NO_CLAIM ครบ (`expense.ts:100-108`) |
| รับใบลดหนี้ (CNR) | 🟡 | posting rule ครบ (`gl.ts:547`) + label/prefix/tabs — ❌ ไม่มี route/nav/ฟอร์ม |
| รับใบเพิ่มหนี้ (DNR) | 🟡 | posting rule ครบ (`gl.ts:556`) — ❌ ไม่มี route/nav |
| ใบรวมจ่าย | ❌ | มีแค่ enum + label + prefix CP (`account.prisma:27`, `expense.ts:47,61`) · **ไม่มี posting rule, ไม่มี relation `PAY_GROUP` ที่ไหนเลย, ไม่มี route** — ต้องทำเส้นเดียวกับใบวางบิลฝั่งรับ |
| นำเข้าเอกสาร | ❌ | เหมือนข้อ 2 |

### 4. ผู้ติดต่อ

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| หน้าผู้ติดต่อ | 🟡 | `/contacts` (`contacts/page.tsx`) — list เดียวไม่มีแท็บ/ค้นหา/pagination · **ไม่มีปุ่มแก้ไข** (มีแต่ `createContactAction`/`archiveContactAction`; `updateContactAction` `actions.ts:317` ไม่มีใครเรียก) · ไม่มีหน้าโปรไฟล์ผู้ติดต่อ |
| กลุ่มมาตรฐาน ทั้งหมด/ลูกค้า/ผู้ขาย/ปิดใช้งาน | 🟡 | `AccountContact.kind` + `archivedAt` มีครบ และ `listContacts` รับ `{kind, includeArchived}` (`service.ts:530`) — **แต่ UI ไม่มีแท็บ/ตัวกรอง** |
| "ลูกค้าประจำ" | ❌ | ไม่มีแนวคิดนี้ในโมเดล — ต้องคำนวณ (จำนวนเอกสาร/ยอดรวม) หรือเพิ่ม flag |
| กลุ่มกำหนดเอง | ❌ | ไม่มีโมเดล group/tag บน `AccountContact` (`account.prisma:259`) — ต้องเพิ่มตาราง `AccountContactGroup` + join table (หรือ field `tags Json`) |
| ค้นหา | ❌ | `listContacts` ไม่มีพารามิเตอร์ `q` (มี index `[systemId, name]` `account.prisma:283` รองรับอยู่แล้ว) |
| เพิ่มเข้ากลุ่ม (bulk) | ❌ | ขึ้นกับ "กลุ่มกำหนดเอง" |
| นำเข้าผู้ติดต่อ | ❌ | ไม่มี · reuse `core/csv.ts` + `CsvImport.tsx` (แบบ `modules/member`) ได้ |
| พิมพ์รายงานผู้ติดต่อ | ❌ | ไม่มี (มี pattern พิมพ์อยู่แล้วที่ `reports/ReportToolbar.tsx`) |
| เพิ่มผู้ติดต่อยอดนิยม | ❌ | ไม่มี |
| ปุ่ม "ทำรายการ" ต่อแถว | ❌ | ไม่มี (ต้อง prefill `contactId` ในฟอร์มสร้างเอกสาร) |
| การเชื่อมต่อคู่ค้าและผู้ติดต่อ | ❌ | ไม่มีแนวคิด peer-to-peer · `AccountSystemLink` (`account_gl.prisma:387`) เป็นการเชื่อม POS/CRM/BusinessUnit ภายใน tenant เดียวกันเท่านั้น |

### 5. สินค้า

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| สินค้า/บริการ | ✅ | `/products?tab=catalog` (`nav.ts:38`) |
| แท็บ สินค้า / บริการ | 🟡 | `listProducts` รับ `{type}` (`product.ts:138`) แต่ UI ใช้แท็บเป็น catalog/units/categories (`products/page.tsx:76-80`) ไม่ได้แยกชนิด |
| รายการจัดชุด (bundle) | ❌ | ไม่มีโมเดล — ต้องเพิ่ม `AccountProductBundleItem` (parentProductId, childProductId, qty) |
| สินค้าที่ติดตาม | ❌ | ไม่มี flag บน `AccountProduct` (`account_gl.prisma:130`) |
| นำเข้าสินค้า | ❌ | ไม่มี · `modules/inventory` ทำแล้ว (`inventory/actions.ts` ใช้ `core/csv.ts`) — ลอกได้ |
| พิมพ์รายงานสินค้า | ❌ | ไม่มี |
| คอลัมน์ รหัส/ชื่อ/หน่วย/คงเหลือ/ราคาขาย | 🟡 | ข้อมูลครบ (`sku`,`name`,`unitId`,`qtyOnHand`,`salePrice`) แต่ render เป็นข้อความรวมบรรทัดเดียวใน `<details>` (`products/page.tsx:99-113`) ไม่ใช่ตาราง |
| ทั้งหมด / ปิดใช้งาน | 🟡 | หน้าโหลด `includeArchived: true` แล้วโชว์ปนกัน (ขีดฆ่า) (`products/page.tsx:61,99`) — ไม่มีแท็บแยก |
| pagination | ❌ | ทั้ง `/products` และ `/contacts` โหลดทั้งหมด ไม่มี take/cursor |
| หน่วย | ✅ | `/products?tab=units` (`AccountUnit`) — แต่ไม่มี conversion factor |
| ใบเบิกสินค้า | ✅ | `/goods-issue` (`nav.ts:39`) |
| ใบส่งคืนเบิกสินค้า | ✅ | หน้าเดียวกัน toggle `GOODS_ISSUE_RETURN` (`GoodsIssueEditor.tsx:59-65`) — ⚠️ ไม่มีเมนูแยก |
| ใบปรับต้นทุนสินค้า | ❌ | ไม่มี docType, ไม่มีช่องต้นทุนคงเหลือบน `AccountProduct` (มีแค่ `buyPrice` ราคาตั้ง) · การปรับต้นทุน/มูลค่าคลังจริงอยู่โมดูล `inventory` และลงบัญชีผ่าน `postInventoryGl` (`gl.ts:930`) — redesign ต้องตัดสินว่าจะดึงเข้าเมนูบัญชีหรือชี้ไป inventory |

### 6. การเงิน

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| **ดูภาพรวม (การเงิน)** — หน้ารวมมีแท็บ 7 อัน | ❌ | ไม่มี route ภาพรวมการเงิน · ปัจจุบันเป็น 4 เมนูแยกใน nav (`nav.ts:44-50`: `/finance`, `/cheque`, `/wht`, `/tax`) ไม่มีหน้าแม่และไม่มีแถบแท็บร่วม |
| ⤷ แท็บย่อย 7 อัน (ภาพรวม · เงินสด/ธนาคาร/e-Wallet · สำรองรับจ่าย · เช็ครับ · เช็คจ่าย · ภาษีถูกหัก · ภาษีหัก ณ ที่จ่าย) | 🟡 | เนื้อทั้ง 6 แท็บหลังมีจริงแต่กระจาย: เงินสด/ธนาคาร/e-Wallet + สำรองรับจ่าย ปนกันในหน้าเดียว (`finance/page.tsx:30-31` แยก `pettyAccounts`/`nonPetty` แล้ว แต่แสดงในลิสต์เดียว) · เช็ครับ/เช็คจ่าย = แท็บ `?dir=IN|OUT` (`cheque/page.tsx:48-51`) · ภาษีถูกหัก/ภาษีหัก = แท็บ `?tab=credit|deduct` (`wht/page.tsx:66-70`) — **ต้องยกมารวมเป็นแท็บชุดเดียว** |
| ⤷ "เงินสด/เงินฝากธนาคารที่ติดตาม" (การ์ดต่อบัญชี + ยอด) | 🟡 | `financeBalances` (`finance.ts:47`) คืนยอดต่อบัญชีครบ และแสดงเป็น `DataList` อยู่แล้ว (`finance/page.tsx:45-83`) — ❌ ขาด **flag "ติดตาม"** (`AccountFinance` มีแค่ `showOnDocuments` `account_gl.prisma:184`) และยังเป็นแถวลิสต์ ไม่ใช่การ์ด |
| ⤷ "ตารางเงินเข้า-ออก" = ปฏิทินรายเดือน | ❌ | ไม่มี component ปฏิทินใด ๆ ในโมดูล · ข้อมูลรายวันดึงได้จาก `AccountDocumentPayment.paidAt` (index `[systemId, paidAt]` `account.prisma:218`) แต่ยังไม่มีฟังก์ชัน |
| ⤷ 6 ไทล์สรุป: เงินเข้า · เงินออก · ค้างรับเกินเวลา · ค้างจ่ายเกินเวลา · เงินคาดว่าจะเข้า · เงินคาดว่าจะออก | 🟡/❌ | **ค้างรับเกินเวลา** = `overviewStats().overdueAmount` ✅ (`service.ts:1539`) · **ค้างจ่ายเกินเวลา** = `payableStats().overdueAmount` ✅ (`expense.ts:983`, ยังไม่มีใครเรียก) · **เงินเข้า/เงินออกจริงในเดือน** ❌ ต้อง groupBy `AccountDocumentPayment` ตามทิศ (มี `financeAccountId` + `amount`) หรืออ่านจาก GL cash accounts · **เงินคาดว่าจะเข้า/ออก** ❌ ต้อง project จาก `dueDate` ของเอกสาร `AWAITING_PAYMENT/PARTIAL` (index `[systemId, docType, dueDate]` `account.prisma:159` รองรับ) — ยังไม่มีฟังก์ชัน |
| ⤷ "รายการที่กระทบยอดแล้ว" (bank reconciliation ต่อบัญชี/เดือน) | ❌ | **ไม่มีระบบกระทบยอดธนาคารเลย** — grep `reconcil`/`กระทบยอด` เจอแต่ (ก) flag ตรวจสมดุลของงบกระแสเงินสด `cf.reconciled` (`reports.ts:349,453`) และ (ข) เครื่องมือนับเงินสดของ POS (`pos/close/CloseDayTools.tsx:47`) — ไม่เกี่ยวกัน · ต้องเพิ่มโมเดลใหม่ (เช่น `AccountBankStatementLine` + flag `reconciledAt`/`reconciledEntryId` บน payment/journal line) + หน้าจับคู่ · ที่มีให้ต่อยอด = `financeStatement` (`finance.ts:232`) ที่คืน running balance ต่อบัญชีอยู่แล้ว |
| ⤷ "เงินคุณอยู่ไหน" | 🟡 | `financeBalances` sum ได้ทันที แต่ยังไม่มีบล็อกนี้ที่ไหน (ซ้ำกับ §C.1) |
| เงินสด/ธนาคาร/e-Wallet | ✅ | `/finance` (`nav.ts:46`) — เพิ่ม/ลบบัญชี, ยอดยกมา, PromptPay, โอนระหว่างบัญชี, statement ต่อบัญชี |
| สำรองรับจ่าย (petty cash / advance) | 🟡 | `AccountFinanceType.PETTY_CASH` + `pettyCashReplenish` TOPUP/REIMBURSE (`finance.ts:342`, UI `finance/page.tsx:156-187`) ✅ — ❌ **ไม่มีหน้า/แท็บของตัวเอง** และไม่มีแนวคิด "เงินทดรองจ่ายรายบุคคล (advance ต่อพนักงาน)" |
| เช็ครับ | ✅ | `/cheque?dir=IN` (`nav.ts:47`) lifecycle: ON_HAND → DEPOSITED → CLEARED / BOUNCED |
| เช็คจ่าย | ✅ | `/cheque?dir=OUT` — ISSUED → CLEARED / VOIDED |
| ภาษีถูกหัก ณ ที่จ่าย (ลูกค้าหักเรา) | ✅ | `/wht?tab=credit` + เครดิตสะสมทั้งปี (บัญชี 1160) ใน `/tax` (`wht.ts:62`) |
| ภาษีหัก ณ ที่จ่าย (เราหักผู้ขาย) | ✅ | `/wht?tab=deduct` + ออก 50 ทวิ + ภ.ง.ด.3/53 + CSV (`wht.ts:140/222/317/398`) |

### 7. บัญชี

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| ผังบัญชี — หน้า 2 คอลัมน์ (tree ซ้าย / รายละเอียดขวา) | 🟡 | `/accounts` (`nav.ts:57`) เป็นหน้าเดียวคอลัมน์เดียว: ฟอร์มเพิ่ม + ลิสต์แบนจัดกลุ่มตาม type + ฟอร์ม mapping (`accounts/page.tsx:102-154`) |
| ⤷ tree จัดกลุ่ม สินทรัพย์(1)/หนี้สิน(2)/ทุน(3)… + expand/collapse | 🟡 | `AccountLedger.parentId`/`children` มีในโมเดล (`account_gl.prisma:227-228`) และใช้จริงตอนสร้างบัญชีลูกของบัญชีเงิน (`finance.ts:createChildLedger`) — **แต่ UI render เป็นลิสต์แบน ไม่แสดง hierarchy และไม่มี expand/collapse** (`accounts/page.tsx:107-131`) |
| ⤷ ค้นหา + จำนวนบัญชีต่อหมวด | ❌ | `listLedgers` (`coa.ts:158`) ไม่มีพารามิเตอร์ค้นหา · หน้าไม่แสดง count ต่อหมวด |
| ⤷ รายละเอียดบัญชีที่เลือก: ผังหลัก/รอง/ย่อย | 🟡 | มี `parentId` 1 ชั้น — ❌ ไม่มีแนวคิดระดับ 3 ชั้น (หลัก/รอง/ย่อย) เป็น field |
| ⤷ อัตราหัก ณ ที่จ่าย ต่อบัญชี | ❌ | `AccountLedger` ไม่มีช่อง `whtRateBp` (`account_gl.prisma:217-240`) — WHT rate กรอกมือตอนจ่าย (`expense-ui.tsx:358`) |
| ⤷ ประเภทภาษี ต่อบัญชี | ❌ | ไม่มีช่อง — VAT rate อยู่ที่ `AccountProduct.vatRateBp` / `AccountDocumentLine.vatRateBp` เท่านั้น |
| ⤷ คำอธิบายบัญชี | ❌ | `AccountLedger` ไม่มีช่อง `description` |
| ⤷ toggle เปิด/ปิดใช้งาน | 🟡 | มี `archivedAt` + ปุ่ม "ปิดใช้งาน" (เฉพาะบัญชีที่ `isSystem=false` `accounts/page.tsx:118`) — ❌ ไม่มีปุ่มกู้คืน และไม่ใช่ toggle |
| ⤷ ลิงก์ "ดูบัญชีแยกประเภท" จากบัญชีที่เลือก | ❌ | ต้องไป `/ledger` แล้วเลือกใน dropdown เอง (`ledger/page.tsx:112-119`) — ไม่มีลิงก์ deep-link `?account=<id>` จากหน้าผังบัญชี (แม้ route รองรับ query นี้อยู่แล้ว) |
| ⤷ ปุ่ม เพิ่มบัญชี | ✅ | `createLedger` (`coa.ts:173`, UI `accounts/page.tsx:77-100`) |
| ⤷ ปุ่ม เพิ่มธนาคารและอื่น ๆ | 🟡 | ทำได้แต่อยู่คนละหน้า — `/finance` สร้าง `AccountFinance` แล้ว auto สร้างบัญชีลูก GL ให้ (`finance.ts:createChildLedger`) |
| ⤷ ปุ่ม นำเข้าผังบัญชี | ❌ | ไม่มี · มีแต่ seed ตายตัว 41 บัญชี (`coa.ts:25-77`) |
| ⤷ ปุ่ม พิมพ์รายงานผังบัญชี | ❌ | ไม่มี |
| บัญชีรายวัน (journal) | ✅ | `/journal` + `/journal/[entryId]` + `/journal/new` (JV มือ) |
| บัญชีแยกประเภท | ✅ | `/ledger` (ยอดยกมา + running balance + ยกไป) |
| งบทดลอง | ✅ | `/reports/trial-balance` |
| งบฐานะการเงิน | ✅ | `/reports/balance-sheet` |
| งบกำไรขาดทุน | ✅ | `/reports/profit-loss` (+ เทียบงวดก่อน) |
| งบกระแสเงินสด | ✅ | `/reports/cash-flow` (วิธีตรง 3 กิจกรรม) |
| DBD e-Filing | ❌ | ไม่มีโค้ดเลย (สเปคจัดไว้ P4 — `docs/modules/12-account.md` S46) · ของที่พร้อมต่อยอด = `balanceSheet`/`profitLoss` + `fiscalYearStartKey` (`reports.ts:78`) |
| สินทรัพย์ (ทะเบียน + ค่าเสื่อม) | ✅ | `/assets` — ⚠️ **จัดอยู่ใต้หมวด "สินค้า" ใน nav** (`nav.ts:40`) ไม่ใช่ "บัญชี" อย่างที่ PEAK วาง |
| (ไม่มีใน PEAK) ปิดงวดบัญชี | ✅ | `/periods` (`nav.ts:58`) — ดู §E |
| (ไม่มีใน PEAK) ภ.พ.30 | ✅ | `/reports/pp30` |

### 8. คลังเอกสาร

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| กล่องขาเข้า (inbox ไฟล์รอแปลงเป็นเอกสาร) | ❌ | ไม่มีแนวคิด inbox · `AccountAttachment` (`account_gl.prisma:369`) มีแค่ `documentId?` + `folder` — ไม่มี status "ยังไม่ออกเอกสาร/ออกแล้ว", ไม่มี `docTypeHint`, ไม่มีคิวงาน · ที่พอใช้แทนได้คือ `documentId = null` (ไฟล์ลอย) ซึ่ง `listAttachments` รองรับผ่าน `centralOnly` (`attachment.ts:53`) แต่ยังไม่มี UI |
| คลังเอกสาร — แท็บ ทั้งหมด / ยังไม่ออกเอกสาร (badge) / ออกเอกสาร | ❌ | `/documents` ใช้ **ชิปโฟลเดอร์** แทน (`documents/page.tsx:48-66`) — ไม่มีแท็บสถานะและไม่มี badge นับ (นับได้จาก `documentId: null` แต่ `listFolders` (`attachment.ts:72`) นับตามโฟลเดอร์เท่านั้น) |
| list / grid toggle | ❌ | มีแค่ `DataList` (`documents/page.tsx:76`) |
| filter ช่วงวันที่อัปโหลด | ❌ | `listAttachments` รับแค่ `{folder, q, documentId, centralOnly}` (`attachment.ts:50-53`) — `createdAt` มี index ทางอ้อมผ่าน `[systemId, folder]` เท่านั้น |
| ค้นหาชื่อไฟล์ | ✅ | `q` → `fileName contains` (`attachment.ts:60`), UI `documents/page.tsx:68-74` |
| ค้นหาตามผู้อัปโหลด | ❌ | `uploadedById` เก็บอยู่ (`account_gl.prisma:380`) แต่ไม่ query และ **ไม่แสดงชื่อผู้อัปโหลด** ในลิสต์ |
| คอลัมน์: ชื่อไฟล์ + thumbnail (pdf/jpg) | 🟡 | มี `isImageMime()` แต่ใช้แค่สลับ emoji 🖼/📄 (`attachment.ts:44`, `documents/page.tsx:82`) — ❌ ไม่มี thumbnail/preview จริง |
| คอลัมน์: วันที่อัปโหลด | ✅ | `createdAt` แสดงในบรรทัดรอง (`documents/page.tsx:88`) |
| คอลัมน์: ประเภท (แก้ได้ เช่น "รายจ่าย > บันทึกค่าใช้จ่าย") | ❌ | ไม่มีช่องประเภทบน `AccountAttachment` — มีแค่ `folder` สตริงอิสระ · ต้องเพิ่ม field (หรือ map folder → docType) |
| คอลัมน์: ผู้อัปโหลด | ❌ | ไม่ render (แม้ `uploadedById` เก็บไว้) |
| คอลัมน์: คำสั่ง (เลขเอกสารที่ผูก หรือปุ่ม "+ สร้าง/แนบเอกสาร") | 🟡 | แสดง "แนบกับ {docNo}" ถ้ามี (`documents/page.tsx:90-92`) — ❌ ไม่ใช่ลิงก์ไปเอกสาร และ **ไม่มีปุ่มสร้างเอกสารจากไฟล์** (`createAttachment` รับ `documentId` ได้ `attachment.ts:89` แต่ฟอร์มในหน้าไม่มีช่องนี้) |
| อัปโหลดไฟล์ | ❌ | **หน้ารับแค่ URL** (`documents/page.tsx:112-135` เขียนกำกับเองว่า "ยังไม่มีระบบอัปโหลดไฟล์ในตัว") ทั้งที่ `uploadFile()`/`storageEnabled()` มีอยู่แล้ว (`src/lib/storage/service.ts:96,118`) และหน้า `/settings` ใช้ `ImageAssetField` อัปโหลดจริงได้ |
| ย้ายโฟลเดอร์ | 🟡 | `moveAttachmentAction` (`documents/actions.ts:55`) + `moveAttachment` (`attachment.ts:134`) พร้อม — ❌ ไม่มีปุ่มใน UI |

### 9. ตั้งค่า

> PEAK = sidebar accordion ซ้าย + เนื้อหาขวา · SHARK ปัจจุบัน = เมนู "ตั้งค่า" 1 รายการ (`nav.ts:69-72`) ชี้ `/settings` หน้าเดียวยาว

| PEAK | สถานะ | รายละเอียด |
|---|---|---|
| ข้อมูลแพ็กเกจ/ต่ออายุ (แพ็กเกจ · การชำระ · บัตร) | ❌ (นอกโมดูล, ไม่ครบ) | มี `/app/settings/billing` = ลิสต์ `PlatformInvoice` ที่แพลตฟอร์มเรียกเก็บ (`settings/billing/page.tsx:19-22`) — ❌ ไม่มีหน้าแพ็กเกจ/ต่ออายุ/ผูกบัตร · ❌ ไม่มีโมเดล plan/quota ระดับ tenant (`prisma/schema/subscription.prisma` มีแค่ `MemberPlan`/`MemberSubscription` = แพ็กเกจสมาชิกของ**ร้าน** ไม่ใช่ของแพลตฟอร์ม) |
| ⤷ usage quota: ผู้ใช้งาน x/y · สิทธิ์ x/y · ช่องทางการเงิน x/y | ❌ | ไม่มีเพดาน/ตัวนับใด ๆ |
| ⤷ แถบใช้เครดิต | 🟡 (นอกโมดูล) | มี `/app/settings/credit` (เครดิต AI) — คนละเรื่องกับโควตาบัญชี |
| ตั้งค่าองค์กร | ✅ | `/settings` ส่วนบน: คำนำหน้า/ชื่อ/ชื่ออังกฤษ/เลขภาษี/สาขา/ที่อยู่/โทร/อีเมล/เว็บไซต์ (`settings/page.tsx:42-104`) + `orgDisplayName` (`service.ts:362`) |
| ตั้งค่าสิทธิ์ผู้ใช้งาน | ❌ (นอกโมดูล) | อยู่ที่ `/app/settings/staff` (ระดับ tenant) · สิทธิ์บัญชี 30 action มีครบใน `permissions.ts:432-461` แต่ **ไม่มีหน้าตั้งค่าสิทธิ์ในโมดูลบัญชี** และไม่มีลิงก์จาก nav บัญชี |
| ตั้งค่าเอกสาร (numbering / template / logo) | ✅ | `/settings` — prefix ต่อ docType + ออกใบกำกับอัตโนมัติ + ลิงก์สาธารณะ (`settings/page.tsx:169-211`, เก็บใน `AccountSettings.docConfig.docTypes` `service.ts:282-300`) + โลโก้/ตราประทับ/ลายเซ็น (`settings/page.tsx:138-167`) · 🟡 pattern เลขรันตายตัว `{prefix}-{YYYY}-{MM}-{0000}` (`expense.ts:nextDocNo`) ปรับได้แค่ prefix ไม่ได้เลือก reset รายปี/รายเดือน (แม้ `SeqReset` type มีอยู่ `service.ts:618`) · ❌ ไม่มี live preview เลขรัน · ❌ ไม่มี template เอกสารหลายแบบ |
| ตั้งค่านโยบายบัญชี — VAT | ✅ | `vatRegistered` + `vatRateBp` (`settings/page.tsx:107-117`) |
| ⤷ นโยบายบัญชี — จุดรับรู้ภาษีขาย | ✅ | `taxPointBasis` ON_ISSUE/ON_PAYMENT (`settings/page.tsx:118-124`) |
| ⤷ นโยบายบัญชี — WHT default | ❌ | ไม่มีค่าเริ่มต้น WHT ที่ไหนเลย — ต้องเลือกประเภทเงินได้ + กรอกอัตราทุกครั้งตอนจ่าย (`expense-ui.tsx:352-358`) |
| ⤷ นโยบายบัญชี — ปีบัญชี (fiscal year) | ❌ | `balanceSheet` รับ `opts.fiscalYearEndMonth` ได้ (`reports.ts:267`) **แต่ไม่มีที่เก็บและหน้าเรียกไม่ส่ง** (`reports/balance-sheet/page.tsx:18`) → ตรึงเป็นปีปฏิทินเสมอ |
| ⤷ นโยบายบัญชี — วิธีคิดต้นทุนสินค้า (inventory costing) | ❌ | ไม่มีใน `AccountSettings` (`account.prisma:288`) · `AccountProduct` ไม่มีต้นทุนคงเหลือ — ต้นทุนจริงอยู่โมดูล `inventory` |
| ⤷ อื่น ๆ ที่มีอยู่ใน settings บัญชี | ✅ | `defaultDueDays`, `defaultValidDays`, `footerNote` (`settings/page.tsx:125-136`) |
| ตั้งค่าเชื่อมต่อระบบภายนอก | 🟡 (นอกโมดูล) | `AccountSystemLink` POS/BUSINESS/CRM มีจริง (`account_gl.prisma:387`) และจัดการที่ `/app/settings/connections` — ❌ ในโมดูลบัญชี **ไม่มีหน้าไหนแสดง link ที่เชื่อมอยู่เลย** · ❌ ไม่มี bank feed / e-Tax provider / DBD (ช่อง `etaxStatus`/`etaxMeta` `account.prisma:137-138` ว่างเปล่าไม่มีโค้ดใช้) |
| ลงทะเบียนสำนักงานบัญชี | ❌ | ไม่มีแนวคิดผู้ทำบัญชีภายนอก/สำนักงานบัญชี — RBAC เป็นระดับ membership ของร้านเท่านั้น (`access.ts:10`) |

---

## D. ฟังก์ชันสถิติ/dashboard ที่มีอยู่

### D.1 คำนวณได้แล้วฝั่ง server (เรียกใช้ได้ทันที)

| ตัวเลข | ฟังก์ชัน | ที่อยู่ | ใช้อยู่ที่ไหน |
|---|---|---|---|
| ลูกหนี้ค้างรับ (หัก CN แล้ว) · จำนวน+ยอดพ้นกำหนด · จำนวนเอกสาร · จำนวนผู้ติดต่อ | `overviewStats(tenantId, systemId)` | `service.ts:1539` | `ui.tsx:53` (หน้าแรก) |
| เจ้าหนี้ค้างจ่าย · พ้นกำหนด · รออนุมัติ · รอรับใบกำกับ | `payableStats(tenantId, systemId)` | `expense.ts:983` | **ไม่มีใครเรียก** |
| ยอดคงเหลือทุกบัญชีเงิน (Σ debit−credit ของ GL ที่ผูก) | `financeBalances` | `finance.ts:47` | `/finance` เท่านั้น |
| statement รายบัญชีเงิน + ยอดยกมา/ยกไป | `financeStatement` | `finance.ts:232` | `/finance/[id]/statement` |
| aging AR/AP 5 bucket ต่อคู่ค้า | `agingReport(ctx, {direction, asOf})` | `reports.ts:702` | `/aging` |
| งบทดลอง (ยกมา/เคลื่อนไหว/คงเหลือ + balanced) | `trialBalance(ctx, from, to)` | `reports.ts:107` | `/reports/trial-balance` |
| P&L รายได้/ต้นทุน/ค่าใช้จ่าย รายบัญชี + กำไรขั้นต้น/สุทธิ (+ เทียบงวดก่อน) | `profitLoss(ctx, from, to, {compare})` | `reports.ts:224` | `/reports/profit-loss` |
| งบดุล + กำไรสะสม + กำไรงวดปัจจุบัน + balanced | `balanceSheet(ctx, asOf)` | `reports.ts:264` | `/reports/balance-sheet` |
| กระแสเงินสด 3 กิจกรรม + เงินต้น/ปลายงวด + reconciled | `cashFlow(ctx, from, to)` | `reports.ts:358` | `/reports/cash-flow` |
| ภ.พ.30 ภาษีขาย/ซื้อ แยกอัตรา + net payable + เครดิตยกไป | `pp30(ctx, period, {carryForward})` | `reports.ts:590` | `/reports/pp30` |
| ภ.ง.ด.3/53 สรุปตามประเภทเงินได้ + รายใบ | `pnd(t, s, {type, period})` | `wht.ts:317` | `/tax` |
| WHT ถูกหัก (เครดิต 1160) / ที่เราหัก | `listWhtCredits` / `listWhtDeductions` | `wht.ts:62/140` | `/wht`, `/tax` |
| เช็ครับ/จ่าย รอเรียกเก็บ (ยอดรวม) | `chequeSummary` | `cheque.ts:65` | `/cheque` |
| สินทรัพย์: ต้นทุนรวม/NBV/ค่าเสื่อมงวดถัดไป | `listAssets` + `nextDepreciationAmount` | `asset.ts:138/286` | `/assets` |
| ยอดขาย POS ที่ไหลเข้า | `applyExternalSale` → `postExternalSale` | `index.ts:40`, `gl.ts:1217` | `modules/pos/account-bridge.ts` |

### D.2 ต้องเขียน query ใหม่ (ยังไม่มี)

1. **series รายเดือน 12 เดือน (รายรับ/รายจ่าย/กำไร) + YoY** — `sumByAccount` (`reports.ts:51`) groupBy แค่ `accountId` ภายใต้ `entry.periodKey` filter ก้อนเดียว · ต้องเพิ่ม groupBy `entry.periodKey` (มี index `[systemId, periodKey, book]` `account_gl.prisma:284` รองรับ)
2. **donut รายได้/ค่าใช้จ่ายเดือนนี้** — ข้อมูลอยู่ใน `profitLoss().income.rows` / `.expense.rows` แล้ว แต่ต้องมี component กราฟ (โมดูลนี้ไม่มีกราฟเลย)
3. **"จ่ายให้ใครมากที่สุด"** — groupBy `AccountDocument.contactId` where `direction=IN`, status ที่มีผล (index `[systemId, contactId, docType]` `account.prisma:160` รองรับ)
4. **"จ่ายค่าอะไรมากที่สุด"** — groupBy `AccountJournalLine.accountId` join `AccountLedger.type in (EXPENSE, COGS)` ในช่วงงวด (index `[systemId, accountId]` `account_gl.prisma:304` รองรับ)
5. **"เงินคุณอยู่ไหน" รวมยอดทุกบัญชี** — `financeBalances` คืน array แล้ว แค่ sum (แต่ต้องยกมาหน้าแรก)
6. **บัญชี/บัญชีเงิน "ที่ติดตาม"** — ต้องเพิ่ม flag ในโมเดล (ไม่มีอะไรรองรับตอนนี้)
7. **สรุป dashboard ฝั่งรายรับแบบกราฟ** (ชำระแล้ว/รอชำระ/พ้นกำหนด รายเดือน) — ต้อง groupBy `AccountDocument` ตาม `issueDate` + status
8. **นับเอกสารรอดำเนินการรวม** (รอตอบรับ / รออนุมัติ / รอหักมัดจำ / needsReview) — มีข้อมูลกระจาย (`payableStats` ให้ 2 ตัว, `needsReview` อยู่บน `AccountJournalEntry` `account_gl.prisma:271`) แต่ยังไม่มีฟังก์ชันรวม
9. **เงินเข้า/เงินออกจริงรายวัน (ปฏิทิน)** — `AccountDocumentPayment` มี `paidAt` + `amount` + `financeAccountId` และ index `[systemId, paidAt]` (`account.prisma:218`) แต่ไม่มีฟังก์ชัน groupBy รายวัน
10. **เงินคาดว่าจะเข้า/จะออก (forecast จาก dueDate)** — index `[systemId, docType, dueDate]` (`account.prisma:159`) รองรับ แต่ไม่มีฟังก์ชัน

### D.3 เช็กรายข้อตามที่ coordinator ถาม

| ความสามารถ | มีไหม | หลักฐาน / สิ่งที่ขาด |
|---|---|---|
| **Bank reconciliation (กระทบยอดธนาคาร)** | ❌ **ไม่มีเลย** | grep `reconcil`/`กระทบยอด` ทั้ง repo เจอแค่ 3 อย่างที่ไม่เกี่ยว: flag ตรวจสมดุลงบกระแสเงินสด (`reports.ts:349,453` `openingCash+netChange==closingCash`), banner เตือนไม่สมดุล (`reports/_shared.tsx:50`), และเครื่องมือนับเงินสดปิดวันของ POS (`pos/close/CloseDayTools.tsx:47`) · ไม่มีโมเดล bank statement, ไม่มีสถานะ reconciled ต่อรายการ, ไม่มีหน้าจับคู่ · ฐานที่ต่อยอดได้ = `financeStatement` (`finance.ts:232`) |
| **Petty cash / เงินสำรองจ่าย** | ✅ (บางส่วน) | `AccountFinanceType.PETTY_CASH` (`account_gl.prisma:21`), บัญชี GL 1030 (`coa.ts:30`), `pettyCashReplenish(TOPUP/REIMBURSE)` (`finance.ts:342`), UI `finance/page.tsx:156-187` · ❌ ไม่มีหน้าแยก, ❌ ไม่มี advance รายบุคคล/ผูกพนักงาน |
| **WHT แยก 2 ขา (ถูกหัก vs เราหัก)** | ✅ **ครบ** | `listWhtCredits` (ถูกหัก → บัญชี 1160) `wht.ts:62` · `listWhtDeductions` (เราหัก → 2130) `wht.ts:140` · แท็บใน UI `wht/page.tsx:66-70` · ออก 50 ทวิ `wht.ts:222` + พิมพ์ `wht/[certId]/print` · ภ.ง.ด.3/53 `wht.ts:317` + CSV `wht.ts:398/442` · ประเภทเงินได้ ม.40(1)-(8) `wht.ts:18` |
| **ผังบัญชี tree parent/child หลายระดับ + toggle เปิดใช้งาน** | 🟡 | โมเดลมี `parentId`/`children` self-relation (`account_gl.prisma:227-228`) และมี `archivedAt` + `isSystem` · ❌ **UI render แบน ไม่แสดง tree** (`accounts/page.tsx:102-134`) · ❌ ไม่มีระดับ "หลัก/รอง/ย่อย" เป็น field · ❌ ปิดใช้งานได้แต่กู้คืนไม่ได้ · ❌ ไม่มี `whtRateBp`/`vatType`/`description` ต่อบัญชี |
| **ตารางค่าเสื่อมสินทรัพย์ (depreciation schedule)** | 🟡 | `AccountFixedAsset` + `AccountDepreciation` unique `(assetId, periodKey)` (`account_gl.prisma:324/353`) · `runDepreciation` เส้นตรง idempotent ต่องวด + ปรับเศษเดือนสุดท้าย (`asset.ts:313`) · `nextDepreciationAmount` preview (`asset.ts:286`) · ลง GL อัตโนมัติ `postDepreciation` (`gl.ts:1025`) · ❌ **UI ไม่แสดงตารางค่าเสื่อมรายงวดต่อสินทรัพย์** — โชว์แค่ยอดสะสม/NBV/จำนวนเดือนที่คิดแล้ว (`assets/page.tsx:250-255`) ทั้งที่ข้อมูลรายงวดเก็บครบ |
| **Document inbox / attachment model** | 🟡 | `AccountAttachment` มี (`account_gl.prisma:369`) รองรับไฟล์ผูกเอกสาร + ไฟล์ลอย (`documentId=null`) + โฟลเดอร์ + ค้นชื่อไฟล์ · ❌ **ไม่มีแนวคิด inbox/สถานะ "ยังไม่ออกเอกสาร"** · ❌ ไม่มีช่อง "ประเภทเอกสารที่ตั้งใจ" · ❌ อัปโหลดไม่ได้ (รับ URL) · ❌ ไม่แสดงผู้อัปโหลด/ไม่ filter วันที่ |
| **ตั้งค่าต่อร้าน: เลขรันเอกสาร / โลโก้ / นโยบายบัญชี** | 🟡 | `AccountSettings` (`account.prisma:288`) + view (`service.ts:254`): prefix ต่อ docType ✅, autoTaxInvoice ✅, publicLink ✅, logo/stamp/signature ✅ (อัปโหลดจริงได้ผ่าน `ImageAssetField`), VAT ✅, taxPointBasis ✅, dueDays/validDays ✅, footerNote ✅ · ❌ pattern เลขรัน/รอบ reset เลือกไม่ได้ (ตายตัวใน `expense.ts:nextDocNo`; `SeqReset` `service.ts:618` ประกาศไว้แต่ไม่ใช้) · ❌ ไม่มี fiscal year (พารามิเตอร์มีที่ `reports.ts:267` แต่ไม่มีที่เก็บ) · ❌ ไม่มี WHT default · ❌ ไม่มี inventory costing |
| **ตั้งค่าสิทธิ์ผู้ใช้ของโมดูลบัญชี** | 🟡 | สิทธิ์ 30 action ครบและบังคับใช้จริง (`permissions.ts:432-461`, `access.ts:19`) · ❌ **ไม่มีหน้าตั้งค่าในโมดูล** — ต้องไป `/app/settings/staff` (ระดับ tenant) และไม่มีลิงก์จาก nav บัญชี (`nav.ts:69-72`) |
| **ตั้งค่าเชื่อมต่อภายนอก (bank feed / e-Tax / DBD)** | ❌ | bank feed ❌ ไม่มีร่องรอย · e-Tax: `AccountEtaxStatus` + `etaxStatus`/`etaxMeta` มีในตาราง (`account_gl.prisma:104`, `account.prisma:137-138`) แต่ **ไม่มีโค้ดอ่าน/เขียนเลย** · DBD ❌ ไม่มี · การเชื่อมภายใน (POS/CRM/BusinessUnit) มีจริงผ่าน `AccountSystemLink` (`account_gl.prisma:387`) แต่หน้าจัดการอยู่นอกโมดูล (`/app/settings/connections`) |

---

## E. สิ่งที่ SHARK มีแต่ PEAK (ตามภาพ) ไม่ได้โชว์ — ห้ามทำหาย

1. **รายงานอายุหนี้ (Aging) AR/AP 5 bucket** — `/aging` + `agingReport` (`reports.ts:702`) เปิดผ่าน facade ให้โมดูลอื่นใช้ได้ (`index.ts:163`)
2. **ปิดงวดบัญชีอัตโนมัติทั้งแพลตฟอร์ม** — `sweepAutoClosePeriods` (`period-sweep.ts:41`) ปิดงวดเดือนก่อนหน้าให้ทุกระบบ ACCOUNT + ส่ง `AppNotification` เมื่อสำเร็จ/ล้มเหลว (กันสแปม)
3. **Gate ปิดงวดที่ตรวจสุขภาพบัญชีจริง** — `closePeriod` (`gl.ts:1135`) บังคับ suspense 9999 เคลียร์ + ไม่มี `needsReview` ค้าง
4. **ทะเบียนเช็ครับ/เช็คจ่ายพร้อม lifecycle ครบ** — นำฝาก/เรียกเก็บได้/เด้ง(กลับรายการ+ตั้งลูกหนี้คืน)/ยกเลิก (`cheque.ts:247-420`) + บัญชี 1040/2300
5. **WHT ครบวงจร 2 ขา** — ออก 50 ทวิ อัตโนมัติตอนบันทึกจ่าย (`expense-ui.tsx:352-362`), พิมพ์ฟอร์มราชการ (`wht/[certId]/print`), ภ.ง.ด.3/53 + CSV, เครดิตภาษีถูกหักสะสมทั้งปี (บัญชี 1160)
6. **VAT ซื้อ 3 โหมด** CLAIM / AWAITING (พักที่ 1155 + สร้าง PTX รอรับ) / NO_CLAIM (`expense.ts:100-108`) — ตรงกฎสรรพากรไทย
7. **จุดรับรู้ภาษีขาย ON_ISSUE vs ON_PAYMENT** (สินค้า vs บริการ) พร้อมบัญชี 2210/2205 (`account_gl.prisma:7-10`, `coa.ts:52-53`)
8. **ลิงก์/QR สาธารณะให้ลูกค้าขอใบกำกับภาษีเอง** — `publicToken` + `/(store)/r/[token]` (`service.ts:1589-1757`)
9. **เงินไหลเข้าจากระบบอื่นในเครือ SHARK อัตโนมัติ** ผ่าน facade เดียว (`src/lib/modules/account/index.ts`):
   - POS: `applyExternalSale` / `reverseExternalSale` (แยกช่องทาง CASH/TRANSFER/PROMPTPAY/**DEPOSIT**/**ROOM_CHARGE** → 2110/1100 สำหรับโรงแรม) (`index.ts:40-112`)
   - CRM: `createExternalQuotation` (Deal → ใบเสนอราคา, idempotent) (`index.ts:119`)
   - HR/Payroll: `postPayrollJV` + `reverseEntry` (`gl.ts:1283`)
   - Inventory: `postInventoryGl` (perpetual inventory, idempotent ต่อ movementId) (`gl.ts:930`)
   - `AccountSystemLink` kind POS / BUSINESS / CRM (`account_gl.prisma:387`)
10. **AI ผู้ช่วยบันทึกค่าใช้จ่าย** — `createExpenseDoc` facade เรียกจาก `src/lib/ai/proposals.ts:615` (สร้างเป็น DRAFT ให้คนตรวจก่อน)
11. **Immutable ledger + reversal** — `reverseEntry`/`reverseFor` (`gl.ts:718/793`), `idempotencyKey` unique ต่อ tenant, entry ไม่เคยถูกลบ
12. **ธง `needsReview` + บัญชีพัก 9999** เมื่อ resolve mapping ไม่ได้ (`gl.ts:88`) — แสดง ⚑ ในสมุดรายวัน (`journal/page.tsx:118-121`)
13. **Audit trail ทั้งแพลตฟอร์มพร้อมป้ายไทย** — `writeAudit` + `auditActionLabelTh` (`access.ts:24/170`) ใช้ที่ `/app/audit`
14. **ค่าเสื่อมราคาอัตโนมัติ + จำหน่าย/ตัดบัญชีลง GL** พร้อมกำไร/ขาดทุนจากการจำหน่าย (`asset.ts:313/444`, บัญชี 4900)
15. **ผังบัญชี SME ไทย seed + mapping key แก้ได้เอง** (41 บัญชี / 28 key, `coa.ts`) + รองรับ override ต่อ docType (`DOC:{docType}`)
16. **เอกสารพิมพ์ตามกฎหมายไทย** — ม.86/4 (ต้นฉบับ/สำเนา), ม.86/10 (CN/DN อ้างใบเดิม+เหตุผล), 50 ทวิ ฟอร์มราชการ
17. **ตราประทับ/ลายเซ็นบนเอกสารพิมพ์** พร้อมปุ่มลบพื้นหลัง (`settings/page.tsx:138-167`)
18. **สถิติสินทรัพย์แบบ preview ค่าเสื่อมงวดนี้ก่อนกดรัน** (`assets/page.tsx:69-83`)

---

## F. ข้อจำกัดจาก `docs/UI_STANDARD.md` ที่มีผลกับ redesign (≤15 ข้อ)

1. **สีมาจาก token เท่านั้น** — ใช้ได้แค่ `--color-ink`, `--color-ink-soft`, `--color-muted`, `--color-line`, `--color-surface`, `--color-surface-2`, `--color-danger`, `--color-accent` · ห้าม `bg-blue-*`/hex ดิบ · **token ผี `--color-fg`/`--color-bg`/`--color-success`/`--color-primary` ไม่มีจริง** (`UI_STANDARD.md:11`) — ⚠️ ปัจจุบัน `aging/page.tsx:31` ยังใช้ `--color-fg`/`--color-bg` อยู่ (บั๊กค้าง)
2. **ไม่มีสีเขียว/แดงเชิงบวก-ลบ** — "สำเร็จ" = ink ตัวหนา · `--color-danger` ใช้เฉพาะ error/สถานะเสีย/ปุ่มทำลาย → **กราฟ donut/bar ของ PEAK ต้องออกแบบเป็นเฉดเทา-ดำ ไม่ใช่จานสี**
3. **ปุ่ม = `.btn .btn-primary` / `.btn .btn-ghost` / `.btn-sm` เท่านั้น** ห้ามประกอบเอง, ห้าม `.btn` เดี่ยว (`UI_STANDARD.md:12`)
4. **ข้อความที่ user เห็นต้องเป็นไทย** ผ่าน label map + `<StatusChip>` — ห้ามโชว์ enum ดิบ · ห้าม jargon "bp/satang/void/token" (`UI_STANDARD.md:13, §3.2`)
5. **เงินผ่าน `<MoneyText>`/`formatBaht()` เท่านั้น** — `฿x,xxx` ทั่วไป / `฿x,xxx.xx` ในเอกสารบัญชี+รายงาน · ห้ามประกาศ `const baht` ซ้ำ (⚠️ ยังซ้ำอยู่ที่ `service.ts:133` และ `product.ts:25`)
6. **max-width ต่อชนิดหน้า**: hub=ไม่จำกัด · list+filter=`max-w-3xl` · detail=`max-w-3xl` · ฟอร์ม/ตั้งค่า=`max-w-2xl` · รายงาน/ตาราง=`max-w-4xl`+`overflow-x-auto` (`UI_STANDARD.md §1.1`)
7. **Spacing scale ตายตัว**: section ใหญ่ `gap-6` · ในการ์ด `gap-3/4` · แถวรายการ `gap-2` · แถว `px-3 py-2` ขั้นต่ำ (touch target)
8. **1 หน้า = 1 `<h1>` ผ่าน `<PageHeader>`** · section = `<h2 text-sm font-medium>` ผ่าน `<Section>` · ทุกหน้าลึกกว่า hub ต้องมี back-link
9. **หน้าเดียว = งานเดียว** — list ห้ามยัดฟอร์มสร้าง + ตาราง + รายงานพร้อมกัน เกิน 3 section ใหญ่ให้แตกหน้า (⚠️ `/docs/[docType]`, `/contacts`, `/products`, `/finance`, `/cheque`, `/assets`, `/goods-issue` ปัจจุบันละเมิดข้อนี้ — list + ฟอร์มสร้างอยู่หน้าเดียว)
10. **Mobile-first**: grid เริ่ม `grid-cols-1/2` แล้วขยาย `sm:` · ห้าม `grid-cols-4` เปล่า · `<table>` ต้องห่อ `overflow-x-auto` + `min-w-[…]` หรือใช้ `<DataList>` แทน · ห้าม fixed width > ~320px · ต้องไม่มี scroll แนวนอนที่ 360px
11. **ห้ามเขียน `<table>` เองนอก `DataTable`** (ยกเว้นหน้า print) — ⚠️ `/aging` และ `/reports/*` ใช้ `TableWrap` + `<table>` ดิบอยู่ (`reports/_shared.tsx:65`)
12. **ทุก action ทำลายข้อมูล (ลบ/ยกเลิก/void/ปิดงวด) ต้องผ่าน `<ConfirmDialog>`** · ทุกปุ่ม submit ต้องมี pending state (`SubmitButton` + `useFormStatus`)
13. **ทุก list ต้องมี `empty` (EmptyState) ที่บอก "ทำไมว่าง + ก้าวถัดไป"** · ทุก input ต้องมี `FormField` label (เลิก placeholder-only) · ฟอร์ม > 6 field ต้องแบ่งกลุ่ม
14. **โครง nav บัญชี 8 หมวดถูกล็อกไว้ใน `docs/UI_STANDARD.md §4`** และ `nav.ts` เป็นแหล่งเดียว — drawer มือถือแปลงจากตัวเดียวกันผ่าน `accountNavChildren` (`nav.ts:84`, ใช้ที่ `src/app/app/layout.tsx:115`) · **ถ้าเปลี่ยนเมนู ต้องแก้ `nav.ts` ที่เดียว + อัปเดต §4 ให้ตรง** (มีบทเรียนเขียนกำกับไว้ `nav.ts:79-82` ว่าเคยพิมพ์เมนูมือแล้วเพี้ยน)
15. **พฤติกรรม `SubNav`**: desktop = sidebar ~200px, active = `bg-surface-2 font-medium` · mobile = accordion ในหน้า hub + back-bar **ห้าม hamburger ซ้อน hamburger** (`UI_STANDARD.md §2.9`) · หน้า hub ตามสเปค = การ์ดสรุป 4 ใบ + ปุ่มหลัก 1-2 + การ์ดหมวด 8 ใบ + เอกสารล่าสุด 8 รายการ — ⚠️ `ui.tsx:102-121` ตัดการ์ดหมวด 8 ใบออกไปแล้ว เหลือ "ใช้บ่อย" 4 ทางลัด ตามคำสั่งเจ้าของ 27 ส.ค.

---

## G. ข้อสังเกตเพิ่มเติมที่ควรใช้ตอนวางแผน

- `/docs/[docType]` โหลด `take: 500` แล้ว filter/sort ฝั่ง UI (`docs/[docType]/page.tsx:99,107-110`) — ถ้าจะทำ list แบบ PEAK (ค้นหา + pagination + filter หลายชั้น) ต้องย้าย logic ลง `listDocuments` (`service.ts:681`)
- ฝั่งรายจ่ายมี `contact` ใน include (`expense.ts:230`) แต่ list ไม่ได้แสดงชื่อคู่ค้า (`expense-ui.tsx:73-87`) — ฝั่งรายรับไม่ include เลย
- `AccountCategory.appliesTo` (กลุ่มจัดประเภทเอกสาร) จัดการได้ที่ `/products?tab=categories` แต่ **ไม่มีที่ไหนให้เลือก category ตอนสร้างเอกสาร** — `DocEditor`/`ExpenseEditor` ไม่ส่ง `categoryId`
- `AccountDocumentLine.productId` มีในตารางและ index (`account.prisma:189`) แต่ **`DocEditor` และ `ExpenseEditor` ไม่มี product picker** (`DocEditor.tsx:8` Row type ไม่มี productId) — ใช้จริงเฉพาะเส้น goods movement · แปลว่า "ขายสินค้าแล้วตัดสต็อก" ยังไม่เชื่อมกัน
- `unitName` บนบรรทัดเป็นสตริงพิมพ์เอง ไม่ผูก `AccountUnit` — ทะเบียนหน่วยจึงยังไม่มีผลต่อเอกสาร
- ทั้ง `/contacts` และ `/products` ไม่มี pagination — ร้านที่มีลูกค้าหลักพันจะโหลดทั้งหมด
