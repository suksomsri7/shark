# QC5 — Account Ledger Audit (สายที่ 2: double-entry / posting rules / state machines / งบการเงิน)

> ตรวจ: `docs/modules/12-account.md` (ฉบับเขียนใหม่ 2026-07-11, 1165 บรรทัด) เทียบ `docs/modules/_CONVENTIONS.md`
> วิธี: ไล่ posting rule ครบ 22 docType · ไล่ state machine ทุกชนิด · **บวกเลขทุกตัวอย่างซ้ำด้วยมือ** · ตรวจ derivation งบ 4 ตัว · cross-check ผังบัญชี seed ↔ mapping keys ↔ posting rules ↔ เมนู ↔ enum
> วันที่ตรวจ: 2026-07-11 · ผู้ตรวจ: QC สายที่ 2 (ความถูกต้องบัญชี)

---

## 0. ผลตรวจเลขตัวอย่าง (บวกซ้ำด้วยมือทุกตัว)

| จุด | การตรวจ | ผล |
|---|---|---|
| F2 มัดจำ — รับเงิน | 1,070 รวม VAT → ฐาน 1,000 + VAT 70 · Dr 1010 107,000 สต. = Cr 2110 100,000 + Cr 2200 7,000 | ✅ balance |
| F2 มัดจำ — ใบแจ้งหนี้ | 5,350 − หักมัดจำ 1,070 = grandTotal 4,280 ✓ · Dr 428,000 + 100,000 = 528,000 = Cr 500,000 + 28,000 ✓ (สเปคเขียน "Σ 528000 = 528000 ✓" ถูกต้อง) | ✅ |
| F2 มัดจำ — VAT รวม | ใบกำกับมัดจำ 70 + ใบกำกับ IV 280 = 350 = 7% ของ 5,000 ✓ · ฐานรวม 1,000+4,000 = 5,000 ✓ | ✅ ไม่ซ้ำไม่ขาด |
| F5 WHT | 10,000 + VAT 700 = 10,700 · WHT 5%×10,000 = 500 · จ่ายจริง 10,700−500 = 10,200 ✓ · issue: Dr 1,000,000+70,000 = Cr 1,070,000 ✓ · จ่าย: Dr 1,070,000 = Cr 1,020,000+50,000 ✓ | ✅ balance ทั้งสอง entry |
| F1 pipeline ขาย | **ไม่มีตัวเลขตัวอย่างใน F1** (เป็นสูตร symbolic) — ตัวเลข "Σ53,500" ที่โจทย์ตรวจอ้างถึงไม่ปรากฏในสเปค · สูตร Dr 1100 (grandTotal) = Cr รายได้ (subTotal−discount) + Cr 2200 (vatAmount) balance เมื่อไม่มีมัดจำ/ไม่แยกบรรทัดส่วนลด — **แต่ option Dr 4800 ทำ Dr≠Cr → C1** และกรณีหักมัดจำ → C2 | ⚠️ ดู C1/C2 |
| F8 ค่าเสื่อม | `(cost−salvage)/usefulLifeMonths` + เดือนสุดท้ายเก็บเศษ → Σ ค่าเสื่อมสะสม = cost−salvage พอดี ✓ · salvage default 100 สต. = 1 บาท ตรงคอมเมนต์ "ซาก ≥ 1 บาท" ✓ | ✅ |
| ตัวนับในสเปค | docType 22 ชนิด (enum = ตาราง §3.0.1 = 22) ✓ · "สรุป 20 models" นับจริง = 20 ✓ · ตาราง phasing P1(15)+P2(2)+P3(2)+P4(1) = 20 ✓ · whtRateBp 300 = 3% ✓ · vatRateBp 700 = 7% ✓ | ✅ |

**สรุป: ไม่พบเลขผิดในตัวอย่างที่มีตัวเลขจริง** — CRITICAL ที่พบมาจาก posting rule ที่เขียนไว้ทำให้ Dr≠Cr เมื่อทำตามตัวอักษร ไม่ใช่จากการบวกเลขผิด

---

## 1. ตาราง Findings

### CRITICAL (Dr≠Cr / งบเพี้ยนถ้าทำตามสเปคตรงตัว)

