# ใบสั่ง D.2 — facade บัญชีสำหรับหอ · ตรวจเข้ม (เงิน · บัญชี)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.2 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §8 แถวบัญชี · A2 · A9 · สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §6.2
> ส่งต่อจากใบก่อน: ใบสั่ง D.1 §7 + "ส่งต่อใบอื่น" (บรรทัด = qty 1 × amountSatang · VAT ต่อบรรทัดตรง `computeTotals` · RENT EXEMPT เสมอ) · ใบสั่ง R0.6 §8 carry (consumer สลิปใช้ `amountSatang` · idempotent ต่อ slipId · หลายสลิปต่อ ref = จ่ายเกิน · expectedSatang ฝั่งเซิร์ฟเวอร์)
> ข้อสอบ: «scripts/qc-svc-d.2.mts» (เขียนฐาน qc-svc) — `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.2.mts` (ห้ามครอบ timeout) · **ห้ามแก้ข้อสอบ** (แย้ง = wo-notes · SVC-RUN §1.3 ข้อ 11)

## 1. ไฟล์ของใบ
| ไฟล์ | สถานะ | หมายเหตุ |
|---|---|---|
| «src/lib/modules/account/index.ts» | แก้ (additive) | ขยาย `createExternalInvoice` + ฟังก์ชันใหม่ §3 · **ทางเดิม CRM ห้ามเปลี่ยนแม้แต่ไบต์เดียว** (ชนิด input/คืน · ข้อความ error · แถวที่เขียน) |
| «src/lib/modules/account/service.ts» · «gl.ts» · «coa.ts» | แก้ (additive) ตามจำเป็น | ตัวช่วยใหม่เท่านั้น · ห้ามเปลี่ยนพฤติกรรมฟังก์ชันเดิม · **ห้ามเพิ่มบัญชีลงผังตั้งต้น `COA`/`MAPPINGS` ของทุกร้าน** (สร้างบัญชีเงินประกันแบบ lazy §3.4) |
| «src/lib/modules/dorm/account-bridge.ts» | ใหม่ | `dormBillInvoiceLines` (pure) — import บัญชีได้ทาง `@/lib/modules/account` (facade) เท่านั้น · import `./calc` ได้ |
| «scripts/fitness.mts» | แก้ 1 จุด | `"dorm→account"` ใน `ALLOWED_EDGES` + คอมเมนต์เหตุผลขึ้นต้น `// SVC D.2` (ภายใน 3 บรรทัดเหนือ) · ห้ามแตะอย่างอื่น |

ห้าม: migration/แตะ `prisma/schema` (ไม่มี enum ใหม่ — ใช้ `AccountDocSource.DORM` ของ D.0 + `AccountLinkedKind.BUSINESS` ที่มีอยู่) · event ใหม่ (ใบนี้ไม่มี event ของตัวเอง — event ที่เกิดได้คือของบัญชีเดิม `account.*`) · แตะ CRM/POS/โมดูลอื่น · `account→dorm` (ทิศเดียว) · `any` · build · commit · install

## 2. เชื่อมบัญชีของหอ (ผู้คุมเคาะ · ไม่มี migration)
- หน่วยหอ (`BusinessUnit.type = DORM`) ผูกสมุดบัญชีด้วยแถว **`AccountSystemLink { linkedKind: "BUSINESS", linkedId: <unitId>, enabled: true, archivedAt: null }`** — ใช้ `findAccountLinkFor(tenantId, "BUSINESS", unitId)` เดิม · ไม่มี/ปิด/ข้ามร้าน ⇒ `NOT_LINKED`
- (หน้าเชื่อมต่อ/การ์ด "หอพัก" ใน connections = ใบหน้าจอหอภายหลัง · ใบนี้ไม่แตะ UI) · ข้อสอบสร้างแถวลิงก์เอง
- เอกสารของหอทุกใบ: `source = "DORM"` · `refSystemId = unitId` · `refType/refId` = ของผู้เรียก — **ความเป็นเจ้าของเอกสาร** (ใช้ตรวจทุกฟังก์ชันที่รับ docId) = `tenantId` ตรง + `systemId` = สมุดที่ผูกหน่วย + `source DORM` + `refSystemId === unitId` · ไม่ตรงข้อใด ⇒ `NOT_FOUND` (ไม่บอกว่ามีอยู่ — X1)

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก)
ทุกฟังก์ชันของหอคืน `{ ok: false; code: string; reason: string }` เมื่อปฏิเสธ (`reason` ไทยไม่ว่าง ไม่โทษผู้ใช้ ไม่มีข้อความ Prisma/อังกฤษดิบ) — **ห้าม throw** (ยกเว้นบั๊กจริง) · เงินสตางค์จำนวนเต็มทุกช่อง · วันที่ของหอเป็น `"YYYY-MM-DD"` (วันไทย · `bkkYmd` / quiet-hours)

