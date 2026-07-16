# Payroll ไทย + ภาษีขาย/ซื้อยื่นจริง (DESIGN — สำหรับ WO-0036 + WO-0035)

> ความลึกไทย-first — จุดขายที่ global player แพ้ (อ้าง `docs/sds/01_VISION.md` ยุทธศาสตร์ 2) · ต่อยอด HR (`prisma/schema/hr.prisma`) + บัญชี (`prisma/schema/account.prisma`, `prisma/schema/account_gl.prisma`) · path อนาคตเขียนธรรมดา

> **หมายเหตุเส้นเงินสำคัญ (อ่านก่อน):** เส้น `PosSale → outbox → account-bridge` คือเส้น **รายรับ (ขาย)** เท่านั้น. Payroll = **รายจ่าย** → ต้องลงบัญชีผ่าน **เส้นบัญชีฝั่งจ่ายที่มีอยู่** (AccountDocument EXPENSE / AccountJournalEntry ผ่าน account facade) **ไม่ใช่** PosSale. ภาษี (ภ.พ.30/ภงด.) = **รายงานอ่านจากข้อมูลที่มี** (VAT บน AccountDocument, WHT บน AccountDocumentPayment) — ไม่สร้างเส้นเงินใหม่.

---

# ส่วน A — Payroll ไทย (WO-0036)

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- คำนวณเงินเดือนต่อรอบ · หักประกันสังคม (ปสส.) 5% เพดาน · หักภาษี ณ ที่จ่าย (ภงด.1) · payslip · ลงบัญชีเป็นค่าใช้จ่าย
- ผู้ใช้: OWNER/HR ของ SME ไทยที่มีลูกจ้างประจำ
- เหตุผล: อ้าง `docs/sds/01_VISION.md` — payroll+ปสส. คือเกณฑ์ "สมบูรณ์ระดับโลก" ที่ไทย-first ชนะ · ต่อยอด HR module (`HrEmployee` มีอยู่แล้ว)

## Data model เสนอ (โมดูล hr ต่อยอด — axis = **system**, ผูก AppSystem type `HR`)
ทุกตารางผูก `tenantId` + `systemId` + `@@unique([systemId, ...])` ตาม convention `docs/sds/06_DATABASE.md`. เงิน = สตางค์ Int.

- `HrSalaryProfile` (axis: system, 1/employee) — ข้อมูลค่าจ้างต่อพนักงาน
  - `id` · `tenantId` · `systemId` · `employeeId` @unique(ต่อระบบ)
  - `payType` enum (`MONTHLY | DAILY | HOURLY`) · `baseSalarySatang` Int · `allowancesJson` Json (`[{name, amountSatang, taxable, ssoBase}]`)
  - `ssoEligible` Boolean @default(true) · `taxId` String? (เลขผู้เสียภาษี 13 หลัก) · `cumulativeStartMonth` Int
  - `personalDeductionJson` Json (ลดหย่อน: คู่สมรส/บุตร/บิดามารดา/ประกัน — สำหรับคำนวณ ภงด.1)
  - `@@unique([systemId, employeeId])`
- `HrPayrollRun` (axis: system) — รอบจ่าย 1 งวด
  - `id` · `tenantId` · `systemId` · `periodKey` (`"2026-07"`) · `payDate` DateTime
  - `status` enum (`DRAFT | APPROVED | PAID | CLOSED`) · `note` String?
  - `totalGrossSatang` · `totalSsoEmployeeSatang` · `totalSsoEmployerSatang` · `totalWhtSatang` · `totalNetSatang` Int
  - `journalEntryId` String? (AccountJournalEntry ที่ลงบัญชี) · `idempotencyKey`
  - `@@unique([systemId, periodKey])` · `@@unique([tenantId, idempotencyKey])`
- `HrPayrollItem` (axis: system) — บรรทัดต่อพนักงานต่อรอบ (append-only หลัง APPROVED)
  - `id` · `tenantId` · `systemId` · `runId` · `employeeId`
  - `grossSatang` · `taxableSatang` · `ssoBaseSatang` Int
  - `ssoEmployeeSatang` · `ssoEmployerSatang` · `whtSatang` (ภงด.1 หัก) · `otherDeductSatang` · `netSatang` Int
  - `snapshotJson` Json (freeze สูตร/ลดหย่อน ณ วันคำนวณ) · `@@unique([runId, employeeId])`