| ID | ระดับ | ประเด็น | จุดในสเปค | ข้อเสนอแก้ |
|---|---|---|---|---|
| C1 | CRITICAL | **Option "แยกบรรทัดส่วนลด" ทำ Dr≠Cr เท่ายอดส่วนลด**: F1 ขั้น 4 เขียน `Dr 1100 (grandTotal) / Cr รายได้ (subTotal − discount) + Cr 2200 (vatAmount) [+ Dr 4800 ส่วนลดจ่าย ถ้าแยกบรรทัดส่วนลด]` — ถ้าเพิ่ม Dr 4800 (discount) โดย Cr รายได้ยังตรึงที่ (subTotal−discount) ตามที่เขียน → Dr = net+vat+discount, Cr = net+vat → **ไม่ balance** · §7.10 แถว INVOICE issue เขียนแบบเดียวกัน `Dr 1100 (+4800)` | §7.7 F1 ขั้น 4 · §7.10 แถว 1 | ระบุชัด: เมื่อแยกบรรทัดส่วนลด (Dr 4800) → **Cr รายได้ต้องเป็นยอด gross (subTotal ก่อนหักส่วนลดท้ายบิล)** ให้ Dr 1100 + Dr 4800 = Cr รายได้ gross + Cr VAT · เพิ่ม property test ทั้งสองโหมด |
| C2 | CRITICAL | **Posting ใบแจ้งหนี้ที่หักมัดจำ — rule ทั่วไปประกอบกันแล้วไม่ balance (เพี้ยน = VAT ของมัดจำ)**: ตัวอย่าง F2 ถูกต้อง (528,000=528,000) แต่ rule เชิงบรรทัดฐานคือ F1 ขั้น 4 (`Cr 2200 = vatAmount`) + §7.10 แถว "IV หักมัดจำ" (`Dr 2110 ฐานมัดจำ`) — ถ้า engine ทำตาม: Dr 428,000+100,000 = 528,000 vs Cr 500,000+**35,000** = 535,000 → **Dr≠Cr 7,000 (VAT มัดจำโพสต์ซ้ำ)** เพราะไม่มีสูตรบอกว่า Cr 2200 ตอน issue = vatAmount − VAT ของมัดจำที่หัก · ซ้ำด้วยความกำกวมว่า `depositDeducted` เก็บ gross (107,000) หรือฐาน (100,000) และ `vatAmount` = 35,000 หรือ 28,000 (สมการ grandTotal ใช้ได้ทั้งสองคู่) | §7.7 F2 · §7.10 แถว "IV หักมัดจำ" · §4.1 Document (vatAmount/depositDeducted/grandTotal) | นิยามให้ชี้ขาด: (1) `depositDeducted` = ยอด gross ที่หัก, `vatAmount` = VAT เต็มของใบ (2) เพิ่มสูตร posting: `Cr 2200 ตอน issue = vatAmount − Σ(VAT ส่วนของมัดจำที่หัก)` และ `Dr 2110 = Σ(ฐานมัดจำที่หัก)` โดยแตกฐาน/VAT ของแต่ละใบมัดจำตาม vat rate ของใบมัดจำนั้น (3) ระบุว่า DocumentRelation.DEPOSIT_APPLY.amount เก็บ gross |

### MAJOR