```ts
export type DormTaxKind = "EXEMPT" | "VAT7" | "NONE";
export type ExternalDocLine = { description: string; qty: number; unitPriceSatang: number; taxKind: DormTaxKind; meta?: Record<string, string | number> };
export type DormVat = { registered: boolean; pricesIncludeVat: boolean };
type Fail = { ok: false; code: string; reason: string };
```

### 3.1 `createExternalInvoice` — overload (ชนิดของ CRM เดิมคงเดิมทุกตัวอักษร)
```ts
createExternalInvoice(input: <ชนิด CRM เดิม · sourceKind: "CRM">): Promise<{ ok: true; docId: string; created: boolean } | { ok: false; reason: string }>   // เดิมเป๊ะ
createExternalInvoice(input: {
  tenantId: string; sourceKind: "DORM"; unitId: string; refType: string; refId: string;
  customer: { name: string; phone?: string | null; email?: string | null; taxId?: string | null; branchCode?: string | null };
  partyId?: string | null; lines: ExternalDocLine[]; vat: DormVat;
  issueDate?: string; dueDate?: string | null; draft?: boolean; note?: string | null; createdById?: string | null;
}): Promise<{ ok: true; docId: string; created: boolean; docNo: string | null; status: string; subTotalSatang: number; vatSatang: number; totalSatang: number } | Fail>
```
- **CRM**: ผลลัพธ์/แถว/ข้อความ error เหมือนก่อนใบนี้ทุกไบต์ (คืนคีย์ `ok,docId,created` / `ok,reason` เท่านั้น · source `MANUAL` · DRAFT · ข้อความ `externalQuotationProblem` เดิม) — ข้อสอบเทียบกับสำเนาทางเดิมที่เรียก service ชุดเดียวกัน
- **DORM**:
  - บรรทัด → `LineInput`: `qty` · `unitPrice = unitPriceSatang` · `vatRateBp`: **VAT7 = 700 · EXEMPT = −1 · NONE = −1** (ไม่ใช่ 0 = อัตรา 0% ส่งออก · ⚠️ ป้ายรอตรวจ J4) · `description` ตามที่ส่ง
  - `vatMode`: `vat.registered` ⇒ `pricesIncludeVat ? "INCLUDE" : "EXCLUDE"` · ไม่จด ⇒ `"NONE"`
  - **`vat.registered` ≠ `AccountSettings.vatRegistered` ของสมุด ⇒ `VAT_SETTING_MISMATCH`** (ทั้งสองทิศ · ไม่สร้างแถว) — กันยอดใบแจ้งหนี้ไม่ตรงบิลแบบเงียบ ๆ
  - ตรวจบรรทัด ⇒ `INVALID_LINE`: ว่าง · > 200 บรรทัด · `qty` ไม่ใช่จำนวนเต็ม ≥ 1 · `unitPriceSatang` ไม่ใช่จำนวนเต็ม ≥ 0 / เกินเพดานเดิม · `taxKind` นอก 3 ค่า · description ว่าง
  - **ยอดเอกสาร = `computeBill` ของ D.1 ทุกสตางค์** (subTotal = Σnet · vatAmount = Σvat · grandTotal = Σgross) — เพราะ D.1 คิด VAT ต่อบรรทัดสูตรเดียวกับ `computeTotals`
  - ค่าเริ่ม **ออกเอกสารเลย** (`issueDocument` เดิม ⇒ เลขที่ · `AWAITING_PAYMENT` · ลง GL ตั้งลูกหนี้ใน tx เดิม) · `draft: true` = ร่าง
  - `issueDate`/`dueDate` = วันไทยตามที่ส่ง (ไม่ส่ง issueDate = วันนี้)
  - **idempotent ต่อ (สมุด, refType, refId)**: ซ้ำ ⇒ ใบเดิม `created: false` ไม่มีแถว/เลขที่ใหม่ · **พร้อมกัน 10 ทาง ⇒ 1 ใบ** (X3 · ไม่มี unique ในฐาน ⇒ `pg_advisory_xact_lock` ต่อคีย์ หรือเทียบเท่า) · ซ้ำแต่ยอดรวมต่างจากใบเดิม ⇒ `IDEMPOTENCY_CONFLICT`
  - ไม่ผูกบัญชี ⇒ `NOT_LINKED`

