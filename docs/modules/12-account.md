# โมดูล 12 — Account (บัญชี)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md D2,D3,D8,D9,D17 (2026-07-11)
> scope: **unit ledger + tenant consolidated view** (ตาม `_CONVENTIONS.md` ข้อ 1)
> สมุดบัญชี (JournalEntry/Expense/TaxInvoice/Period) แยกต่อ BusinessUnit · ผังบัญชี (Chart of Accounts) ใช้ร่วมระดับ tenant · รายงานรวมองค์กร (consolidated) เกิดที่ **ชั้น query** ไม่ใช่ชั้นข้อมูล
> อ่านคู่กับ: `../BLUEPRINT.md` §5.12 · `../BLUEPRINT_BUSINESS_UNITS.md` · `_CONVENTIONS.md` (contract 2.4)

---

## 1. ภาพรวม + ขอบเขต

### 1.1 โมดูลนี้คืออะไร

ระบบบัญชีสำหรับ **เจ้าของร้าน SME ไทยที่ไม่ใช่นักบัญชี** — ตอบ 4 คำถามที่เจ้าของร้านถามทุกวัน:

1. **วันนี้/เดือนนี้ขายได้เท่าไหร่ กำไรเท่าไหร่** (ต่อกิจการ + รวมทุกกิจการ)
2. **เงินเข้าทางไหนบ้าง** (เงินสด/โอน/PromptPay/บัตร) ตรงกับยอด POS ไหม
3. **จ่ายอะไรไปบ้าง** (บันทึกรายจ่าย + ถ่ายรูปใบเสร็จแนบ)
4. **เดือนนี้ต้องยื่นภาษีเท่าไหร่** (ภาษีขาย-ซื้อ เตรียมยื่น ภ.พ.30) + ออกใบกำกับภาษีให้ลูกค้าได้

ภายในเป็น **double-entry แบบย่อ** (ทุก entry เดบิต=เครดิตเสมอ, immutable) เพื่อให้ตัวเลขตรวจสอบย้อนได้และส่งต่อนักบัญชีจริงได้ แต่ **UI ไม่โชว์ศัพท์บัญชี** — เจ้าของร้านเห็น "เงินเข้า/เงินออก/กำไร" ไม่เห็นคำว่า debit/credit (โหมดสมุดรายวันแบบบัญชีมีให้เปิดดูสำหรับคนที่อยากเห็น)

### 1.2 ทำอะไรใน v1 (สรุป)

- Chart of Accounts template SME ไทย — seed อัตโนมัติ, ปรับแต่งได้ต่อ tenant, ใช้ร่วมทุก unit
- Ledger แยกต่อ unit: รับ posting อัตโนมัติจาก POS (contract 2.4) + บันทึกรายจ่ายมือ
- Mapping "ประเภทรายการ → account code" ตั้งค่าได้ (default ระดับ tenant, override ต่อ unit)
- VAT 7%: ราคา include/exclude ตั้งต่อ unit, ใบกำกับภาษีอย่างย่อ/เต็มรูป เลขรันต่อ unit
- รายงาน: งบกำไรขาดทุน (P&L) รายเดือนต่อ unit + consolidated, cash flow summary, ยอดขายตามช่องทางชำระ, ภาษีขายรายเดือน (เตรียมยื่น ภ.พ.30), export CSV
- ปิดงวดรายเดือน (lock period), กระทบยอด POS vs ledger รายวัน, audit log ทุก entry

### 1.3 ไม่ทำใน v1 (boundary — สำคัญ อย่าหลุด scope)

| ไม่ทำ | เหตุผล / ทางออก |
|---|---|
| งบดุล งบทดลอง งบกระแสเงินสดตามมาตรฐาน ปิดบัญชีสิ้นปี/กำไรสะสม | v1 คือบัญชีที่เจ้าของร้านเข้าใจ ไม่ใช่โปรแกรมสำหรับนักบัญชี — ปิดงวดรายเดือน (lock) พอ · trial balance 🔜 |
| ภาษีหัก ณ ที่จ่าย (WHT 50 ทวิ) | 🔜 Phase ถัดไป — v1 บันทึกเป็นรายจ่ายปกติได้ก่อน |
| e-Tax Invoice (อิเล็กทรอนิกส์ยื่นสรรพากร) | 🔜 — v1 ออก PDF พิมพ์/ส่งอีเมลพอ |
| ตัดสต็อก→COGS อัตโนมัติ (inventory valuation) | ของ POS/Restaurant · v1 COGS = บันทึกรายจ่ายหมวดต้นทุนขายด้วยมือ · auto 🔜 |
| Recurring expense (รายจ่ายประจำอัตโนมัติ) | 🔜 — schema เผื่อไว้แล้ว (§4.9) |
| เชื่อมโปรแกรมบัญชีจริง (FlowAccount / PEAK / TRCloud) | 🔜 — v1 ให้ **export CSV โครงเดียวกับที่นักบัญชีนำเข้าได้** เป็นสะพานไปก่อน |
| Bank feed / กระทบยอด statement ธนาคาร | 🔜 — v1 กระทบยอดกับ POS เท่านั้น |
| หลายสกุลเงิน | THB เท่านั้น (`_CONVENTIONS` ข้อ 3) |
| ลูกหนี้/เจ้าหนี้แบบมี aging + วางบิล/ตามหนี้ | v1 มี account code รองรับใน CoA แต่ไม่มี workflow — 🔜 |

**เส้นแบ่งกับ POS:** POS เป็นจุดตัดเงินเดียว (contract 2.1) — ใบเสร็จรับเงิน (receipt) เป็นเอกสารของ POS · Account รับ **posting** และเป็นเจ้าของ **ใบกำกับภาษี** (อย่างย่อพิมพ์รวมกับใบเสร็จได้, เต็มรูปออกจากโมดูลนี้)

---

## 2. Persona & User Stories

| Persona | บทบาทกับโมดูลนี้ |
|---|---|
| **Owner** (เจ้าของ) | ดูภาพรวมทุกกิจการ, ปรับผังบัญชี/mapping, ปิดงวด, export ส่งนักบัญชี |
| **Manager** (ผู้จัดการหน่วย) | ดูบัญชีเฉพาะหน่วยตน, บันทึก/void รายจ่าย, ออก/void ใบกำกับ, กระทบยอดรายวัน |
| **Staff** (แคชเชียร์/แอดมิน) | บันทึกรายจ่าย (ถ่ายรูปใบเสร็จ), ออกใบกำกับเต็มรูปเมื่อลูกค้าขอ |
| **นักบัญชีภายนอก** (ไม่มี login ใน v1) | รับไฟล์ CSV รายเดือนจาก Owner ไปลงโปรแกรมบัญชีจริง |
| **Customer** (ลูกค้าร้าน) | ขอใบกำกับภาษีเต็มรูป (แจ้งข้อมูลผู้ซื้อที่จุดขาย) |

User stories หลัก:

- ในฐานะ **Owner** ฉันอยากเห็นกำไรขาดทุนเดือนนี้ของทุกกิจการในตารางเดียว (แยกคอลัมน์ต่อหน่วย + รวม) เพื่อรู้ว่ากิจการไหนกำไร/ขาดทุน
- ในฐานะ **Owner** ฉันอยากปิดงวดเดือนที่แล้ว เพื่อไม่ให้ใครแก้/ลงรายการย้อนหลังหลังจากส่งข้อมูลให้นักบัญชีแล้ว
- ในฐานะ **Manager** ฉันอยากเห็นทุกเย็นว่ายอดขายใน POS ตรงกับบัญชีไหม (กระทบยอดรายวัน) เพื่อจับเงินขาด/รายการตกหล่น
- ในฐานะ **Staff** ฉันอยากถ่ายรูปใบเสร็จค่าวัตถุดิบแล้วบันทึกรายจ่ายจากมือถือใน 30 วินาที
- ในฐานะ **Staff** เมื่อลูกค้าขอใบกำกับภาษีเต็มรูป ฉันอยากกรอกชื่อ/เลขผู้เสียภาษี แล้วได้ PDF ทันทีจากใบเสร็จที่เพิ่งขาย
- ในฐานะ **Owner** ฉันอยากได้ยอดภาษีขาย-ภาษีซื้อเดือนที่แล้วเป็นตัวเลขสรุป เพื่อกรอกยื่น ภ.พ.30 เอง (หรือส่งนักบัญชี)
- ในฐานะ **Owner** ฉันอยากรู้ว่าตอนนี้ร้านมี "หนี้แต้ม" ค้างอยู่เท่าไหร่ (point liability) เพราะแต้มที่ลูกค้าสะสมคือส่วนลดในอนาคต

---

## 3. ฟังก์ชันทั้งหมด (MVP ✅ / Phase ถัดไป 🔜)

### 3.1 Chart of Accounts (ผังบัญชี — tenant-level ใช้ร่วมทุก unit)

- ✅ Seed template SME ไทยอัตโนมัติตอนเปิดโมดูล (ตาราง §3.1.1) — บัญชี system แก้ชื่อได้ ลบไม่ได้
- ✅ เพิ่มบัญชีย่อยเอง (code + ชื่อ TH/EN + หมวด), archive บัญชีที่ไม่ใช้ (ห้าม archive ถ้ามี movement ในงวดเปิด)
- ✅ hierarchy 1 ชั้น: บัญชีอิง parent เพื่อจัดกลุ่มในรายงาน (เช่น 6xxx ทั้งหมดอยู่ใต้ "ค่าใช้จ่าย")
- 🔜 import/export ผังบัญชี, map เข้าผังบัญชีมาตรฐานของโปรแกรมบัญชีภายนอก

#### 3.1.1 Template ตั้งต้น (isSystem = true)

