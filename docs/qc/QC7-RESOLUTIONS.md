# QC7 — CPA + Security audit งาน complete-menu + Chat (2026-07-12, Fable 5)

> ตรวจ 4 ทีม (อ่าน code จริง + รัน harness กับ Neon): เช็ครับ/จ่าย · ใบกำกับ ม.86/4+CSV ภงด · ลิงก์สาธารณะ+attachment+settings · Chat
> **regression เดิม `qc-account-cpa.mts` = 107/107 ผ่าน** (Fable รันเอง) — ของใหม่ต่อไปนี้อยู่**นอก** 107 ข้อ ต้องเพิ่ม test แล้วปิดให้หมด
> harness ที่ agent ทิ้งไว้ (รันซ้ำได้ ลบ tenant เอง): `/tmp/qc-cheque-audit.mts` · `/tmp/qc-tax-print-audit.mts`

## ต้นตอร่วม (แก้ราก 5 จุด ปิด CRITICAL เกือบหมด)

- **R-A: void ไม่ cascade ตาม chain** → `voidPayment` (service.ts:1312) + `voidVendorPayment` (expense.ts:742) reverse แค่ entry ตัวเอง ไม่ตาม `sourcePaymentId` ไปปิด **TAX_INVOICE + WHT_CERT** → ปิด CRITICAL #1,#2
- **R-B: ทะเบียนเช็ค = เกาะโดดเดี่ยว** → `cheque.ts` post GL เองผ่าน `postManualJV` ไม่ผูก AccountDocumentPayment (`payment.chequeId` = dead field) → ปิด CRITICAL #5,#6 + MAJOR เช็ค
- **R-C: เลขภาษี/ประเภทผู้เสียภาษี ไม่ validate ไม่ freeze** → taxId เช็คแค่ `\d{13}` ไม่มี mod-11, legalType filter สดตอน export → ปิด MAJOR #4,#6
- **R-D: public link auto-ISSUE ใบกำกับจริง** → ต้องเป็น "คำขอ" ให้ staff อนุมัติ ไม่ jump ISSUED+จองเลข+post GL → ปิด CRITICAL #7 + MAJOR race
- **R-E: Chat public ไม่มี hardening** (rate limit / CSPRNG token / RBAC unit / advisory lock) → ปิด MAJOR Chat 4 ตัว

---

## 🔴 CRITICAL (7) — ยื่นภาษีผิด / ข้อมูลรั่ว / เงินเพี้ยน

| # | จุด | อาการ (พิสูจน์แล้ว) | แก้ |
|---|---|---|---|
| C1 | service.ts:1312 voidPayment | เช็คเด้ง/void หลังออกใบกำกับ (บริการ ON_PAYMENT) → 2200 ค้าง → จ่ายใหม่ออกใบที่ 2 → **ภพ.30 = 140 แทน 70, 2210 ติดลบ** | void → หา TAX_INVOICE ที่ sourcePaymentId=นี้ → voidDocument+reverseFor ใน tx เดียว (R-A) |
| C2 | expense.ts:742 voidVendorPayment / service.ts:1312 | void จ่าย → GL 2130=0 แต่ WHT_CERT ยัง ISSUED → **ภงด.53=30 บนเงินที่ไม่ได้จ่าย** | void → set WHT_CERT=VOIDED + ล้าง whtCertDocId (R-A) |
| C3 | expense.ts:692 | auto 50 ทวิ ใช้ `new Date()` แทน `pay.paidAt` → จ่าย backdate → **WHT ตกงวด ภงด. ผิดเดือน (เบี้ยปรับ 1.5%/ด.)** | ใช้ `pay.paidAt` ให้ตรง wht.ts:249 |
| C4 | print/[docId]/page.tsx | CN/DN พิมพ์**ไม่มีเลขใบกำกับเดิม+เหตุผล** (ม.86/10) ทั้งที่ DB มีครบ (relationsTo+adjustReason) → ปรับภาษีขาย/ซื้อไม่ได้ | print เพิ่ม block เมื่อ docType∈{CN,DN}: อ้าง docNo+issueDate ใบเดิม + adjustReason |
| C5 | cheque.ts:134-163 | เช็คตัด GL แต่ **ไม่ตัดหนี้เอกสาร** → invoice ยัง AWAITING, `receivable`=1,070 ≠ GL 0 ตลอดกาล | createCheque รับ documentId → สร้าง AccountDocumentPayment(channel=CHEQUE,chequeId) → อัปเดต paidTotal/status (R-B) |
| C6 | cheque.ts + service.ts | ลงเช็คในทะเบียน (Dr2100) แล้วกด "จ่าย" หน้าเอกสารซ้ำ (Dr2100) → **2100 ติด Dr 535 เจ้าหนี้ติดลบ** | รวมเป็น flow เดียว (R-B) — ตัดทางจ่ายซ้ำ |
| C7 | service.ts:1506,1580 (/r/[token]) | public ออกใบกำกับ **status ISSUED + จองเลข + post GL ทันที ไม่มีคนอนุมัติ** + first-write-wins → คนร้ายยิงก่อนได้ใบแทนลูกค้าจริง | public บันทึกเป็น DRAFT/PENDING → staff อนุมัติก่อนจองเลข (R-D) |