## สูตรคำนวณ (deterministic — ต้องตรงกฎหมายไทย · ทดสอบด้วย oracle)

### 1) ประกันสังคม (ปสส. — สปส.1-10)
- ฐานคำนวณ = `clamp(ค่าจ้างที่คิดปสส., 1,650, 15,000)` บาท/เดือน (เพดานปี 2567)
- เงินสมทบลูกจ้าง = `round(ฐาน × 5%)` → ต่ำสุด 83 / สูงสุด 750 บาท/เดือน
- เงินสมทบนายจ้าง = เท่ากัน (5%) → สูงสุด 750
- นำส่งประกันสังคม = ลูกจ้าง + นายจ้าง (สปส.1-10 ยื่นภายในวันที่ 15 ของเดือนถัดไป)
- 🔑 อัตรา/เพดานเป็น config (`SsoSettings`) เพราะรัฐปรับเป็นครั้งคราว (เคยลด 1%/3% ช่วงโควิด)

### 2) ภาษีหัก ณ ที่จ่าย เงินเดือน (ภ.ง.ด.1 — มาตรา 40(1))
วิธี "ทำให้เต็มปี" (annualization) ตามสรรพากร:
1. เงินได้ทั้งปี (ประมาณ) = เงินเดือนต่อเดือน × 12 (+ที่จ่ายแล้วสะสม/ปรับกลางปี)
2. หักค่าใช้จ่าย = 50% ของเงินได้ 40(1)(2) **แต่ไม่เกิน 100,000 บาท**
3. หักค่าลดหย่อน: ส่วนตัว 60,000 · คู่สมรสไม่มีเงินได้ 60,000 · บุตร 30,000/คน · ปสส.ที่จ่ายจริง (≤9,000) · เบี้ยประกัน ฯลฯ (จาก `personalDeductionJson`)
4. เงินได้สุทธิ → คำนวณภาษีตาม **ขั้นบันไดเงินได้บุคคลธรรมดา** (ตาราง below)
5. ภาษีทั้งปี ÷ 12 = ภาษีหักต่อเดือน (ปัดเศษตามวิธีสรรพากร)

**ขั้นบันไดภาษีเงินได้บุคคลธรรมดา (เงินได้สุทธิ/ปี):**
| ช่วง (บาท) | อัตรา |
|---|---|
| 0 – 150,000 | ยกเว้น |
| 150,001 – 300,000 | 5% |
| 300,001 – 500,000 | 10% |
| 500,001 – 750,000 | 15% |
| 750,001 – 1,000,000 | 20% |
| 1,000,001 – 2,000,000 | 25% |
| 2,000,001 – 5,000,000 | 30% |
| > 5,000,000 | 35% |

- ภงด.1 ยื่นภายในวันที่ 7 (กระดาษ) / 15 (e-filing) ของเดือนถัดไป · **ภงด.1ก** = สรุปทั้งปี (ยื่น ก.พ. ปีถัดไป)
- 🔑 ขั้นบันได+ลดหย่อนเป็น config version ต่อปีภาษี (`TaxYearConfig`) เพราะเปลี่ยนตามกฎหมาย

### 3) เงินสุทธิ
`netSatang = grossSatang − ssoEmployeeSatang − whtSatang − otherDeductSatang`

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/hr/payroll.ts)
- `createPayrollRun(ctx, periodKey)` — DRAFT + สร้าง HrPayrollItem ต่อ active employee (คำนวณ ปสส./ภงด.1/net จาก HrSalaryProfile) — deterministic
- `recalcItem(ctx, runId, employeeId, overrides)` — ปรับ OT/allowance/หักเพิ่ม → คำนวณใหม่
- `approveRun(m, ctx, runId)` — DRAFT → APPROVED (freeze snapshot) · optional เข้า Approval (0049) ถ้าเกินวงเงิน
- `postToAccount(ctx, runId)` — **สร้าง AccountJournalEntry ผ่าน account facade** (Dr เงินเดือน/สวัสดิการ · Cr เงินสด-ธนาคาร (net) · Cr เจ้าหนี้ปสส. · Cr ภาษีหัก ณ ที่จ่ายค้างนำส่ง) · idempotencyKey `payroll-<runId>` → APPROVED→PAID
- `payslip(ctx, runId, employeeId)` — PDF-lite
- **Edge cases:** พนักงานเข้ากลางเดือน (prorate วัน) · ปสส.ต่ำกว่าฐานขั้นต่ำ (min 83) · เงินเดือน < 150k/ปี (ภาษี 0) · แก้หลัง APPROVED → reversal (append-only) · จ่ายซ้ำ (idempotencyKey กัน journal ซ้ำ)