| code | ชื่อ | type | หมายเหตุ |
|---|---|---|---|
| 1000 | เงินสด | ASSET | รับ mapping `PAY_CASH` |
| 1010 | เงินฝากธนาคาร | ASSET | `PAY_TRANSFER`, `PAY_PROMPTPAY` |
| 1030 | ลูกหนี้บัตรเครดิต (รอเรียกเก็บ) | ASSET | `PAY_CARD` — เงินบัตรยังไม่เข้าธนาคารวันขาย |
| 1100 | ลูกหนี้การค้า | ASSET | v1 มี code รองรับ ไม่มี workflow (🔜) |
| 1150 | ภาษีซื้อ | ASSET | `VAT_INPUT` — จากรายจ่ายที่มีใบกำกับ |
| 1200 | สินค้าคงเหลือ | ASSET | เผื่อ inventory 🔜 |
| 2100 | เจ้าหนี้การค้า | LIABILITY | v1 มี code รองรับ (🔜) |
| 2200 | ภาษีขาย | LIABILITY | `VAT_OUTPUT` |
| 2300 | แต้มสะสมค้างจ่าย (point liability) | LIABILITY | `POINT_LIABILITY` |
| 2310 | บัตรกำนัลค้างจ่าย (voucher liability) | LIABILITY | `PAY_VOUCHER` ตัดหนี้ตอนลูกค้าใช้ voucher |
| 3000 | ทุน/เงินเจ้าของ | EQUITY | เงินเจ้าของใส่เข้า/ถอนออก (ADJUST) |
| 4000 | รายได้ขายสินค้า | INCOME | `INCOME_POS` |
| 4010 | รายได้ร้านอาหาร | INCOME | `INCOME_RESTAURANT` |
| 4020 | รายได้ห้องพัก | INCOME | `INCOME_HOTEL` |
| 4030 | รายได้ค่าบริการ | INCOME | `INCOME_BOOKING` |
| 4040 | รายได้ขายตั๋ว/อีเวนต์ | INCOME | `INCOME_TICKET` |
| 4800 | ส่วนลดจ่าย | INCOME | contra (ยอด debit) — `DISCOUNT` |
| 4900 | รายได้อื่น | INCOME | `INCOME_OTHER` (แต้มหมดอายุ ฯลฯ) |
| 5000 | ต้นทุนขาย (COGS) | COGS | `COGS` — v1 ลงจาก expense มือ |
| 6000 | เงินเดือนและค่าแรง | EXPENSE | |
| 6100 | ค่าเช่า | EXPENSE | |
| 6200 | ค่าน้ำ ค่าไฟ ค่าเน็ต | EXPENSE | |
| 6300 | ค่าการตลาด/โฆษณา | EXPENSE | |
| 6400 | วัตถุดิบและของใช้สิ้นเปลือง | EXPENSE | ร้านที่ไม่แยก COGS ใช้ตัวนี้ |
| 6500 | ค่าธรรมเนียมชำระเงิน | EXPENSE | `PAYMENT_FEE` (ค่าธรรมเนียมบัตร/gateway) |
| 6600 | ค่าใช้จ่ายส่งเสริมการขาย (แต้ม/โปรโมชัน) | EXPENSE | `POINT_EXPENSE` |
| 6900 | ค่าใช้จ่ายอื่น | EXPENSE | `EXPENSE_DEFAULT` |
| 9999 | พักรายการ (รอตรวจสอบ) | EXPENSE | `SUSPENSE` — posting ที่ mapping ไม่ครบ ห้ามมียอดค้างตอนปิดงวด |

> ผังบัญชีเป็น **tenant-level** เพื่อให้รายงาน consolidated เทียบข้ามหน่วยได้บรรทัดต่อบรรทัด — unit แยกกันด้วย ledger (`JournalEntry.unitId`) ไม่ใช่แยกผัง

### 3.2 Journal (สมุดรายวัน — unit-level)

- ✅ `JournalEntry` + `JournalLine` แบบ double-entry ย่อ: **ทุก entry Σdebit = Σcredit** (บังคับที่ service + DB check)
- ✅ **Immutable**: entry ที่ post แล้วห้าม UPDATE/DELETE — แก้ = สร้าง **reversal entry** (กลับ debit/credit ทุกบรรทัด อ้าง `reversalOfId`) แล้วลงรายการใหม่
- ✅ รับ posting อัตโนมัติจากโมดูลอื่นตาม contract 2.4 ผ่าน facade `postSale / postRefund / postVoid` (จาก POS — D3, EXPENSE จากฟอร์มรายจ่าย)
- ✅ posting กันซ้ำด้วย `idempotencyKey` (unique ต่อ tenant) — POS retry ได้ปลอดภัย
- ✅ manual entry ประเภท ADJUST สำหรับ Owner (เช่น เงินเจ้าของใส่เพิ่ม, ปรับปรุงยอด) — ต้องเลือกบัญชี 2 ฝั่งเอง มี audit log
- ✅ เลขเอกสารรันต่อ unit ต่อเดือน: `JV-2569-07-0001` (`@@unique([unitId, docNo])`)
- ✅ needsReview flag: posting ที่ลง suspense (mapping ขาด) หรือถูกเลื่อนงวด — โชว์ badge ให้เจ้าของเคลียร์
- 🔜 แนบไฟล์กับ manual entry, template manual entry ที่ใช้บ่อย

### 3.3 Posting mapping (ตั้งค่าบัญชีต่อประเภทรายการ)

- ✅ ตาราง `AccountMapping`: key เชิงความหมาย → บัญชีในผัง · ค่า default ระดับ tenant (unitId = null), override ต่อ unit
- ✅ keys ชุดแรก: `PAY_CASH` `PAY_TRANSFER` `PAY_PROMPTPAY` `PAY_CARD` `PAY_VOUCHER` `INCOME_POS` `INCOME_RESTAURANT` `INCOME_HOTEL` `INCOME_BOOKING` `INCOME_TICKET` `INCOME_OTHER` `DISCOUNT` `VAT_OUTPUT` `VAT_INPUT` `POINT_EXPENSE` `POINT_LIABILITY` `PAYMENT_FEE` `COGS` `EXPENSE_DEFAULT` `SUSPENSE`
- ✅ ลำดับ resolve: unit override → tenant default → seed default (ฝังในโค้ด) → `SUSPENSE` + needsReview
- ✅ UI ภาษาคน: "เงินสดเข้าบัญชีไหน" / "ยอดขายร้านอาหารลงบัญชีไหน" — ไม่โชว์คำว่า mapping/debit/credit
- 🔜 mapping ต่อหมวดสินค้า (product category → income code แยกละเอียด)

### 3.4 รายจ่าย (Expense — unit-level)

- ✅ ฟอร์มบันทึกรายจ่าย: วันที่, หมวด (บัญชี type EXPENSE/COGS), จำนวนเงิน, วิธีจ่าย (เงินสด/โอน/PromptPay/บัตร/อื่น), ผู้ขาย, โน้ต
- ✅ แนบรูปใบเสร็จ (ถ่ายจากกล้องมือถือ / upload หลายรูป → object storage)
- ✅ ติ๊ก "มีใบกำกับภาษี" → กรอกยอด VAT ซื้อ (auto คำนวณ 7% จากยอด แก้มือได้) + เลขผู้เสียภาษีผู้ขาย → เข้า report ภาษีซื้อ
- ✅ บันทึกแล้ว post journal ทันที: Dr ค่าใช้จ่าย(หมวด) + Dr ภาษีซื้อ / Cr เงินสด|ธนาคาร ตามวิธีจ่าย
- ✅ Void รายจ่าย (เหตุผลบังคับ) → auto reversal entry · ห้าม void ในงวดปิด
- ✅ เลขเอกสาร `EXP-2569-07-0001` ต่อ unit
- 🔜 **Recurring expense**: ตั้งรายจ่ายประจำ (ค่าเช่า/เงินเดือน ทุกวันที่ X) → ระบบสร้าง draft ให้กดยืนยัน (schema §4.9 วางไว้แล้ว)
- 🔜 OCR อ่านยอดจากรูปใบเสร็จ, อนุมัติรายจ่ายหลายขั้น (STAFF สร้าง draft → MANAGER approve)

### 3.5 ภาษี & ใบกำกับภาษี

- ✅ ตั้งค่าต่อ unit (`unit.settings.account`): จด VAT หรือไม่ (`vatRegistered`), ราคาสินค้า **รวม/ไม่รวม** VAT (`priceIncludesVat`), อัตรา (default 7%), เลขผู้เสียภาษี, ชื่อ-ที่อยู่สถานประกอบการ (หัวใบกำกับ), รหัสสาขา (`00000` สำนักงานใหญ่) — **`unit.settings.account.*` เป็น VAT/ภาษี source of truth เดียวของแพลตฟอร์ม (D9): POS อ่านจากที่นี่ในการคำนวณ VAT ทุกบิล (`!vatRegistered → NONE`, `priceIncludesVat → INCLUDED | EXCLUDED`) — ไม่มี `settings.pos.vat` อีกต่อไป**
- ✅ unit ไม่จด VAT: ไม่มีบรรทัดภาษีใน posting, ปุ่มใบกำกับถูกซ่อน, ออกได้เฉพาะใบเสร็จ (POS)
- ✅ **ใบกำกับภาษีอย่างย่อ (ABB)**: ออกอัตโนมัติพร้อมการขายทุกครั้ง (unit ที่จด VAT) — เลขรัน `TXA-2569-07-00001`, `@@unique([unitId, docNo])`
- ✅ **ใบกำกับภาษีเต็มรูป (FULL)**: ออกจากใบขายเดิม (แทน ABB — void ABB อ้างอิงกัน) กรอกข้อมูลผู้ซื้อ: ชื่อ, เลขผู้เสียภาษี 13 หลัก (validate checksum), สำนักงานใหญ่/สาขา, ที่อยู่ — เลขรันแยก `TXF-2569-07-0001` · 1 ใบขาย ออก FULL ได้ใบเดียว
- ✅ Void ใบกำกับ (เหตุผลบังคับ, เก็บใบเดิมสถานะ VOIDED — เลขไม่ reuse) + ออกใบใหม่แทน (`replacesId`)
- ✅ PDF ใบกำกับ (เต็มรูป A4 + อย่างย่อ 80mm) — ฟิลด์ครบตามข้อกำหนดสรรพากร (คำว่า "ใบกำกับภาษี", เลขที่, วันที่, ชื่อ/ที่อยู่/เลขผู้เสียภาษีผู้ขาย+ผู้ซื้อ, รายการ, มูลค่าก่อน VAT, VAT, รวม)
- 🔜 WHT หัก ณ ที่จ่าย (ออก/รับ 50 ทวิ), e-Tax Invoice & e-Receipt, ใบเพิ่มหนี้/ลดหนี้ (debit/credit note — v1 ใช้ void+ออกใหม่)