## 🟠 MAJOR (12)

**บัญชี/ภาษี**
- M1 service.ts:1529 — public double-issue race (existing เช็คนอก tx) → 2 ใบ VAT เบิ้ล · แก้: partial unique `(systemId, sourceDocId) where docType=TAX_INVOICE` + catch P2002 คืนเลขเดิม
- M2 actions.ts:400 / service.ts:1513 — **ออกใบกำกับได้ทั้งที่ผู้ขายไม่มี taxId** (T9) + taxId ไม่ validate 13 หลัก/checksum ทุกจุด (T0 backoffice, T8 public รับ 1111111111111) · แก้: validate mod-11 ใน createContact + public + gate ออกใบกำกับต้องมี settings.taxId
- M3 service.ts:87 CONVERT_MAP DEPOSIT_RECEIPT:[] — **รับมัดจำแล้ว backoffice ออกใบกำกับมัดจำไม่ได้** + `autoTaxInvoice` dead setting · แก้: เพิ่มปุ่มออกใบกำกับจาก DEPOSIT_RECEIPT + wire หรือถอด autoTaxInvoice
- M4 wht.ts:334 — ภงด.แยก 3/53 จาก `contact.legalType` **สด (ไม่ freeze)** + default COMPANY → แก้ย้อนหลังยอดขยับ (T2) · แก้: freeze legalType ลง contactSnapshot ตอนออก cert
- M5 wht.ts:40-43,395 — CSV ฐานเงินได้ **คำนวณย้อนจาก wht/rate** ไม่ใช่ยอดจ่ายจริง (T4: จ่าย 1000.10 โชว์ 1000.00) + ขาดคอลัมน์ **ที่อยู่ + เงื่อนไขการหัก** (1 หัก/2 ออกให้ตลอด/3 ครั้งเดียว) · แก้: เก็บ base จริง + เพิ่ม 2 คอลัมน์ (address มีใน snapshot แล้ว)
- M6 gl.ts:113 — channel=CHEQUE ลง 1010 ธนาคารทันที (ยังไม่ขึ้นเงิน) ไม่ผ่าน 1040/2300 · แก้: CHEQUE → CHEQUE_IN_TRANSIT/PAYABLE ให้ clearCheque ย้ายเข้า/ออกธนาคาร (ผูกกับ R-B)
- M7 cheque.ts:137,152 + gl.ts:817 — entry เช็ค = ManualJV + randomUUID → trace ไม่ได้, reverseFor ใช้ไม่ได้, ไม่ idempotent · แก้: commitEntry refType="AccountCheque" refId=chequeId event=REGISTER/CLEAR/BOUNCE/VOID
- M8 cheque.ts:143-158 — บรรทัด AR/AP ไม่ใส่ contactId → subledger รายคู่ค้าเพี้ยน · แก้: เพิ่ม contactId

