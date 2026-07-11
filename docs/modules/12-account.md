# โมดูล 12 — Account (ระบบบัญชีไทยเต็มรูป)

> 🔄 **เขียนใหม่ทั้งฉบับ 2026-07-11** ตามเมนูความต้องการละเอียดของเจ้าของ (ระดับ FlowAccount/PEAK) — แทนสเปคเดิม (POS-ledger subset) ทั้งหมด
> **Scope: system-scoped** ตาม `../BLUEPRINT_SYSTEMS.md` (override `_CONVENTIONS.md` §1 แถว Account เดิม) — Account เป็น **ระบบ feature (AppSystem)** ผู้ใช้สร้างกี่ชุดก็ได้ ทุกตารางผูก `tenantId + systemId` · เชื่อม POS/ระบบ business เป็น **opt-in** ผ่านตาราง link ของโมดูลเอง (§8)
> อ่านคู่กับ: `../BLUEPRINT_SYSTEMS.md` · `_CONVENTIONS.md` (contract 2.4, กติกา §3-5) · `14-pos.md`

---

## 1. ภาพรวม + ขอบเขต

### 1.1 โมดูลนี้คืออะไร

ระบบบัญชีสำหรับ SME ไทย ครอบคลุม **วงจรเอกสารธุรกิจครบวงจร** (ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ+ใบกำกับภาษี), รายจ่าย+ภาษีหัก ณ ที่จ่าย, การเงิน (เงินสด/ธนาคาร/e-Wallet/เช็ค), และบัญชีแยกประเภทเต็มรูปถึงระดับงบการเงิน (งบทดลอง/งบกำไรขาดทุน/งบฐานะการเงิน/งบกระแสเงินสด) พร้อมภาษีไทยครบ (VAT 7%, ใบกำกับเต็ม/อย่างย่อ, e-Tax 🔜, WHT + 50 ทวิ, ภ.พ.30, ภ.ง.ด.3/53, DBD e-Filing 🔜)

**แกนของระบบ = Document pipeline**: เอกสารทุกใบอยู่ในตาราง `Document` เดียว (polymorphic `docType` 22 ชนิด) แปลงต่อกันได้โดยไม่พิมพ์ซ้ำ ทุกใบที่มีผลทางบัญชีโพสต์เข้า **บัญชีรายวัน (Journal) อัตโนมัติ** ตามผังบัญชี → งบทุกตัวคำนวณจาก Journal เสมอ (single source of truth — ตัวเลขบนเอกสารกับงบไม่มีวันเถียงกัน)

```
รายรับ:  ใบเสนอราคา ──แปลง──▶ ใบแจ้งหนี้ ──รับชำระ──▶ ใบเสร็จรับเงิน + ใบกำกับภาษีขาย
                                  ▲    │
         ใบรับเงินมัดจำ ──หักมัดจำ─┘    ├──▶ ใบลดหนี้ / ใบเพิ่มหนี้ (อ้างใบเดิม)
         ใบวางบิล ◀──รวมหลายใบแจ้งหนี้──┘
รายจ่าย: ใบสั่งซื้อ(PO) ──แปลง──▶ บันทึกซื้อ/ค่าใช้จ่าย ──จ่ายชำระ──▶ (+ ใบกำกับภาษีซื้อ, WHT 50 ทวิ)
         ใบจ่ายเงินมัดจำ ──หักมัดจำ──▶ บันทึกซื้อ · ใบรวมจ่าย ◀──รวมหลายใบซื้อ
ทุกใบที่มีผลเงิน ──auto──▶ บัญชีรายวัน ──▶ แยกประเภท ──▶ งบทดลอง/P&L/งบฐานะ/กระแสเงินสด
```

### 1.2 การตัดสินใจสถาปัตยกรรมหลัก (ตัดสินแล้ว — ห้ามเถียงซ้ำ)

| # | ประเด็น | ตัดสินใจ | เหตุผล |
|---|---|---|---|
| A1 | เอกสาร 22 ชนิด: ตารางเดียว vs แยกตาราง | **`Document` เดียว + enum `docType`** + `DocumentLine` + `DocumentPayment` + `DocumentRelation` | (1) pipeline แปลงเอกสาร (QT→IV→RE) copy บรรทัด/ผู้ติดต่อ/ยอดในโครงเดียว ไม่ต้อง mapper ต่อคู่ชนิด (2) เลขรัน/สถานะ/แนบไฟล์/audit/public link เป็น logic เดียวใช้ร่วม 22 ชนิด (3) ค้นหา/คลังเอกสาร/รายงานเอกสารข้ามชนิดทำได้ใน query เดียว (4) field เฉพาะชนิดมีน้อย (validUntil, buyer branch ฯลฯ) คุมด้วย service-level validation ต่อ docType ไม่คุ้มแตก 22 ตาราง |
| A2 | ความถูกต้องบัญชี | **double-entry เต็มรูป, JournalEntry immutable, ทุก entry Σdr=Σcr** | ส่งต่อนักบัญชี/สรรพากรได้จริง — งบทุกตัว derive จาก JournalLine ไม่มีตาราง summary แยก |
| A3 | จุดโพสต์บัญชี | เอกสารโพสต์ journal **อัตโนมัติตอนเปลี่ยนเป็นสถานะมีผล** (ISSUED/APPROVED — ไม่ใช่ตอน DRAFT) ผ่าน posting rule ต่อ docType (§7.10) | ผู้ใช้ไม่ต้องรู้บัญชี — mapping resolve ฝั่งระบบ, แก้ mapping ไม่ย้อนหลัง |
| A4 | Immutability เอกสาร | DRAFT แก้ได้เต็มที่ · พ้น DRAFT แล้ว **ห้ามแก้เนื้อหา** — แก้ = ยกเลิก (VOID → reversal journal) + ออกใบใหม่ (`REPLACE`) หรือออกใบลดหนี้/เพิ่มหนี้ | ตาม `_CONVENTIONS` §5 + ข้อกำหนดสรรพากร (เลขที่เอกสารไม่ reuse) |
| A5 | Scope | ทุกตาราง `tenantId + systemId` (AppSystem ของ Account ชุดนั้น) — 1 tenant มีระบบบัญชีหลายชุดได้ (เช่น แยกนิติบุคคล) | ตาม BLUEPRINT_SYSTEMS — ข้อมูลนิติบุคคล/เลขภาษี/เลขรัน อยู่ที่ `settings` ของระบบ ไม่ใช่ tenant |
| A6 | เชื่อม POS / business | opt-in ผ่าน `AccountSystemLink` (Account 1 ชุดรับได้หลาย POS/หลาย business unit) — บิล POS ไหลเข้าเป็นเอกสารรายรับ+journal อัตโนมัติผ่าน facade contract 2.4 | ตาม BLUEPRINT_SYSTEMS §3 (feature↔feature ใช้ตาราง link ของตัวเอง) |
| A7 | ปิดปี/กำไรสะสม | v1 **virtual closing ที่ชั้น query** (กำไรสะสม = Σ P&L ปีก่อนหน้า) — closing entry จริง 🔜 P4 | เจ้าของได้งบฐานะถูกต้องโดยไม่ต้องเข้าใจการปิดบัญชี |

### 1.3 ไม่ทำใน v1 (boundary)

| ไม่ทำ | ทางออก |
|---|---|
| Inventory valuation เต็มรูป (FIFO/average, ตัด COGS อัตโนมัติ) | ใบเบิกสินค้า/ส่งคืนตัด **จำนวน** ได้ (P2) — มูลค่า COGS ลงจากบันทึกซื้อ/ปรับปรุงมือ · valuation 🔜 |
| หลายสกุลเงิน | THB เท่านั้น (`_CONVENTIONS` §3) |
| Bank feed / กระทบยอด statement อัตโนมัติ | 🔜 — v1 กระทบยอดกับ POS + บันทึกยอดยกมา FinanceAccount |
| Payroll / ประกันสังคม / ภ.ง.ด.1 | นอก scope โมดูลนี้ — เงินเดือนลงเป็นบันทึกค่าใช้จ่าย |
| e-Tax Invoice ยิงจริง / DBD ยื่นจริง | P4 วางโครงผ่าน service provider + export ไฟล์ — การสมัคร SP เป็นงาน ops |
| ภาษีเงินได้นิติบุคคล (ภ.ง.ด.50/51) | ให้งบ + งบทดลอง export ส่งนักบัญชี |

### 1.4 Phasing (ระบบใหญ่ — บังคับตัดเฟส)

| เฟส | ขอบเขต | ตาราง (migrate) | หน้าจอ |
|---|---|---|---|
| **P1 — รายรับ pipeline หลัก** | ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ/ใบกำกับภาษีขาย/ใบรับเงินมัดจำ/ใบลดหนี้/ใบเพิ่มหนี้/ใบวางบิล + ผู้ติดต่อ + สินค้า/บริการ+หน่วย + ตั้งค่าองค์กร/เอกสาร/เลขรัน + PDF/อีเมล/ลิงก์สาธารณะ+ลิงก์ขอใบกำกับ + คลังเอกสาร (แนบไฟล์) + **posting engine + ผังบัญชี seed** (โพสต์เงียบๆ ตั้งแต่ P1 — UI บัญชีเปิด P3 ข้อมูลย้อนหลังครบ) | Document, DocumentLine, DocumentPayment, DocumentRelation, Attachment, DocSequence, Contact, Product, ProductUnit, ClassificationGroup, LedgerAccount, AccountMapping, JournalEntry, JournalLine, AccountingPeriod | S1-S13, S26, S31-S36 |
| **P2 — รายจ่าย + WHT + การเงิน** | บันทึกซื้อ/ค่าใช้จ่าย/PO/ใบสั่งซื้อ+ซื้อสินทรัพย์(เอกสาร)/ใบกำกับภาษีซื้อ/ใบจ่ายมัดจำ/รับใบลดหนี้-เพิ่มหนี้/ใบรวมจ่าย + workflow อนุมัติ + WHT สองขา (ถูกหัก/หัก+50 ทวิ+ภ.ง.ด.3/53) + เงินสด/ธนาคาร/e-Wallet/สำรองรับจ่าย + ใบเบิก/ส่งคืนสินค้า + เชื่อม POS/business (§8) | FinanceAccount, AccountSystemLink (+docType ฝั่งจ่ายใช้ตารางเดิม) | S14-S25, S27 |
| **P3 — บัญชีเต็มรูป + สินทรัพย์** | หน้าบัญชีรายวัน 5 เล่ม + แยกประเภท + งบทดลอง + งบกำไรขาดทุน + งบฐานะการเงิน + งบกระแสเงินสด + ผังบัญชี UI + manual JV + ปิดงวด + ทะเบียนสินทรัพย์+ค่าเสื่อมอัตโนมัติ + ภ.พ.30 รายงานภาษีขาย/ซื้อ | FixedAsset, AssetDepreciation | S28-S30, S37-S44 |
| **P4 — ทางการ/ธนาคาร** | e-Tax Invoice ผ่าน service provider + DBD e-Filing export + เช็ครับ/เช็คจ่าย + closing entry ปิดปี | Cheque (+field etax ใน Document ใช้จริง) | S45-S47 |

---

## 2. Persona & User Stories

| Persona | บทบาท |
|---|---|
| **Owner** (เจ้าของ) | ตั้งค่าองค์กร/ผังบัญชี, อนุมัติ PO/สินทรัพย์, ปิดงวด, ดูงบทุกตัว, export ส่งนักบัญชี/DBD |
| **ผู้จัดทำ** (แอดมิน/ธุรการ — STAFF) | สร้างใบเสนอราคา/แจ้งหนี้/บันทึกซื้อ-จ่าย DRAFT, แนบไฟล์, ส่งเอกสารให้ลูกค้า |
| **ผู้อนุมัติ** (MANAGER/OWNER) | อนุมัติ PO/ใบสั่งซื้อสินทรัพย์, อนุมัติเอกสารพ้น DRAFT (ถ้าเปิด approval flow), void |
| **ผู้ชำระ/ผู้รับชำระ** (การเงิน) | บันทึกรับ/จ่ายเงิน, หัก WHT + ออก 50 ทวิ, จัดการเช็ค, กระทบยอด |
| **นักบัญชีภายนอก** | รับ export งบทดลอง/สมุดรายวัน/ภ.พ.30/ภ.ง.ด. — หรือได้ login role custom ดูอย่างเดียว |
| **ลูกค้า** (ไม่มี login) | เปิดลิงก์สาธารณะดูใบเสนอราคา/ใบแจ้งหนี้, กดยอมรับใบเสนอราคา, กรอกฟอร์มขอใบกำกับภาษีเต็มรูป |

User stories หลัก:

- Owner: "ส่งใบเสนอราคาให้ลูกค้าทางลิงก์ ลูกค้ากดยอมรับ แล้วผมกดแปลงเป็นใบแจ้งหนี้ได้เลยไม่ต้องพิมพ์ใหม่"
- การเงิน: "ลูกค้าโอนมาหัก ณ ที่จ่าย 3% — บันทึกรับชำระแล้วยอดภาษีถูกหักไปโผล่ในรายงานขอคืน/เครดิตอัตโนมัติ"
- การเงิน: "จ่ายค่าเช่าออฟฟิศ กดจ่ายทีเดียวได้ทั้ง journal + หนังสือรับรอง 50 ทวิ + ยอดเข้า ภ.ง.ด.53 เดือนนั้น"
- Owner: "สิ้นเดือนเปิดงบกำไรขาดทุนกับงบฐานะการเงินดูได้เอง ไม่ต้องรอนักบัญชี และ export ภ.พ.30 พร้อมรายงานภาษีขาย/ซื้อแนบยื่น"
- Owner: "ร้านมี POS อยู่แล้ว — เชื่อมปุ๊บ บิลขายหน้าร้านไหลเข้าบัญชีรายวันเองทุกบิล ไม่ต้องคีย์ซ้ำ"
- ผู้จัดทำ: "งานจองจากระบบ Booking จบแล้ว กดสร้างใบแจ้งหนี้จากงานนั้นได้เลย ข้อมูลลูกค้า/รายการติดมาให้"
- ลูกค้า: "ซื้อของแล้วอยากได้ใบกำกับเต็มรูป — สแกน QR บนใบเสร็จ กรอกเลขภาษีเอง ระบบออกใบกำกับส่งอีเมลให้"

---

## 3. ฟังก์ชันทั้งหมด

> Badge = เฟสที่ส่งมอบ (P1=MVP ✅) · ทุกเอกสารมี: เลขรันตั้ง prefix ได้, DRAFT→มีผล→immutable, แนบไฟล์, PDF/พิมพ์/อีเมล/ลิงก์สาธารณะ, audit log, กลุ่มจัดประเภท, ช่อง filter สถานะ + แท็บ "ล่าสุด" (default: สร้าง/แก้ล่าสุด 30 รายการ)

### 3.0 Document pipeline — docType, state machine, mapping เมนู→สถานะ

#### 3.0.1 ทะเบียน docType (22 ชนิด)