### 3.6 รายงาน (unit + consolidated) — รายละเอียด §10

- ✅ งบกำไรขาดทุนรายเดือนต่อ unit + consolidated ทั้ง tenant (คอลัมน์ต่อหน่วย + รวม)
- ✅ Cash flow summary (เงินเข้า-ออกตามบัญชีเงิน แยกวิธีชำระ, รายวัน/รายเดือน)
- ✅ ยอดขายตามช่องทางชำระ · ✅ ค่าใช้จ่ายตามหมวด · ✅ ภาษีขาย-ซื้อรายเดือน (เตรียมยื่น ภ.พ.30) · ✅ ยอดหนี้แต้มคงค้าง
- ✅ Export CSV ทุกรายงาน + export สมุดรายวันทั้งงวด (โครงคอลัมน์มาตรฐานส่งนักบัญชี)
- ✅ PDF: ใบกำกับภาษี · 🔜 PDF รายงาน (v1 ใช้ print stylesheet ของหน้ารายงานไปก่อน)

### 3.7 ปิดงวด & กระทบยอด

- ✅ ปิดงวดรายเดือนต่อ unit (`AccountingPeriod` OPEN→CLOSED): งวดปิดแล้ว **ห้าม post/void/reverse ที่ date อยู่ในงวดนั้น**
- ✅ pre-close checklist อัตโนมัติ: ยอด suspense = 0, ไม่มี needsReview ค้าง, กระทบยอดครบทุกวัน, ไม่มี sale ที่ posting ไม่สำเร็จ
- ✅ Reopen งวด (OWNER เท่านั้น + เหตุผล + audit log)
- ✅ auto-posting ที่ date ตกในงวดปิด (เช่น refund ข้ามเดือน) → ลงวันที่แรกของงวดเปิดถัดไป + needsReview (ห้าม fail เงียบ, ห้าม block การขาย)
- ✅ **Reconcile รายวัน**: เทียบยอด POS (Σ `PosSale` ต่อวิธีชำระ) vs ยอด posting ใน ledger วันเดียวกัน — โชว์ diff, รายการขายที่ posting หาย, ปุ่ม re-post
- 🔜 ปิดงวดปี + ยกยอดกำไรสะสม, กระทบยอด statement ธนาคาร

### 3.8 Audit & ความปลอดภัย

- ✅ `AuditLog` กลาง (per `_CONVENTIONS` ข้อ 5) กับทุก action: post/reverse, expense create/void, invoice issue/void, close/reopen period, แก้ CoA/mapping — เก็บ who/what/when/before/after
- ✅ ตารางบัญชีเขียนได้จาก Account service เท่านั้น — โมดูลอื่นยิง posting ผ่าน contract, ไม่ import Prisma model ตรง

---

## 4. Data Model (Prisma)

> ทุก model unit-scoped มี `tenantId + unitId` ตามกติกา BLUEPRINT_BUSINESS_UNITS · เงินเป็น `Int` สตางค์ทั้งหมด · `LedgerAccount` ตั้งชื่อเลี่ยงชน `Account` ของ Auth

```prisma
// ───────────────────────── enums ─────────────────────────

enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  INCOME
  COGS
  EXPENSE
}

enum LedgerAccountStatus {
  ACTIVE
  ARCHIVED
}

enum JournalType {
  SALE      // จาก POS createSale (facade postSale)
  REFUND    // จาก POS refund (facade postRefund)
  EXPENSE   // จากฟอร์มรายจ่าย
  ADJUST    // manual โดย OWNER
  REVERSAL  // กลับรายการ (อ้าง reversalOfId เสมอ) — รวม postVoid จาก POS (กลับ entry SALE เดิมทั้งก้อน)
}

enum EntrySource {
  AUTO      // posting จากโมดูลอื่นผ่าน contract
  MANUAL    // คนกดเอง (expense/adjust/reversal)
}

enum EntryStatus {
  POSTED
  REVERSED  // ถูกกลับรายการแล้ว (ตัว entry เดิมยังอยู่ครบ)
}

enum ExpensePayMethod {
  CASH
  TRANSFER
  PROMPTPAY
  CARD
  OTHER
}

enum ExpenseStatus {
  POSTED
  VOIDED
}

enum TaxInvoiceType {
  ABB   // อย่างย่อ
  FULL  // เต็มรูป
}

enum TaxInvoiceStatus {
  ISSUED
  VOIDED
}

enum PeriodStatus {
  OPEN
  CLOSED
}

// ─────────────── 4.1 ผังบัญชี (tenant-level) ───────────────

model LedgerAccount {
  id        String              @id @default(cuid())
  tenantId  String
  code      String              // "4010"
  name      String              // "รายได้ร้านอาหาร"
  nameEn    String?
  type      AccountType
  parentId  String?             // จัดกลุ่มรายงาน 1 ชั้น
  parent    LedgerAccount?      @relation("AccountTree", fields: [parentId], references: [id])
  children  LedgerAccount[]     @relation("AccountTree")
  isSystem  Boolean             @default(false) // จาก template: แก้ชื่อได้ ลบ/เปลี่ยน type ไม่ได้
  status    LedgerAccountStatus @default(ACTIVE)
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  lines     JournalLine[]
  mappings  AccountMapping[]
  expenses  Expense[]

  @@unique([tenantId, code])
  @@index([tenantId, type, status])
}

// ─────────────── 4.2 Posting mapping ───────────────

model AccountMapping {
  id        String        @id @default(cuid())
  tenantId  String
  unitId    String?       // null = ค่า default ระดับ tenant · มีค่า = override ต่อ unit
  key       String        // "PAY_CASH" | "INCOME_RESTAURANT" | ... (§3.3)
  accountId String
  account   LedgerAccount @relation(fields: [accountId], references: [id])
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@unique([tenantId, unitId, key]) // ⚠️ Postgres: NULL ไม่ชนกันเอง — service ต้อง upsert ด้วย findFirst (edge case §11.9)
  @@index([tenantId, key])
}

// ─────────────── 4.3 สมุดรายวัน (unit-level, immutable) ───────────────

model JournalEntry {
  id             String        @id @default(cuid())
  tenantId       String
  unitId         String
  docNo          String        // "JV-2569-07-0001" รันต่อ unit ต่อเดือน
  journal        JournalType
  date           DateTime      // business date (UTC — periodKey คิดจาก timezone ของ unit)
  periodKey      String        // "2026-07" denormalized: query งวด/ปิดงวดเร็ว
  refType        String?       // D8: ชื่อ Prisma model ตรงตัว — "PosSale" | "Expense" | "TaxInvoice" | null
  refId          String?
  memo           String?
  source         EntrySource
  status         EntryStatus   @default(POSTED)
  needsReview    Boolean       @default(false) // ลง suspense / ถูกเลื่อนงวด
  idempotencyKey String?       // กัน post ซ้ำจาก retry — POS ส่งมาเสมอ
  reversalOfId   String?       @unique // entry นี้เป็น reversal ของใบไหน
  reversalOf     JournalEntry? @relation("Reversal", fields: [reversalOfId], references: [id])
  reversedBy     JournalEntry? @relation("Reversal")
  postedById     String?       // userId (null = system/AUTO)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  lines          JournalLine[]

  @@unique([unitId, docNo])
  @@unique([tenantId, idempotencyKey])
  @@index([unitId, periodKey])
  @@index([unitId, journal, date])
  @@index([unitId, needsReview])
  @@index([tenantId, periodKey])   // consolidated query
  @@index([refType, refId])
}

model JournalLine {
  id        String        @id @default(cuid())
  tenantId  String
  unitId    String        // denormalized จาก entry — รายงานต่อบัญชีต่อหน่วยไม่ต้อง join
  entryId   String
  entry     JournalEntry  @relation(fields: [entryId], references: [id])
  accountId String
  account   LedgerAccount @relation(fields: [accountId], references: [id])
  debit     Int           @default(0) // สตางค์ ≥ 0 — บรรทัดหนึ่งมีได้ฝั่งเดียว
  credit    Int           @default(0) // สตางค์ ≥ 0
  note      String?

  @@index([entryId])
  @@index([unitId, accountId])
  @@index([tenantId, accountId])
}
// invariant (service + DB CHECK): debit >= 0, credit >= 0, ไม่เป็น 0 ทั้งคู่, ไม่ >0 ทั้งคู่
// invariant ต่อ entry: SUM(debit) == SUM(credit) — ตรวจใน transaction เดียวกับ insert

// ─────────────── 4.4 รายจ่าย (unit-level) ───────────────

model Expense {
  id            String           @id @default(cuid())
  tenantId      String
  unitId        String
  docNo         String           // "EXP-2569-07-0001"
  date          DateTime
  accountId     String           // หมวด (LedgerAccount type EXPENSE|COGS เท่านั้น)
  account       LedgerAccount    @relation(fields: [accountId], references: [id])
  amount        Int              // ยอดจ่ายรวมที่จ่ายจริง (สตางค์, รวม VAT ถ้ามี)
  vatAmount     Int              @default(0) // ภาษีซื้อ (ต้อง hasTaxInvoice)
  hasTaxInvoice Boolean          @default(false)
  vendorName    String?
  vendorTaxId   String?          // 13 หลัก — บังคับเมื่อ hasTaxInvoice
  payMethod     ExpensePayMethod
  note          String?
  receiptImages Json             @default("[]") // [{url, width, height}]
  status        ExpenseStatus    @default(POSTED)
  voidReason    String?
  entryId       String?          @unique // JournalEntry ที่เกิดจากรายจ่ายนี้
  createdById   String
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@unique([unitId, docNo])
  @@index([unitId, date])
  @@index([unitId, accountId])
  @@index([unitId, status])
}

// ─────────────── 4.5 ใบกำกับภาษี (unit-level) ───────────────

model TaxInvoice {
  id           String           @id @default(cuid())
  tenantId     String
  unitId       String
  type         TaxInvoiceType
  docNo        String           // ABB: "TXA-2569-07-00001" · FULL: "TXF-2569-07-0001"
  issueDate    DateTime
  saleRefType  String           // "PosSale" (D8: refType = ชื่อ Prisma model ตรงตัว)
  saleRefId    String           // ใบขายจาก POS
  // ข้อมูลผู้ซื้อ — บังคับเมื่อ type = FULL (snapshot freeze ตาม _CONVENTIONS 2.6)
  buyerName    String?
  buyerTaxId   String?          // 13 หลัก validate checksum
  buyerBranch  String?          // "00000" สำนักงานใหญ่ | "00001" สาขา
  buyerAddress String?
  // ยอดเงิน (สตางค์) — snapshot จากใบขาย ณ วันออก
  subtotal     Int              // มูลค่าก่อน VAT
  vatRate      Int              // basis point: 700 = 7%
  vatAmount    Int
  total        Int
  linesSnapshot Json            // [{name, qty, unitPrice, amount}] freeze รายการ ณ วันออก
  status       TaxInvoiceStatus @default(ISSUED)
  voidReason   String?
  replacesId   String?          @unique // ใบนี้ออกแทนใบที่ void
  pdfUrl       String?
  issuedById   String?          // null = ABB auto จากระบบ
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  @@unique([unitId, docNo])
  @@index([unitId, type, issueDate])
  @@index([saleRefType, saleRefId])
}

// ─────────────── 4.6 งวดบัญชี (unit-level) ───────────────

model AccountingPeriod {
  id         String       @id @default(cuid())
  tenantId   String
  unitId     String
  periodKey  String       // "2026-07"
  status     PeriodStatus @default(OPEN)
  closedAt   DateTime?
  closedById String?
  reopenLog  Json         @default("[]") // [{at, byId, reason}]
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  @@unique([unitId, periodKey])
  @@index([tenantId, periodKey])
}

// ─────────────── 4.7 เลขเอกสารรัน (unit-level) ───────────────

model DocSequence {
  id        String @id @default(cuid())
  tenantId  String
  unitId    String
  docType   String // "JV" | "EXP" | "TXA" | "TXF"
  periodKey String // reset รายเดือน
  lastNo    Int    @default(0)

  @@unique([unitId, docType, periodKey]) // จองเลขด้วย upsert + increment ใน tx เดียวกับเอกสาร
}

// ─────────────── 4.8 ตั้งค่าต่อ unit (เก็บใน BusinessUnit.settings.account — ไม่ใช่ตารางใหม่) ───────────────
// {
//   "vatRegistered": true,
//   "priceIncludesVat": true,        // ราคาขายรวม VAT แล้ว (ร้านค้าปลีกทั่วไป) | false = บวก VAT ท้ายบิล
//   "vatRate": 700,                  // basis point
//   "taxId": "0105561000000",
//   "branchCode": "00000",
//   "legalName": "บริษัท ตัวอย่าง จำกัด",
//   "legalAddress": "...",
//   "docPrefix": { "JV": "JV", "EXP": "EXP", "TXA": "TXA", "TXF": "TXF" }
// }

// ─────────────── 4.9 🔜 Recurring expense (Phase ถัดไป — วาง schema เผื่อ ไม่ migrate ใน v1) ───────────────
// model RecurringExpense {
//   id          String  @id @default(cuid())
//   tenantId    String
//   unitId      String
//   accountId   String
//   amount      Int
//   payMethod   ExpensePayMethod
//   note        String?
//   dayOfMonth  Int      // สร้าง draft ทุกวันที่ X
//   nextRunAt   DateTime
//   status      String   // ACTIVE | PAUSED
//   @@index([unitId, status])
// }
```