## การเชื่อมต่อ (Payroll)
- **บัญชี (เส้นจ่าย):** postToAccount → AccountJournalEntry ผ่าน **facade `src/lib/modules/account`** (แบบเดียวกับ `src/lib/modules/pos/account-bridge.ts` ที่เรียก facade) — **ไม่แตะ AccountJournalEntry ตรง, ไม่ใช้ PosSale**
- **HR:** ต่อ HrEmployee/HrAttendance เดิม (คิด OT จากลงเวลา optional)
- **Outbox ใหม่:** `hr.payroll.approved` · `hr.payroll.posted` (ให้แจ้งเตือน/Automation เกาะ)
- **Approval (0049):** งวดเกินวงเงิน → submitForApproval ก่อน post

## AI actions (Payroll)
- **read:** `payroll_summary` (ยอดรวมงวดล่าสุด) · `payroll_unposted` (งวดที่ยังไม่ลงบัญชี)
- **action:** `payroll_run` → ProposalKind `payroll_run` → dispatch `payroll.createPayrollRun` (เดินเส้น proposal เดิม `src/lib/ai/proposals.ts`, assertCan `hr.payroll.run`) — **AI ไม่ post บัญชีเอง** (คนยืนยันก่อนลงเงิน)

## Permissions เสนอ (Payroll)
- `hr.salary.manage` · `hr.payroll.run` · `hr.payroll.approve` · `hr.payroll.post` · `hr.payslip.view`

---

# ส่วน B — ภาษีขาย/ซื้อยื่นจริง (WO-0035)

## เป้าหมาย
- รายงาน **ภ.พ.30** (VAT) export ไฟล์ยื่น + **ภ.ง.ด.3/53** (WHT นิติ/บุคคล) + **ภ.ง.ด.1** (จาก payroll) + ใบ/หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ — มี AccountDocType `WHT_CERT` แล้วใน `prisma/schema/account.prisma`)
- ต่อยอด reports บัญชีที่มี · **oracle เทียบตัวเลขกับ qc:account** (อ้าง `docs/sds/10_MASTER_QUEUE.md`)

## Data model เสนอ (โมดูล account ต่อยอด — axis = **system** ACCOUNT)
รายงานส่วนใหญ่ **อ่านสด** จากข้อมูลที่มี (ไม่เก็บซ้ำ). เพิ่มเฉพาะตาราง **ล็อกงวดยื่น** (audit + กันแก้ย้อนหลังหลังยื่น):

- `TaxFiling` (axis: system) — บันทึกการยื่น 1 แบบ/1 งวด
  - `id` · `tenantId` · `systemId` · `formType` enum (`PP30 | PND1 | PND3 | PND53 | SSO_1_10 | PND1_KOR`)
  - `periodKey` (`"2026-07"`) · `status` (`DRAFT | FILED | AMENDED`) · `filedAt` DateTime? · `filedById`
  - `summaryJson` Json (ยอดที่ยื่น — freeze snapshot) · `fileUrl` String? (ไฟล์ที่ export)
  - `@@unique([systemId, formType, periodKey])`

### โครงสร้างข้อมูล + สูตร ภ.พ.30 (แบบแสดงรายการภาษีมูลค่าเพิ่ม)
อ่านจาก `AccountDocument` (มี `vatAmount`, `subTotal`, `vatRateBp`, `docType`, `direction`, `vatTiming`) + `AccountDocumentPayment` (จุดรับรู้ภาษีบริการ ON_PAYMENT):
- **ภาษีขาย (output):** Σ `vatAmount` ของเอกสารขายที่ถึงจุดรับรู้ในงวด (TAX_INVOICE/TAX_INVOICE_ABB/RECEIPT ที่มี VAT · สินค้า=ON_ISSUE, บริการ=ON_PAYMENT ตาม `vatTiming`/`taxPointBasis`)
- **ยอดขายรวม:** แยก (1) ขายที่ต้องเสีย 7% (2) อัตรา 0% (3) ยกเว้น (`vatRateBp` = 700/0/-1)
- **ภาษีซื้อ (input):** Σ `vatAmount` ของ `PURCHASE_TAX_INVOICE` (direction IN) ที่ RECEIVED ในงวด
- **ภาษีสุทธิ:** `output − input` → ถ้า > 0 = ต้องชำระ · < 0 = ภาษีซื้อยกไป/ขอคืน
- ยื่นภายในวันที่ 15 ของเดือนถัดไป · export: รายงานภาษีขาย + รายงานภาษีซื้อ + สรุป ภ.พ.30 (xlsx/รูปแบบไฟล์ยื่น)