| กลุ่ม | docType | prefix default | โพสต์บัญชี | สมุดรายวัน | เฟส |
|---|---|---|---|---|---|
| รายรับ | `QUOTATION` ใบเสนอราคา | QT | ❌ | — | P1 |
| รายรับ | `INVOICE` ใบแจ้งหนี้/ใบส่งของ (บันทึกลูกหนี้) | IV | ✅ ตอนออก | ขาย | P1 |
| รายรับ | `RECEIPT` ใบเสร็จรับเงิน | RE | ✅ ตอนรับเงิน | รับ | P1 |
| รายรับ | `TAX_INVOICE` ใบกำกับภาษีขาย (เต็มรูป) | TX | ❌* (VAT โพสต์กับ IV/RE ที่อ้าง) | — | P1 |
| รายรับ | `TAX_INVOICE_ABB` ใบกำกับอย่างย่อ (POS link) | TXA | ❌* (โพสต์กับบิล POS) | — | P2 |
| รายรับ | `DEPOSIT_RECEIPT` ใบรับเงินมัดจำ | DR | ✅ ตอนรับเงิน | รับ | P1 |
| รายรับ | `CREDIT_NOTE` ใบลดหนี้ | CN | ✅ ตอนออก | ขาย | P1 |
| รายรับ | `DEBIT_NOTE` ใบเพิ่มหนี้ | DN | ✅ ตอนออก | ขาย | P1 |
| รายรับ | `BILLING_NOTE` ใบวางบิล (รวมใบแจ้งหนี้) | BN | ❌ | — | P1 |
| รายจ่าย | `PURCHASE` บันทึกซื้อสินค้า | PC | ✅ ตอนบันทึก | ซื้อ | P2 |
| รายจ่าย | `EXPENSE` บันทึกค่าใช้จ่าย | EX | ✅ ตอนบันทึก | ซื้อ | P2 |
| รายจ่าย | `PURCHASE_ORDER` ใบสั่งซื้อ (PO) | PO | ❌ | — | P2 |
| รายจ่าย | `ASSET_PURCHASE_ORDER` ใบสั่งซื้อสินทรัพย์ | APO | ❌ | — | P2 |
| รายจ่าย | `ASSET_PURCHASE` ซื้อสินทรัพย์ | AP | ✅ ตอนบันทึก (Dr สินทรัพย์) | ซื้อ | P2 |
| รายจ่าย | `PURCHASE_TAX_INVOICE` ใบกำกับภาษีซื้อ (ทะเบียนรับ) | PTX | ✅ ตอน "รับแล้ว" (โอน VAT รอ→เคลม) | ทั่วไป | P2 |
| รายจ่าย | `DEPOSIT_PAYMENT` ใบจ่ายเงินมัดจำ | DP | ✅ ตอนจ่าย | จ่าย | P2 |
| รายจ่าย | `CREDIT_NOTE_RECEIVED` รับใบลดหนี้ | CNR | ✅ ตอนบันทึก | ซื้อ | P2 |
| รายจ่าย | `DEBIT_NOTE_RECEIVED` รับใบเพิ่มหนี้ | DNR | ✅ ตอนบันทึก | ซื้อ | P2 |
| รายจ่าย | `COMBINED_PAYMENT` ใบรวมจ่าย | CP | ✅ ตอนจ่าย | จ่าย | P2 |
| สินค้า | `GOODS_ISSUE` ใบเบิกสินค้า | GI | ❌ (ตัดจำนวน — มูลค่า 🔜) | — | P2 |
| สินค้า | `GOODS_ISSUE_RETURN` ใบส่งคืนเบิกสินค้า | GIR | ❌ (คืนจำนวน) | — | P2 |
| การเงิน | `WHT_CERT` หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) | WHT | ❌* (WHT โพสต์กับ payment ที่หัก) | — | P2 |

\* เอกสารกลุ่มภาษี/รับรอง **ไม่โพสต์ซ้ำ** — ตัวเงินโพสต์แล้วกับเอกสารต้นทาง กันลงบัญชีสองรอบ

#### 3.0.2 State machines (เอกสารหลัก)

```
QUOTATION      DRAFT ──ส่ง──▶ AWAITING_ACCEPT ──ลูกค้า/ผู้ใช้กดยอมรับ──▶ ACCEPTED ──แปลง──▶ (INVOICE)
                 │                 │  └─ปฏิเสธ─▶ REJECTED
                 └─▶ CANCELLED     └─(validUntil < วันนี้ ⇒ แสดง "พ้นกำหนด" — derived ไม่เปลี่ยน status)

INVOICE        DRAFT ──ออก(โพสต์บัญชี: ตั้งลูกหนี้)──▶ AWAITING_PAYMENT ──รับชำระบางส่วน──▶ PARTIAL
                 │                                        │        └──รับครบ──▶ PAID ──▶ (RECEIPT+TAX_INVOICE auto/กดออก)
                 └─▶ CANCELLED                            └─(dueDate < วันนี้ ⇒ "พ้นกำหนด" derived)
               พ้น DRAFT แก้ไม่ได้ → VOID (reversal journal) + ออกใหม่ / CREDIT_NOTE / DEBIT_NOTE

DEPOSIT_RECEIPT DRAFT ──ออก──▶ AWAITING_PAYMENT ──รับเงิน(โพสต์: Dr เงิน/Cr มัดจำรับ+VAT)──▶ AWAITING_DEDUCT
                                                    ──ถูกหักในใบแจ้งหนี้ครบ──▶ DEDUCTED   └─ค้างเกิน dueDate ⇒ "พ้นกำหนด"

RECEIPT        DRAFT(กรณีสร้างเดี่ยว) ──รับเงิน──▶ PAID · สร้างจาก INVOICE ⇒ เกิดเป็น PAID ทันที → VOID ได้อย่างเดียว

TAX_INVOICE    ออกจาก RECEIPT/INVOICE ⇒ ISSUED ──void──▶ VOIDED (+ออกใบแทน REPLACE ได้) · e-Tax: ISSUED→ETAX_SENT→ETAX_OK/FAIL (P4)

PO / ASSET_PURCHASE_ORDER   DRAFT ──ส่งอนุมัติ──▶ AWAITING_APPROVAL ──▶ APPROVED ──แปลง──▶ (PURCHASE/ASSET_PURCHASE)
                                                        └─▶ REJECTED · └─▶ CANCELLED

PURCHASE / EXPENSE / ASSET_PURCHASE   DRAFT ──บันทึก(โพสต์: ตั้งเจ้าหนี้/ค่าใช้จ่าย)──▶ AWAITING_PAYMENT ──▶ PARTIAL ──▶ PAID
                                                                     └─(เกิน dueDate ⇒ "พ้นกำหนด") · ASSET_PURCHASE PAID+รับใบเสร็จ ⇒ RECEIVED

PURCHASE_TAX_INVOICE   AWAITING_RECEIVE(บันทึกซื้อติ๊ก "ยังไม่ได้รับใบกำกับ") ──รับตัวจริง──▶ RECEIVED (โอน 1155→1150 เคลม VAT)

BILLING_NOTE / COMBINED_PAYMENT   DRAFT ──ออก──▶ ISSUED ──ทุกใบใน relation ชำระครบ──▶ PAID · └─▶ CANCELLED

CHEQUE (model แยก — P4)  รับ: ON_HAND→DEPOSITED→CLEARED / BOUNCED · จ่าย: ISSUED→CLEARED / VOIDED
```

- **"พ้นกำหนด" (OVERDUE) เป็นสถานะ derived** — ไม่เก็บลง DB: `status ∈ {AWAITING_PAYMENT, PARTIAL, AWAITING_ACCEPT} && (dueDate|validUntil) < today(ระบบ timezone)` — กัน cron เปลี่ยนสถานะพัง/ย้อน

#### 3.0.3 ตาราง mapping เมนูเจ้าของ → docType + filter (ทุก list มีแท็บตามนี้เป๊ะ)

| เมนู | docType | แท็บ/filter → เงื่อนไข query |
|---|---|---|
| ใบเสนอราคา | QUOTATION | สร้าง=ปุ่ม+form · ยอมรับ=`ACCEPTED` · รอตอบรับ=`AWAITING_ACCEPT && validUntil ≥ today` · พ้นกำหนด=`AWAITING_ACCEPT && validUntil < today` · ทั้งหมด · ล่าสุด |
| ใบแจ้งหนี้ (ใบส่งของ/บันทึกลูกหนี้) | INVOICE | สร้าง · รอชำระเงิน=`AWAITING_PAYMENT|PARTIAL && !overdue` · ชำระเงินแล้ว=`PAID` · พ้นกำหนด=`AWAITING_PAYMENT|PARTIAL && dueDate<today` · ทั้งหมด · ล่าสุด |
| ใบเสร็จรับเงิน | RECEIPT | ชำระเงินแล้ว=`PAID` · ดูทั้งหมด · ล่าสุด |
| ใบกำกับภาษีขาย | TAX_INVOICE (+TAX_INVOICE_ABB) | ออกแล้ว=`ISSUED` · e-Tax Invoice=`etaxStatus != null` (P4) · ทั้งหมด · ล่าสุด |
| ใบรับเงินมัดจำ | DEPOSIT_RECEIPT | สร้าง · รอชำระเงิน=`AWAITING_PAYMENT && !overdue` · พ้นกำหนด=`AWAITING_PAYMENT && dueDate<today` · รอหักมัดจำ=`AWAITING_DEDUCT` · ทั้งหมด · ล่าสุด |
| ใบลดหนี้ | CREDIT_NOTE | สร้าง · ทั้งหมด · ล่าสุด |
| ใบเพิ่มหนี้ | DEBIT_NOTE | สร้าง · ทั้งหมด · ล่าสุด |
| ใบวางบิล | BILLING_NOTE | สร้าง · ทั้งหมด · ล่าสุด |
| บันทึกซื้อสินค้า | PURCHASE | รอชำระ · ชำระแล้ว · พ้นกำหนด · ทั้งหมด · ล่าสุด (เงื่อนไขเดียวกับ INVOICE ฝั่งจ่าย) |
| บันทึกค่าใช้จ่าย | EXPENSE | รอชำระ · ชำระแล้ว · พ้นกำหนด · ทั้งหมด · ล่าสุด |
| ใบสั่งซื้อสินทรัพย์ | ASSET_PURCHASE_ORDER | อนุมัติแล้ว=`APPROVED` · รออนุมัติ=`AWAITING_APPROVAL` · ทั้งหมด · ล่าสุด |
| ซื้อสินทรัพย์ | ASSET_PURCHASE | รอชำระ · พ้นกำหนด · รับใบเสร็จแล้ว=`RECEIVED` · ทั้งหมด · ล่าสุด |
| ใบกำกับภาษีซื้อ | PURCHASE_TAX_INVOICE | รอรับ=`AWAITING_RECEIVE` · รับแล้ว=`RECEIVED` · ทั้งหมด · ล่าสุด |
| ใบสั่งซื้อ (PO) | PURCHASE_ORDER | อนุมัติแล้ว · รออนุมัติ · ทั้งหมด · ล่าสุด |
| ใบจ่ายเงินมัดจำ | DEPOSIT_PAYMENT | รอชำระ · พ้นกำหนด · รอหักมัดจำ=`AWAITING_DEDUCT` · ทั้งหมด · ล่าสุด |
| รับใบลดหนี้ | CREDIT_NOTE_RECEIVED | สร้าง · ทั้งหมด · ล่าสุด |
| รับใบเพิ่มหนี้ | DEBIT_NOTE_RECEIVED | สร้าง · ทั้งหมด · ล่าสุด |
| ใบรวมจ่าย | COMBINED_PAYMENT | สร้าง · ทั้งหมด · ล่าสุด |
| ใบเบิกสินค้า | GOODS_ISSUE | สร้าง · ทั้งหมด · ล่าสุด |
| ใบส่งคืนเบิกสินค้า | GOODS_ISSUE_RETURN | สร้าง · ทั้งหมด · ล่าสุด |
| บัญชีรายวัน | JournalEntry | ทั้งหมด · ซื้อ=`book=PURCHASES` · ขาย=`SALES` · จ่าย=`PAYMENTS` · รับ=`RECEIPTS` · ทั่วไป=`GENERAL` · ล่าสุด |

### 3.1 รายรับ

- **ใบเสนอราคา (P1)**: บรรทัดสินค้า/บริการ + ส่วนลด (บรรทัด+ท้ายบิล บาท/%) + VAT include/exclude + WHT preview · `validUntil` (default ตั้งค่าได้) · ส่งอีเมล/ลิงก์สาธารณะ ลูกค้ากด **ยอมรับ/ปฏิเสธ** บนหน้า public (บันทึก IP+เวลา) · แปลง → ใบแจ้งหนี้ / ใบรับเงินมัดจำ (บางส่วน) · duplicate ทำใบใหม่
- **ใบแจ้งหนี้ = ใบส่งของ/บันทึกลูกหนี้ (P1)**: ออกแล้วตั้งลูกหนี้ + โพสต์รายได้/VAT ทันที (accrual) · เลือกจุดรับรู้ VAT ต่อใบ: ตอนแจ้งหนี้ (ขายสินค้า) หรือ ตอนรับเงิน (บริการ — ผ่านบัญชีภาษีขายรอเรียกเก็บ 2210) · **หักมัดจำ**: ดึงใบรับเงินมัดจำ AWAITING_DEDUCT ของผู้ติดต่อเดียวกันมาหักได้หลายใบ · dueDate จากเครดิตเทอมของผู้ติดต่อ · รับชำระหลายงวด (DocumentPayment) รองรับ WHT ถูกหัก + ค่าธรรมเนียม · พิมพ์เป็นชุด "ใบแจ้งหนี้/ใบส่งของ/ใบกำกับภาษี" ได้ตาม template ที่ตั้ง
- **ใบเสร็จรับเงิน (P1)**: เกิดจากรับชำระใบแจ้งหนี้ (auto/กดออก) หรือสร้างเดี่ยว (ขายสด) · ผูกช่องทางเงิน (FinanceAccount) · ออกคู่ใบกำกับภาษีในคลิกเดียว ("ใบเสร็จรับเงิน/ใบกำกับภาษี" ใบเดียวกันได้ตามตั้งค่า)
- **ใบกำกับภาษีขาย (P1, e-Tax P4)**: เต็มรูปฟิลด์ครบตามสรรพากร (ชื่อ/ที่อยู่/เลขภาษี 13 หลัก validate checksum/สำนักงานใหญ่-สาขา ทั้งผู้ขาย+ผู้ซื้อ) · ออกจาก RECEIPT/INVOICE — snapshot รายการ ณ วันออก · 1 เอกสารต้นทาง = 1 ใบ ISSUED · void + ออกใบแทน · **e-Tax Invoice (P4)**: ส่งผ่าน service provider, เก็บสถานะ/ไฟล์ XML+PDF ลงเอกสาร
- **ใบรับเงินมัดจำ (P1)**: รับเงินแล้วออกใบกำกับภาษีมัดจำ (ตามกฎหมาย VAT เกิดตอนรับเงิน) → ค้างสถานะ "รอหักมัดจำ" จนใบแจ้งหนี้ดึงไปหักครบ · ดูยอดคงเหลือหักได้ต่อใบ
- **ใบลดหนี้ / ใบเพิ่มหนี้ (P1)**: บังคับอ้างเอกสารเดิม (INVOICE/RECEIPT/TAX_INVOICE) + เหตุผลตามประกาศสรรพากร (คืนของ/ลดราคา/คำนวณผิด ฯลฯ) · โพสต์กลับรายได้+VAT (CN) / เพิ่ม (DN) · ยอดไปหักลูกหนี้คงค้างหรือบันทึกคืนเงิน
- **ใบวางบิล (P1)**: เลือกใบแจ้งหนี้ค้างชำระหลายใบของลูกค้าเดียวกัน → ใบเดียวส่งลูกค้า + นัดวันรับเช็ค/โอน · รับชำระจากหน้าใบวางบิล กระจายตัดทุกใบแจ้งหนี้ในใบเดียว