**สรุป: 8 models ใน v1** (LedgerAccount, AccountMapping, JournalEntry, JournalLine, Expense, TaxInvoice, AccountingPeriod, DocSequence) + 1 schema เผื่อ 🔜 (RecurringExpense) + settings JSON ใน BusinessUnit

---

## 5. API Endpoints

> unit-scoped อยู่ใต้ `/api/u/[unitId]/account/...` (middleware ตรวจ unit ∈ tenant + `can()` 4 มิติ) · tenant-scoped อยู่ใต้ `/api/account/...`
> เงินทุก payload = Int สตางค์

### 5.1 ผังบัญชี + mapping (tenant-level)

| # | Method + Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| 1 | `GET /api/account/accounts` | ผังบัญชีทั้งหมด (filter `type`, `status`) | ทุก role ที่มี account.view |
| 2 | `POST /api/account/accounts` | เพิ่มบัญชี `{code, name, nameEn?, type, parentId?}` | OWNER |
| 3 | `PATCH /api/account/accounts/:id` | แก้ชื่อ / archive (`{name?, nameEn?, status?}` — code/type แก้ไม่ได้เมื่อมี movement, isSystem ห้าม archive) | OWNER |
| 4 | `GET /api/account/mappings` | mapping default ของ tenant (ครบทุก key + ค่า effective) | OWNER |
| 5 | `PUT /api/account/mappings` | ตั้ง default `{items: [{key, accountId}]}` | OWNER |
| 6 | `GET /api/u/:unitId/account/mappings` | mapping effective ของ unit (override + fallback) | OWNER, MANAGER |
| 7 | `PUT /api/u/:unitId/account/mappings` | ตั้ง override ต่อ unit (ส่ง `accountId: null` = ลบ override กลับไปใช้ default) | OWNER, MANAGER |

### 5.2 Journal (unit-level)

| # | Method + Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| 8 | `GET /api/u/:unitId/account/journal` | list `?period=2026-07&journal=SALE&needsReview=1&page=` | OWNER, MANAGER |
| 9 | `GET /api/u/:unitId/account/journal/:id` | entry + lines + ref link (ใบขาย/รายจ่าย) | OWNER, MANAGER |
| 10 | `POST /api/u/:unitId/account/journal` | manual ADJUST `{date, memo, lines: [{accountId, debit?, credit?}]}` — ตรวจ Σdr=Σcr, งวดเปิด | OWNER |
| 11 | `POST /api/u/:unitId/account/journal/:id/reverse` | สร้าง reversal entry `{reason}` — ห้ามถ้า entry ถูก reverse แล้ว / งวดปิด | OWNER, MANAGER |
| 12 | `POST /api/u/:unitId/account/journal/:id/mark-reviewed` | เคลียร์ needsReview หลังแก้ (ต้อง reclass ออกจาก suspense ก่อนถ้ามี) | OWNER, MANAGER |

> **หมายเหตุ:** facade `account.postSale/postRefund/postVoid` ตาม contract 2.4 เป็น **internal service function** ไม่ใช่ REST endpoint สาธารณะ — โมดูลอื่นเรียกในโปรเซสเดียวกัน (modular monolith) · `account.post` (raw lines) ใช้ได้เฉพาะภายในโมดูล Account เท่านั้น (D3) ดู §8

### 5.3 รายจ่าย (unit-level)

| # | Method + Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| 13 | `GET /api/u/:unitId/account/expenses` | list `?period=&accountId=&status=&q=` | OWNER, MANAGER, STAFF(expense.view) |
| 14 | `POST /api/u/:unitId/account/expenses` | สร้าง `{date, accountId, amount, vatAmount?, hasTaxInvoice?, vendorName?, vendorTaxId?, payMethod, note?, receiptImages?}` → post journal ใน tx เดียว | OWNER, MANAGER, STAFF(expense.create) |
| 15 | `GET /api/u/:unitId/account/expenses/:id` | รายละเอียด + รูป + entry | ตาม expense.view |
| 16 | `POST /api/u/:unitId/account/expenses/:id/void` | void `{reason}` → auto reversal | OWNER, MANAGER |
| 17 | `POST /api/u/:unitId/account/expenses/upload` | อัปรูปใบเสร็จ (multipart → storage คืน url) | ตาม expense.create |

### 5.4 ใบกำกับภาษี (unit-level)

| # | Method + Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| 18 | `GET /api/u/:unitId/account/tax-invoices` | list `?type=&period=&q=เลข/ชื่อผู้ซื้อ` | OWNER, MANAGER, STAFF(invoice.view) |
| 19 | `POST /api/u/:unitId/account/tax-invoices/full` | ออกเต็มรูปจากใบขาย `{saleId, buyer: {name, taxId, branch, address}}` — void ABB เดิมอัตโนมัติ, 1 sale = 1 FULL | OWNER, MANAGER, STAFF(invoice.issue) |
| 20 | `POST /api/u/:unitId/account/tax-invoices/:id/void` | void `{reason, reissue?: boolean}` | OWNER, MANAGER |
| 21 | `GET /api/u/:unitId/account/tax-invoices/:id/pdf` | PDF (A4 เต็มรูป / 80mm อย่างย่อ) | ตาม invoice.view |

### 5.5 งวด + กระทบยอด (unit-level)

| # | Method + Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| 22 | `GET /api/u/:unitId/account/periods` | รายการงวด + สถานะ + pre-close checklist ของงวดล่าสุด | OWNER, MANAGER |
| 23 | `POST /api/u/:unitId/account/periods/:periodKey/close` | ปิดงวด — ตรวจ checklist ผ่านก่อน (`force: true` ข้ามได้เฉพาะ OWNER + บันทึกเหตุผล) | OWNER |
| 24 | `POST /api/u/:unitId/account/periods/:periodKey/reopen` | เปิดงวดกลับ `{reason}` + audit | OWNER |
| 25 | `GET /api/u/:unitId/account/reconcile?date=2026-07-11` | ยอด POS vs ledger ต่อวิธีชำระ + รายการขายที่ posting หาย/fail | OWNER, MANAGER |
| 26 | `POST /api/u/:unitId/account/reconcile/repost` | re-post รายการที่หาย `{saleIds: []}` (idempotent) | OWNER, MANAGER |

### 5.6 รายงาน + export