| ID | ระดับ | ประเด็น | จุดในสเปค | ข้อเสนอแก้ |
|---|---|---|---|---|
| M1 | MAJOR | **State machine ขาด 9 จาก 22 ชนิด**: §3.0.2 ไม่นิยาม CREDIT_NOTE, DEBIT_NOTE, CREDIT_NOTE_RECEIVED, DEBIT_NOTE_RECEIVED, DEPOSIT_PAYMENT, GOODS_ISSUE, GOODS_ISSUE_RETURN, WHT_CERT, TAX_INVOICE_ABB (บางตัวพอเดา mirror ได้ แต่ QC checklist สั่ง "unit test matrix 22 ชนิด × สถานะ" ทั้งที่ 9 ชนิดไม่มี machine ให้ test) | §3.0.2 vs §3.0.1 (22 ชนิด) · §12 QC ข้อ 1 | เติม machine ทั้ง 9 — อย่างน้อย: CN/DN/CNR/DNR = DRAFT→ISSUED→VOIDED · DEPOSIT_PAYMENT = mirror DEPOSIT_RECEIPT (DRAFT→AWAITING_PAYMENT→AWAITING_DEDUCT→DEDUCTED) · WHT_CERT = ISSUED→VOIDED (ผูก payment void) · GI/GIR = DRAFT→ISSUED→CANCELLED · TXA = ISSUED→VOIDED (ตาม POS) |
| M2 | MAJOR | **ใบลดหนี้ไม่มี cap + ไม่มี settlement path**: ไม่มีกติกา CN ≤ ยอดคงเหลือ/ยอดใบเดิม (edge §11.5 คุมเฉพาะมัดจำ) → CN เกินยอดได้ ลูกหนี้ติดลบ · CN อ้างใบ PAID (คืนของหลังจ่ายครบ): Cr 1100 ทำ AR ติดลบ — สเปคพูดว่า "หักลูกหนี้คงค้างหรือบันทึกคืนเงิน" แต่ไม่มีสถานะ/flow ตามคืนเงิน (AWAITING_REFUND?) · DN ตั้งหนี้เพิ่มแต่แท็บมีแค่ สร้าง/ทั้งหมด — ไม่มีการเก็บเงิน DN (AWAITING_PAYMENT/payment บน DN?) | §3.1 ใบลดหนี้ · §7.7 F4 · §3.0.3 | (1) กติกา: Σ CN ที่อ้างใบเดิม ≤ grandTotal ใบเดิม (ตรวจใน tx) (2) CN แยกสองโหมด: ตัดลูกหนี้คงค้าง (ต้อง ≤ ยอดค้าง) vs คืนเงิน (Cr เงิน + ต้องระบุ FinanceAccount) (3) DN มี AWAITING_PAYMENT→PARTIAL→PAID รับชำระได้เหมือน IV |
| M3 | MAJOR | **PayChannel `CREDIT_APPLY`/`DEPOSIT_APPLY` ไม่มี posting rule — เสี่ยงลดหนี้ซ้ำ**: CN โพสต์ Cr 1100 ตอน issue แล้ว (F4) — ถ้าเอา CN ไป apply เป็น payment (channel CREDIT_APPLY) กับใบแจ้งหนี้อีก จะโพสต์อะไร? ถ้าโพสต์ Cr 1100 อีก = **ลดหนี้ 2 รอบ** ถ้าไม่โพสต์ก็ไม่มีที่ไหนบอก · เช่นกัน DEPOSIT_APPLY เป็น channel มีไว้ทำไมในเมื่อมัดจำหักตอน issue (ลด grandTotal) — สองกลไกซ้อนกันโดยไม่นิยามว่าเส้น payment-channel โพสต์อย่างไร | §4 enum PayChannel · §4.1 DocumentPayment (financeAccountId null ได้เฉพาะ 2 channel นี้) · §7.10 ไม่มีแถว | ระบุ: ทั้งสอง channel **ไม่โพสต์ journal** (ตัวเงินโพสต์แล้วกับ CN issue / deposit issue) — สร้าง DocumentPayment เพื่ออัปเดต paidTotal/สถานะเท่านั้น + relation ADJUST/DEPOSIT_APPLY · หรือถ้าจะให้ DEPOSIT_APPLY หลัง issue โพสต์ Dr 2110 / Cr 1100 ต้องเขียนเป็นแถวใน §7.10 และตัดการหักตอน issue ออกไม่ให้ซ้อน |
| M4 | MAJOR | **`DocumentPayment.entryId @unique` ขัดกับ F3**: F3 สั่ง "journal ก้อนเดียว: Dr เงิน / Cr ลูกหนี้" สำหรับรับชำระใบวางบิลที่กระจายเป็น DocumentPayment หลายแถว (ทีละใบ) — หลายแถวชี้ entry เดียวกันไม่ได้เพราะ entryId เป็น @unique | §4.1 DocumentPayment.entryId · §7.7 F3 ขั้น 2 | เลือกทาง: (ก) ถอด @unique เป็น @@index ให้หลาย payment แชร์ entry เดียว หรือ (ข) โพสต์ entry ต่อ payment (หลายก้อน Σ เท่ายอดโอน) แล้วแก้ F3 — แนะนำ (ก) ตรงเจตนา "ก้อนเดียว" |
| M5 | MAJOR | **`JournalEntry.docNo` unique ชนกับ "AUTO ใช้เลขเอกสารต้นทาง"**: เอกสาร 1 ใบเกิดหลาย entry (issue + payment หลายงวด + reversal) — ถ้าทุก entry ใช้ docNo = เลขเอกสารต้นทาง จะชน `@@unique([systemId, docNo])` ตั้งแต่ payment งวดแรก | §4.6 JournalEntry (docNo comment + unique) | นิยามเลขรัน entry แยกทุก entry (เช่น `JE-{...}` ต่อเล่ม) แล้วเก็บเลขเอกสารต้นทางไว้ที่ refType/refId + memo — หรือ unique เฉพาะ (systemId, docNo, journal) ก็ยังไม่พอสำหรับหลายงวด ต้องใช้เลขรันจริง |
| M6 | MAJOR | **ยอดยกมา (OPENING) ไม่มี posting rule / ไม่มีบัญชีคู่**: มี JournalType OPENING + FinanceAccount.openingBalance + "บันทึกยอดยกมา FinanceAccount" แต่ไม่มีที่ไหนบอกขา Cr คู่ (ทุนยกมา? 3xxx?) — Dr เงินขาเดียวผิด invariant Σdr=Σcr, และถ้าไม่โพสต์เลย statement/งบกระแสเงินสด (ที่ derive จาก JournalLine) จะไม่ตรง openingBalance | §3.5 · §4.4 FinanceAccount · §4 enum JournalType.OPENING · §3.6 งบกระแส "ต้อง reconcile กับยอด FinanceAccount" | เพิ่มแถว §7.10: ตั้งยอดยกมา = Dr/Cr บัญชีนั้น คู่กับบัญชี "ยอดยกมา/ทุนเปิดบัญชี" (เพิ่ม 3xxx opening equity ใน seed + mapping key OPENING_BALANCE) — รวมยกมาลูกหนี้/เจ้าหนี้/สินทรัพย์ที่คีย์ยกมาด้วย |
| M7 | MAJOR | **ไม่มีนิยามปีบัญชี (fiscal year)** ทั้งไฟล์: กำไรสะสม virtual = "Σ P&L ปีก่อนหน้า" และ "กำไรงวดปัจจุบัน" ต้องรู้ว่าปีเริ่มเดือนไหน — นิติบุคคลไทยจำนวนมากปีบัญชีไม่ตรงปีปฏิทิน · settings.org ไม่มี fiscalYearStart · กระทบทั้งงบฐานะ (3800 virtual) และ DBD export "เลือกปีงบ" | §1.2 A7 · §3.6 งบฐานะ · §4.13 settings | เพิ่ม `settings.org.fiscalYearEndMonth` (default 12) + นิยาม: กำไรสะสม = Σ P&L ทุกปีบัญชีที่จบก่อน asOf, กำไรงวด = Σ P&L ตั้งแต่ต้นปีบัญชีปัจจุบันถึง asOf |
| M8 | MAJOR | **งบกระแสเงินสด (วิธีตรง) ขาดกติกา 3 เรื่อง**: (1) entry หลายบรรทัด — บรรทัดเงินมี "บัญชีคู่" หลายตัว (เช่น รับชำระ: Dr เงิน+1160+6500 / Cr 1100) จัด activity ตามตัวไหน/สัดส่วนไหนไม่ระบุ (2) โอนระหว่างบัญชีเงิน (cash↔cash JV) — บัญชีคู่คือเงินด้วยกันเอง จะโชว์เป็นเข้า+ออก operating พองทั้งสองขา ต้อง exclude ไม่ได้เขียน (3) activity `NONE` มีใน enum แต่ไม่บอกว่าบรรทัดที่คู่กับ NONE ไปอยู่หมวดไหนของงบ | §3.6 งบกระแสเงินสด · §4 enum CashflowActivity | นิยาม algorithm: ต่อ entry — บรรทัดเงิน netting กันเองก่อน (โอน cash↔cash = ไม่เข้า/ออก), ที่เหลือ allocate ให้บัญชีคู่ non-cash ตามสัดส่วนยอด, NONE → บังคับ resolve เป็น OPERATING + needsReview (หรือแสดงหมวด "ไม่จัดประเภท" ให้เคลียร์ก่อนปิดงวด) |
| M9 | MAJOR | **`paidTotal` ไม่รวม feeAmount → ใบที่มีค่าธรรมเนียมไม่มีวัน PAID**: นิยาม paidTotal = "Σ DocumentPayment (รวม whtAmount)" — เงื่อน PAID คือ paidTotal ครบ grandTotal · กรณีลูกค้าโอน 10,700 โดนหัก fee 10: amount=10,690 + wht 0 = 10,690 ≠ 10,700 ตลอดกาล — ทั้งที่ journal ฝั่ง Cr 1100 ต้องตัดเต็ม 10,700 (Dr เงิน 10,690 + Dr 6500 10) · สเปคไม่นิยามว่า fee อยู่ใน Cr 1100 หรือเป็นรายการแยก | §4.1 Document.paidTotal · §7.10 แถวรับชำระ (6500) | นิยามชัด: ยอดตัดลูกหนี้ต่อ payment = amount + whtAmountSatang + feeAmount และ paidTotal = Σ ทั้งสามช่อง (กรณี fee ผู้ขายรับภาระ) — ถ้าจะรองรับ fee นอกบิล (ลูกค้ารับภาระ) ให้เป็น flag แยก |
| M10 | MAJOR | **Void เอกสารที่ journal อยู่ในงวดปิดแล้ว = ทางตัน**: §11.7 บอก MANUAL→423, AUTO→เลื่อนงวด — การ void/void payment เป็น action มือ (MANUAL) → reversal ลงงวดปิดไม่ได้ (423) และไม่มีข้อความไหนอนุญาตลง "งวดเปิดถัดไป" สำหรับ reversal → เอกสารเดือนที่ปิดแล้ว void ไม่ได้เลย (ธุรกิจจริงเจอบ่อย: ลูกค้าคืนของข้ามเดือน) | §11.7 · §7.9 F9/F10 · API #8/#11 | ระบุ: reversal ของเอกสารในงวดปิด → โพสต์วันแรกของงวดเปิดปัจจุบัน + memo วันจริง + needsReview (แนวเดียวกับ AUTO) — ห้ามแตะงวดปิด · หรือบังคับใช้ CN/DN แทน void สำหรับเอกสารข้ามงวด (ต้องเขียนให้ชัดว่าเส้นไหน) |
| M11 | MAJOR | **ส่วนลดท้ายบิล × บรรทัดหลายอัตรา VAT — ไม่มีกติกา allocate ฐาน**: §11.1 บอก "แยกฐานต่อกลุ่มก่อนปัด" แต่ discountAmount เป็นยอดเดียวระดับเอกสาร — ไม่บอกว่ากระจายเข้าแต่ละกลุ่ม (7%/0%/ยกเว้น) ตามสัดส่วนใด → ฐาน VAT และ ภ.พ.30 คลาดได้ตามการตีความ | §11.1 · §4.1 Document.discountAmount | นิยาม: กระจาย discountAmount ตามสัดส่วน amount ของแต่ละกลุ่มอัตรา (ปัดต่อกลุ่ม เศษเข้ากลุ่มอัตราสูงสุด/กลุ่มสุดท้าย) แล้วค่อยคำนวณ VAT ต่อกลุ่ม — ใส่ตัวอย่างเลขในสเปค |
| M12 | MAJOR | **มัดจำรับเงินแล้วไม่มีทางออกอื่นนอกจากถูกหัก**: DEPOSIT_RECEIPT จบที่ AWAITING_DEDUCT→DEDUCTED — ไม่มี flow คืนเงินมัดจำ/ยกเลิกงาน (เงิน+VAT รับไปแล้ว ใบกำกับมัดจำออกแล้ว) และไม่ระบุ void ใบมัดจำที่ถูกหักไปบางส่วน · ตามกฎหมายต้องออกใบลดหนี้อ้างใบกำกับมัดจำ — สเปคจำกัด CN ให้อ้าง INVOICE/RECEIPT/TAX_INVOICE เท่านั้น | §3.0.2 DEPOSIT_RECEIPT · §3.1 ใบลดหนี้ ("บังคับอ้าง INVOICE/RECEIPT/TAX_INVOICE") | เพิ่ม: CN อ้าง DEPOSIT_RECEIPT ได้ (คืนมัดจำ: Dr 2110 + Dr 2200 / Cr เงิน) + คืนโควตาหัก + สถานะมัดจำ → REFUNDED/VOIDED · นิยาม void มัดจำที่หักบางส่วนแล้ว = ห้าม (ต้องใช้ CN ส่วนที่เหลือ) |
| M13 | MAJOR | **Phasing ขัดกัน: P1 มีรับชำระแต่ FinanceAccount เป็นตาราง P2**: P1 ส่งมอบใบแจ้งหนี้+รับชำระ+ใบเสร็จ (S6 modal บังคับเลือก "ช่องทาง (บัญชีเงิน)", DocumentPayment.financeAccountId, posting Dr เงิน 10xx) แต่ FinanceAccount migrate ที่ P2 → P1 บันทึกรับเงินลงบัญชีเงินตัวไหน/ผูก GL ยังไงไม่มีคำตอบ | §1.4 (ตาราง P1/P2) · §6 S6 (P1) · §4.4 | ย้าย FinanceAccount มา P1 (อย่างน้อย type CASH/BANK + ยอดยกมา) หรือระบุว่า P1 โพสต์เข้า 1000/1010 seed ตรงๆ โดย channel เป็นข้อมูลประกอบ แล้ว P2 ค่อย migrate ผูก FinanceAccount |