### 3.2 `recordExternalPayment` (ห่อ `recordPayment` · R0.6 carry)
```ts
recordExternalPayment(input: { tenantId: string; unitId: string; docId: string; amountSatang: number; idempotencyKey: string;
  paidAt?: Date; channel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null; slipId?: string | null; note?: string | null; createdById?: string | null })
→ Promise<{ ok: true; duplicate: boolean; paymentId: string | null; appliedSatang: number; excessSatang: number; status: string; outstandingSatang: number } | Fail>
```
- `amountSatang` ไม่ใช่จำนวนเต็ม > 0 ⇒ `INVALID_AMOUNT` · คีย์ว่าง ⇒ `INVALID_INPUT` · เอกสารไม่ใช่ของหน่วยนี้ (§2) ⇒ `NOT_FOUND` · ใบร่าง/ยกเลิก ⇒ `NOT_PAYABLE`
- คงค้าง = grand − paid − ใบลดหนี้ที่มีผล (`familyCreditInTx` เดิม) · **applied = min(amount, คงค้าง)** ⇒ `recordPayment` เดิม (Dr เงิน / Cr 1100 · สถานะ PARTIAL/PAID · event เดิม) · **excess = amount − applied > 0 ⇒ ลง GL รายการเดียว Dr เงิน (ช่องทางเดียวกัน) / Cr `DEPOSIT_RECEIVED` (2110 เงินรับล่วงหน้า)** · ไม่มีวันปฏิเสธเพราะ "จ่ายเกิน" (เงินเข้าจริงแล้ว — D.10 เอายอดยกไปใช้)
- ช่องทาง: CASH ⇒ `CASH` (1000) · TRANSFER/PROMPTPAY ⇒ `BANK` (1010) หรือบัญชีของ `financeAccountId` (ตัวเลือกเดิมของ `financeLedgerId`)
- **idempotent ต่อ `idempotencyKey` ภายในร้าน** (consumer สลิปส่ง `slip:<slipId>`): ซ้ำ ⇒ ผลเดิม `duplicate: true` ไม่มีแถว/JV ใหม่ (รวมกรณีเดิมเป็น excess ล้วน) · คีย์เดิมแต่ docId/amountSatang ต่าง ⇒ `IDEMPOTENCY_CONFLICT` · **พร้อมกัน 10 ทางคีย์เดียว ⇒ ทุกตัว ok · paymentId เดียว · เงินลงครั้งเดียว** (ตอนนี้ `recordPayment` ชน unique แล้วคืน error — ต้องจัดการ) · **10 คีย์ต่างกันยอดเต็มพร้อมกัน ⇒ applied รวม = grand พอดี · ที่เหลือเป็น excess** (X3)
- `outstandingSatang` = คงค้างหลังบันทึก (≥ 0)