### โครงสร้าง ภ.ง.ด.3 / 53 (WHT)
อ่านจาก `AccountDocumentPayment.whtAmountSatang` + `whtRateBp` + `whtCertDocId` (WHT_CERT ที่ออก) + `AccountContact.legalType`:
- **ภ.ง.ด.3** = ผู้ถูกหักเป็น **บุคคลธรรมดา** (`legalType = PERSON`)
- **ภ.ง.ด.53** = ผู้ถูกหักเป็น **นิติบุคคล** (`legalType = COMPANY`)
- แยกตามประเภทเงินได้ (`AccountWhtIncomeType` M40_1..M40_8 มีใน `prisma/schema/account_gl.prisma`) + อัตรา:
  - ค่าบริการ/รับจ้างทำของ 3% · วิชาชีพอิสระ 3% · ค่าเช่า 5% · ค่าโฆษณา 2% · ค่าขนส่ง 1% · ดอกเบี้ย/เงินปันผลตามชนิด
- export: ใบแนบ ภ.ง.ด. (รายผู้ถูกหัก) + ยอดรวมนำส่ง · ยื่นภายในวันที่ 7/15 ของเดือนถัดไป

### ภ.ง.ด.1 = จาก Payroll (ส่วน A)
รวม `HrPayrollItem.whtSatang` ต่องวด → ใบแนบ ภงด.1 (รายพนักงาน) · ภงด.1ก สรุปทั้งปี

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/account/tax.ts)
- `buildPP30(ctx, periodKey)` — คำนวณสด → คืนโครง ภ.พ.30 + รายการภาษีขาย/ซื้อ
- `buildPND(ctx, formType, periodKey)` — รวม WHT ตาม legalType/incomeType
- `buildPND1(ctx, periodKey)` — จาก payroll
- `exportFiling(ctx, filing)` — สร้างไฟล์ (xlsx/txt รูปแบบ RD) + สร้าง/อัปเดต TaxFiling (FILED = ล็อก snapshot)
- `amendFiling(ctx, filingId)` — ยื่นเพิ่มเติม (AMENDED, เก็บประวัติ)
- **Edge cases:** เอกสารแก้/void หลังยื่นแล้ว → เตือน + ต้อง amend · จุดรับรู้ภาษีบริการ (ON_PAYMENT) ต้องนับตอนรับเงินไม่ใช่ตอนออกเอกสาร · เดือนไม่มีรายการ → ยื่นเปล่า (ยังต้องยื่น) · ปัดเศษสตางค์→บาทตามวิธี RD

## การเชื่อมต่อ (Tax)
- **ไม่มีเส้นเงินใหม่** — รายงานอ่านจาก AccountDocument/Payment/HrPayrollItem ที่มี (read aggregation)
- **qc:account:** ตัวเลข ภ.พ.30 output/input ต้อง reconcile กับ GL ภาษีขาย/ซื้อ (บัญชี 2100/1150) — oracle เทียบ (อ้าง `docs/sds/04_CORE_PLATFORM.md` qc:account 107 ข้อ)
- **WHT_CERT:** ใบ 50 ทวิ ออกผ่าน AccountDocument เดิม (docType WHT_CERT) — tax report รวมยอด

## AI actions (Tax)
- **read:** `tax_pp30_preview` (ภาษีต้องชำระงวดนี้) · `tax_wht_due` (WHT ต้องนำส่ง) — read-only, ช่วยเจ้าของรู้ยอดก่อนยื่น
- **action:** ไม่มี auto-file (การยื่นภาษี = ความรับผิดทางกฎหมาย → คนกด export/ยื่นเองเสมอ) — สอดคล้อง "User ตัดสินใจเสมอ"