### 3.2 รายจ่าย (P2)

- **บันทึกซื้อสินค้า / บันทึกค่าใช้จ่าย**: บรรทัดเลือกสินค้า (PURCHASE) หรือหมวดบัญชีค่าใช้จ่าย (EXPENSE — บรรทัดผูก `accountId` ตรง) · VAT ซื้อ: มีใบกำกับ (เคลมได้ → 1150) / ยังไม่รับใบกำกับ (→ 1155 รอ + สร้าง PURCHASE_TAX_INVOICE สถานะรอรับ) / ไม่มี-เคลมไม่ได้ (VAT รวมเป็นต้นทุน) · จ่ายทันทีหรือตั้งเจ้าหนี้ · จ่ายพร้อม **หัก WHT** → ออก 50 ทวิอัตโนมัติ · แนบรูปใบเสร็จ/ใบกำกับ (มือถือถ่ายได้)
- **ใบสั่งซื้อ (PO) / ใบสั่งซื้อสินทรัพย์**: DRAFT → ส่งอนุมัติ → APPROVED (ผู้อนุมัติตามสิทธิ์ + วงเงินอนุมัติตั้งได้) → แปลงเป็นบันทึกซื้อ/ซื้อสินทรัพย์ · ส่ง PDF ให้ vendor
- **ซื้อสินทรัพย์**: เหมือนบันทึกซื้อแต่ Dr เข้าบัญชีสินทรัพย์ + สร้างรายการรอขึ้น **ทะเบียนสินทรัพย์** (P3 กำหนดอายุ/วิธีคิดค่าเสื่อมตอนขึ้นทะเบียน) · สถานะเพิ่ม "รับใบเสร็จแล้ว"
- **ใบกำกับภาษีซื้อ (ทะเบียน)**: list ใบกำกับที่ผูกกับบันทึกซื้อ/ค่าใช้จ่าย — รอรับ/รับแล้ว · กด "รับแล้ว" → โอน 1155→1150 (เริ่มเคลมในเดือนที่รับตามกติกา ภ.พ.30 เคลมย้อนได้ ≤ 6 เดือน — ระบบเตือนใกล้หมดสิทธิ์)
- **ใบจ่ายเงินมัดจำ**: จ่ายมัดจำ vendor → สินทรัพย์ "เงินมัดจำจ่าย" รอหักในบันทึกซื้อ (mirror ฝั่งรับ)
- **รับใบลดหนี้ / รับใบเพิ่มหนี้**: อ้างบันทึกซื้อเดิม — กลับ/เพิ่มค่าใช้จ่าย + VAT ซื้อ
- **ใบรวมจ่าย**: รวมหลายบันทึกซื้อ/ค่าใช้จ่ายของ vendor เดียว จ่ายครั้งเดียว (โอน/เช็ค 1 ใบ) กระจายตัดเจ้าหนี้ทุกใบ + หัก WHT รวมและออก 50 ทวิใบเดียว

### 3.3 ผู้ติดต่อ (P1)

- ลูกค้า/ผู้ขาย/ทั้งคู่ · บุคคลธรรมดา/นิติบุคคล · ชื่อจดทะเบียน, **เลขผู้เสียภาษี 13 หลัก (validate checksum)**, รหัสสาขา (00000 สนญ.)+ชื่อสาขา, ที่อยู่จดทะเบียน + ที่อยู่จัดส่ง (หลายชุด), ผู้ติดต่อ (ชื่อ/อีเมล/เบอร์ หลายคน), **เครดิตเทอม (วัน)** → คำนวณ dueDate อัตโนมัติ, บัญชีธนาคาร vendor (ไว้โอนจ่าย), หมายเหตุ, WHT default rate ต่อผู้ติดต่อ
- หน้าโปรไฟล์: การ์ดยอดค้างรับ/ค้างจ่าย + ประวัติเอกสารทุกชนิดของรายนี้ + aging (P3)
- import CSV 🔜 · merge รายซ้ำ 🔜

### 3.4 สินค้า/บริการ (P1 · เบิกสินค้า P2)

- **สินค้า+บริการ**: SKU, ชื่อ TH/EN, type GOODS/SERVICE, หน่วย, ราคาขาย/ราคาซื้อ default, VAT default (7/0/ยกเว้น), บัญชีรายได้/ค่าใช้จ่าย override ต่อสินค้า, รูป, สถานะ archive
- **หน่วย**: ทะเบียนหน่วย (ชิ้น/กล่อง/ชั่วโมง/เดือน ฯลฯ) แก้เพิ่มได้
- **ใบเบิกสินค้า / ใบส่งคืนเบิกสินค้า (P2)**: ตัด/คืน**จำนวน** `qtyOnHand` ของสินค้า type GOODS (ใช้ภายใน เช่น เบิกไปใช้งาน/สาธิต) — ไม่โพสต์ GL ใน v1 (มูลค่า inventory 🔜) · เห็นความเคลื่อนไหวย้อนหลังต่อสินค้า

### 3.5 การเงิน (P2 · เช็ค P4)