### 3.3 ใบลดหนี้ / ใบเพิ่มหนี้ (ห่อของเดิม `createDocument` CREDIT_NOTE/DEBIT_NOTE + `issueDocument`)
```ts
createExternalCreditNote(input: { tenantId: string; unitId: string; sourceDocId: string; refType: string; refId: string; reason: string;
  lines: ExternalDocLine[]; vat: DormVat; issueDate?: string; createdById?: string | null })
→ Promise<{ ok: true; docId: string; created: boolean; docNo: string | null; subTotalSatang: number; vatSatang: number; totalSatang: number } | Fail>
createExternalDebitNote(<input เดียวกัน>) → <คืนเดียวกัน>
```
- ต้นทางต้องเป็นใบแจ้งหนี้ของหน่วยนี้ (§2) ⇒ ไม่ใช่ `NOT_FOUND` · เหตุผลว่าง (trim) ⇒ `INVALID_INPUT` · บรรทัด/VAT ตรวจเหมือน §3.1
- ใบลดหนี้: ยอด > คงค้างของต้นทาง ⇒ `EXCEEDS_REMAINING` (ด่านเดิมใน `issueDocument` ซึ่งเผื่อ 1 สตางค์ — แปลงเป็นโค้ดนี้ · ข้อสอบใช้ยอดเกิน ≥ 1 บาท) · ออกแล้วสถานะต้นทางคิดใหม่ตามของเดิม (ปิดยอด ⇒ PAID)
- เอกสารออกเลย · `source DORM` · `refSystemId unitId` · `sourceDocId` = ต้นทาง · idempotent ต่อ (refType, refId) เหมือน §3.1
- GL ตามของเดิม: CN = Dr รายได้ + Dr VAT / Cr 1100 · DN = กลับด้าน

### 3.4 เงินประกันผู้เช่า (หนี้สิน · DH A2 A9 · มติ §1 ข้อ 8 ของแบบ)
**บัญชี (⚠️ ค่าเสนอ — J4 ผู้ตรวจบัญชียังไม่ตอบ):** mapping key **`TENANT_SECURITY_DEPOSIT`** → บัญชี **LIABILITY** ชื่อ **"เงินประกันรับจากผู้เช่า"** (en "Tenant Security Deposits") รหัส **2140** · `cashflowActivity OPERATING` · `isSystem true` · `description` มีคำ **"รอตรวจ"** (ป้าย J4)
- สร้าง **lazy** ครั้งแรกที่สมุดนั้นใช้ (ไม่อยู่ในผังตั้งต้น — ร้านที่ไม่มีหอไม่เห็นบัญชีนี้) · idempotent · ถ้ามี mapping แล้วใช้ตาม mapping (ร้านย้ายได้) · **ถ้ารหัส 2140 ถูกใช้แล้วโดยบัญชีที่ไม่ใช่ของเรา** (ไม่มี mapping ชี้) ⇒ ใช้รหัสว่างตัวแรกใน 2141–2149 · ห้ามลงบัญชีของร้านที่ชนรหัส
- **ห้ามใช้ 2110** (เงินมัดจำรับของ POS/CRM — หักในใบแจ้งหนี้ได้ · ประกันไม่ใช่) · ไม่มี VAT · ไม่มีรายได้