## Permissions เสนอ (Tax)
- `account.tax.view` · `account.tax.file` (export/ล็อกงวด — จำกัด OWNER/ผู้ทำบัญชี)

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้าภาษี** (ต่อ nav บัญชี `การเงิน > ภาษี (ภ.พ.30 / ภ.ง.ด.)` ที่มีใน `docs/UI_STANDARD.md` §4) — เลือกงวด → สรุปยอด (`DataTable`, `MoneyText decimals`) → ปุ่ม export
- **หน้า payroll** — รายการงวด (`DataList` + `StatusChip`) → หน้างวด: ตารางพนักงาน (gross/ปสส./ภาษี/สุทธิ) → อนุมัติ+ลงบัญชีผ่าน `ConfirmDialog`
- อัตราภาษีแสดงเป็น **%** ไม่ใช่ bp (มาตรฐานภาษา) · payslip โทน ink ล้วน

## ข้อสอบ oracle ที่ต้องมี
**Payroll:**
1. ปสส.: เงินเดือน 20,000 → ฐาน clamp 15,000 → ลูกจ้าง 750, นายจ้าง 750
2. ปสส.: เงินเดือน 1,000 → ฐาน min 1,650 → 83 (ขั้นต่ำ)
3. ภงด.1: เงินเดือน 30,000/เดือน → คำนวณ annualize → หักค่าใช้จ่าย 50% cap 100k → ลดหย่อน 60k+ปสส. → ภาษี/เดือนถูกต้องตามขั้นบันได
4. เงินเดือนต่ำ (เงินได้สุทธิ < 150k) → ภาษี 0
5. netSatang = gross − ปสส. − ภาษี − หักอื่น (ตรงเป๊ะ)
6. postToAccount → AccountJournalEntry สมดุล (Dr=Cr), idempotencyKey กันซ้ำ, **ไม่มี PosSale**
7. คำนวณ deterministic: input เดิม → ผลเดิม (รันซ้ำเท่ากัน)
8. พนักงานเข้ากลางเดือน → prorate ถูก
9. cross-tenant/system: payroll run/item ไม่รั่ว
10. แก้หลัง APPROVED → reversal append-only (ไม่ทับ)

**Tax:**
11. ภ.พ.30: output − input = ภาษีสุทธิ ตรงกับ Σ vatAmount ในงวด (เทียบ qc:account)
12. ภ.พ.30 แยกยอดขาย 7% / 0% / ยกเว้น ถูกตาม vatRateBp
13. ภาษีบริการ ON_PAYMENT: นับตอนรับเงิน ไม่ใช่ตอนออกใบแจ้งหนี้
14. ภ.ง.ด.3 vs 53 แยกตาม legalType (PERSON/COMPANY) ถูก
15. WHT อัตราตามประเภท (บริการ 3% / เช่า 5% / ขนส่ง 1%) รวมยอดนำส่งถูก
16. ภ.ง.ด.1 รวม whtSatang จาก payroll ตรงกับงวด
17. FILED แล้ว snapshot ล็อก — แก้เอกสารย้อนหลังต้อง AMENDED (เตือน)
18. เดือนไม่มีรายการ → ยื่นเปล่าได้ (ยอด 0)
19. cross-tenant: TaxFiling ไม่รั่ว

## ความเสี่ยง / คำถามเปิด
- 🔑 **อัตรา/เพดาน/ขั้นบันได/ลดหย่อน เป็น config version ต่อปีภาษี** (`TaxYearConfig`, `SsoSettings`) — ต้องมีคนดูแลอัปเดตเมื่อกฎหมายเปลี่ยน (เจ้าของ/ผู้เชี่ยวชาญบัญชียืนยันตัวเลขปีปัจจุบัน)
- 🔑 **รูปแบบไฟล์ยื่นจริง (RD e-filing / ประกันสังคม e-service)** — โครงไฟล์ txt/xml เฉพาะของสรรพากร/สปส. ต้องยืนยันสเปคไฟล์ล่าสุด (อาจต้องทดสอบอัปโหลดจริง = งานเจ้าของ)
- 🔑 การรับรู้ภาษีขายบริการ (ON_PAYMENT) กับ deposit/มัดจำ ยังพันกับ WO บัญชีมัดจำ (0040) — ต้อง sync ลำดับ
- ปัดเศษ (สตางค์→บาท) ต้องตรงวิธี RD ทุกแบบ — กำหนดกฎ rounding กลาง
- ต้องทำ WO-0035 (tax) ก่อน/คู่ WO-0036 (payroll ป้อน ภงด.1) ตาม dependency ใน `docs/sds/10_MASTER_QUEUE.md`
