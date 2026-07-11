# QC5 — คำตัดสินระบบบัญชี (RESOLUTIONS) — FINAL

> ที่มา: QC5-account-{tax,ledger,pipeline}.md (10 CRITICAL · 36 MAJOR · 34 MINOR)
> ตัดสินโดย Fable 5 (2026-07-11) — **มีผลเหนือ 12-account.md และ code P1 ทุกจุดที่ขัด**
> ผู้ execute: session Opus 4.8 — แก้สเปคก่อน แล้วแก้ code ตาม Gate

## ผลตรวจที่ยืนยันความแข็งแรง (คงไว้ ห้าม regress)
เลขตัวอย่างถูกทุกตัว (F2 มัดจำ/F5 WHT/F8 ค่าเสื่อม) · สถาปัตยกรรม Document เดียว + journal immutable + งบ derive จาก JournalLine = ถูกทาง · เมนูเจ้าของครบทุกแถว · ผัง seed ครบ · schema P1 ต่อเติมได้ additive

---

## Gate A — ต้องปิดก่อนให้ผู้ใช้ออกเอกสารจริง (ผิดกฎหมาย/ข้อมูลเสียถาวร)

**A1. Tax point ใบกำกับภาษี (tax-C1,C2)** — ใบกำกับต้องออกตามจุดที่กฎหมายกำหนด ไม่ใช่ตามใบเสร็จเสมอ:
- เพิ่ม `taxPointBasis` ต่อธุรกิจ/รายการ: **GOODS = ออกตอนส่งมอบ (พร้อมใบแจ้งหนี้/ส่งของ)** · **SERVICE = ออกตอนรับเงิน (ต่อยอดที่รับจริง)**
- **Data model แก้: TAX_INVOICE อ้างได้ทั้ง document และ payment** (1 ใบแจ้งหนี้บริการรับหลายงวด → ใบกำกับต่องวด) — ยกเลิกกติกา "1 ต้นทาง = 1 ใบกำกับ" เปลี่ยนเป็น "1 payment = 1 ใบกำกับ (บริการ) / 1 delivery = 1 ใบกำกับ (สินค้า)"
- default `autoTaxInvoice` ตั้งตามประเภทธุรกิจตอน setup (ร้านบริการ=WITH_RECEIPT ยังถูก, ขายสินค้า=WITH_INVOICE)

**A2. เดือนภาษี = แหล่งเดียว (tax-C3)** — `Cr 2200 (VAT ขาย)` โพสต์**พร้อมการออกใบกำกับ** (ไม่ใช่ตอน IV issue) → GL กับรายงาน ภ.พ.30 (นับจากวันที่ใบกำกับ) reconcile ตรงกันเสมอ · IV ที่ยังไม่ออกใบกำกับ พัก VAT ใน 2205 (VAT รอออกใบกำกับ — เพิ่มบัญชี)

**A3. VAT-registered gate (tax-C4) + ภาษีซื้อต้องห้าม (tax-M9)** — `vatRegistered=false` → ปุ่ม/พาธออกใบกำกับปิดทั้งหมด + เอกสารไม่มีบรรทัด VAT · ภาษีซื้อจาก ABB/ค่ารับรอง/รถนั่ง → default ไม่เคลม (Dr เข้าเป็นต้นทุน) + เตือน

**A4. Posting rules ชี้ขาด 2 จุดที่ Dr≠Cr ได้ (ledger-C1,C2)**:
- ส่วนลด: **default = net** (Cr รายได้หลังหักส่วนลด, ไม่ใช้ 4800) · ถ้าเปิด option 4800 → **Cr รายได้ = gross + Dr 4800 คู่กันเสมอ** (เขียนเป็นสูตรเดียว ห้ามเลือกครึ่งทาง)
- มัดจำหักในใบแจ้งหนี้: นิยาม field ชัด — `depositDeducted` = **gross (รวม VAT)**, สูตรตอน issue: `Cr 2200 = vatAmount(เต็มใบ) − VAT ส่วนมัดจำที่หัก` + `Dr 2110 = ฐานมัดจำ` + `Dr 2200 กลับ = VAT มัดจำ` (ตามตัวอย่าง F2 ที่ถูกอยู่แล้ว — ยก F2 ขึ้นเป็น normative rule)