| # | Method + Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| 27 | `GET /api/u/:unitId/account/reports/pnl?period=2026-07` | P&L หน่วย (โครง §10.1) | OWNER, MANAGER |
| 28 | `GET /api/u/:unitId/account/reports/cashflow?from=&to=&groupBy=day\|month` | เงินเข้า-ออกตามบัญชีเงิน/วิธีชำระ | OWNER, MANAGER |
| 29 | `GET /api/u/:unitId/account/reports/sales-by-paymethod?period=` | ยอดขายแยกช่องทางชำระ | OWNER, MANAGER |
| 30 | `GET /api/u/:unitId/account/reports/vat?period=` | ภาษีขาย/ซื้อ + ยอดสุทธิ เตรียม ภ.พ.30 (§10.4) | OWNER, MANAGER |
| 31 | `GET /api/u/:unitId/account/reports/expense-by-category?period=` | ค่าใช้จ่ายตามหมวด | OWNER, MANAGER |
| 32 | `GET /api/account/reports/pnl?period=2026-07&unitIds=all` | **Consolidated P&L** — คอลัมน์ต่อ unit + รวม (unit ที่ user มีสิทธิ์เท่านั้น) | OWNER (MANAGER เห็นเฉพาะหน่วยตน) |
| 33 | `GET /api/account/reports/overview?period=` | การ์ดสรุปรวม: รายได้/ค่าใช้จ่าย/กำไร/เงินสด/หนี้แต้ม ต่อหน่วย | OWNER, MANAGER |
| 34 | ทุกรายงาน + `GET .../journal/export` | รับ `?format=csv` (default json) — CSV UTF-8 BOM เปิด Excel ไทยไม่เพี้ยน | ตามรายงานนั้น |

**รวม 34 endpoints** (32 เส้นทาง + รูปแบบ export)

---

## 6. UI Screens

> B&W minimal, i18n TH/EN, mobile-first, ทุกหน้ามี empty/loading/error state ตาม `_CONVENTIONS` ข้อ 5 · ภาษาหน้าจอ = ภาษาคน ("เงินเข้า/เงินออก") ไม่ใช่ศัพท์บัญชี

### Tenant-level (`/app/account` — โซน sidebar tenant, เห็นตลอดไม่ขึ้นกับ unit ที่เลือก)

| # | หน้า | เนื้อหา | Mobile |
|---|---|---|---|
| S1 | **ภาพรวมบัญชีรวม** `/app/account` | แถบเดือน + การ์ดต่อหน่วย (รายได้/รายจ่าย/กำไร เดือนนี้ + sparkline) + แถวรวมองค์กร + badge needsReview/ยังไม่กระทบยอด · คลิกการ์ด → S5 ของหน่วยนั้น | การ์ด stack แนวตั้ง |
| S2 | **งบกำไรขาดทุนรวม** `/app/account/reports/pnl` | ตาราง P&L: แถว = หมวดบัญชี, คอลัมน์ = หน่วย + รวม · เลือกเดือน/ช่วง · ปุ่ม export CSV | คอลัมน์เลื่อนแนวนอน (sticky ชื่อแถว) |
| S3 | **ผังบัญชี** `/app/account/settings/chart` | tree 2 ชั้นตาม type → บัญชี · เพิ่ม/แก้ชื่อ/archive · badge "system" · โชว์ยอด movement เดือนนี้ | list + bottom-sheet ฟอร์ม |
| S4 | **ตั้งค่าบัญชีอัตโนมัติ (mapping default)** `/app/account/settings/mapping` | ฟอร์มภาษาคน: "เงินสดเข้าบัญชีไหน", "ยอดขายห้องพักลงบัญชีไหน" — dropdown บัญชีจากผัง · โชว์ key เทคนิคแบบพับเก็บ | ฟอร์มยาว scroll เดียว |

### Unit-level (`/app/account/u/[unitSlug]/...` — ตาม URL scheme ของ BLUEPRINT_BUSINESS_UNITS)

| # | หน้า | เนื้อหา | Mobile |
|---|---|---|---|
| S5 | **หน้าแรกบัญชีหน่วย** `/app/account/u/[unitSlug]` | เดือนนี้: เงินเข้า/เงินออก/กำไร + กราฟรายวัน + สถานะกระทบยอดวันนี้ + needsReview + shortcut (บันทึกรายจ่าย/ออกใบกำกับ/ดูรายงาน) | การ์ด stack + FAB "บันทึกรายจ่าย" |
| S6 | **สมุดรายวัน** `.../journal` | ตาราง entry (วันที่, เลขที่, ประเภท, memo, ยอด, source, badge review) · filter งวด/ประเภท · คลิก → drawer รายละเอียด lines + ลิงก์ใบขาย/รายจ่าย + ปุ่ม "กลับรายการ" | list card, drawer เต็มจอ |
| S7 | **รายจ่าย** `.../expenses` | list (วันที่, หมวด, ผู้ขาย, ยอด, รูป thumbnail, สถานะ) + ปุ่มเพิ่ม → ฟอร์ม §3.4 (กล้อง/แนบรูป, toggle "มีใบกำกับภาษี") · void พร้อมเหตุผล | ฟอร์มเต็มจอ, ปุ่มกล้องเด่น — flow 30 วินาที |
| S8 | **ใบกำกับภาษี** `.../tax-invoices` | แท็บ อย่างย่อ/เต็มรูป · ค้นหาเลข/ชื่อผู้ซื้อ · ปุ่ม "ออกเต็มรูปจากใบขาย" (ค้นใบขาย → ฟอร์มผู้ซื้อ → preview → ออก+PDF) · void/ออกแทน | ฟอร์มผู้ซื้อ step-by-step |
| S9 | **รายงานหน่วย** `.../reports` | แท็บ: P&L · Cash flow · ช่องทางชำระ · ค่าใช้จ่ายตามหมวด · ภาษี (ภ.พ.30) — ทุกแท็บเลือกงวด + export CSV + print stylesheet | ตาราง → การ์ดสรุป + ตารางย่อ |
| S10 | **กระทบยอดรายวัน** `.../reconcile` | เลือกวัน → ตาราง: วิธีชำระ, ยอด POS, ยอดบัญชี, diff (แดงถ้าไม่ตรง) · list ใบขายที่ posting หาย + ปุ่ม re-post · ติ๊ก "ตรวจแล้ว" ต่อวัน | ตารางแคบ 3 คอลัมน์ |
| S11 | **ปิดงวด** `.../periods` | รายการเดือน + สถานะ · หน้างวด: checklist อัตโนมัติ (suspense=0, review=0, กระทบยอดครบ, ไม่มี posting fail) → ปุ่มปิดงวด (confirm 2 ชั้น) · reopen เฉพาะ OWNER | checklist stack |
| S12 | **ตั้งค่าบัญชีหน่วย** `.../settings` | VAT: จด/ไม่จด, ราคารวม/ไม่รวม VAT, เลขผู้เสียภาษี+สาขา+ชื่อที่อยู่หัวใบกำกับ · prefix เลขเอกสาร · mapping override (โครงเดียวกับ S4 + ป้าย "ใช้ค่ากลาง/กำหนดเอง") | ฟอร์ม section แยก |