### MINOR

| ID | ระดับ | ประเด็น | จุดในสเปค | ข้อเสนอแก้ |
|---|---|---|---|---|
| N1 | MINOR | §3.0.1 RECEIPT "✅ โพสต์ตอนรับเงิน" ครอบใบเสร็จที่ auto ออกจากการชำระ INVOICE ด้วย — ตัวเงินโพสต์กับ DocumentPayment แล้ว เสี่ยงตีความโพสต์ซ้ำ | §3.0.1 · §3.0.2 RECEIPT | เติมเชิงอรรถ: RECEIPT โพสต์เองเฉพาะสร้างเดี่ยว (ขายสด) — ใบเสร็จจาก IV ไม่โพสต์ (payment โพสต์แล้ว) |
| N2 | MINOR | QUOTATION ที่ส่งแล้ว (AWAITING_ACCEPT/ACCEPTED) ไม่มี transition ยกเลิก — diagram ให้ CANCELLED จาก DRAFT เท่านั้น (ถอนใบเสนอราคาเป็นเคสปกติ) | §3.0.2 | อนุญาต AWAITING_ACCEPT/ACCEPTED → CANCELLED (ไม่มี journal อยู่แล้ว) + ปิด public token |
| N3 | MINOR | Diagram มัดจำวางเงื่อน "ค้างเกิน dueDate ⇒ พ้นกำหนด" ไว้ท้ายบรรทัด AWAITING_DEDUCT แต่นิยาม OVERDUE derived (§3.0.2 bullet + แท็บ §3.0.3) รวมเฉพาะ AWAITING_PAYMENT/PARTIAL/AWAITING_ACCEPT — อ่านขัดกัน | §3.0.2 vs §3.0.3 | จัดวาง diagram ให้เงื่อน overdue เกาะ AWAITING_PAYMENT ชัดเจน (หรือถ้าตั้งใจให้มัดจำค้างหักนานขึ้น overdue ต้องแก้นิยาม derived + แท็บ) |
| N4 | MINOR | แท็บไม่ครบ/ไม่นิยาม: ASSET_PURCHASE ไม่มีแท็บ "ชำระแล้ว" (PAID หายไปอยู่แต่ "ทั้งหมด") · BILLING_NOTE ไม่ระบุสถานะเมื่อ IV ใน relation ถูก void (PAID ไม่มีวันถึง) | §3.0.3 · §3.0.2 BN | เพิ่มแท็บ PAID ให้ AP · กติกา: IV ใน BN ถูก void → ถอด relation/ปรับยอด BN + log |
| N5 | MINOR | ใบกำกับภาษีซื้อเกิน 6 เดือน "บันทึกเป็นต้นทุนแทน" — ไม่มี posting rule (ควรเป็น Dr 5xxx/6xxx เดิมของบิล / Cr 1155) | §11.9 · §7.10 | เพิ่มแถว §7.10: PTX หมดสิทธิ์เคลม → Dr บัญชีค่าใช้จ่าย/ต้นทุนของเอกสารต้นทาง / Cr 1155 (ทั่วไป + needsReview) |
| N6 | MINOR | เช็คจ่าย: seed มี 2300 เช็คจ่ายรอเรียกเก็บ แต่ §7.10 มีแต่ขาเช็ครับ (1040) — posting เช็คจ่าย ISSUED (Cr 2300) → CLEARED (Dr 2300/Cr 1010) ไม่ได้เขียน · mapping key CHEQUE_IN_TRANSIT มีตัวเดียวแต่ต้องใช้ 2 บัญชี (1040/2300) | §4.14 · §4.5 AccountMapping · §7.10 | เพิ่มแถวเช็คจ่าย + แยก key CHEQUE_IN (1040) / CHEQUE_OUT (2300) (P4 แต่ควรล็อกในสเปคเลย) |
| N7 | MINOR | Mapping/seed ไม่ครบคู่: เศษปัด ≤1 สต. เข้า "4900/6900" hardcode ไม่มี key ROUNDING · มี key ASSET_DISPOSAL_GAIN แต่ไม่มีบัญชี seed กำไร/ขาดทุนจำหน่ายสินทรัพย์ชัด (4900 ทำแทน?) และไม่มี key ฝั่ง LOSS | §11.1 · §4.5 · §4.14 · §3.6 | เพิ่ม key ROUNDING_INCOME/ROUNDING_EXPENSE + บัญชี seed 4910 กำไรจำหน่ายสินทรัพย์ / 6910 ขาดทุนจำหน่ายสินทรัพย์ + key ทั้งคู่ |
| N8 | MINOR | ตาราง mapping เมนู §3.0.3 ไม่มีแถว WHT_CERT (อยู่เมนูการเงิน S25 — โจทย์ "ทุก list มีแท็บตามนี้เป๊ะ" เลยไม่ครอบ 50 ทวิ) · facade `account.postPointBurn / postExpense` ไม่มีแถว posting ใน §7.10 | §3.0.3 · §7.10 · §8.1 | เพิ่มแถว WHT_CERT (ออกแล้ว/void/ทั้งหมด) + แถว posting ของ postPointBurn (Dr ส่วนลดแต้ม 4800/6300 / รวมในก้อน postSale) และ postExpense |
| N9 | MINOR | กติกาเศษจากการโพสต์ "ตามสัดส่วน" ไม่ระบุงวดสุดท้าย: (1) ON_PAYMENT โอน 2210→2200 ตามสัดส่วนรับเงินหลายงวด (2) WHT หักตามสัดส่วนงวด — Σ ของค่าปัดรายงวดอาจไม่เท่ายอดเต็ม | §7.7 F1 ขั้น 5 · §11.2 | ระบุ: งวดที่ทำให้ครบ (paidTotal=grandTotal) ใช้ยอดคงเหลือจริงแทนสัดส่วน (remainder method) ทั้ง VAT โอนและ WHT |
| N10 | MINOR | งบทดลอง: §3.6 ต้องแสดง ยอดยกมา/movement/ยกไป (ต้องมีช่วง from-to) แต่ API #30 ให้ `/trial-balance?asOf=` พารามิเตอร์เดียว | §3.6 vs §5.4 #30 | เปลี่ยนเป็น `?from=&to=` (หรือ period=) ให้ derive opening = Σ ก่อน from ตามสูตรที่เขียนไว้ |
| N11 | MINOR | เฟสหน้าจอขัดกัน: ตาราง §6 ให้ S21 (ผู้ติดต่อ), S22 (สินค้า), S41-S44 (ตั้งค่า) = P1 แต่ §1.4 P1 ระบุหน้าจอ "S1-S13, S26, S31-S36" (ไม่มี S21/S22/S41-S44) และแถว P3 กลับรวม "S37-S44" | §1.4 vs §6 | แก้ §1.4: P1 = S1-S13, S21, S22, S26, S31-S36, S41-S44 · P3 = S28-S30, S37-S40 |
| N12 | MINOR | เอกสารกระโดดหัวข้อ §4.8 → §4.13 (ไม่มี 4.9-4.12) · นิยาม INCLUDE mode กำกวม: subTotal นิยามเป็น "ฐานก่อน VAT" แต่ discountAmount ท้ายบิลกรณี INCLUDE เป็นยอด gross หรือฐานไม่ระบุ (กระทบสูตร §11.1 "Σหลังส่วนลด") | §4 · §4.1 · §11.1 | จัดเลขหัวข้อ + ระบุ: INCLUDE เก็บ subTotal เป็นฐาน ex-VAT ที่ derive แล้ว, discountAmount กรอกเป็น gross แล้วระบบแตกฐานให้ (พร้อมตัวอย่างเลข) |
| N13 | MINOR | Closing entry จริง (P4) จะชนกับกำไรสะสม virtual: ถ้าโพสต์ปิดปีเข้า 3800 จริงแล้ว query virtual ยัง Σ P&L ปีก่อน → นับซ้ำ — ไม่มีข้อความสลับโหมด | §1.2 A7 · §1.4 P4 | ระบุ: ปีที่มี closing entry แล้ว virtual ข้ามปีนั้น (ตรวจจาก JournalType CLOSING — ต้องเพิ่มค่า enum ด้วย เพราะปัจจุบันไม่มี CLOSING ใน JournalType) |
| N14 | MINOR | ภ.พ.30 ภาษีขายนับจาก "ใบกำกับ ISSUED เดือนนั้น" แต่ GL 2200 โพสต์ตอน IV issue — ถ้า autoTaxInvoice=WITH_RECEIPT ใบกำกับออกเดือนถัดไป ยอดรายงาน vs GL เหลื่อมเดือน และไม่มี requirement reconcile 2200 ↔ ภ.พ.30 | §10 ข้อ 4 · §3.8 autoTaxInvoice | เพิ่มกติกา: ขายสินค้า (ON_ISSUE) tax point = วันแจ้งหนี้ ใบกำกับต้องออกวันเดียวกัน (บังคับ auto) · เพิ่ม QC: Σ 2200 เดือน = ยอดภาษีขาย ภ.พ.30 เดือนเดียวกัน |
| N15 | MINOR | Contract 2.4 ใน _CONVENTIONS ใช้ `unitId` แต่โมดูล override เป็น system-scoped (AccountSystemLink/linkedId) — signature facade ไม่ได้ปรับตาม (สเปคบอก "contract คงเดิม") · ค่าเสื่อม: ไม่ระบุ pro-rata เดือนแรก (startDepDate กลางเดือน = คิดเต็มเดือน?) | _CONVENTIONS §2.4 vs §8.1 · §3.6/F8 | อัปเดต contract 2.4 ให้รับ posSystemId (หรือ map unit→link ภายใน) จด RESOLUTIONS · ระบุ: เดือนแรกคิดเต็มเดือนถ้า startDepDate ≤ วันที่ 15 (หรือเริ่มเดือนถัดไป — เลือกให้ชัด) |