**Chat**
- M9 webchat/[id]/route.ts — **ไม่มี rate limit** ทั้ง repo → ยิง 10k req = 10k conv/contact ท่วม DB+inbox ทุกร้าน · แก้: rate limit ต่อ IP+connectionId (20/นาที) + cap contact ใหม่/ชม.
- M10 ChatWidget.tsx:13 — guest token = `Math.random().toString(36)` (ไม่ใช่ CSPRNG) เป็น auth เดียว → เดา/รู้ token = อ่าน+เขียน thread คนอื่น (IDOR) · แก้: `crypto.randomUUID()` server-gen + httpOnly cookie
- M11 chat/actions.ts + service.ts:564 — **ไม่มี RBAC ต่อ unit** พนักงาน unit A อ่าน+ตอบ thread unit B ได้หมด · แก้: filter unitId ตาม unitAccess ใน listConversations/getThread/sendReply
- M12 service.ts:221-266 — advisory lock ที่ comment อ้าง (chat.prisma:165) **ไม่ได้เขียนจริง** → race 2 ข้อความ contact เดียว → P2002 นอก try/catch → **ข้อความที่ 2 หาย** · แก้: `$transaction` + `pg_advisory_xact_lock(hashtextextended(contactId))` หรือ catch P2002 re-fetch

## 🟡 MINOR (รวม ~12) — เก็บทีหลังได้
account_gl.prisma:198 chequeNo ไม่ unique · reports.ts:354 cash flow รวม 1040 (เช็คยังไม่ขึ้นเงิน) · expense.ts:671 จ่าย WHT ไม่เลือกประเภท→ไม่ออก cert เงียบ · label "ใบกำกับภาษีขาย"→"ใบกำกับภาษี" · ไม่มี "เอกสารออกเป็นชุด" · print+tax page ขาด assertAccountCan · logo/stamp URL ไม่ validate scheme (ไม่มี exploit จริง) · attachment.ts:122 ลบไฟล์งวดปิดได้ · publicLink/autoTaxInvoice dead toggle · CSV วันที่เป็น UTC (จ่ายก่อน 07:00 เพี้ยนวัน) · Chat webhookKey secret ตายทิ้ง (ใช้ id ตรง) · crypto.ts:15 dev fallback key คงที่ · period param NaN→500

## ✅ ที่ยืนยันว่า "ผ่าน" (ไม่ต้องแตะ)
double-entry engine ทุกโมดูล Σdr=Σcr + net-zero จริง · snapshot ผู้ซื้อ freeze ตอน issue · กันออกใบกำกับซ้ำ (idempotent) · ใบกำกับบริการต่องวดตรงเงินรับจริง · BOM+escape CSV · auth ของ export route · TZ ไทย periodRange · Chat HMAC+AES-256-GCM+tenant isolation+auto-link กันปลอม · token public 144-bit · attachment กัน XSS/IDOR/can()/Audit ครบ · prefix เปลี่ยนกลางปีไม่ทำเลขชน · งบครอบ 1040/2300 ถูก

## กติกาปิด QC7
1. เพิ่มทุก case ข้างบนเข้า `scripts/qc-account-cpa.mts` (หรือไฟล์ใหม่ qc-account-qc7.mts) — ต้องเห็นมัน **fail ก่อนแก้** แล้ว **pass หลังแก้**
2. แตะ chat ต้องมี test แยก (rate limit/IDOR/race)
3. deploy 2 ที่ + qc-account-cpa.mts 107/107 ต้องยังผ่าน + commit + อัปเดต _HANDOFF