- **เงินสด/ธนาคาร/e-Wallet**: ทะเบียน FinanceAccount (type CASH/BANK/E_WALLET/PETTY_CASH) + ยอดยกมา · ทุกการรับ/จ่ายผูกบัญชีเงิน → ยอดคงเหลือ ณ ปัจจุบัน + statement ความเคลื่อนไหว (จาก JournalLine ของบัญชี GL ที่ผูก) · โอนระหว่างบัญชีเงิน (JV ทั่วไป)
- **สำรองรับจ่าย (petty cash)**: FinanceAccount type PETTY_CASH + เติมเงิน/เบิกชดเชย — รายจ่ายย่อยตัดจากบัญชีนี้
- **ภาษีถูกหัก ณ ที่จ่าย** (ลูกค้าหักเรา): บันทึกตอนรับชำระ (rate 1/2/3/5% หรือกำหนดเอง + แนบสำเนา 50 ทวิที่ได้รับ) → สินทรัพย์ 1160 → รายงานเครดิตภาษีสิ้นปี
- **ภาษีหัก ณ ที่จ่าย** (เราหัก vendor): บันทึกตอนจ่าย → หนี้สิน 2130 + **ออกหนังสือรับรอง 50 ทวิ** (docType WHT_CERT — เลขรัน, ประเภทเงินได้ ม.40, อัตรา, PDF ฟอร์มราชการ) → สรุปยื่น **ภ.ง.ด.3** (บุคคล)/**ภ.ง.ด.53** (นิติบุคคล) รายเดือน + export
- **เช็ครับ / เช็คจ่าย (P4)**: ทะเบียนเช็ค (เลขเช็ค/ธนาคาร/สาขา/วันที่หน้าเช็ค) ผูกกับ DocumentPayment · lifecycle §3.0.2 · เช็ครับผ่านบัญชีพัก 1040 จนเคลียริ่ง · เด้ง → reverse + ตั้งลูกหนี้กลับ + แจ้งเตือน

### 3.6 บัญชี (P3)

- **บัญชีรายวัน**: 5 เล่ม (ขาย/ซื้อ/รับ/จ่าย/ทั่วไป) + ทั้งหมด — ทุก entry มาจากเอกสาร (AUTO, คลิกทะลุไปเอกสาร) หรือ JV มือ (GENERAL) · Σdr=Σcr บังคับ · immutable — แก้ = กลับรายการ
- **บัญชีแยกประเภท (GL)**: เลือกบัญชี+ช่วงเวลา → ยอดยกมา, movement ทุกบรรทัด (คลิกทะลุ entry→เอกสาร), ยอดยกไป
- **งบทดลอง**: ทุกบัญชี — ยอดยกมา dr/cr, movement dr/cr, ยอดคงเหลือ dr/cr · Σ ทั้งสองฝั่งต้องเท่ากันเสมอ (สูตร: opening = Σ JournalLine ก่อนช่วง, movement = Σ ในช่วง)
- **งบกำไรขาดทุน**: รายได้ (4xxx) − ต้นทุนขาย (5xxx) = กำไรขั้นต้น − ค่าใช้จ่าย (6xxx) = กำไรสุทธิ · รายเดือน/สะสม/เทียบช่วงก่อน/12 เดือน
- **งบฐานะการเงิน**: ณ วันที่เลือก — สินทรัพย์ (1xxx) = หนี้สิน (2xxx) + ส่วนของเจ้าของ (3xxx + กำไรสะสม virtual + กำไรงวดปัจจุบัน) · ไม่ balance = บั๊ก posting → banner แดง + ลิงก์ตรวจ
- **งบกระแสเงินสด**: วิธีตรง — movement ของบัญชีเงิน (FinanceAccount-linked) จัดกลุ่มตาม `cashflowActivity` ของบัญชีคู่ (OPERATING/INVESTING/FINANCING — tag บนผังบัญชี, seed มาให้ครบ) · เงินต้นงวด + เข้า − ออก = ปลายงวด (ต้อง reconcile กับยอด FinanceAccount)
- **ผังบัญชี**: template SME ไทย ~50 บัญชี seed อัตโนมัติ (ตาราง §4.14) · เพิ่ม/แก้ชื่อ/archive · hierarchy 1 ชั้น · บัญชี system ลบไม่ได้
- **JV มือ (ADJUST)** + กลับรายการ + ปิดงวดรายเดือน (lock — pre-close checklist: suspense=0, needsReview=0) + reopen (OWNER)
- **DBD e-Filing (P4)**: export งบฐานะ+P&L+งบทดลอง เป็นไฟล์ Excel ตาม template DBD (v.2.0) ให้เอาไปยื่น e-Filing เอง — ยิงตรง 🔜
- **สินทรัพย์ (P3)**: ทะเบียนสินทรัพย์ (รหัส, หมวด, วันได้มา, มูลค่า, ซาก, อายุ (เดือน), วิธี = เส้นตรง) — ขึ้นทะเบียนจากเอกสารซื้อสินทรัพย์หรือคีย์ยกมา · **ค่าเสื่อมรายเดือนอัตโนมัติ** (cron สิ้นเดือน: Dr 6800 ค่าเสื่อม / Cr 16xx ค่าเสื่อมสะสม ต่อสินทรัพย์, `(cost−salvage)/usefulLifeMonths` ปัดสตางค์ เดือนสุดท้ายเก็บเศษ) · ขาย/ตัดจำหน่าย → JV กำไร/ขาดทุนจากจำหน่ายสินทรัพย์

### 3.7 คลังเอกสาร (P1)

- แนบไฟล์กับเอกสารทุกใบ (รูป/PDF ≤ 10MB, object storage) + **คลังกลาง**: อัปโหลดเอกสารลอย (สัญญา/หนังสือรับรอง) จัดโฟลเดอร์/ค้นหา/กรองตามชนิด-เดือน · ไฟล์ผูกเอกสารเห็นในคลังด้วย (ลิงก์กลับ)

### 3.8 ตั้งค่า (P1)

- **องค์กร**: ชื่อกิจการ (TH/EN), เลขผู้เสียภาษี, สำนักงานใหญ่/สาขา, ที่อยู่, โลโก้, **ตราประทับ+ลายเซ็นอัปโหลด** (แปะบน PDF), จด VAT?/อัตรา, เบอร์/อีเมล/เว็บ — เก็บใน `AppSystem.settings.org`
- **ผู้ใช้งาน+สิทธิ**: ใช้ระบบสิทธิ์กลาง (`can()`) — role ต่อระบบบัญชีชุดนี้ + custom permission ราย action (§9) + วงเงินอนุมัติ
- **เอกสาร** (ต่อ docType): **เลขที่เอกสาร** (prefix + pattern `{YYYY}{MM}{####}` + reset ปี/เดือน/ไม่ reset) · **หมายเหตุท้ายเอกสาร** default · **วันครบกำหนด** default (วัน) · **ช่องทางชำระ** ที่พิมพ์บนเอกสาร (บัญชีธนาคาร/PromptPay QR) · **กลุ่มจัดประเภท** (ClassificationGroup — tag เอกสารไว้กรอง/รายงาน) · **การแสดงข้อมูลสาธารณะ** (เปิด/ปิดลิงก์ public ต่อชนิด + ซ่อนราคาทุน/ส่วนลด) · **การออกใบกำกับภาษี** (ออกอัตโนมัติพร้อมใบเสร็จ? / แยกใบ? / ใบเสร็จ-ใบกำกับใบเดียว?) · **รายงานเอกสาร** (คอลัมน์ default ของ export ต่อชนิด) · **บัญชีรายวัน** (override บัญชี default ต่อ docType เช่น รายได้ของ INVOICE ลง 4000 หรือ 4030) · **ลิงก์สำหรับขอใบกำกับภาษี** (เปิดหน้า public ให้ลูกค้ากรอกข้อมูลผู้ซื้อขอใบกำกับจากใบเสร็จ — QR บนใบเสร็จ)

---

## 4. Data Model (Prisma)

> ทุก model: `tenantId + systemId` (systemId = AppSystem ของระบบบัญชีชุดนั้น) · เงิน `Int` สตางค์ · `@@unique([systemId, ...])` · cuid() · createdAt/updatedAt (ละไว้ในโค้ดด้านล่างเพื่อความกระชับ = ✍️ ใส่จริงทุกตาราง)

```prisma
// ───────────────────────── enums ─────────────────────────

enum DocType {
  QUOTATION  INVOICE  RECEIPT  TAX_INVOICE  TAX_INVOICE_ABB  DEPOSIT_RECEIPT
  CREDIT_NOTE  DEBIT_NOTE  BILLING_NOTE
  PURCHASE  EXPENSE  PURCHASE_ORDER  ASSET_PURCHASE_ORDER  ASSET_PURCHASE
  PURCHASE_TAX_INVOICE  DEPOSIT_PAYMENT  CREDIT_NOTE_RECEIVED  DEBIT_NOTE_RECEIVED
  COMBINED_PAYMENT  GOODS_ISSUE  GOODS_ISSUE_RETURN  WHT_CERT
}

enum DocStatus {
  DRAFT
  AWAITING_ACCEPT   // ใบเสนอราคา รอตอบรับ
  ACCEPTED          REJECTED
  AWAITING_APPROVAL APPROVED          // PO/ใบสั่งซื้อสินทรัพย์
  AWAITING_PAYMENT  PARTIAL  PAID     // ฝั่งเงิน (OVERDUE = derived จาก dueDate)
  AWAITING_DEDUCT   DEDUCTED          // มัดจำ
  AWAITING_RECEIVE  RECEIVED          // ใบกำกับภาษีซื้อ / ซื้อสินทรัพย์รับใบเสร็จ
  ISSUED                              // ใบกำกับ/50ทวิ/ใบวางบิล มีผลแล้ว
  VOIDED  CANCELLED                   // VOID = เคยมีผล+reversal · CANCELLED = ยกเลิกก่อนมีผล
}

enum VatMode { INCLUDE EXCLUDE NONE }          // ต่อเอกสาร
enum VatTiming { ON_ISSUE ON_PAYMENT }          // จุดรับรู้ภาษีขาย (สินค้า/บริการ)
enum DocDirection { IN OUT INTERNAL }           // รายรับ/รายจ่าย/ภายใน — denormalize จาก docType
enum RelationType { CONVERT DEPOSIT_APPLY ADJUST BILL PAY_GROUP TAX_FOR REPLACE }
enum PayChannel { CASH TRANSFER PROMPTPAY CARD E_WALLET CHEQUE DEPOSIT_APPLY CREDIT_APPLY OTHER }
enum ContactKind { CUSTOMER VENDOR BOTH }
enum LegalType { PERSON COMPANY }
enum ProductType { GOODS SERVICE }
enum FinanceAccountType { CASH BANK E_WALLET PETTY_CASH }
enum ChequeDirection { IN OUT }
enum ChequeStatus { ON_HAND DEPOSITED CLEARED BOUNCED ISSUED VOIDED }
enum AccountType { ASSET LIABILITY EQUITY INCOME COGS EXPENSE }
enum CashflowActivity { OPERATING INVESTING FINANCING NONE }
enum JournalBook { SALES PURCHASES RECEIPTS PAYMENTS GENERAL }
enum JournalType { DOC PAYMENT ADJUST REVERSAL DEPRECIATION OPENING }
enum EntrySource { AUTO MANUAL }
enum EntryStatus { POSTED REVERSED }
enum PeriodStatus { OPEN CLOSED }
enum AssetStatus { ACTIVE FULLY_DEPRECIATED DISPOSED WRITTEN_OFF }
enum WhtIncomeType { M40_1 M40_2 M40_3 M40_4 M40_5 M40_6 M40_7 M40_8 } // ประเภทเงินได้ 50 ทวิ
enum EtaxStatus { NOT_SENT PENDING SENT FAILED }                        // P4
enum LinkedKind { POS BUSINESS }

// ───────────── 4.1 เอกสาร (แกนระบบ — polymorphic docType) ─────────────

model Document {
  id             String      @id @default(cuid())
  tenantId       String
  systemId       String
  docType        DocType
  docNo          String                      // "IV-2026-07-0001" — จองใน tx เดียวกับ insert
  status         DocStatus   @default(DRAFT)
  direction      DocDirection                // denormalized — query รายรับ/รายจ่ายเร็ว
  issueDate      DateTime                    // วันที่เอกสาร (business date)
  dueDate        DateTime?                   // ครบกำหนดชำระ (จากเครดิตเทอม/ตั้งค่า)
  validUntil     DateTime?                   // QUOTATION: ยืนราคาถึง
  contactId      String?
  contact        Contact?    @relation(fields: [contactId], references: [id])
  contactSnapshot Json?                      // freeze ชื่อ/ที่อยู่/เลขภาษี/สาขา ณ วันออก (พ้น DRAFT)
  // ── ยอดเงิน (สตางค์) — คำนวณจาก lines, freeze พ้น DRAFT ──
  vatMode        VatMode     @default(EXCLUDE)
  vatTiming      VatTiming   @default(ON_ISSUE)
  subTotal       Int         @default(0)     // Σ บรรทัดหลังส่วนลดบรรทัด (ฐานก่อน VAT)
  discountAmount Int         @default(0)     // ส่วนลดท้ายบิล
  vatAmount      Int         @default(0)     // ปัดระดับเอกสาร
  whtAmount      Int         @default(0)     // WHT ที่คาดว่าจะถูกหัก/จะหัก (preview — ตัวจริงอยู่ DocumentPayment)
  depositDeducted Int        @default(0)     // Σ มัดจำที่หักในใบนี้ (ผ่าน DocumentRelation DEPOSIT_APPLY)
  grandTotal     Int         @default(0)     // ยอดสุทธิที่ต้องชำระ = subTotal − discount + vat − depositDeducted
  paidTotal      Int         @default(0)     // Σ DocumentPayment (รวม whtAmount ของ payment)
  // ── อ้างอิง/ที่มา ──
  refSystemId    String?                     // ระบบต้นทาง (POS system / business unit) เมื่อไหลมาจาก link (§8)
  refType        String?                     // ชื่อ Prisma model ตรงตัว: "PosSale" | "Appointment" | ...
  refId          String?
  categoryId     String?                     // กลุ่มจัดประเภท
  category       ClassificationGroup? @relation(fields: [categoryId], references: [id])
  note           String?                     // หมายเหตุบนเอกสาร (พิมพ์)
  internalNote   String?                     // โน้ตภายใน (ไม่พิมพ์)
  adjustReason   String?                     // CN/DN: เหตุผลตามประกาศสรรพากร
  whtIncomeType  WhtIncomeType?              // WHT_CERT
  whtRateBp      Int?                        // WHT_CERT: basis point (300 = 3%)
  publicToken    String?     @unique         // ลิงก์สาธารณะ (null = ปิด)
  acceptedAt     DateTime?                   // QUOTATION accepted (public/manual) + acceptedMeta ใน auditLog
  etaxStatus     EtaxStatus  @default(NOT_SENT) // P4
  etaxMeta       Json?                       // P4: {providerId, xmlUrl, sentAt, error}
  pdfUrl         String?
  voidReason     String?
  replacedById   String?     @unique         // ใบใหม่ที่ออกแทน (คู่กับ relation REPLACE)
  createdById    String
  approvedById   String?                     // ผู้อนุมัติ (PO/APO/approval flow)
  paidById       String?                     // ผู้บันทึกชำระล่าสุด

  lines          DocumentLine[]
  payments       DocumentPayment[]
  relationsFrom  DocumentRelation[] @relation("RelFrom")
  relationsTo    DocumentRelation[] @relation("RelTo")
  attachments    Attachment[]

  @@unique([systemId, docType, docNo])
  @@index([systemId, docType, status, issueDate])
  @@index([systemId, docType, dueDate])       // overdue query
  @@index([systemId, contactId, docType])
  @@index([systemId, direction, issueDate])
  @@index([refType, refId])
  @@index([tenantId, systemId])
}

model DocumentLine {
  id          String   @id @default(cuid())
  tenantId    String
  systemId    String
  documentId  String
  document    Document @relation(fields: [documentId], references: [id])
  sortOrder   Int      @default(0)
  productId   String?
  product     Product? @relation(fields: [productId], references: [id])
  description String                        // ชื่อ/รายละเอียด (แก้ได้แม้เลือกสินค้า — freeze พ้น DRAFT)
  qty         Decimal  @db.Decimal(12, 4)   // จำนวน (หน่วยทศนิยมได้ เช่น 1.5 ชม.) — เงินเท่านั้นที่เป็น Int
  unitName    String?                       // snapshot ชื่อหน่วย
  unitPrice   Int                           // สตางค์/หน่วย
  discount    Int      @default(0)          // ส่วนลดบรรทัด (สตางค์)
  vatRateBp   Int      @default(700)        // 700 = 7% | 0 = 0% | -1 = ยกเว้น VAT
  amount      Int                           // qty×unitPrice − discount (ฐานบรรทัด)
  accountId   String?                       // override บัญชี GL (EXPENSE บังคับเลือกหมวด, INVOICE เลือกได้)
  account     LedgerAccount? @relation(fields: [accountId], references: [id])
  assetId     String?                       // ASSET_PURCHASE: ผูกทะเบียนสินทรัพย์หลังขึ้นทะเบียน

  @@index([documentId, sortOrder])
  @@index([systemId, productId])
}

model DocumentPayment {
  id             String     @id @default(cuid())
  tenantId       String
  systemId       String
  documentId     String
  document       Document   @relation(fields: [documentId], references: [id])
  paidAt         DateTime
  channel        PayChannel
  financeAccountId String?                  // บัญชีเงินที่เข้า/ออก (null เฉพาะ DEPOSIT_APPLY/CREDIT_APPLY)
  financeAccount FinanceAccount? @relation(fields: [financeAccountId], references: [id])
  amount         Int                        // เงินที่เข้า/ออกจริง (ไม่รวม WHT)
  whtAmountSatang Int       @default(0)     // WHT ที่ถูกหัก (รายรับ) / ที่หักเขา (รายจ่าย)
  whtRateBp      Int?                       // 100|150|200|300|500|... หรือกำหนดเอง
  whtCertDocId   String?    @unique         // Document(WHT_CERT) ที่ออกให้ vendor (ฝั่งจ่าย)
  feeAmount      Int        @default(0)     // ค่าธรรมเนียมโอน/gateway (โพสต์เป็นค่าใช้จ่าย)
  chequeId       String?    @unique
  cheque         Cheque?    @relation(fields: [chequeId], references: [id])
  note           String?
  entryId        String?    @unique         // JournalEntry ของการชำระครั้งนี้
  voidedAt       DateTime?
  voidReason     String?
  createdById    String

  @@index([systemId, paidAt])
  @@index([documentId])
}

model DocumentRelation {
  id        String       @id @default(cuid())
  tenantId  String
  systemId  String
  fromId    String                          // เอกสารต้นทาง (เช่น QT, มัดจำ, ใบวางบิล)
  from      Document     @relation("RelFrom", fields: [fromId], references: [id])
  toId      String                          // เอกสารปลายทาง (เช่น IV ที่แปลงไป/ที่ถูกหัก/ที่ถูกรวม)
  to        Document     @relation("RelTo", fields: [toId], references: [id])
  type      RelationType                    // CONVERT | DEPOSIT_APPLY | ADJUST | BILL | PAY_GROUP | TAX_FOR | REPLACE
  amount    Int?                            // DEPOSIT_APPLY: ยอดมัดจำที่หัก · BILL/PAY_GROUP: ยอดของใบนั้นในกลุ่ม

  @@unique([fromId, toId, type])
  @@index([systemId, type])
  @@index([toId])
}

// ───────────── 4.2 เลขรันเอกสาร ─────────────

model DocSequence {
  id        String  @id @default(cuid())
  tenantId  String
  systemId  String
  docType   DocType
  prefix    String                          // ตั้งได้ต่อชนิดต่อระบบ ("IV", "INV-BKK")
  pattern   String  @default("{PREFIX}-{YYYY}-{MM}-{NNNN}")
  resetBy   String  @default("MONTH")       // "YEAR" | "MONTH" | "NEVER"
  periodKey String                          // "2026-07" | "2026" | "-"
  lastNo    Int     @default(0)

  @@unique([systemId, docType, periodKey])  // จองเลข: upsert + lastNo++ ใน tx เดียวกับเอกสาร (row lock)
}

// ───────────── 4.3 ผู้ติดต่อ / สินค้า / หน่วย / กลุ่มจัดประเภท ─────────────

model Contact {
  id           String      @id @default(cuid())
  tenantId     String
  systemId     String
  kind         ContactKind
  legalType    LegalType   @default(COMPANY)
  code         String?                      // รหัสลูกค้า/ผู้ขาย (optional, unique ถ้าตั้ง)
  name         String                       // ชื่อจดทะเบียน
  taxId        String?                      // 13 หลัก validate checksum
  branchCode   String?     @default("00000")
  branchName   String?
  address      Json?                        // {line1, district, province, postcode}
  shippingAddresses Json    @default("[]")
  contacts     Json        @default("[]")   // [{name, email, phone, role}]
  email        String?
  phone        String?
  creditTermDays Int       @default(0)      // 0 = เงินสด
  whtDefaultBp Int?                         // อัตรา WHT default ต่อรายนี้
  bankAccounts Json        @default("[]")   // vendor: [{bank, accountNo, accountName}]
  note         String?
  archivedAt   DateTime?

  documents    Document[]

  @@unique([systemId, code])
  @@index([systemId, kind, archivedAt])
  @@index([systemId, taxId])
  @@index([systemId, name])
}

model ProductUnit {
  id        String  @id @default(cuid())
  tenantId  String
  systemId  String
  name      String                          // "ชิ้น" "กล่อง" "ชั่วโมง"
  archivedAt DateTime?

  @@unique([systemId, name])
}

model Product {
  id               String      @id @default(cuid())
  tenantId         String
  systemId         String
  sku              String?
  name             String
  nameEn           String?
  type             ProductType @default(GOODS)
  unitId           String?
  salePrice        Int?                     // default ราคาขาย (สตางค์)
  buyPrice         Int?
  vatRateBp        Int         @default(700)
  incomeAccountId  String?                  // override ผังบัญชีต่อสินค้า
  expenseAccountId String?
  imageUrl         String?
  qtyOnHand        Decimal     @default(0) @db.Decimal(12, 4) // ตัด/คืนโดย GOODS_ISSUE(_RETURN) + PURCHASE (P2)
  archivedAt       DateTime?

  lines            DocumentLine[]

  @@unique([systemId, sku])
  @@index([systemId, type, archivedAt])
}

model ClassificationGroup {                 // "กลุ่มจัดประเภท" ในตั้งค่าเอกสาร
  id        String   @id @default(cuid())
  tenantId  String
  systemId  String
  name      String
  appliesTo Json     @default("[]")         // [DocType] ที่ใช้กลุ่มนี้ได้ ([] = ทุกชนิด)
  archivedAt DateTime?

  documents Document[]

  @@unique([systemId, name])
}

// ───────────── 4.4 การเงิน ─────────────

model FinanceAccount {
  id              String             @id @default(cuid())
  tenantId        String
  systemId        String
  type            FinanceAccountType
  name            String                    // "กสิกร ออมทรัพย์ 123-4" | "เงินสดหน้าร้าน" | "TrueMoney"
  bankName        String?
  accountNo      String?
  promptpayId     String?                   // พิมพ์ QR บนเอกสาร
  openingBalance  Int                @default(0)
  openingDate     DateTime?
  ledgerAccountId String                    // บัญชี GL ที่ผูก (สร้างบัญชีลูกใต้ 1000/1010 อัตโนมัติ)
  showOnDocuments Boolean            @default(false) // โชว์เป็นช่องทางชำระบนเอกสาร
  archivedAt      DateTime?

  payments        DocumentPayment[]

  @@index([systemId, type, archivedAt])
}

model Cheque {                              // P4
  id               String          @id @default(cuid())
  tenantId         String
  systemId         String
  direction        ChequeDirection
  chequeNo         String
  bankName         String
  bankBranch       String?
  chequeDate       DateTime                 // วันที่หน้าเช็ค
  amount           Int
  status           ChequeStatus             // IN: ON_HAND→DEPOSITED→CLEARED/BOUNCED · OUT: ISSUED→CLEARED/VOIDED
  financeAccountId String?                  // บัญชีที่นำฝาก/ตัดจ่าย
  clearedAt        DateTime?
  note             String?

  payment          DocumentPayment?

  @@index([systemId, direction, status])
}

// ───────────── 4.5 ผังบัญชี + mapping ─────────────

model LedgerAccount {
  id               String           @id @default(cuid())
  tenantId         String
  systemId         String
  code             String                   // "1150"
  name             String
  nameEn           String?
  type             AccountType
  cashflowActivity CashflowActivity @default(OPERATING) // ใช้จัดกลุ่มงบกระแสเงินสด
  parentId         String?
  parent           LedgerAccount?   @relation("AccountTree", fields: [parentId], references: [id])
  children         LedgerAccount[]  @relation("AccountTree")
  isSystem         Boolean          @default(false)
  archivedAt       DateTime?

  lines            JournalLine[]
  mappings         AccountMapping[]
  docLines         DocumentLine[]

  @@unique([systemId, code])
  @@index([systemId, type, archivedAt])
}

model AccountMapping {
  id        String        @id @default(cuid())
  tenantId  String
  systemId  String
  key       String                          // §7.10: "AR" "AP" "VAT_OUTPUT" "VAT_OUTPUT_UNDUE" "VAT_INPUT"
                                            // "VAT_INPUT_UNDUE" "WHT_ASSET" "WHT_PAYABLE" "DEPOSIT_RECEIVED"
                                            // "DEPOSIT_PAID" "INCOME_DEFAULT" "PURCHASE_DEFAULT" "EXPENSE_DEFAULT"
                                            // "DISCOUNT_GIVEN" "DISCOUNT_RECEIVED" "PAYMENT_FEE" "CHEQUE_IN_TRANSIT"
                                            // "DEPRECIATION_EXPENSE" "ASSET_DISPOSAL_GAIN" "SUSPENSE" + "DOC:{docType}" override
  accountId String
  account   LedgerAccount @relation(fields: [accountId], references: [id])

  @@unique([systemId, key])
  @@index([systemId])
}

// ───────────── 4.6 บัญชีรายวัน (immutable) ─────────────

model JournalEntry {
  id             String       @id @default(cuid())
  tenantId       String
  systemId       String
  docNo          String                     // "JV-2026-07-0001" (book GENERAL) — เอกสาร AUTO ใช้เลขเอกสารต้นทางเป็น ref
  book           JournalBook                // ขาย/ซื้อ/รับ/จ่าย/ทั่วไป (เมนูบัญชีรายวัน filter ตามนี้)
  journal        JournalType                // DOC | PAYMENT | ADJUST | REVERSAL | DEPRECIATION | OPENING
  date           DateTime
  periodKey      String                     // "2026-07" (timezone ระบบ)
  refType        String?                    // "Document" | "DocumentPayment" | "AssetDepreciation" | "PosSale"
  refId          String?
  memo           String?
  source         EntrySource
  status         EntryStatus  @default(POSTED)
  needsReview    Boolean      @default(false)
  idempotencyKey String?
  reversalOfId   String?      @unique
  reversalOf     JournalEntry? @relation("Reversal", fields: [reversalOfId], references: [id])
  reversedBy     JournalEntry? @relation("Reversal")
  postedById     String?

  lines          JournalLine[]

  @@unique([systemId, docNo])
  @@unique([tenantId, idempotencyKey])
  @@index([systemId, periodKey, book])
  @@index([systemId, date])
  @@index([refType, refId])
  @@index([systemId, needsReview])
}

model JournalLine {
  id        String        @id @default(cuid())
  tenantId  String
  systemId  String                          // denormalized — งบ query ตรงไม่ join
  entryId   String
  entry     JournalEntry  @relation(fields: [entryId], references: [id])
  accountId String
  account   LedgerAccount @relation(fields: [accountId], references: [id])
  debit     Int           @default(0)       // ≥0, ฝั่งเดียวต่อบรรทัด
  credit    Int           @default(0)
  contactId String?                         // ประกอบรายงานลูกหนี้/เจ้าหนี้รายตัว
  note      String?

  @@index([entryId])
  @@index([systemId, accountId])
  @@index([systemId, contactId, accountId])
}
// invariants (service + DB CHECK): debit≥0, credit≥0, ไม่ 0 ทั้งคู่/ไม่ >0 ทั้งคู่ · ต่อ entry: Σdebit == Σcredit ใน tx เดียวกับ insert

model AccountingPeriod {
  id         String       @id @default(cuid())
  tenantId   String
  systemId   String
  periodKey  String                          // "2026-07"
  status     PeriodStatus @default(OPEN)
  closedAt   DateTime?
  closedById String?
  reopenLog  Json         @default("[]")

  @@unique([systemId, periodKey])
}

// ───────────── 4.7 สินทรัพย์ + ค่าเสื่อม (P3) ─────────────

model FixedAsset {
  id               String      @id @default(cuid())
  tenantId         String
  systemId         String
  code             String                   // "FA-0001"
  name             String
  category         String?                  // "อุปกรณ์สำนักงาน" "ยานพาหนะ"
  acquiredDate     DateTime
  startDepDate     DateTime                 // เริ่มคิดค่าเสื่อม
  cost             Int
  salvageValue     Int         @default(100) // ซาก ≥ 1 บาทตามธรรมเนียม
  usefulLifeMonths Int                      // 60 = 5 ปี
  assetAccountId   String                   // 16xx สินทรัพย์
  accumAccountId   String                   // 16x9 ค่าเสื่อมสะสม
  expenseAccountId String                   // 6800 ค่าเสื่อมราคา
  sourceDocumentId String?                  // Document(ASSET_PURCHASE)
  status           AssetStatus @default(ACTIVE)
  disposedAt       DateTime?
  disposalAmount   Int?
  note             String?

  depreciations    AssetDepreciation[]

  @@unique([systemId, code])
  @@index([systemId, status])
}

model AssetDepreciation {
  id        String     @id @default(cuid())
  tenantId  String
  systemId  String
  assetId   String
  asset     FixedAsset @relation(fields: [assetId], references: [id])
  periodKey String                           // "2026-07"
  amount    Int                              // ค่าเสื่อมเดือนนี้
  entryId   String?                          // JournalEntry (DEPRECIATION)

  @@unique([assetId, periodKey])             // cron รันซ้ำได้ idempotent
  @@index([systemId, periodKey])
}

// ───────────── 4.8 คลังเอกสาร / การเชื่อมระบบ ─────────────

model Attachment {
  id         String    @id @default(cuid())
  tenantId   String
  systemId   String
  documentId String?                         // null = ไฟล์ลอยในคลังกลาง
  document   Document? @relation(fields: [documentId], references: [id])
  folder     String?                         // คลังกลาง: จัดโฟลเดอร์
  fileName   String
  fileUrl    String                          // object storage
  mimeType   String
  sizeBytes  Int
  uploadedById String

  @@index([systemId, documentId])
  @@index([systemId, folder])
}

model AccountSystemLink {                    // เชื่อม POS/business (opt-in — BLUEPRINT_SYSTEMS §3)
  id             String     @id @default(cuid())
  tenantId       String
  systemId       String                      // ระบบบัญชีชุดนี้
  linkedKind     LinkedKind                  // POS | BUSINESS
  linkedId       String                      // AppSystem.id (POS) | BusinessUnit.id (business)
  config         Json       @default("{}")   // POS: {autoPost: true, incomeAccountId, receiptAsAbb: true}
                                             // BUSINESS: {allowDocRef: true, defaultIncomeAccountId}
  archivedAt     DateTime?

  @@unique([systemId, linkedKind, linkedId]) // ระบบบัญชี 1 ชุดเชื่อมหลาย POS/หลาย business ได้
  @@index([linkedKind, linkedId])            // ฝั่ง POS หา account system ที่ต้อง post
}
```

**สรุป 20 models**: Document, DocumentLine, DocumentPayment, DocumentRelation, DocSequence, Contact, ProductUnit, Product, ClassificationGroup, FinanceAccount, Cheque, LedgerAccount, AccountMapping, JournalEntry, JournalLine, AccountingPeriod, FixedAsset, AssetDepreciation, Attachment, AccountSystemLink · settings อยู่ `AppSystem.settings` (§4.13)

### 4.13 `AppSystem.settings` (JSON — ไม่ใช่ตาราง)

```jsonc
{
  "org": { "legalName": "บริษัท ตัวอย่าง จำกัด", "legalNameEn": "", "taxId": "0105561000000",
           "branchCode": "00000", "branchName": "สำนักงานใหญ่", "address": {...},
           "logoUrl": "", "stampUrl": "", "signatureUrl": "",
           "vatRegistered": true, "vatRateBp": 700, "phone": "", "email": "", "website": "" },
  "timezone": "Asia/Bangkok",
  "doc": {                                  // ต่อ docType (ตั้งค่าเอกสาร §3.8)
    "INVOICE": { "prefix": "IV", "pattern": "{PREFIX}-{YYYY}-{MM}-{NNNN}", "resetBy": "MONTH",
                 "defaultNote": "ชำระภายในกำหนด...", "defaultDueDays": 30,
                 "payChannels": ["fin_acc_id1"], "publicLink": true, "publicHideDiscount": false,
                 "autoTaxInvoice": "WITH_RECEIPT",   // WITH_RECEIPT | SEPARATE | COMBINED_DOC
                 "journalOverrides": { "INCOME_DEFAULT": "acc_4030" } }
    // ... ต่อชนิด
  },
  "taxInvoiceRequest": { "enabled": true, "expireDays": 30 },   // ลิงก์ขอใบกำกับจากใบเสร็จ (QR)
  "approval": { "PURCHASE_ORDER": { "required": true, "limitSatang": 5000000 } },
  "etax": { "provider": null, "credentials": null }             // P4
}
```

### 4.14 ผังบัญชี template SME ไทย (seed, isSystem=true — ย่อเฉพาะโครง)

| ช่วง code | กลุ่ม | ตัวหลัก |
|---|---|---|
| 1000-1049 | เงินสด/ธนาคาร/e-Wallet/สำรองรับจ่าย | 1000 เงินสด · 1010 เงินฝากธนาคาร · 1020 e-Wallet · 1030 เงินสำรองรับจ่าย · 1040 เช็ครับรอนำฝาก |
| 1100-1199 | ลูกหนี้+ภาษีฝั่งสินทรัพย์ | 1100 ลูกหนี้การค้า · 1130 เงินมัดจำจ่าย · 1150 ภาษีซื้อ · 1155 ภาษีซื้อยังไม่ถึงกำหนด (รอใบกำกับ) · 1160 ภาษีถูกหัก ณ ที่จ่าย |
| 1200 | สินค้าคงเหลือ | (มูลค่า 🔜) |
| 1600-1699 | สินทรัพย์ถาวร | 1610 อุปกรณ์ · 1619 คส.สะสม-อุปกรณ์ · 1620 เครื่องตกแต่ง · 1629 คส.สะสม · 1630 ยานพาหนะ · 1639 คส.สะสม (INVESTING) |
| 2100-2299 | หนี้สิน | 2100 เจ้าหนี้การค้า · 2110 เงินมัดจำรับ/เงินรับล่วงหน้า · 2130 ภาษีหัก ณ ที่จ่ายค้างนำส่ง · 2200 ภาษีขาย · 2210 ภาษีขายยังไม่ถึงกำหนด (บริการรอรับเงิน) · 2300 เช็คจ่ายรอเรียกเก็บ |
| 3000-3999 | ส่วนของเจ้าของ | 3000 ทุน (FINANCING) · 3800 กำไรสะสม (virtual v1) |
| 4000-4999 | รายได้ | 4000 รายได้ขายสินค้า · 4030 รายได้ค่าบริการ · 4800 ส่วนลดจ่าย (contra) · 4900 รายได้อื่น |
| 5000-5999 | ต้นทุน | 5000 ซื้อสินค้า/ต้นทุนขาย · 5800 ส่วนลดรับ (contra) |
| 6000-6999 | ค่าใช้จ่าย | 6000 เงินเดือน · 6100 ค่าเช่า · 6200 น้ำ/ไฟ/เน็ต · 6300 การตลาด · 6500 ค่าธรรมเนียมชำระเงิน · 6800 ค่าเสื่อมราคา · 6900 ค่าใช้จ่ายอื่น |
| 9999 | พักรายการ | SUSPENSE — ต้องเป็น 0 ก่อนปิดงวด |

---

## 5. API Endpoints

> ทั้งหมดอยู่ใต้ `/api/sys/[systemId]/account/...` (middleware: systemId ∈ tenant + `can()`) · public อยู่ใต้ `/api/pub/account/...` · เงิน = Int สตางค์

### 5.1 เอกสาร (generic ทุก docType — engine เดียว)

| # | Method + Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| 1 | `GET /docs/:docType` | list — `?tab=` (ชื่อแท็บตาม §3.0.3: awaiting/paid/overdue/all/recent) `&q=&contactId=&category=&from=&to=&page=` | account.doc.view |
| 2 | `POST /docs/:docType` | สร้าง DRAFT `{contactId?, issueDate, dueDate?, vatMode, vatTiming?, lines[], discountAmount, note, categoryId?, refType?, refId?}` — server คำนวณยอดทุกชั้นเอง (client ส่ง input ดิบ) | account.doc.create |
| 3 | `GET /docs/:docType/:id` | รายละเอียด + lines + payments + relations + attachments + journal ref | account.doc.view |
| 4 | `PATCH /docs/:docType/:id` | แก้ — **DRAFT เท่านั้น** (พ้นแล้ว 409) | account.doc.create |
| 5 | `POST /docs/:docType/:id/issue` | DRAFT → มีผล (ตาม state machine ของชนิด): จองเลข docNo + freeze snapshot + **โพสต์ journal** (§7.10) | account.doc.issue |
| 6 | `POST /docs/:docType/:id/submit-approval` · `/approve` · `/reject` | workflow อนุมัติ (PO/APO/ชนิดที่เปิด approval) — approve เกินวงเงิน → 403 | account.doc.approve |
| 7 | `POST /docs/:docType/:id/accept` · `/decline` | ใบเสนอราคา: บันทึกตอบรับ/ปฏิเสธ (มือ — ฝั่ง public ใช้ #30) | account.doc.create |
| 8 | `POST /docs/:docType/:id/void` | ยกเลิกเอกสารมีผล `{reason}` → reversal journal + คืนสถานะ relation (มัดจำกลับเป็นรอหัก ฯลฯ) | account.doc.void |
| 9 | `POST /docs/:docType/:id/convert` | แปลงเอกสาร `{toDocType, lines?: subset, deposits?: [{docId, amount}]}` → สร้าง DRAFT ปลายทาง + relation CONVERT/DEPOSIT_APPLY | account.doc.create |
| 10 | `POST /docs/:docType/:id/payments` | บันทึกรับ/จ่ายเงิน `{paidAt, channel, financeAccountId, amount, whtAmountSatang?, whtRateBp?, whtIncomeType?, feeAmount?, chequeNo…?}` → โพสต์ journal + ปรับสถานะ (PARTIAL/PAID) + auto ออก RECEIPT/WHT_CERT ตามตั้งค่า | account.payment.record |
| 11 | `POST /docs/:docType/:id/payments/:payId/void` | ยกเลิกการชำระ `{reason}` → reversal + ถอยสถานะ | account.payment.void |
| 12 | `POST /docs/:docType/:id/tax-invoice` | ออกใบกำกับภาษีจาก RECEIPT/INVOICE `{buyer?}` (default = contactSnapshot) — 1 ต้นทาง 1 ใบ ISSUED | account.doc.issue |
| 13 | `GET /docs/:docType/:id/pdf` | PDF (A4 / 80mm ตามชนิด, โลโก้+ตราประทับ+ลายเซ็น) | account.doc.view |
| 14 | `POST /docs/:docType/:id/email` | ส่งอีเมล `{to, message?}` ผ่าน notify() + แนบ PDF | account.doc.view |
| 15 | `POST /docs/:docType/:id/public-link` · `DELETE` | เปิด/ปิดลิงก์สาธารณะ (คืน URL `/pub/account/d/{token}`) | account.doc.issue |
| 16 | `POST /docs/billing-note` (ผ่าน #2 พร้อม `invoiceIds[]`) · `POST /docs/combined-payment` (พร้อม `purchaseIds[]`) | สร้างใบวางบิล/ใบรวมจ่ายจากหลายใบ → relation BILL/PAY_GROUP + ตรวจผู้ติดต่อเดียวกัน | account.doc.create |
| 17 | `POST /docs/:docType/:id/attachments` · `DELETE .../:attId` | แนบ/ลบไฟล์ | account.doc.create |
| 18 | `POST /docs/purchase-tax-invoice/:id/receive` | ใบกำกับภาษีซื้อ: มาแล้ว → RECEIVED + โอน 1155→1150 | account.payment.record |

### 5.2 ผู้ติดต่อ / สินค้า / หน่วย / กลุ่ม

| # | Path | ทำอะไร |
|---|---|---|
| 19 | `GET·POST /contacts` · `GET·PATCH /contacts/:id` · `POST /contacts/:id/archive` | CRUD ผู้ติดต่อ (validate taxId checksum) — `GET /contacts/:id/summary` = ยอดค้างรับ/จ่าย + เอกสารล่าสุด |
| 20 | `GET·POST /products` · `GET·PATCH /products/:id` · archive | CRUD สินค้า/บริการ |
| 21 | `GET·POST /units` · `PATCH /units/:id` | หน่วย |
| 22 | `GET·POST /categories` · `PATCH /categories/:id` | กลุ่มจัดประเภท |

### 5.3 การเงิน

| # | Path | ทำอะไร |
|---|---|---|
| 23 | `GET·POST /finance-accounts` · `PATCH /finance-accounts/:id` | บัญชีเงิน + ยอดยกมา (สร้าง GL ลูกอัตโนมัติ) |
| 24 | `GET /finance-accounts/:id/statement?from=&to=` | ความเคลื่อนไหว + ยอดคงเหลือ |
| 25 | `POST /finance-transfers` | โอนระหว่างบัญชีเงิน `{fromId, toId, amount, date}` → JV ทั่วไป |
| 26 | `GET /wht?direction=IN\|OUT&period=` | ทะเบียน WHT สองขา (จาก DocumentPayment) + `GET /wht/pnd?type=3\|53&period=` สรุป ภ.ง.ด. + export |
| 27 | `GET·POST /cheques` · `POST /cheques/:id/deposit` · `/clear` · `/bounce` · `/void` | เช็ครับ/จ่าย lifecycle (P4) — โพสต์ journal ตามขั้น |

### 5.4 บัญชี / งบ / งวด (P3)

| # | Path | ทำอะไร |
|---|---|---|
| 28 | `GET /journal?book=&period=&needsReview=` · `GET /journal/:id` · `POST /journal` (JV มือ) · `POST /journal/:id/reverse` | บัญชีรายวัน 5 เล่ม + JV + กลับรายการ |
| 29 | `GET·POST /chart` · `PATCH /chart/:id` · `GET·PUT /mappings` | ผังบัญชี + posting mapping |
| 30 | `GET /reports/general-ledger?accountId=&from=&to=` · `/trial-balance?asOf=` · `/pnl?period=` · `/balance-sheet?asOf=` · `/cashflow?from=&to=` · `/vat?period=` (ภ.พ.30+รายงานภาษีขาย/ซื้อ) · `/ar-aging` · `/ap-aging` · `/doc-report?docType=` | งบ+รายงานทั้งหมด — ทุกตัวรับ `?format=csv` (UTF-8 BOM) |
| 31 | `GET /periods` · `POST /periods/:key/close` · `/reopen` | ปิดงวด (pre-close checklist) |
| 32 | `GET·POST /assets` · `PATCH /assets/:id` · `POST /assets/:id/dispose` · `POST /assets/run-depreciation {periodKey}` | ทะเบียนสินทรัพย์ + ค่าเสื่อม (cron เรียก run-depreciation — idempotent) |
| 33 | `GET /exports/dbd?year=` | DBD e-Filing Excel (P4) |

### 5.5 คลังเอกสาร / ตั้งค่า / เชื่อมระบบ

| # | Path | ทำอะไร |
|---|---|---|
| 34 | `GET /library?folder=&q=` · `POST /library/upload` · `DELETE /library/:id` | คลังเอกสารกลาง |
| 35 | `GET·PUT /settings/org` · `GET·PUT /settings/doc/:docType` · `GET·PUT /settings/approval` | ตั้งค่า (§3.8) — เปลี่ยน prefix มีผลเอกสารใหม่เท่านั้น |
| 36 | `GET /links` · `POST /links {linkedKind, linkedId, config}` · `PATCH /links/:id` · `DELETE /links/:id` | เชื่อม/ถอด POS + business (§8) |

### 5.6 Public (ไม่ต้อง login — rate limit + token)

| # | Path | ทำอะไร |
|---|---|---|
| 37 | `GET /api/pub/account/d/:token` | หน้าเอกสารสาธารณะ (ตาม publicLink settings — ซ่อน field ตามตั้งค่า) + ปุ่ม PDF |
| 38 | `POST /api/pub/account/d/:token/accept` · `/decline` | ลูกค้าตอบรับใบเสนอราคา (เก็บ IP/UA/เวลาใน audit) |
| 39 | `GET /api/pub/account/tax-request/:token` · `POST` | **ลิงก์ขอใบกำกับภาษี**: ลูกค้ากรอกชื่อ/เลขภาษี/สาขา/ที่อยู่/อีเมล จากใบเสร็จ (QR) → สร้าง TAX_INVOICE (ตาม autoTaxInvoice policy: auto-issue หรือรอ staff กดยืนยัน) + ส่งอีเมล PDF |

**รวม ~39 กลุ่ม endpoint** (นับแยก method ~70 เส้นทาง) — facade `account.postSale/postRefund/postVoid` เป็น internal service function ไม่ใช่ REST (§8)

---

## 6. UI Screens

> Sidebar ตามหมวดเมนูเจ้าของ**เป๊ะ** · B&W minimal, i18n TH/EN, mobile-first, empty/loading/error ครบ · ทุก list: แท็บสถานะตาม §3.0.3 + ค้นหา + filter ช่วงเวลา/ผู้ติดต่อ/กลุ่ม + export CSV · ทุกฟอร์มเอกสาร = โครงเดียว (หัวเอกสาร→ผู้ติดต่อ→ตารางบรรทัดสินค้า(+VAT/หน่วย/ส่วนลดบรรทัด)→ส่วนลดท้ายบิล→VAT include/exclude→WHT preview→หักมัดจำ→หมายเหตุ→แนบไฟล์) + ปุ่ม บันทึกร่าง/ออกเอกสาร/พิมพ์/PDF/อีเมล/ลิงก์สาธารณะ/แปลงเอกสาร/ประวัติ(audit)

```
Sidebar:  หน้าแรก
          รายรับ      ▸ ใบเสนอราคา · ใบแจ้งหนี้ · ใบเสร็จรับเงิน · ใบกำกับภาษีขาย · ใบรับเงินมัดจำ
                        · ใบลดหนี้ · ใบเพิ่มหนี้ · ใบวางบิล
          รายจ่าย     ▸ บันทึกซื้อสินค้า · บันทึกค่าใช้จ่าย · ใบสั่งซื้อ (PO) · ใบสั่งซื้อสินทรัพย์
                        · ซื้อสินทรัพย์ · ใบกำกับภาษีซื้อ · ใบจ่ายเงินมัดจำ · รับใบลดหนี้ · รับใบเพิ่มหนี้ · ใบรวมจ่าย
          ผู้ติดต่อ    ▸ ลูกค้า · ผู้ขาย
          สินค้า      ▸ สินค้า/บริการ · หน่วย · ใบเบิกสินค้า · ใบส่งคืนเบิกสินค้า
          การเงิน     ▸ เงินสด/ธนาคาร/e-Wallet · สำรองรับจ่าย · ภาษีถูกหัก ณ ที่จ่าย · ภาษีหัก ณ ที่จ่าย (50 ทวิ)
                        · เช็ครับ · เช็คจ่าย
          บัญชี       ▸ บัญชีรายวัน · บัญชีแยกประเภท · งบทดลอง · งบกำไรขาดทุน · งบฐานะการเงิน
                        · งบกระแสเงินสด · ผังบัญชี · สินทรัพย์/ค่าเสื่อม · ภาษี (ภ.พ.30/ภ.ง.ด.) · ปิดงวด · DBD e-Filing
          คลังเอกสาร
          ตั้งค่า      ▸ องค์กร · ผู้ใช้งานและสิทธิ์ · เอกสาร · การเชื่อมต่อระบบ
```

| # | หน้า | เนื้อหา (นอกเหนือโครง list/form มาตรฐาน) | เฟส |
|---|---|---|---|
| S1 | หน้าแรก `/app/sys/[id]` | การ์ด: ค้างรับ/ค้างจ่าย/พ้นกำหนด (จำนวน+ยอด), เงินคงเหลือรวมต่อบัญชี, กำไรเดือนนี้ (มินิ P&L), รายการรอ (รออนุมัติ/รอตอบรับ/รอหักมัดจำ/needsReview), shortcut สร้างเอกสารยอดฮิต | P1 |
| S2-S3 | ใบเสนอราคา list + form | ปุ่ม "แปลงเป็นใบแจ้งหนี้/ใบรับเงินมัดจำ" บนใบ ACCEPTED · แสดงสถานะการเปิดดูลิงก์ | P1 |
| S4-S5 | ใบแจ้งหนี้ list + form | form มี "หักมัดจำ" (picker ใบมัดจำรอหักของลูกค้ารายนี้) · หน้า detail: timeline รับชำระ + ปุ่มรับชำระ (modal §S6) + ออกใบเสร็จ/ใบกำกับ/ลดหนี้/เพิ่มหนี้ | P1 |
| S6 | Modal รับ/จ่ายชำระ | วันที่, ช่องทาง (บัญชีเงิน), ยอด (default = คงค้าง), WHT (rate → คำนวณ, แสดง "รับจริง"), ค่าธรรมเนียม, เช็ค (P4) — ใช้ร่วมทุกเอกสารฝั่งเงิน | P1 |
| S7-S8 | ใบเสร็จรับเงิน list + detail | ปุ่มออกใบกำกับภาษี + QR ลิงก์ขอใบกำกับ (พิมพ์บนใบเสร็จ) | P1 |
| S9 | ใบกำกับภาษีขาย list + detail | แท็บ ออกแล้ว/e-Tax/ทั้งหมด/ล่าสุด · void+ออกใบแทน · (P4) ปุ่มส่ง e-Tax + สถานะ | P1 |
| S10 | ใบรับเงินมัดจำ list + form | คอลัมน์ "คงเหลือให้หัก" · detail: ใบแจ้งหนี้ที่หักไปแล้ว | P1 |
| S11 | ใบลดหนี้ / ใบเพิ่มหนี้ list + form | บังคับเลือกเอกสารอ้างอิง + เหตุผล · แสดงผลกระทบยอดลูกหนี้ | P1 |
| S12 | ใบวางบิล list + form | เลือกหลายใบแจ้งหนี้ (checkbox จาก list ค้างชำระของลูกค้า) · รับชำระจากใบวางบิล → กระจายตัด | P1 |
| S13 | หน้าเอกสารสาธารณะ (public) | เอกสารสวยพิมพ์ได้ + ปุ่มยอมรับ/ปฏิเสธ (QT) + ดาวน์โหลด PDF — ตามตั้งค่าการแสดงข้อมูลสาธารณะ | P1 |
| S14-S15 | บันทึกซื้อสินค้า / บันทึกค่าใช้จ่าย list + form | form: บรรทัด = สินค้า (PC) / หมวดบัญชี (EX) · VAT ซื้อ 3 โหมด · จ่ายทันที/ตั้งเจ้าหนี้ · WHT ตอนจ่าย · ถ่ายรูปใบเสร็จแนบ (mobile flow ≤ 30 วิ) | P2 |
| S16-S17 | PO / ใบสั่งซื้อสินทรัพย์ list + form | ปุ่มส่งอนุมัติ · แถบผู้อนุมัติ+วงเงิน · แปลงเป็นบันทึกซื้อ/ซื้อสินทรัพย์ | P2 |
| S18 | ซื้อสินทรัพย์ list + form | + ปุ่ม "รับใบเสร็จแล้ว" + ลิงก์ขึ้นทะเบียนสินทรัพย์ (P3) | P2 |
| S19 | ใบกำกับภาษีซื้อ list | แท็บ รอรับ/รับแล้ว · ปุ่ม "รับแล้ว" · เตือนใกล้หมดสิทธิ์เคลม 6 เดือน | P2 |
| S20 | ใบจ่ายเงินมัดจำ / รับใบลดหนี้ / รับใบเพิ่มหนี้ / ใบรวมจ่าย | mirror ฝั่งรายรับ | P2 |
| S21 | ลูกค้า / ผู้ขาย list + โปรไฟล์ | โปรไฟล์: การ์ดค้างรับ-จ่าย + เอกสารทุกชนิด + เครดิตเทอม + aging (P3) | P1 |
| S22 | สินค้า/บริการ + หน่วย | list + form + ความเคลื่อนไหวจำนวน (P2) | P1 |
| S23 | ใบเบิกสินค้า / ใบส่งคืน | list + form (บรรทัดสินค้า+จำนวน+เหตุผล) | P2 |
| S24 | เงินสด/ธนาคาร/e-Wallet + สำรองรับจ่าย | การ์ดต่อบัญชี (ยอดคงเหลือ) + statement + โอนระหว่างบัญชี + เติม/เบิกชดเชย petty cash | P2 |
| S25 | ภาษีถูกหัก / ภาษีหัก ณ ที่จ่าย | ทะเบียน 2 ขา + ปุ่มดู/พิมพ์ 50 ทวิ + สรุป ภ.ง.ด.3/53 รายเดือน + export | P2 |
| S26 | คลังเอกสาร | grid/list ไฟล์ทั้งหมด (ผูกเอกสาร+ลอย) + โฟลเดอร์ + upload + preview | P1 |
| S27 | การเชื่อมต่อระบบ | list POS/business ที่เชื่อม + ปุ่มเชื่อม (เลือกจากระบบใน tenant) + config ต่อ link + สถานะไหลเข้าล่าสุด | P2 |
| S28 | บัญชีรายวัน | แท็บ ทั้งหมด/ซื้อ/ขาย/จ่าย/รับ/ทั่วไป/ล่าสุด · drawer entry+lines คลิกทะลุเอกสาร · ปุ่ม JV มือ + กลับรายการ | P3 |
| S29 | บัญชีแยกประเภท + งบทดลอง | GL: เลือกบัญชี/ช่วง · TB: ตารางเต็ม + drill ลง GL | P3 |
| S30 | งบกำไรขาดทุน / งบฐานะการเงิน / งบกระแสเงินสด | เลือกงวด/เทียบงวดก่อน/12 เดือน + drill + export + print stylesheet | P3 |
| S37 | ผังบัญชี | tree ตาม type + movement เดือนนี้ + เพิ่ม/แก้/archive | P3 |
| S38 | สินทรัพย์/ค่าเสื่อม | ทะเบียน (มูลค่าสุทธิ, สะสม) + ตารางค่าเสื่อมต่อตัว + ปุ่มขาย/ตัดจำหน่าย + สถานะ cron เดือนล่าสุด | P3 |
| S39 | ภาษี (ภ.พ.30) | สรุปภาษีขาย-ซื้อ + รายงานภาษีขาย/รายงานภาษีซื้อ (ฟอร์มตามสรรพากร: เลขใบกำกับ/วันที่/ชื่อ-เลขภาษีคู่ค้า/ฐาน/VAT) + export | P3 |
| S40 | ปิดงวด | รายการเดือน + checklist (suspense=0, review=0, ค่าเสื่อมรันแล้ว) + ปิด/เปิดงวด | P3 |
| S41-S44 | ตั้งค่า: องค์กร / ผู้ใช้งานและสิทธิ์ / เอกสาร (ต่อ docType — ทุกหัวข้อ §3.8) / ลิงก์ขอใบกำกับ | form sections + ตัวอย่างเลขรัน live preview | P1 |
| S45 | เช็ครับ / เช็คจ่าย | ทะเบียน + lifecycle ปุ่มตามสถานะ + เตือนเช็คถึงกำหนด | P4 |
| S46 | DBD e-Filing | เลือกปีงบ → preview งบ → download Excel template DBD | P4 |
| S47 | e-Tax console | คิวส่ง/สำเร็จ/ล้มเหลว + retry + ตั้งค่า provider | P4 |
| S31-S36 | (public) หน้าเอกสาร/ตอบรับ/ขอใบกำกับ + PDF templates (A4 เอกสารทุกชนิด, 80mm, 50 ทวิฟอร์มราชการ) | | P1-P2 |

**รวม ~47 หน้าจอ** (dashboard ~40 + public 3 + PDF template ชุด)

---

## 7. Business Flows

### F1 — Pipeline ขายเต็มวงจร (QT → IV → รับเงิน → RE+TX)

```
1. สร้าง QUOTATION DRAFT → issue → AWAITING_ACCEPT → ส่งลิงก์/อีเมล
2. ลูกค้ากดยอมรับบนหน้า public (#38) → ACCEPTED (เก็บ IP/เวลา)
3. กด "แปลงเป็นใบแจ้งหนี้" (#9) → INVOICE DRAFT (copy contact snapshot + lines ทั้งหมดหรือบางบรรทัด)
   + DocumentRelation(QT→IV, CONVERT) · QT ใบเดิมไม่แตะ
4. issue INVOICE → จองเลข IV + โพสต์ journal (สมุดขาย):
      Dr 1100 ลูกหนี้ (grandTotal)
         Cr 4000/4030 รายได้ (subTotal − discount)   [+ Dr 4800 ส่วนลดจ่าย ถ้าแยกบรรทัดส่วนลด]
         Cr 2200 ภาษีขาย (vatAmount)                 [vatTiming=ON_PAYMENT → Cr 2210 แทน]
5. ลูกค้าชำระ → บันทึกรับชำระ (#10): Dr 1010 เงินฝาก / [Dr 1160 ภาษีถูกหัก ถ้ามี WHT] / Cr 1100 ลูกหนี้
   [ON_PAYMENT: + Dr 2210 / Cr 2200 โอน VAT ถึงกำหนดตามสัดส่วนรับเงิน]
   → paidTotal ครบ → PAID → auto ออก RECEIPT + TAX_INVOICE ตาม settings.doc.INVOICE.autoTaxInvoice
6. Failure: แก้ใบ issue แล้ว → 409 แนะนำ void+ออกใหม่ หรือ CN/DN · void IV ที่มี payment → ต้อง void payment ก่อน
```

### F2 — มัดจำ (รับ → หักในใบแจ้งหนี้) — ภาษีถูกต้องไม่ซ้ำไม่ขาด

```
รับมัดจำ 1,070 (รวม VAT): DEPOSIT_RECEIPT issue+รับเงิน →
      Dr 1010 เงินฝาก 107000 / Cr 2110 เงินมัดจำรับ 100000 · Cr 2200 ภาษีขาย 7000
      + ออกใบกำกับภาษีมัดจำ (กฎหมาย: VAT เกิดตอนรับเงิน) → สถานะ AWAITING_DEDUCT
งานจริง 5,350 (รวม VAT): สร้าง INVOICE เลือกหักมัดจำใบนี้เต็ม 1,070 → grandTotal คงเหลือ 4,280
      posting ตอน issue: Dr 1100 ลูกหนี้ 428000 · Dr 2110 มัดจำรับ 100000
                          / Cr 4030 รายได้ 500000 · Cr 2200 ภาษีขาย 28000     (Σ 528000 = 528000 ✓)
      → ใบกำกับของ INVOICE ออกฐาน 4,000 + VAT 280 (ส่วนที่ยังไม่เคยออก) — VAT รวมสองใบ = 350 ✓
      → DEPOSIT_RECEIPT เปลี่ยนเป็น DEDUCTED (หักครบ) · หักบางส่วนได้หลายใบ (Σ apply ≤ ยอดมัดจำ)
ฝั่งจ่าย (DEPOSIT_PAYMENT → หักในบันทึกซื้อ) = mirror ผ่าน 1130 เงินมัดจำจ่าย + 1150/1155 ภาษีซื้อ
```

### F3 — ใบวางบิล + รับชำระรวม

```
1. เลือกใบแจ้งหนี้ค้าง 3 ใบของลูกค้า A → BILLING_NOTE (relation BILL ×3 + amount ต่อใบ) → ISSUED → ส่งลูกค้า
2. ลูกค้าโอนก้อนเดียว → บันทึกรับชำระที่ใบวางบิล → ระบบสร้าง DocumentPayment กระจายตัดทีละใบ (เรียงเก่า→ใหม่
   หรือระบุเอง) — journal ก้อนเดียว: Dr เงิน / Cr ลูกหนี้ (Σ ตรงกัน) · ทุก IV PAID → BN = PAID
3. ยอดโอนขาด → ตัดบางใบ PARTIAL — BN ค้าง ISSUED · ใบรวมจ่าย (COMBINED_PAYMENT) = mirror ฝั่งเจ้าหนี้ + WHT รวมใบเดียว
```

### F4 — ลดหนี้/เพิ่มหนี้

```
CN: อ้าง INVOICE/RECEIPT เดิม + เหตุผล + บรรทัดที่ลด → issue → journal (สมุดขาย):
      Dr 4000 รายได้ (ฐานลด) · Dr 2200 ภาษีขาย (VAT ลด) / Cr 1100 ลูกหนี้ (หรือ Cr เงิน ถ้าคืนเงินสด)
    → ยอดค้างใบเดิมลด · ใบเดิมสถานะไม่เปลี่ยน (ประวัติผ่าน relation ADJUST)
DN: กลับด้าน (Dr 1100 / Cr รายได้ + VAT) · ฝั่งซื้อ (CNR/DNR) mirror ผ่าน 2100/1150
```

### F5 — รายจ่าย + WHT + 50 ทวิ (P2)

```
ค่าเช่า 10,000 + VAT 700 = 10,700 หัก WHT 5% (ของฐาน 10,000) = 500 → จ่ายจริง 10,200
1. EXPENSE บรรทัดผูกบัญชี 6100 → issue (ตั้งเจ้าหนี้): Dr 6100 ค่าเช่า 1000000 · Dr 1150 ภาษีซื้อ 70000
      / Cr 2100 เจ้าหนี้ 1070000
2. จ่ายชำระ + WHT 5%: Dr 2100 เจ้าหนี้ 1070000 / Cr 1010 เงินฝาก 1020000 · Cr 2130 WHT ค้างนำส่ง 50000
   → auto ออก WHT_CERT (50 ทวิ — เลขรัน WHT, ประเภทเงินได้ ม.40(5), 5%, PDF ฟอร์มราชการ) ผูก payment
3. สิ้นเดือน: S25 สรุป ภ.ง.ด.53 (Σ 2130 เดือนนั้น รายใบ) → export ยื่น → บันทึกจ่ายภาษี (JV: Dr 2130 / Cr เงิน)
ฝั่งถูกหัก (ลูกค้าหักเรา): payment ของ INVOICE ใส่ whtAmount → Dr 1160 สะสมเป็นเครดิตภาษี + แนบสำเนา 50 ทวิที่ได้รับ
```

### F6 — POS link: บิลขายหน้าร้านไหลเข้าอัตโนมัติ (P2 — §8)

```
1. เชื่อม POS ระบบ "ร้านกาแฟ" เข้า Account (S27, opt-in) → AccountSystemLink(POS, autoPost)
2. POS ปิดบิล → outbox เรียก account.postSale({...contract 2.4, idempotencyKey}) → Account:
   - สร้าง Document(RECEIPT, source AUTO, refType "PosSale", refSystemId=POS) สถานะ PAID
     [+ TAX_INVOICE_ABB ถ้าองค์กรจด VAT — เลขรัน TXA คืน abbInvoiceNo ให้ POS พิมพ์ท้ายใบเสร็จ]
   - โพสต์ journal (สมุดรับ): Dr เงินตาม payMethods / Dr ส่วนลด / Cr รายได้ (mapping ต่อ link) · Cr 2200 VAT
3. refund/void จาก POS → postRefund/postVoid → เอกสาร+reversal อัตโนมัติ
4. ลูกค้า POS ขอใบกำกับเต็มรูป → สแกน QR ใบเสร็จ → F7 (ออก TAX_INVOICE เต็มรูปแทน ABB — void ABB อ้างกัน)
5. posting fail → POS retry queue — บิลไม่ล้ม (contract 2.4) · reconcile รายวันเทียบ Σ PosSale vs journal
```

### F7 — ลิงก์ขอใบกำกับภาษี (public)

```
1. ใบเสร็จ (พิมพ์/PDF) มี QR → /pub/account/tax-request/{token} (อายุตาม expireDays)
2. ลูกค้ากรอก ชื่อ/เลขภาษี (validate checksum)/สนญ.-สาขา/ที่อยู่/อีเมล
3. ระบบ: ตรวจ 1 ใบเสร็จ = 1 ใบกำกับเต็มรูป → auto-issue (หรือเข้าคิวรอ staff ยืนยันตามตั้งค่า)
   → void ABB เดิม (ถ้ามี) → PDF ส่งอีเมล + แจ้ง staff ผ่าน notify()
4. token หมดอายุ/ใบเสร็จ void → หน้า error ภาษาคน + ช่องทางติดต่อร้าน
```

### F8 — ค่าเสื่อมรายเดือน (P3)

```
cron สิ้นเดือน (หรือกดรันเอง): ทุก FixedAsset ACTIVE →
   amount = round((cost − salvage) / usefulLifeMonths)  · เดือนสุดท้าย = ยอดคงเหลือทั้งหมด (เก็บเศษปัด)
   upsert AssetDepreciation(assetId, periodKey) — unique กันรันซ้ำ → JournalEntry(DEPRECIATION, สมุดทั่วไป):
   Dr 6800 ค่าเสื่อมราคา / Cr 16x9 ค่าเสื่อมสะสม (รายตัวหรือรวมกลุ่มบัญชีเดียวกัน)
   ครบอายุ → status FULLY_DEPRECIATED · งวดปิดแล้ว → ลงงวดเปิดถัดไป + needsReview
```

### F9 — ปิดงวด / F10 — กลับรายการ

เหมือนสเปคเดิม (pre-close checklist: suspense=0 · needsReview=0 · ค่าเสื่อมรันแล้ว (P3) · ไม่มี posting fail ค้าง) — งวดปิด: MANUAL → 423, AUTO → เลื่อนงวดเปิดถัดไป + needsReview · reversal = entry ใหม่ dr/cr สลับ อ้าง `reversalOfId`

### 7.10 Posting rules ต่อ docType (สรุป — mapping resolve: `DOC:{docType}` override → key กลาง → SUSPENSE+needsReview)

| เหตุการณ์ | Dr | Cr | สมุด |
|---|---|---|---|
| INVOICE issue | 1100 ลูกหนี้ (+4800 ส่วนลด) | รายได้ 4xxx, 2200/2210 VAT | ขาย |
| INVOICE/BN รับชำระ | เงิน 10xx, 1160 WHT ถูกหัก, 6500 ค่าธรรมเนียม | 1100 ลูกหนี้ (+2210→2200 ถ้า ON_PAYMENT) | รับ |
| RECEIPT ขายสด | เงิน 10xx | รายได้, 2200 | รับ |
| DEPOSIT_RECEIPT รับเงิน | เงิน 10xx | 2110 มัดจำรับ, 2200 | รับ |
| IV หักมัดจำ (ใน issue) | 2110 (ฐานมัดจำ) | — (รวมในก้อน issue F2) | ขาย |
| CN issue | รายได้, 2200 | 1100 / เงิน | ขาย |
| DN issue | 1100 | รายได้, 2200 | ขาย |
| PURCHASE/EXPENSE issue | 5000/6xxx (+1150/1155 VAT ซื้อ) | 2100 เจ้าหนี้ / เงิน (จ่ายสด) | ซื้อ |
| จ่ายชำระ (+WHT) | 2100 | เงิน 10xx, 2130 WHT ค้างนำส่ง | จ่าย |
| ASSET_PURCHASE issue | 16xx สินทรัพย์ (+1150) | 2100 / เงิน | ซื้อ |
| PURCHASE_TAX_INVOICE รับแล้ว | 1150 | 1155 | ทั่วไป |
| DEPOSIT_PAYMENT จ่าย | 1130 มัดจำจ่าย (+1150) | เงิน | จ่าย |
| CNR/DNR | 2100 ↔ 5xxx/6xxx + 1150 (ตามทิศ) | | ซื้อ |
| เช็ครับ (P4) | 1040 เช็ครอนำฝาก → เคลียร์: 1010 | 1100 → 1040 | รับ/ทั่วไป |
| ค่าเสื่อม | 6800 | 16x9 | ทั่วไป |
| VOID เอกสารใดๆ | reversal ทั้งก้อน (dr/cr สลับ) | | เล่มเดิม |

---

## 8. Integration

### 8.1 เชื่อม POS (feature↔feature — `AccountSystemLink` kind POS, opt-in)

- Account 1 ชุดรับได้**หลาย POS** (หลายร้านลงบัญชีเล่มเดียว) · POS 1 ชุดควรผูก Account เดียว (service ตรวจเตือนถ้าซ้ำ)
- **Facade contract 2.4 คงเดิม** (โมดูลอื่นห้ามรู้ account code): `account.postSale / postRefund / postVoid({...})` → `{journalId, abbInvoiceNo}` — ภายใน: resolve link → สร้าง Document(RECEIPT/TAX_INVOICE_ABB, AUTO) + journal · idempotent `(tenantId, idempotencyKey)` · POS ไม่เชื่อม Account = ขายได้ปกติ ไม่มี posting (standalone ตามหลัก BLUEPRINT)
- `account.postPointBurn / postExpense` ตาม contract เดิม — ใช้เมื่อ POS นั้นพ่วง Point
- Side effects วิ่ง **outbox กลาง + retry** — บิลไม่ล้มเพราะบัญชีล่ม · reconcile รายวัน (Σ PosSale ต่อ payMethod vs journal) เป็นตาข่าย

### 8.2 เชื่อมระบบ business (Booking/Hotel/Restaurant/Ticket — kind BUSINESS)

- เชื่อมแล้ว: หน้า job/booking ของระบบนั้นมีปุ่ม **"สร้างใบเสนอราคา/ใบแจ้งหนี้จากงานนี้"** → เปิดฟอร์ม P1 พร้อม prefill (ลูกค้า→Contact findOrCreate จาก member, รายการ→lines, `refSystemId/refType/refId` ชี้กลับงาน) — เอกสารอ้างงานได้ เอกสารโชว์ลิงก์กลับ, งานโชว์เอกสารที่ออก
- ธุรกรรมเงินสดหน้างานของ business ยังวิ่งผ่าน POS (contract 2.1) — เส้นนี้สำหรับงานเครดิต/B2B ที่ต้องออกเอกสารเป็นทางการ

### 8.3 เรียกออก

| ไป | ใช้ทำอะไร |
|---|---|
| **Notification** (2.5) | ส่งเอกสาร PDF อีเมล (template `account.doc.sent`, `account.invoice.overdue` reminder cron, `account.taxinvoice.issued`) — TRANSACTIONAL |
| **Member** (2.6) | prefill Contact จาก member ตอนสร้างเอกสารจากระบบ business (Contact = snapshot ของโมดูลนี้ ไม่ sync ย้อน) |
| **AuditLog กลาง** | ทุก mutation ที่แตะเอกสารมีผล/เงิน/ผัง/สิทธิ์/ตั้งค่า |
| **Outbox กลาง** | posting จาก POS, อีเมล, e-Tax queue (P4) |

---

## 9. Permissions (`can(user, {tenantId, systemId, module:'ACCOUNT', action})`)

> โมเดลบทบาทเอกสาร 3 ขา: **ผู้จัดทำ** (create/แก้ DRAFT) · **ผู้อนุมัติ** (approve/issue/void — ตั้งวงเงินได้) · **ผู้ชำระ** (record/void payment) — map เข้า role ผ่านตาราง + custom ราย action

| action | OWNER | MANAGER | STAFF | หมายเหตุ |
|---|---|---|---|---|
| `account.doc.view` | ✅ | ✅ | ✅ (จำกัดชนิดผ่าน custom ได้) | |
| `account.doc.create` (DRAFT/แก้ DRAFT/แปลง) | ✅ | ✅ | ✅ | ผู้จัดทำ |
| `account.doc.issue` (ออกเอกสาร/ใบกำกับ/ลิงก์ public) | ✅ | ✅ | ✅* (*ปิดได้) | |
| `account.doc.approve` (PO/APO/approval flow) | ✅ | ✅ ≤ วงเงิน | ❌ | ผู้อนุมัติ |
| `account.doc.void` | ✅ | ✅ | ❌ | |
| `account.payment.record` | ✅ | ✅ | ✅* | ผู้ชำระ |
| `account.payment.void` | ✅ | ✅ | ❌ | |
| `account.contact.manage` / `product.manage` | ✅ | ✅ | ✅ | |
| `account.finance.manage` (บัญชีเงิน/โอน/เช็ค) | ✅ | ✅ | ❌ | |
| `account.wht.manage` (50 ทวิ / ภ.ง.ด.) | ✅ | ✅ | ❌ | |
| `account.journal.view` / `report.view` (งบทุกตัว) | ✅ | ✅ | ❌ | นักบัญชีภายนอก = custom view-only |
| `account.journal.adjust` (JV มือ/กลับรายการ) | ✅ | ❌ | ❌ | |
| `account.chart.manage` / `mapping.manage` | ✅ | ❌ | ❌ | |
| `account.asset.manage` | ✅ | ✅ | ❌ | |
| `account.period.close` / `reopen` | ✅ | ❌ | ❌ | reopen + เหตุผล + audit |
| `account.settings.manage` / `link.manage` | ✅ | ❌ | ❌ | |
| `account.export` | ✅ | ✅ | ❌ | |

---

## 10. Reports & Metrics

1. **รายงานเอกสาร** (ต่อ docType — เมนู "รายงานเอกสาร" ในตั้งค่า): ทุกใบในช่วง + สถานะ + ยอด, คอลัมน์ตั้งได้, CSV — P1
2. **ลูกหนี้/เจ้าหนี้ aging**: คงค้างราย Contact, bucket ไม่เกิน 30/31-60/61-90/90+ วัน (จาก dueDate) — P3
3. **งบทดลอง / GL / P&L / งบฐานะ / งบกระแสเงินสด** — สูตรตาม §3.6, ทุกตัว drill ถึง entry→เอกสาร — P3
4. **ภ.พ.30**: ยอดขาย-ฐาน VAT + ภาษีขาย (จากใบกำกับ ISSUED เดือนนั้น) − ภาษีซื้อ (ใบกำกับซื้อ RECEIVED ที่เคลมเดือนนั้น) = ชำระ/ขอคืน + **รายงานภาษีขาย/รายงานภาษีซื้อ** รูปแบบตามประกาศสรรพากร — P3
5. **ภ.ง.ด.3/53**: ราย WHT_CERT เดือนนั้น (ผู้รับ/เลขภาษี/ประเภทเงินได้/ฐาน/อัตรา/ภาษี) + ใบปะหน้า — P2
6. **เครดิตภาษีถูกหัก**: ทะเบียน 1160 สะสมทั้งปี (แนบ ภ.ง.ด.50/ขอคืน) — P2
7. **ทะเบียนสินทรัพย์+ค่าเสื่อม**: ต่อตัว/รวม, มูลค่าตามบัญชี ณ วันที่ — P3
8. **DBD e-Filing export** (Excel งบตาม template) — P4
9. Metrics หน้าแรก: ค้างรับ/ค้างจ่าย/พ้นกำหนด, เงินคงเหลือ, กำไรเดือนนี้, เอกสารรออนุมัติ/รอตอบรับ
10. Export ทุกรายงาน CSV UTF-8 BOM (สตางค์→บาท 2 ตำแหน่งเฉพาะตอน export) + print stylesheet · สมุดรายวันเต็มงวด (คอลัมน์มาตรฐานส่งนักบัญชี)

---

## 11. Edge Cases & Rules

1. **ปัดเศษ VAT ระดับเอกสาร**: INCLUDE `vat = round(Σหลังส่วนลด × r/(1+r))` · EXCLUDE `vat = round(ฐาน × r)` — ครึ่งสตางค์ปัดขึ้น · บรรทัด vatRateBp ผสม (7/0/ยกเว้น) แยกฐานต่อกลุ่มก่อนปัด · Σdr=Σcr เสมอ (เศษ balance ลงบรรทัดปรับเศษ ≤ 1 สตางค์เข้า 4900/6900)
2. **WHT คิดจากฐานก่อน VAT** (ไม่รวม VAT) — คิดตอน**ชำระ** ไม่ใช่ตอน issue · จ่ายหลายงวด = หักตามสัดส่วนงวด · 50 ทวิ 1 payment = 1 ใบ (ใบรวมจ่าย = ใบเดียว Σ ทุกเอกสารในกลุ่ม)
3. **เลขเอกสาร**: จองใน tx เดียวกับ insert (DocSequence row lock) — DRAFT ยังไม่กินเลข (จองตอน issue) กันเลขโหว่งจาก draft ทิ้ง · void ไม่ reuse เลข · เปลี่ยน prefix มีผลใบใหม่
4. **Immutability**: พ้น DRAFT — UPDATE ได้เฉพาะ status/paidTotal/depositDeducted/pdfUrl/etax*/publicToken (ห้ามแตะ lines/ยอด/contact snapshot — DB trigger กัน) · ทุกแก้ผ่าน void+ออกใหม่/CN/DN
5. **หักมัดจำเกิน**: Σ DEPOSIT_APPLY ต่อใบมัดจำ ≤ ยอดมัดจำ (ตรวจใน tx + lock) · void ใบแจ้งหนี้ที่หักมัดจำ → คืนโควตา ใบมัดจำกลับ AWAITING_DEDUCT
6. **void ห่วงโซ่**: เอกสารที่มีใบต่อ (แปลงไปแล้ว/ถูกวางบิล/มีใบกำกับ) → void ต้องจัดการปลายทางก่อน (ระบบ list ให้เห็น + ปุ่มลัด) — ห้าม cascade เงียบ
7. **งวดปิด**: MANUAL → 423 · AUTO (POS/ค่าเสื่อม) → เลื่อนงวดเปิดถัดไป + needsReview + memo วันจริง
8. **เครดิตเทอมเปลี่ยน**: กระทบเฉพาะเอกสารใหม่ — dueDate ใบเก่าไม่เปลี่ยน
9. **ใบกำกับภาษีซื้อเคลมข้ามเดือน**: เคลมในเดือนที่ "รับแล้ว" (สิทธิ์ย้อน ≤ 6 เดือนจากวันที่ในใบกำกับ) — เกิน 6 เดือน ระบบไม่ให้กด RECEIVED แบบเคลม (บันทึกเป็นต้นทุนแทน + เตือน)
10. **ลูกค้ากดยอมรับใบเสนอราคาที่หมดอายุ/ถูกแก้**: token ตรวจ status+validUntil ก่อนบันทึก — พ้นกำหนด → หน้าแจ้ง "ติดต่อผู้ขาย" ไม่บันทึก
11. **เอกสารจาก POS (AUTO) ห้ามแก้/void ฝั่ง Account** — void ต้องทำจาก POS (จุดตัดเงินเดียว) → ไหลมาเป็น postVoid
12. **เลขภาษี 13 หลัก checksum (mod 11)** บังคับทุกจุด (Contact, buyer ใบกำกับ, public request) · branchCode 5 หลัก
13. **หลาย Account system ใน tenant**: เอกสาร/ผัง/เลขรันแยกขาดกันโดย systemId — ห้าม query ข้าม ยกเว้น dashboard กลางระดับ tenant (read-only, สิทธิ์ตาม system)
14. **ลบผู้ติดต่อ/สินค้า/บัญชีเงินที่ถูกใช้**: archive เท่านั้น — เอกสารเก่าอ่าน snapshot ไม่พัง
15. **qtyOnHand ติดลบ** (เบิกเกิน): เตือนแต่ไม่ block ใน v1 (ของจริงหน้างานสำคัญกว่า) — report จำนวนติดลบให้เคลียร์
16. **Race บันทึกชำระพร้อมกัน**: lock Document row ใน tx — paidTotal เกิน grandTotal → 409 (เงินเกินให้บันทึกเป็นรับล่วงหน้า/มัดจำแยกใบ)
17. **Timezone**: issueDate/periodKey/overdue คิดจาก `settings.timezone` (default Asia/Bangkok) — ขาย 23:59 อยู่งวดเดียวกับใบเสร็จ