---

## 2. ตารางไล่ครบ 22 docType (enum ↔ ตาราง §3.0.1 ↔ เมนู §3.0.3 ↔ state machine §3.0.2 ↔ posting §7.10)

| docType | §3.0.1 | เมนู §3.0.3 | State machine | Posting rule | หมายเหตุ |
|---|---|---|---|---|---|
| QUOTATION | ✓ ❌โพสต์ | ✓ | ✓ | — (ถูกต้อง ไม่โพสต์) | N2 ยกเลิกหลังส่งไม่ได้ |
| INVOICE | ✓ | ✓ | ✓ | ✓ | C1/C2 ที่ตัว rule |
| RECEIPT | ✓ | ✓ | ✓ | ✓ | N1 กำกวมโพสต์ซ้ำ |
| TAX_INVOICE | ✓ ❌* | ✓ | ✓ | — (โพสต์กับต้นทาง ✓) | |
| TAX_INVOICE_ABB | ✓ ❌* | ✓ (รวมกับ TX) | ✗ ไม่มี | — ✓ | M1 |
| DEPOSIT_RECEIPT | ✓ | ✓ | ✓ | ✓ | M12 ไม่มีทางคืนเงิน |
| CREDIT_NOTE | ✓ | ✓ | ✗ ไม่มี | ✓ (F4) | M1/M2 |
| DEBIT_NOTE | ✓ | ✓ | ✗ ไม่มี | ✓ (F4) | M1/M2 เก็บเงิน DN ไม่นิยาม |
| BILLING_NOTE | ✓ ❌ | ✓ | ✓ | — ✓ (payment โพสต์) | M4 entryId · N4 |
| PURCHASE | ✓ | ✓ | ✓ | ✓ | |
| EXPENSE | ✓ | ✓ | ✓ | ✓ | |
| PURCHASE_ORDER | ✓ ❌ | ✓ | ✓ | — ✓ | |
| ASSET_PURCHASE_ORDER | ✓ ❌ | ✓ | ✓ | — ✓ | |
| ASSET_PURCHASE | ✓ | ✓ | ✓ | ✓ | N4 ไม่มีแท็บชำระแล้ว |
| PURCHASE_TAX_INVOICE | ✓ | ✓ | ✓ | ✓ (1150↔1155) | N5 เกิน 6 เดือน |
| DEPOSIT_PAYMENT | ✓ | ✓ | ✗ ไม่มี (เดา mirror) | ✓ | หักมัดจำจ่ายใน PC ไม่มีแถว posting (mirror ผ่าน F2 บรรทัดเดียว) — รวมใน C2 fix |
| CREDIT_NOTE_RECEIVED | ✓ | ✓ | ✗ ไม่มี | ✓ (แถว CNR/DNR — เขียนหลวม "ตามทิศ") | M1 |
| DEBIT_NOTE_RECEIVED | ✓ | ✓ | ✗ ไม่มี | ✓ | M1 |
| COMBINED_PAYMENT | ✓ | ✓ | ✓ | (อาศัยแถว "จ่ายชำระ" — ไม่ระบุชื่อ CP) | M4 เดียวกับ BN |
| GOODS_ISSUE | ✓ ❌ | ✓ | ✗ ไม่มี | — ✓ (ตัดจำนวน) | M1 |
| GOODS_ISSUE_RETURN | ✓ ❌ | ✓ | ✗ ไม่มี | — ✓ | M1 |
| WHT_CERT | ✓ ❌* | ✗ ไม่มีแถว | ✗ ไม่มี | — ✓ (โพสต์กับ payment) | M1/N8 |