```ts
postSecurityDeposit(input: { tenantId: string; unitId: string; leaseId: string; amountSatang: number; idempotencyKey: string;
  paidAt?: Date; channel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null; partyId?: string | null; note?: string | null; createdById?: string | null })
→ Promise<{ ok: true; duplicate: boolean; entryId: string; entryNo: string; heldSatang: number } | Fail>
securityDepositHeld(input: { tenantId: string; unitId: string; leaseId: string }) → Promise<number>
settleSecurityDeposit(input: { tenantId: string; unitId: string; leaseId: string; idempotencyKey: string; date?: Date;
  applyToDocIds: string[]; refund?: { channel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null }; note?: string | null; createdById?: string | null })
→ Promise<{ ok: true; duplicate: boolean; entryId: string; heldSatang: number; appliedSatang: number; refundSatang: number; tenantOwesSatang: number;
    applied: { docId: string; amountSatang: number }[] } | Fail>
```
- **รับประกัน** = JV เดียว: Dr เงิน (ช่องทางตาม §3.2) / Cr 2140 · `entryNo` = เลขที่ JV (ใช้เป็นเลขใบรับเงินประกัน — D.5 พิมพ์ · เก็บ `DormLease.depositDocumentId` = entryId) · ใช้ได้หลายครั้งต่อสัญญา (เงินจอง + ส่วนที่เหลือ) · idempotent ต่อคีย์ (ซ้ำ ⇒ ผลเดิม · พร้อมกัน 10 ⇒ 1 JV) · `heldSatang` = ยอดถือของสัญญานี้หลังบันทึก
- **ยอดถือ** (`securityDepositHeld`) คิดจาก GL ต่อ (สมุด · หน่วย · สัญญา) — ข้ามหน่วย/ข้ามร้าน = 0 · วิธีผูกหน่วย/สัญญากับ JV เป็นของ builder (refType/refId/memo) แต่ต้องไม่ชนกันข้ามหน่วย
- **ปิดประกัน = JV เดียว** (หัก + คืน ในรายการเดียว — DH มติข้อ 8): held = ยอดถือทั้งหมด · ไล่ `applyToDocIds` ตามลำดับ ตัดคงค้างแต่ละใบจน held หมด · **Dr 2140 = held / Cr 1100 = applied / Cr เงิน = refund (= held − applied)** · เอกสารที่ถูกหัก: `paidTotal` เพิ่มตาม applied + สถานะ PARTIAL/PAID ตามของเดิม (VAT ON_PAYMENT ย้าย 2210→2200 ได้ตามของเดิม — ยอมให้มี JV ย้าย VAT เพิ่ม แต่ขา 2140/1100/เงิน ต้องอยู่ใน JV เดียว)
  - `tenantOwesSatang` = คงค้างรวมของใบใน `applyToDocIds` หลังหัก (หักเกินประกัน ⇒ ทวงเพิ่ม · refund 0)
  - docId ใดไม่ใช่ของหน่วยนี้ ⇒ `NOT_FOUND` ทั้งคำขอ (ไม่ลงอะไร) · ใบที่ชำระครบแล้ว = หัก 0 · ยอดถือ 0 ⇒ `NO_DEPOSIT_HELD`
  - idempotent ต่อคีย์ · **พร้อมกัน 10 ทาง (คีย์เดียวหรือต่างคีย์) ⇒ ปิดครั้งเดียว** (ล็อกต่อสัญญา) — ตัวอื่นได้ผลเดิม (`duplicate`) หรือ `NO_DEPOSIT_HELD`
  - การอนุมัติหักเกินวงเงิน/หลักฐาน/กฎหมาย = ใบย้ายออก (ใช้ `settleDeposit` ของ D.1 ก่อนเรียก) — facade ไม่ตรวจกฎหมาย