**A5. Implementation P1 (pipeline-C1,C4):**
- **สร้าง posting engine ทันที** ตามสเปค §1.4 (โพสต์เงียบตั้งแต่ P1 — UI งบยังไม่ต้องมี) + `DocumentPayment.financeAccountId` (FinanceAccount ตารางย้ายเข้า P1 — ledger-M13) + backfill เอกสารที่ออกไปแล้วใน staging
- **ใส่ `can()` ทุก action + AuditLog** จุดแตะเงิน (issue/void/payment/settings)
- **docType ที่ flow ยังไม่ครบ (มัดจำ/วางบิล/CN/DN) → ซ่อนออกจาก UI ชั่วคราว** ดีกว่าปล่อยเปลือกให้คนใช้แล้วข้อมูลค้างครึ่งทาง (pipeline-C2,C3, M1)
- `paidTotal` semantics รองรับ WHT/fee ตั้งแต่ตอนนี้ (= ยอดที่ตัดหนี้ ไม่ใช่เงินเข้า) (pipeline-M3, ledger-M9) + `vatTiming` ลง schema (pipeline-M6)

## Gate B — ก่อนเปิด P2 (รายจ่าย/WHT)
- State machine ครบ 22 ชนิด (ledger-M1) รวม CN cap ≤ คงเหลือ, มัดจำคืนเงิน/ยกเลิก (ledger-M2,M12)
- แก้ unique ขัดแย้ง: `DocumentPayment.entryId` เลิก @unique (BN 1 entry หลาย payment) · `JournalEntry.docNo` → `@@unique([systemId, docNo, seq])` (ledger-M4,M5)
- PayChannel CREDIT_APPLY/DEPOSIT_APPLY posting rules (ledger-M3) · ส่วนลดท้ายบิล×หลายอัตรา VAT = allocate ตามสัดส่วนฐาน (ledger-M11) · per-line vatRateBp ใช้จริงใน computeTotals (pipeline-M5)
- ใบกำกับ: ฟิลด์ ม.86/4 ครบ (คำว่า "ใบกำกับภาษี"/เอกสารออกเป็นชุด/สาขา) + ABB เงื่อนไข + CN/DN แสดงมูลค่าเดิม-ใหม่-ผลต่าง + แสดงส่วนลดบนใบ (tax-M1,M2,M3,M6) · 50 ทวิเพิ่มเงื่อนไขการหัก (tax-M8) · ภ.พ.30 เครดิตยกมา+แยกอัตรา+คอลัมน์สาขาคู่ค้า (tax-M4,M5)
- เลขรัน: prefix/pattern/reset รายปี + TZ ไทย (pipeline-M7) · แปลงเอกสารบางส่วน+คุมยอดสะสม (pipeline-M14) · กัน overpay/void payment (pipeline-M3) · void chain check (pipeline-M4) · ออกใบกำกับซ้ำจากต้นทางเดิม block (pipeline-M2)

## Gate C — ก่อน P3 (งบ)
- ยอดยกมา OPENING + บัญชีคู่ 3999 (ledger-M6) · นิยามปีบัญชี + closing/retained earnings (ledger-M7) · กระแสเงินสด algorithm (entry หลายบรรทัด/โอนภายใน/NONE) (ledger-M8) · void ในงวดปิด → reversal ลงงวดเปิดถัดไป (ledger-M10)

## Verify กับนักบัญชี/ผู้เชี่ยวชาญจริงก่อน launch (จาก tax verify-list)
1. **สูตร checksum เลขภาษีนิติบุคคล (DBD)** — อาจไม่ใช่ mod 11 แบบบัตรประชาชน (ถ้าผิด = บล็อกลูกค้านิติบุคคลทั้งหมด!) 2. เงื่อนไข ABB ต่อประเภทกิจการ 3. e-Tax provider format 4. รายละเอียด ภ.ง.ด. ยื่นออนไลน์ปัจจุบัน — รวม 9 ข้อ ดูท้าย QC5-account-tax.md

## MINOR ทั้งหมด (34) — แก้ระหว่างทาง ไม่ block gate ใด