**รวม 12 หน้าจอ** (4 tenant + 8 unit) — ไม่มีหน้า storefront (ลูกค้าขอใบกำกับผ่านแคชเชียร์ที่จุดขาย; ปุ่ม "ขอใบกำกับเต็มรูป" บนหน้าจ่ายเงินเป็นของโมดูล POS ที่เรียก endpoint #19)

---

## 7. Business Flows

### F1 — Auto posting การขายจาก POS (SALE)

ตัวอย่าง: ร้านอาหาร (จด VAT, ราคา **รวม** VAT) ขาย 535.00 บาท ลูกค้าใช้คูปองลด 35.00 จ่ายจริง 500.00 (เงินสด 300 + PromptPay 200)

```
1. POS ปิดการขาย → เรียก account.postSale({          // payload ตาม _CONVENTIONS 2.4 v2 (D3)
     tenantId, unitId, saleId: "sale_abc", docType: "SALE",
     grandTotal: 50000, vatAmount: 3271,             // POS คำนวณตาม unit.settings.account.* (D9): 50000×7/107 ปัดสตางค์
     discountTotal: 3500, pointDiscount: 0,
     payMethods: [{type:"CASH", amount:30000}, {type:"PROMPTPAY", amount:20000}],
     sourceModule: "RESTAURANT", businessDate,
     idempotencyKey: "PosSale:sale_abc:post"
   })
2. Account resolve mapping (unit override → tenant default → seed):
     Dr 1000 เงินสด                    30000
     Dr 1010 เงินฝากธนาคาร (PromptPay)  20000
     Dr 4800 ส่วนลดจ่าย                 3500
        Cr 4010 รายได้ร้านอาหาร               50229   // 53500 − 3271
        Cr 2200 ภาษีขาย                        3271
   ตรวจ Σdr = Σcr = 53,500 → insert JournalEntry(journal=SALE) + lines ใน tx เดียว
   · pointDiscount > 0 → Dr 2300 แต้มค้างจ่าย (ล้างหนี้แต้มที่ลูกค้าใช้เป็นส่วนลดในบิล — D5)
   · หนี้แต้มฝั่ง earn ไม่อยู่ใน postSale แล้ว (D5 — earn เป็น post-commit outbox ฝั่ง Point,
     POS ไม่รู้ยอดแต้ม ณ เวลา postSale): Point ยิง posting ตั้งหนี้แต้ม Dr 6600 / Cr 2300
     เมื่อ earn สำเร็จ — ดู §8.1
3. จองเลข JV จาก DocSequence (upsert+increment ใน tx) → docNo
4. unit จด VAT → ออก TaxInvoice ABB อัตโนมัติ (TXA-...) ผูก saleRefId → POS แนบเลขลงใบเสร็จ
5. คืน { journalId, abbInvoiceNo } ให้ POS (D3 — POS เก็บลง PosSale.abbInvoiceNo แปะใบเสร็จ)
```

**Failure paths**
- mapping key ไหนหาไม่เจอ → บรรทัดนั้นลง `SUSPENSE (9999)` + `needsReview=true` — **การขายไม่ fail**
- `date` ตกงวดปิด → post วันแรกของงวดเปิดถัดไป + needsReview + memo บอกวันจริง
- idempotencyKey ซ้ำ (POS retry) → คืน entry เดิม ไม่สร้างซ้ำ (HTTP-เทียบเท่า 200 เดิม)
- DB error → POS เก็บ posting เข้า retry queue — การขายสำเร็จเสมอ, reconcile (F8) เป็นตาข่ายจับรายการหล่น

#### F1.1 — payMethod `DEPOSIT` = ล้างภาระมัดจำ (D2 — v1 cash-basis, facade จัดการเอง POS ไม่ต้องรู้)

วิธี treat มัดจำใน v1 (cash-basis — รับรู้เมื่อเงินเข้า):

1. **ตอนรับมัดจำ**: บิลมัดจำจากต้นทาง (Hotel/Booking) เป็น sale ปกติ → `postSale` ปกติ: Dr เงิน / Cr รายได้ตาม sourceModule / Cr ภาษีขาย — **รายได้+VAT รับรู้ทันทีที่รับเงินมัดจำ** (ใบกำกับออก ณ ตอนรับเงิน ถูกต้องตามสรรพากร) · v1 ไม่ตั้งบัญชี unearned revenue แยก — accrual เต็มรูป (ตั้ง liability "เงินมัดจำรับล่วงหน้า") = 🔜
2. **ตอน settle**: บิล settle มี lines เต็ม + `payMethods: [{type:'DEPOSIT', amount, refSaleId}, ...]` — DEPOSIT เป็น "วิธีชำระ" ไม่ใช่ line จึง**ไม่กระทบฐาน VAT ของบิล settle** (POS ส่ง vatAmount จากยอดเต็มของบิล — D2)
3. **facade ล้างภาระมัดจำเอง**: ยอด DEPOSIT ถูกโพสต์ฝั่ง Dr แยก 2 ส่วนตามอัตรา/โหมด VAT ของบิลมัดจำเดิม (อ่านจาก `refSaleId`):
   - `Dr รายได้ (key ตาม sourceModule — contra)` = ส่วนฐานของมัดจำ → กลับรายได้ที่รับรู้ไปแล้วตอนรับมัดจำ **กันรับรู้รายได้ซ้ำ**
   - `Dr 2200 ภาษีขาย` = ส่วน VAT ของมัดจำ → กลับ VAT ที่ตั้งหนี้ไว้แล้วตอนรับมัดจำ **กันนำส่ง VAT ซ้ำ**
   - ผลสุทธิของบิลมัดจำ + บิล settle: รายได้และ VAT รวม = เท่ายอดธุรกรรมจริงพอดี ไม่ซ้ำ ไม่ขาด
4. ตัวอย่าง: มัดจำ 1,000.00 (VAT 65.42) → settle 5,000.00 (VAT 327.10, จ่าย DEPOSIT 1,000 + CASH 4,000):
   `Dr 1000 เงินสด 400000 · Dr 4020 รายได้ห้องพัก (contra มัดจำ) 93458 · Dr 2200 ภาษีขาย 6542
    / Cr 4020 รายได้ห้องพัก 467290 · Cr 2200 ภาษีขาย 32710` — Σdr = Σcr = 500000 ✓ · VAT สุทธิสองบิล = 32710 ✓
5. Validation ฝั่ง Account: `refSaleId` ต้องเป็นบิลที่ post แล้วของ unit เดียวกัน · Σ ยอด DEPOSIT ที่อ้างบิลมัดจำใบเดียว ≤ ยอดบิลมัดจำ (POS ตรวจชั้นแรก, Account ตรวจซ้ำ) · **แต้มไม่ earn ซ้ำเป็นหน้าที่ POS** (earn base ไม่รวม DEPOSIT/ROOM_CHARGE — D2)

### F2 — Refund / Void จาก POS

- POS เรียก `account.postRefund({tenantId, unitId, saleId: refundSaleId, docType: 'REFUND', grandTotal: <ยอดคืน>, vatAmount, discountTotal, pointDiscount, payMethods, sourceModule, businessDate, idempotencyKey: "PosSale:{refundSaleId}:post"})` — payload โครงเดียวกับ postSale (`_CONVENTIONS` 2.4 v2)
- `account.postVoid({...docType: 'VOID', saleId: <ใบเดิม>, ...})` — void ทั้งใบ: Account สร้าง entry กลับด้าน debit/credit ของใบเดิมเองทั้งก้อน (journal REVERSAL) — **POS ไม่ส่ง lines/ไม่รู้ account code (D3)**
- ลงกลับฝั่ง: Dr รายได้ + Dr ภาษีขาย / Cr เงินสด·ธนาคาร · pointDiscount → Cr 2300 (ตั้งหนี้แต้มคืน — Point คืนแต้มให้ลูกค้าผ่าน `point.reverse` ฝั่ง 09)
- refund บางส่วนหลายครั้งได้ — idempotencyKey ต่อ refund ไม่ใช่ต่อ sale
- ทั้งคู่คืน `{journalId, abbInvoiceNo?}`
- ใบขายมี FULL invoice แล้ว → แจ้งเตือนใน UI ให้ void/ออกใบกำกับใหม่ (v1 ไม่ auto — ใบเพิ่ม/ลดหนี้ 🔜)

### F3 — บันทึกรายจ่าย

```
1. Staff เปิด S7 → ถ่ายรูปใบเสร็จ → upload (#17) → กรอกฟอร์ม
2. ติ๊ก "มีใบกำกับภาษี" → ระบบเสนอ vatAmount = amount×7/107 (แก้มือได้) + บังคับ vendorTaxId
3. POST #14 → tx เดียว: สร้าง Expense + จองเลข EXP + post journal:
     Dr 6400 วัตถุดิบ 100000  Dr 1150 ภาษีซื้อ 7000 / Cr 1000 เงินสด 107000
4. Failure: งวดปิด → reject 422 บอก "งวดนี้ปิดแล้ว เลือกวันที่ในงวดเปิด"
   · vatAmount > 0 แต่ hasTaxInvoice=false → reject
5. Void (#16): เหตุผลบังคับ → reversal entry + Expense.status=VOIDED (ห้ามในงวดปิด)
```

### F4 — ออกใบกำกับภาษีเต็มรูป

```
1. ลูกค้าขอที่จุดขาย → แคชเชียร์ค้นใบขาย (วันนี้/เลขใบเสร็จ) ใน S8 หรือปุ่มบนหน้า POS
2. กรอกผู้ซื้อ: ชื่อ, เลขผู้เสียภาษี (validate 13 หลัก + checksum), สนญ./สาขา, ที่อยู่
3. ระบบ: void ABB ใบเดิมของ sale นั้น (สถานะ VOIDED, เหตุผล "ออกเต็มรูปแทน")
   → สร้าง FULL (TXF-...) snapshot รายการ+ยอดจากใบขาย → PDF → พิมพ์/ส่งอีเมล
4. กติกา: 1 ใบขาย = FULL ได้ 1 ใบ (ใบ ISSUED) · ออกซ้ำ → 409 ชี้ไปใบเดิม
   · ข้ามเดือนหลังปิดงวด → ออกได้ (issueDate = วันนี้, ไม่แตะ ledger — ใบกำกับไม่สร้าง entry ใหม่
     เพราะรายได้/ภาษีขาย post ไปแล้วตอน SALE) แต่แจ้งเตือนว่ายอด VAT report เดือนก่อน ยึดตามใบขาย
5. Void FULL (#20): เหตุผลบังคับ → เลือกออกใบแทน (replacesId) หรือจบ
```

### F5 — ปิดงวด

```
1. Owner เปิด S11 เลือกเดือน → ระบบรัน pre-close checklist:
   ✓ ยอดคงเหลือ 9999 พักรายการ = 0   ✓ ไม่มี entry needsReview ค้าง
   ✓ กระทบยอดครบทุกวันที่มีการขาย     ✓ ไม่มี sale posting fail ค้างใน queue
2. ผ่านครบ → ปุ่มปิดงวด (confirm พิมพ์ชื่อเดือน) → AccountingPeriod=CLOSED + audit log
   ไม่ผ่าน → list รายการค้างพร้อมลิงก์ไปแก้ · OWNER force ได้ (บันทึกเหตุผล)
3. หลังปิด: post/void/reverse ที่ date ในงวด → reject 423 ทุกช่องทาง (รวม auto จาก POS — เข้ากติกาเลื่อนงวด F1)
4. Reopen (OWNER + เหตุผล) → audit + แจ้งเตือนใน S1
```

### F6 — กลับรายการ (reversal)

```
1. จาก S6 detail → "กลับรายการ" + เหตุผล
2. สร้าง entry ใหม่ journal=REVERSAL, reversalOfId=เดิม, lines สลับ dr/cr ทุกบรรทัด,
   date = วันนี้ (ถ้างวดของ entry เดิมยังเปิดจะเลือกใช้วันที่เดิมได้)
3. entry เดิม → status=REVERSED (ข้อมูลอยู่ครบ) · reversal ซ้ำ / reverse ตัว REVERSAL → reject
```

### F7 — ภาษีรายเดือน (เตรียม ภ.พ.30)

```
1. ต้นเดือน Owner เปิด S9 แท็บภาษี เลือกเดือนก่อน
2. ระบบสรุป: ยอดขาย (ฐาน VAT จากใบขาย/ABB/FULL ที่ ISSUED), ภาษีขาย (2200 movement),
   ยอดซื้อที่มีใบกำกับ + ภาษีซื้อ (1150 movement), สุทธิ = ชำระ/ขอคืน
3. Export CSV แนบสำเนา → กรอกยื่นเอง/ส่งนักบัญชี — v1 ไม่ยื่นออนไลน์ให้ (🔜 e-filing)
```

### F8 — กระทบยอดรายวัน

```
1. ปิดร้าน → Manager เปิด S10 (หรือเช้าวันถัดไป) — default = เมื่อวาน
2. ระบบ query: Σ PosSale (POS) ต่อ payMethod vs Σ JournalLine ฝั่ง Dr บัญชีเงิน (SALE−REFUND) วันเดียวกัน
3. ตรง → ติ๊ก "ตรวจแล้ว" (เก็บสถานะรายวัน ใช้ใน pre-close)
4. ไม่ตรง → โชว์ diff + ใบขายที่ไม่มี entry (จับคู่ refId) → ปุ่ม re-post (#26, idempotent)
   diff จากเหตุอื่น (เงินสดหาย) → บันทึก ADJUST โดย OWNER
```

---

## 8. Integration (contract `_CONVENTIONS` ข้อ 2)

### 8.1 ฝั่งรับ — Account เป็น **ผู้รับ posting รายเดียว** (contract 2.4)

**Facade signature (D3 — `_CONVENTIONS` 2.4 v2, ช่องทางเดียวที่โมดูลอื่นเรียกได้):**

```
account.postSale / postRefund / postVoid ({ tenantId, unitId, saleId, docType, grandTotal, vatAmount,
  discountTotal, pointDiscount, payMethods[], sourceModule, businessDate, idempotencyKey })
→ { journalId, abbInvoiceNo }   // POS เก็บ abbInvoiceNo ลง PosSale.abbInvoiceNo แปะใบเสร็จ
```

โมดูลอื่น **ห้ามรู้จัก account code** (D3) — mapping ทั้งหมดอยู่ฝั่ง Account: facade resolve mapping ภายใน แล้วค่อยเรียก `account.post` จริง · `account.post` (raw lines) = **internal ของโมดูล Account เท่านั้น**

| ผู้เรียก | Function | เมื่อไหร่ |
|---|---|---|
| **POS** (จุดตัดเงินเดียว — Hotel/Restaurant/Booking/Ticket ชำระผ่าน POS ตาม contract 2.1 จึง **ไม่ยิง posting ตรง**) | `account.postSale` | ปิดการขายทุกใบ — `sourceModule` เลือก key รายได้ (`INCOME_POS/RESTAURANT/HOTEL/BOOKING/TICKET`) · payMethod `DEPOSIT` → facade ล้างภาระมัดจำเอง (F1.1 — D2) · `pointDiscount` → Dr 2300 |
| **POS** | `account.postRefund` | คืนเงิน (เอกสาร REFUND ใหม่) |
| **POS** | `account.postVoid` | void ทั้งใบ — Account กลับ entry เดิมทั้งก้อนเอง (journal REVERSAL) |
| **POS** | `account.postPaymentFee({feeSatang, payType})` 🔜 | บันทึกค่าธรรมเนียมบัตร/gateway อัตโนมัติ |
| **Point/Reward** | `account.postPointBurn({memberId, points, valueSatang, unitId, refId})` | แลกแต้ม/รางวัลหน้างาน: Dr 2300 / Cr 6600 (ลดหนี้แต้ม) · แต้มหมดอายุ → Cr 4900 🔜 |
| **Point** | posting ตั้งหนี้แต้มตอน earn สำเร็จ (Dr 6600 / Cr 2300 — idempotent ต่อ ledger entry ฝั่ง 09) | ย้ายจาก postSale มาเป็นหน้าที่ Point เพราะ earn เป็น post-commit outbox (D5) — POS ไม่รู้ยอดแต้ม ณ เวลา postSale |
| **Account เอง** | `account.post` (raw) | Expense (F3), manual ADJUST, reversal |

กติกาฝั่งรับ (ทุก facade):
1. `idempotencyKey` บังคับสำหรับ AUTO — ซ้ำ = คืนผลเดิม
2. Σdebit = Σcredit ไม่ตรง → reject (bug ฝั่งผู้เรียก — log + alert, ห้ามลงบางส่วน)
3. mapping ขาด → SUSPENSE + needsReview (ไม่ block ธุรกรรมต้นทาง)
4. งวดปิด → เลื่อนวันแรกของงวดเปิดถัดไป + needsReview (AUTO) / reject 423 (MANUAL)
5. posting fail ทั้งก้อน → ผู้เรียกเก็บเข้า retry queue ของตัวเอง — ธุรกรรมเงินต้นทางสำเร็จเสมอ, reconcile เป็นตาข่าย

### 8.2 ฝั่งเรียกออก

| เรียกไป | ใช้ทำอะไร |
|---|---|
| **POS** `pos.getDailySales({unitId, date})` + `pos.getSale(saleId)` | reconcile F8 · ดึงรายการใบขายมาออก FULL invoice F4 (Account อ่านผ่าน service ไม่แตะตาราง POS ตรง) |
| **Point** `point.getValuation()` / liability balance | ตรวจกระทบยอดหนี้แต้ม (2300 vs Point ledger) ในรายงาน |
| **Notification** (contract 2.5) `notify()` | ส่ง PDF ใบกำกับเต็มรูปเข้าอีเมลลูกค้า · แจ้ง Owner: ปิดงวดสำเร็จ, reconcile diff เกิน threshold, suspense ค้าง |
| **Member** (contract 2.6) | FULL invoice เก็บ buyer เป็น **snapshot** (เอกสาร freeze — ข้อยกเว้นที่ contract อนุญาต) · เสนอ autofill จาก memberId ถ้าเคยออก |
| **AuditLog กลาง** | ทุก action ที่แตะเงิน (§3.8) |

### 8.3 สิ่งที่โมดูลอื่นต้องเตรียม (assumption ข้ามโมดูล — ต้อง sync กับสเปค 14-pos / 09-point)

1. `PosSale` (POS) ต้องมี: `vatAmount` ที่คำนวณตาม `unit.settings.account.*` (source of truth เดียว — D9), `pointDiscount`, `payMethods[]`, และ field `abbInvoiceNo String?` เก็บเลขที่ Account คืนให้ (D3)
2. POS ต้องมี retry queue สำหรับ posting ที่ fail + ปุ่มขอใบกำกับเต็มรูปบนหน้าปิดการขาย (เรียก endpoint #19)
3. Point ต้องให้ `valueSatang/point` (อัตราตีมูลค่าแต้ม) — ถ้าไม่ตั้ง Account จะข้ามบรรทัดแต้ม และรายงานหนี้แต้มจะอ่านจาก Point ledger แทน (ระบุหมายเหตุในรายงาน)

---

## 9. Permissions (`can(user, {tenantId, unitId, module: 'ACCOUNT', action})` — module key UPPERCASE, ทุก action มี module prefix `account.*` ตาม D17)

| action | OWNER | MANAGER (unit ตน) | STAFF | หมายเหตุ |
|---|---|---|---|---|
| `account.view` (ledger/รายงาน unit) | ✅ ทุกหน่วย | ✅ | ❌ (custom ให้ได้) | |
| `account.viewConsolidated` (S1/S2) | ✅ | ✅ เห็นเฉพาะหน่วยใน unitAccess | ❌ | คอลัมน์หน่วยอื่นถูกกรองที่ query |
| `account.chart.manage` (ผังบัญชี) | ✅ | ❌ | ❌ | tenant-level กระทบทุกหน่วย |
| `account.mapping.manageTenant` | ✅ | ❌ | ❌ | |
| `account.mapping.manageUnit` | ✅ | ✅ | ❌ | override หน่วยตน |
| `account.expense.create` | ✅ | ✅ | ✅ (ถ้าเปิดใน permissions) | STAFF สร้างได้ void ไม่ได้ |
| `account.expense.void` | ✅ | ✅ | ❌ | |
| `account.invoice.issue` (FULL) | ✅ | ✅ | ✅ (แคชเชียร์) | ABB ออก auto โดยระบบ |
| `account.invoice.void` | ✅ | ✅ | ❌ | |
| `account.journal.adjust` (manual) | ✅ | ❌ | ❌ | แตะบัญชีตรง — Owner เท่านั้น |
| `account.journal.reverse` | ✅ | ✅ | ❌ | |
| `account.reconcile` | ✅ | ✅ | ❌ | |
| `account.period.close` / `reopen` | ✅ | ❌ | ❌ | reopen = OWNER + เหตุผล |
| `account.export` | ✅ | ✅ (หน่วยตน) | ❌ | |
| `account.settings.unit` (S12) | ✅ | ✅ | ❌ | เปลี่ยน vatRegistered มีผลไปหน้า (ไม่ย้อน) |

- ทุก action เขียน → AuditLog · ทุก endpoint unit-scoped ผ่าน middleware `unitId ∈ tenant` ก่อน `can()`

---

## 10. Reports & Metrics

### 10.1 งบกำไรขาดทุน (P&L) รายเดือน — ต่อ unit + consolidated

```
รายได้ (INCOME 4xxx ยกเว้น 4800)            xxx
หัก ส่วนลดจ่าย (4800)                       (xxx)
รายได้สุทธิ                                  xxx
หัก ต้นทุนขาย (COGS 5xxx)                   (xxx)
กำไรขั้นต้น                                  xxx    ← เจ้าของร้านเข้าใจ "กำไรก่อนหักค่าใช้จ่ายร้าน"
หัก ค่าใช้จ่าย (EXPENSE 6xxx รายหมวด)        (xxx)
กำไรสุทธิ (ก่อนภาษีเงินได้)                   xxx
```
- consolidated: แถวเดียวกัน คอลัมน์ต่อ unit + รวม (aggregate จาก `JournalLine` group by `unitId, accountId` — ผังร่วม tenant ทำให้บรรทัดตรงกันเสมอ)
- เทียบเดือนก่อน (Δ%) · กราฟ 12 เดือน

### 10.2 Cash flow summary
เงินเข้า−ออกจริงตามบัญชีกลุ่มเงิน (1000/1010/1030): แยกตามวิธีชำระ + หมวดจ่ายใหญ่, รายวัน/รายเดือน + ยอดคงเหลือสะสมโดยประมาณ (หมายเหตุ: ไม่ใช่ยอดเงินธนาคารจริงจนกว่าจะมี bank feed 🔜)

### 10.3 ยอดขายตามช่องทางชำระ
เงินสด/โอน/PromptPay/มัดจำ (DEPOSIT)/บัตร 🔜/voucher 🔜 (D4) — ยอด + จำนวนบิล + % · ใช้คู่หน้า reconcile

### 10.4 ภาษีรายเดือน (เตรียม ภ.พ.30)
ยอดขายที่มี VAT (ฐานภาษี), ภาษีขาย, ยอดซื้อที่มีใบกำกับ, ภาษีซื้อ, **สุทธิชำระ/ขอคืน** + รายการใบกำกับขาย (ISSUED/VOIDED) และรายจ่ายที่มีภาษีซื้อประกอบ — export CSV

### 10.5 อื่นๆ
- ค่าใช้จ่ายตามหมวด (top หมวด + เทียบเดือนก่อน)
- หนี้แต้มคงค้าง: ยอด 2300 + เทียบ Point ledger (ต่างเกิน threshold → เตือน)
- Metrics ป้อน Dashboard Overview (การ์ด KPI ต่อหน่วยใน BLUEPRINT_BUSINESS_UNITS §4): รายได้วันนี้, กำไรเดือนนี้ (สะสม), รายการรอตรวจ

### 10.6 Export
- CSV ทุกรายงาน + สมุดรายวันเต็มงวด (คอลัมน์: docNo, date, journal, accountCode, accountName, debit, credit, memo, refType, refId) — UTF-8 BOM · แปลงสตางค์เป็นบาททศนิยม 2 ตำแหน่งเฉพาะตอน export
- PDF: ใบกำกับภาษี ✅ · รายงาน PDF 🔜 (v1 print stylesheet)

---

## 11. Edge Cases & Rules

1. **ปัดเศษ VAT**: คำนวณระดับ **เอกสาร** (ไม่ใช่ต่อบรรทัด) ปัดครึ่งขึ้นเป็นสตางค์ — ราคารวม VAT: `vat = round(paid × 7/107)` · ไม่รวม: `vat = round(subtotal × 0.07)` · เศษที่ทำให้ Σdr≠Σcr ห้ามเกิด — ฝั่งคำนวณ (POS) ต้องส่งยอดที่ balance แล้ว, Account ตรวจซ้ำและ reject ถ้าไม่ balance
2. **เลขเอกสารแข่งกัน (race)**: จองเลขผ่าน `DocSequence` upsert + `lastNo++` ใน transaction เดียวกับ insert เอกสาร (row lock) — ห้าม gen เลขนอก tx · เลขที่ void แล้ว **ไม่ reuse**
3. **Idempotency**: `@@unique([tenantId, idempotencyKey])` — retry ชนแล้วอ่าน entry เดิมคืน · refund หลายครั้งของ sale เดียว = คนละ key (`REFUND:{refundId}`)
4. **Immutability บังคับจริง**: ไม่มี code path UPDATE JournalEntry/JournalLine หลัง insert (ยกเว้น `status→REVERSED`, `needsReview→false`) — เพิ่ม DB trigger/policy กัน UPDATE ฝั่ง SQL ตรงด้วย
5. **Timezone / business date**: `periodKey` และวันใน reconcile คิดจาก `unit.settings.timezone` (default Asia/Bangkok) — ขายตอน 23:59 ต้องอยู่วัน/งวดเดียวกับใบเสร็จ POS (ใช้กติกาเดียวกัน 2 โมดูล)
6. **งวดปิดกับรายการอัตโนมัติ**: AUTO เลื่อนเข้างวดเปิดถัดไป + needsReview (ห้าม block การขาย/ห้ามเงียบ) · MANUAL reject ตรงๆ — และ **reversal ของ entry ในงวดปิด** ให้ลง date งวดปัจจุบัน (ไม่แก้ตัวเลขงวดที่ปิดแล้ว)
7. **Suspense ต้องเป็นศูนย์ก่อนปิดงวด**: การเคลียร์ = reverse entry ที่ลง suspense แล้ว post ใหม่ให้ถูกบัญชี (ผ่านปุ่ม "แก้รายการ" ใน S6 ที่ทำ 2 ขั้นให้อัตโนมัติ)
8. **Voucher ≠ รายได้ตอนรับชำระ** (🔜 — payMethod VOUCHER ตัดออกจาก v1 ตาม D4, เปิดพร้อมระบบขาย gift voucher): จ่ายด้วย voucher → Dr 2310 (ตัดหนี้) ไม่ใช่เงินเข้า — ยอดขายเงินสดใน cash flow จะน้อยกว่ายอดขายรวม เป็นเรื่องถูกต้อง (UI อธิบาย) · **มัดจำ (DEPOSIT) v1**: ล้างภาระด้วยการกลับรายได้+VAT ตาม F1.1 — ไม่ผ่าน 2310
9. **AccountMapping unitId = NULL ซ้ำได้ใน Postgres**: `@@unique([tenantId, unitId, key])` ไม่กันแถว default ซ้ำ — service ต้อง upsert ผ่าน `findFirst({unitId: null, key})` + tx, และมี cleanup ตรวจซ้ำใน healthcheck
10. **เปลี่ยน mapping ไม่ย้อนหลัง**: มีผลเฉพาะ posting ใหม่ — รายงานย้อนหลังไม่เปลี่ยน (entry เก็บ accountId จริง ไม่ resolve ใหม่)
11. **เปลี่ยน vatRegistered กลางเดือน**: มีผลไปหน้า — ใบขายเก่าไม่ถูกคำนวณใหม่ · เตือนใน S12 ว่ากระทบรายงานภาษีเดือนนั้น (ยอดครึ่งเดือน)
12. **FULL invoice ข้ามเดือน**: ออกได้ (สิทธิ์ลูกค้า) — ไม่สร้าง entry ใหม่ (ภาษีขาย post แล้วตอน SALE) · ระวังตีความ: VAT report ยึด **วันที่ขาย** เป็นหลักใน v1 และแสดงหมายเหตุใบ FULL ที่ออกข้ามงวด
13. **ลบ/archive บัญชีที่มี movement**: ห้าม archive ถ้ามี movement ในงวดที่ยังเปิด หรือถูกใช้ใน mapping ใดๆ (ต้องย้าย mapping ก่อน)
14. **หน่วย PAUSED/ARCHIVED**: ledger อ่านได้เสมอ (read-only เมื่อ ARCHIVED) — consolidated ยังรวมข้อมูลย้อนหลังของหน่วยนั้น
15. **จำนวนเงินติดลบ**: ห้ามทุกที่ — เอกสารกลับทิศใช้ REFUND/REVERSAL เท่านั้น (debit/credit ≥ 0)
16. **STAFF เห็นเงิน**: STAFF ที่มีแค่ expense.create มองไม่เห็น ledger/รายงาน — ฟอร์มรายจ่ายเป็นหน้าที่เข้าถึงได้หน้าเดียว
17. **เลขผู้เสียภาษี**: validate 13 หลัก + checksum (mod 11) ทั้งฝั่งผู้ซื้อ (FULL) และผู้ขาย (expense ที่มีใบกำกับ) — ผิด format ห้ามบันทึก

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional — ledger**
- [ ] posting SALE/REFUND/EXPENSE/ADJUST/REVERSAL: ทุก entry Σdebit=Σcredit (unit test ครอบทุก facade + property test ยอดสุ่ม)
- [ ] ตัวอย่าง F1 ลงบัญชีตรงตามตาราง (รวมส่วนลด, VAT include/exclude, pointDiscount → Dr 2300, จ่ายผสม 2 วิธี)
- [ ] payMethod DEPOSIT (F1.1 — D2): บิลมัดจำ + บิล settle → รายได้/VAT สุทธิไม่ซ้ำไม่ขาด (ตัวอย่าง 1,000/5,000 ตรงเป๊ะ) · หักเกินมูลค่ามัดจำถูก reject
- [ ] idempotency: ยิง postSale ซ้ำ key เดิม 10 ครั้งขนาน → entry เดียว + คืน `{journalId, abbInvoiceNo}` เดิม
- [ ] เลขเอกสาร: ยิงสร้าง 100 เอกสารพร้อมกัน → เลขไม่ซ้ำ ไม่ข้าม (ต่อ unit ต่อ docType)
- [ ] immutability: ไม่มี endpoint/query แก้ entry ที่ post แล้ว · reversal กลับยอดถูกทุกบรรทัด · reverse ซ้ำ → 409
- [ ] mapping ขาด → ลง suspense + needsReview + การขายไม่ fail · เคลียร์ suspense แล้วปิดงวดได้

**Functional — ภาษี/เอกสาร**
- [ ] ABB ออกอัตโนมัติเฉพาะ unit ที่ vatRegistered · unit ไม่จด VAT ไม่มีบรรทัดภาษีและซ่อน UI ใบกำกับ
- [ ] FULL: validate เลขผู้เสียภาษี checksum, 1 sale = 1 FULL, void ABB เดิมอัตโนมัติ, PDF ฟิลด์ครบตามข้อกำหนดสรรพากร
- [ ] VAT ปัดเศษ: เคส 100.00/107.00/999.99 (include) และ exclude — ตรงสูตร §11.1
- [ ] ภ.พ.30 report: ภาษีขาย = movement 2200, ภาษีซื้อ = movement 1150, ใบ VOIDED ไม่ถูกนับ

**Functional — งวด/reconcile/รายงาน**
- [ ] ปิดงวดแล้ว: manual → 423 · auto → เลื่อนงวด + needsReview · reopen ได้เฉพาะ OWNER + audit
- [ ] pre-close checklist บล็อกเมื่อ suspense ≠ 0 / review ค้าง / reconcile ไม่ครบ · force ได้เฉพาะ OWNER
- [ ] reconcile จับใบขายที่ posting หาย (ลบ entry จำลอง) → re-post แล้ว diff = 0
- [ ] P&L unit + consolidated: ยอดรวมทุกคอลัมน์ = ผลรวมหน่วย · เดือนไม่มีข้อมูล → empty state ไม่ error
- [ ] Export CSV เปิดใน Excel ภาษาไทยไม่เพี้ยน (UTF-8 BOM) ยอดบาททศนิยม 2 ตำแหน่ง

**Isolation & RBAC**
- [ ] tenant A มองไม่เห็นทุกอย่างของ tenant B (ทดสอบทุก endpoint ด้วย id ข้าม tenant → 404)
- [ ] MANAGER หน่วย A: เรียก endpoint หน่วย B → 403 · consolidated เห็นเฉพาะคอลัมน์หน่วยตน
- [ ] STAFF (expense.create อย่างเดียว): เข้ารายงาน/journal → 403, UI ซ่อนเมนู
- [ ] unit-scoped query ทุกจุดมี unitId (dev-guard Prisma extension ไม่ throw ใน test suite ปกติ — ยกเว้นรายงาน consolidated ที่ใช้ `crossUnit: true`)

**คุณภาพร่วม (`_CONVENTIONS` ข้อ 5)**
- [ ] AuditLog ครบทุก action เขียน (post/void/reverse/close/reopen/แก้ผัง/mapping) พร้อม before/after
- [ ] i18n TH/EN ครบทุกหน้า/อีเมล/ PDF (PDF ใบกำกับ = ไทยเป็นหลักตามกฎหมาย) · B&W minimal · mobile: S7 flow ถ่ายรูป→บันทึก ≤ 30 วิ
- [ ] empty/loading/error state ครบ 12 หน้าจอ · เงินแสดงผลจากสตางค์ถูกต้อง (ไม่มี float ใน pipeline)
- [ ] Rate limit endpoint เขียน + PDF gen · รูปใบเสร็จเข้า object storage ไม่ลง DB