### 3.6 ORACLE-EDIT 28 ต.ค. (review · `/root/svc-runs/fix/d2.md` F1–F8) — ทับ §3.1–§3.4 เมื่อขัดกัน
- **F1 คีย์กันซ้ำระดับร้านจริง**: คีย์เดียวกัน (รับชำระ · ส่วนเกิน · รับประกัน · ปิดประกัน) ยิงพร้อมกันข้ามหน่วย/ข้ามสมุด ⇒ ลงเงินครั้งเดียว (ตัวอื่น `duplicate` หรือ `IDEMPOTENCY_CONFLICT`) · คีย์เดียวข้ามฟังก์ชัน (จ่าย ↔ รับประกัน ↔ ปิดประกัน) ⇒ `IDEMPOTENCY_CONFLICT` — ข้อสอบ P-13 P-14 (PC-3 = ทีละคำขอ)
- **F2 ถอยการปิดประกัน**: `reverseSecurityDepositSettlement(input: { tenantId: string; unitId: string; leaseId: string; idempotencyKey?: string /* ของ settle */; settlementEntryId?: string; reason: string; createdById?: string | null }) → Promise<{ ok: true; duplicate: boolean; reversalEntryId: string; heldSatang: number } | Fail>` (export จาก account/index.ts) — tx เดียว: JV กลับรายการของ JV ปิด (สถานะ REVERSED) + ยกเลิกงวดหักประกัน (`voidedAt`) · ใบกลับสถานะเดิม · ยอดถือกลับเท่าเดิม · ซ้ำ = ok ไม่มีแถวใหม่ · ปิดใหม่ (คีย์ใหม่) ได้ · `voidPayment` ของงวดหักประกันยังถูกกัน (ข้อความชี้ฟังก์ชันนี้) — S-13
- **F3 ผูกผู้เช่า**: `postSecurityDeposit.partyId` **บังคับ** (ไม่มี ⇒ `INVALID_INPUT`) · ปิดประกันหักได้เฉพาะใบ DORM ที่ผู้ติดต่อเป็น Party เดียวกับเงินประกันของสัญญา ไม่ใช่ ⇒ `NOT_FOUND` ทั้งคำขอ — S-14
- **F4 สมุด**: หน่วยมีลิงก์ BUSINESS เปิดมากกว่า 1 ⇒ ทุกฟังก์ชันหอ `AMBIGUOUS_LINK` (ไม่เลือกเดา · ไม่มีแถว) · `securityDepositHeld` คิดจาก JV ประกันของสัญญา (refType/refId) ทุกสมุดของร้าน — ห้ามตอบ 0 เงียบ (หลายลิงก์: คืนยอดจริงหรือ `AMBIGUOUS_LINK`) · ประกันอยู่สมุดอื่นจากลิงก์ปัจจุบัน ⇒ ปิดประกัน `DEPOSIT_IN_OTHER_BOOK` (ไม่ใช่ `NO_DEPOSIT_HELD`) — S-15 S-16
- **F5** ใบเพิ่มหนี้ที่อ้างใบ DORM: `recordExternalPayment` จ่ายได้ (Dr เงิน / Cr 1100) และใส่ใน `applyToDocIds` ได้ — N-6
- **F6** ใบลด/เพิ่มหนี้ที่ต้นทางเป็นร่าง/ยกเลิก ⇒ `NOT_PAYABLE` (ตรวจซ้ำใต้ล็อก) — N-7
- **F7** กลับรายการ JV refType `DormSecurityDeposit` / `DormPaymentExcess` ทางสมุดรายวันทั่วไป (`reverseJournalEntry`) ⇒ ปฏิเสธข้อความไทยชี้ทางหอ · refType อื่นเหมือนเดิม (PC-5) — G-3
- **F8** ปิดประกันคีย์เดิมแต่รายการใบ/ยอดต่าง ⇒ `IDEMPOTENCY_CONFLICT` (S-17) · `securityDepositHeld` ห้ามกลืน error ฐานเป็น 0 · ยอดถือไม่ผูกข้อความไทย
- สมุด VAT จุดภาษี ON_PAYMENT: งวดหักประกันต้องออกใบกำกับอัตโนมัติ + ย้าย 2210→2200 ตามทางเดิม — S-18 (PC-4 = ทางเดิม)
- โค้ดปฏิเสธเพิ่ม: `AMBIGUOUS_LINK` · `DEPOSIT_IN_OTHER_BOOK` · `NOT_PAYABLE` (ใบลด/เพิ่มหนี้)

### 3.5 «dorm/account-bridge.ts»
```ts
export function dormBillInvoiceLines(bill: DormBillResult): ExternalDocLine[]
```
- 1 บรรทัดบิล = 1 บรรทัดเอกสาร ลำดับเดิม · **`qty: 1` · `unitPriceSatang: line.amountSatang`** · `taxKind: line.taxKind` · `meta` ⊇ `{ code: line.code }` (+ meta เดิมของบรรทัด)
- `description` เริ่มด้วย `labelTh` · บรรทัดมิเตอร์ (มี `meta.units`) ต้องแสดง **หน่วย** และถ้า `unitPriceSatang` ของบรรทัดบิลไม่ null ต้องแสดง **ราคาต่อหน่วยเป็นบาท 2 ตำแหน่ง** (เช่น `ค่าไฟฟ้า 120 หน่วย × 4.72 บาท`) — กฎหมายให้แสดงหน่วย+อัตรา (D.1 §3.1)
- pure (ไม่มี db/นาฬิกา/สุ่ม) · import บัญชีเป็น `import type` จาก `@/lib/modules/account` ได้