---

## 12. QC Checklist

**Document pipeline**
- [ ] ทุก docType: state machine ตาม §3.0.2 — transition นอกตาราง → 409 (unit test matrix 22 ชนิด × สถานะ)
- [ ] แท็บ/filter ทุก list ตรง mapping §3.0.3 เป๊ะ (รวม overdue derived — เที่ยงคืนเปลี่ยนวันแล้วใบขยับแท็บเองไม่ต้องมี cron)
- [ ] แปลงเอกสาร: QT→IV, PO→PC, มัดจำ→หักใน IV (เต็ม/บางส่วน/หลายใบ), BN รวม 3 IV กระจายตัดถูก — relation ครบ ยอดตรง
- [ ] immutable: แก้เอกสารพ้น DRAFT ทุกช่องทาง (API/DB) ถูกกัน · void → reversal ยอดกลับครบ + สถานะ relation คืนถูก (มัดจำกลับรอหัก)
- [ ] เลขรัน: ยิงสร้าง 100 ใบพร้อมกันต่อชนิด → ไม่ซ้ำไม่ข้าม · DRAFT ไม่กินเลข · prefix/pattern/reset ปี-เดือนทำงาน

**บัญชี/ภาษี**
- [ ] posting ทุกแถวใน §7.10: Σdr=Σcr (property test ยอดสุ่ม + vatMode ผสม + บรรทัดยกเว้น VAT)
- [ ] มัดจำ F2: ตัวเลข 1,070/5,350 ตรงเป๊ะ — VAT รวมสองใบ = 350, รายได้ = 5,000, ไม่ซ้ำไม่ขาด · หักเกิน → reject
- [ ] WHT F5: 10,700 หัก 5% → จ่าย 10,200 + 50 ทวิออกอัตโนมัติ + เข้า ภ.ง.ด.53 เดือนถูก · ฝั่งถูกหักเข้า 1160
- [ ] งบทดลอง Σ สองฝั่งเท่ากัน · งบฐานะ balance (สินทรัพย์=หนี้สิน+ทุน+กำไรสะสม virtual+กำไรงวด) ทุก dataset ทดสอบ
- [ ] งบกระแสเงินสด: ต้นงวด+เข้า−ออก = ปลายงวด = Σ FinanceAccount statement
- [ ] ภ.พ.30: ภาษีขายจากใบกำกับ ISSUED (VOIDED ไม่นับ), ภาษีซื้อจากใบ RECEIVED เดือนเคลม, เคลมเกิน 6 เดือนถูกกัน
- [ ] idempotency posting: postSale ซ้ำ key เดิม 10 ครั้งขนาน → เอกสาร+entry เดียว
- [ ] ค่าเสื่อม: รัน 2 ครั้งเดือนเดียว → ไม่ซ้ำ · เดือนสุดท้ายเก็บเศษครบ cost−salvage พอดี · งวดปิด → เลื่อน+needsReview