การแบ่งโพสต์/ไม่โพสต์ 13✅ + 9❌ สมเหตุสมผล — เอกสารกลุ่มภาษี/รับรองไม่โพสต์ซ้ำ (footnote \*) ถูกต้องตามหลักกันลงบัญชีสองรอบ

## 3. ผังบัญชี seed ↔ posting references

บัญชีที่ posting rules/flows อ้าง: 1000/1010/1020/1030/1040, 1100, 1130, 1150, 1155, 1160, 16xx/16x9, 2100, 2110, 2130, 2200, 2210, 2300, 3000, 3800, 4000/4030, 4800, 4900, 5000, 5800, 6100, 6500, 6800, 6900, 9999 — **มีใน seed §4.14 ครบทุกตัว** ✅ ยกเว้นช่องว่างที่ N6 (posting 2300 ไม่เขียน), N7 (บัญชีกำไร/ขาดทุนจำหน่ายสินทรัพย์ + key ROUNDING/LOSS ไม่มี), M6 (บัญชียอดยกมา)

## 4. งบการเงิน — ผลตรวจ derivation

- **งบทดลอง**: สูตร opening/movement จาก JournalLine ✓ — Σdr=Σcr ค้ำด้วย invariant ต่อ entry ✓ (แต่ API param ไม่พอ — N10, และ OPENING ไม่มีคู่ — M6)
- **P&L**: 4xxx−5xxx−6xxx ✓ contra 4800/5800 อยู่ในช่วงถูกต้อง (หักในตัว) ✓ — ขาดนิยามปีบัญชี (M7)
- **งบฐานะ**: 1xxx = 2xxx + 3xxx + กำไรสะสม virtual + กำไรงวด — โครงถูก, มี banner แดงเมื่อไม่ balance ✓ — แต่ virtual ต้องการปีบัญชี (M7) และชน closing จริง P4 (N13)
- **งบกระแสเงินสด**: วิธีตรงจาก movement บัญชีเงิน + tag บัญชีคู่ — แนวคิด derive จาก JournalLine ล้วนจริง ✓ แต่ algorithm ระดับ entry หลายบรรทัด/โอนภายใน/NONE ยังไม่ปิด (M8) และยอดต้นงวด reconcile ไม่ได้ถ้า OPENING ไม่โพสต์ (M6)