## 4. เกณฑ์รับ
- **ORACLE-EDIT 28 ต.ค. (review): ข้อสอบเพิ่ม 14 ข้อ (P-13 P-14 N-6 N-7 S-13…S-18 G-3 = 11 + positive control PC-3 PC-4 PC-5) รวม 77 ข้อ** · ข้อเดิมที่ใช้ประกันส่ง `partyId` แล้ว (ใบทดสอบผูก Party เดียวกัน)
- ข้อสอบ 63 ข้อ (เดิม) เขียวทุกข้อ (ก่อนงาน: เขียว 13 = PC-1/PC-2 positive control · C-1..C-5 CRM เดิม · F-5 F-6 S-0 G-1 E-1 Z-1 — **ต้องคงเขียว** · แดง 50 = ยังไม่มีฟังก์ชัน/DORM) · บิลสุ่มมีเมล็ด (`SEED=` ทำซ้ำ · `D2_BILLS_PER_MODE` ค่าเริ่ม 100) · typecheck (ISO_MEM=9000M · heap 7168) · fitness 2 โหมด (มี env / `env -u DATABASE_URL`) · ไม่มี `any` · ตรวจเข้ม 2 รอบ (SVC-RUN §1.4)
- regression (ผู้คุมรันบน qc-svc · baseline ก่อน builder): `qc-acc-v2-gl-inclvat` `qc-acc-v2-payments` `qc-acc-v2-security` `qc-acc-v2-coa` `qc-acc-v2-journal` `qc-acc-v2-guard` · `qc-account-api-write-docs` `qc-account-api-write-payments` · `qc-pos-account` · CRM ที่ใช้ `createExternalInvoice`: `qc-crm-c1.5` `qc-crm-c2.7` · `qc-svc-d.1` (calc ไม่ถูกแตะ) · `qc-svc-smoke`
- wo-notes: X1 (ข้ามร้าน/ข้ามหน่วย ⇒ NOT_FOUND/NOT_LINKED) · X3 (ใบแจ้งหนี้/รับชำระ/ประกัน/ปิดประกัน 10 ทาง) · X4 (สลิปเดิมซ้ำ = ครั้งเดียว) · หนี้: การ์ดเชื่อม "หอพัก" ในหน้าเชื่อมต่อ · J4 (รหัส 2140 · NONE→−1 · ค่าปรับไม่มี VAT)

## 5. จุดที่ผู้คุมตัดสินเอง (ส่งผู้ตรวจบัญชี J4 พร้อมชุดนี้)
1. บัญชีเงินประกันผู้เช่า = 2140 LIABILITY แยกจาก 2110 (2110 หักในใบแจ้งหนี้ได้ · ประกันคืนได้ทั้งก้อน ไม่ใช่รายได้รับล่วงหน้า) · สร้าง lazy
2. รับเงินเกินบิล = Cr 2110 เงินรับล่วงหน้า (ไม่ใช่รายได้ · ไม่ใช่ 2140)
3. taxKind NONE → `vatRateBp −1` (ไม่ใช่ 0%) · ค่าปรับล่าช้า NONE ตาม D.1 (รอผู้ตรวจ)
4. ปิดประกันหักกับ "ใบแจ้งหนี้" เท่านั้น — ค่าน้ำไฟวันออก/ค่าเสียหายต้องออกใบแจ้งหนี้ DORM ก่อน (รายได้/VAT รับรู้ที่ใบ) แล้วค่อยหักประกัน
5. ไม่จด VAT ในค่าตั้งหอ แต่สมุดจด (หรือกลับกัน) = ปฏิเสธ ไม่เดา