**Pipeline ภายนอก**
- [ ] POS link: เชื่อม→บิลไหลเข้า (เอกสาร+journal+ABB)/ถอด→หยุด (บิลเก่าอยู่) · ไม่เชื่อม = POS ขายปกติ · reconcile จับบิลหล่น+re-post ได้
- [ ] Business link: สร้าง IV จากงานจอง — prefill ครบ + ลิงก์สองทาง
- [ ] Public: ลูกค้ากดยอมรับ QT (บันทึก IP) · ขอใบกำกับจาก QR — checksum เลขภาษี, 1 ใบเสร็จ 1 ใบกำกับ, token หมดอายุ, rate limit
- [ ] PDF: ใบกำกับเต็มรูปฟิลด์ครบตามสรรพากร + 50 ทวิฟอร์มถูก + โลโก้/ตราประทับ/ลายเซ็นแปะตามตั้งค่า

**Isolation & คุณภาพร่วม**
- [ ] ข้าม tenant → 404 ทุก endpoint · ข้าม systemId ใน tenant เดียว → 404 · role matrix §9 (STAFF เข้างบ → 403)
- [ ] AuditLog ครบทุก mutation ที่มีผล (issue/void/payment/approve/close/settings) before/after
- [ ] i18n TH/EN ทุกหน้า (PDF เอกสารทางการ = ไทยหลัก) · empty/loading/error ครบ ~47 หน้าจอ · ไม่มี float ใน pipeline เงิน
- [ ] mobile: บันทึกค่าใช้จ่ายถ่ายรูป ≤ 30 วิ · ตารางงบ scroll แนวนอน sticky หัวแถว