## 5. สรุปจำนวน findings

| ระดับ | จำนวน |
|---|---|
| CRITICAL | 2 (C1, C2) |
| MAJOR | 13 (M1–M13) |
| MINOR | 15 (N1–N15) |

**ความเห็นรวม**: โครงสถาปัตยกรรมบัญชีแข็งแรง (single Document pipeline + journal immutable + Σdr=Σcr invariant + งบ derive จาก JournalLine ล้วน) และ**ตัวอย่างตัวเลขทุกตัวในสเปคบวกแล้วถูกหมด** — จุดอ่อนอยู่ที่ "rule เชิงบรรทัดฐาน" ที่เขียนหลวมกว่า worked example: ทำตามตัวอักษรแล้ว Dr≠Cr ได้ 2 ทาง (C1 ส่วนลดแยกบรรทัด, C2 VAT มัดจำ), state machine หายไป 9/22 ชนิด, และมี schema-vs-flow ขัดกันเอง 3 จุด (entryId unique, docNo unique, FinanceAccount ข้ามเฟส) ที่จะระเบิดตอน implement — ควรแก้ C+M ให้จบก่อนเริ่ม P1 เพราะ posting engine โพสต์เงียบตั้งแต่ P1 แล้วแก้ย้อนหลังยาก (journal immutable)
