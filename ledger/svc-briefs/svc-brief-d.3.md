# ใบสั่ง D.3 — VAT แยกบรรทัด + ใบกำกับภาษี (หอ) · ตรวจ **เข้ม** (เงิน + ประมวลรัษฎากร)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.3 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §3 (แถว VAT ค่าเช่า · VAT ค่าน้ำไฟ/บริการ · หัก ณ ที่จ่าย · ใบแจ้งหนี้ vs ใบเสร็จ) · A4 (VAT) · ภาคผนวก ก หอ #19–22 · ภาพ หอ 10 กล่อง VAT ("จด VAT → ออกใบกำกับภาษีให้บรรทัดที่มี VAT อัตโนมัติ") · หอ 04 (ตัวอย่างบิล)
> ส่งต่อจากใบก่อน (อ่านก่อนเขียน): **D.1** VAT ต่อบรรทัด = `computeTotals` บัญชี V2 · RENT = EXEMPT เสมอ · **D.2** `createExternalInvoice/CreditNote/DebitNote` (DORM · idempotent ต่อ ref · ล็อกระดับร้าน = เงินหอคิวเดียว · VAT หอ ≠ สมุด ⇒ `VAT_SETTING_MISMATCH` · EXEMPT/NONE = `vatRateBp −1`) · **D.8** `sendBillRun` (จองบิล → ใบแจ้งหนี้ → SENT+event ใน tx เดียว · F17 ref `#n` · บทเรียน `/root/svc-runs/fix/d8.md`: ห้ามใบลอย · ref คงที่ · ทางกู้ต้องทำได้จริง · ใบลด/เพิ่มหนี้ไม่แก้ทับ)
> โค้ดบัญชีที่ใช้ (อ่านก่อน): `account/service.ts` — `issueDocumentInTx` (ด่าน ม.86/4 เลขผู้ขาย · pipeline-M2 กันใบกำกับซ้ำต่อต้นทาง) · `issueServiceTaxInvoice` (ใบกำกับต่อการรับเงิน — **ห้ามเกิดกับใบหอ** §2.4) · `voidDocument` · `dormUpsertDocument` · `isValidThaiTaxId` · `doc-numbering.ts` (`openDocNumbering`/`deferDocNo`/`finalizeDocNos` · `AccountDocSequence`) · `gl.ts` (`INVOICE` ON_ISSUE ⇒ Cr 2205 · `postTaxInvoice` Dr 2205/2210 → Cr 2200 · `reverseFor` ลงวันที่ "วันนี้") · `reports.ts` `pp30` (แถวต่อเอกสารจาก GL 2200 · ฐาน = `subTotal` ของเอกสาร)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.3.mts» — `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.3.mts` (ห้ามครอบ timeout · ห้าม kill กลางคัน — ล้างข้อมูลใน finally · G รันหลังล้าง) · `--no-regression` ข้ามหมวด G
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/schema`** · เลน l2 · temp ขึ้นต้น `svc-d3-` · รายงานต่อข้อ (id → ผล)
> **ไม่มี migration** (ตรวจแล้ว): ใบกำกับ = `AccountDocument` ชนิด `TAX_INVOICE` (`sourceDocId` = ใบแจ้งหนี้ · `refType "DormBillTax"` · `replacedById` · `contactSnapshot` · `adjustReason` · `note`) · ผูกบิล→ใบกำกับผ่าน `DormBill.accountDocumentId` → `sourceDocId` (ไม่ต้องมีคอลัมน์ใหม่) · ประวัติแก้ = `AuditLog` — ขาดคอลัมน์ = หยุดถามผู้คุม

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/dorm/tax-invoice.ts» (ใหม่) | §3.2–§3.4 — ผ่าน `tenantDb` เท่านั้น (ไม่ import prisma ดิบ · F5.1) · เงิน/เอกสารผ่าน facade บัญชีเท่านั้น |
| `src/lib/modules/dorm/billing.ts` | **แก้เพิ่ม** §3.5 (ด่านส่ง · ใบกำกับต่อบิล · พักบิลเลขผู้ซื้อผิด · ผู้ซื้อบนใบแจ้งหนี้ · หมายเหตุใบลด/เพิ่มหนี้ · `BillPreview`/แถว) — ตรรกะ D.8 อื่นห้ามเปลี่ยน |
| `src/lib/modules/dorm/index.ts` | บล็อก export D.3 (บล็อกใบอื่นห้ามแตะ) |
| `src/lib/modules/account/index.ts` | บล็อก `SVC D.3` ใหม่: §3.1 (4 ฟังก์ชัน + ชนิด) · `DormExternalNoteInput.note?` (เพิ่มอย่างเดียว) |
| `src/lib/modules/account/service.ts` | (ก) `dormUpsertDocument`: ใบ `INVOICE` ของหอ `vatTiming = taxPointBasis = "ON_ISSUE"` เสมอ (§2.4) · (ข) ฟังก์ชันชั้นข้อมูลของ §3.1 (ชื่อขึ้นต้น `dorm`) · (ค) `voidDocument` ด่าน 2 ข้อ §2.6 (กระทบเฉพาะเอกสาร `source = DORM`) — ส่วนอื่นห้ามแตะ |
| `src/lib/core/settings/defs/rooms.ts` | def ใหม่ `rooms.vat.reissueDate` (§4) + `PENDING_LEGAL_REVIEW_KEYS` · ค่าเริ่ม `rooms.tax.withholdingCorporateBp` **0** (แถวแผน "แหล่งยังไม่ยืนยัน = ปิดค่าเริ่ม") — def อื่นห้ามแก้ |
| «src/components/dorm/TaxInvoicePrint.tsx» (ใหม่) | ใบกำกับภาษีเต็มรูปพิมพ์ §5.2 (render ล้วน · ไม่ import โมดูล server/prisma/actions/next) |
| «src/app/app/u/[unitSlug]/dorm/billing/[billId]/tax-invoice/page.tsx» (ใหม่) | หน้าห่อ §5.2 (server · ด่านเดียวกับหน้าพิมพ์ D.8) |
| `src/components/dorm/BillingRunScreen.tsx` | **เพิ่มอย่างเดียว** §5.1 (ตัวอย่างบิล: VAT · เลขใบกำกับ · หัก ณ ที่จ่าย · ปุ่มออกใบใหม่แทน) — DOM ของ D.8 ห้ามเปลี่ยน |
| `src/app/app/u/[unitSlug]/dorm/billing/actions.ts` | เพิ่ม `issueTaxInvoiceAction` `reissueTaxInvoiceAction` (export async function · requireUnit + DORM · ร้าน/ผู้กระทำจาก session) |
| `scripts/fitness.mts` | เฉพาะ `ALLOWED_EDGES` ที่ใช้จริง (คาดว่ามีครบ) + คอมเมนต์ `// SVC D.3` |

ห้าม: migration · แก้ `calc.ts` / `account-bridge.ts` / `utility.ts` / `law.ts` / `lease.ts` · แตะ `account/*` นอก 2 ไฟล์ข้างบน · เปลี่ยนพฤติกรรมเอกสารบัญชีที่ไม่ใช่ `source = DORM` · ใบกำกับอย่างย่อ (`TAX_INVOICE_ABB`) สำหรับหอ · `any` · `getDay()/getDate()/getMonth()` ดิบ · ยิงเงินขนาน (`Promise.all` ครอบทางเงิน/เอกสาร) · event ใหม่ (ไม่มีในใบนี้ — D.9 อ่านใบกำกับผ่าน `billTaxInvoice`)

## 2. กติกา (ประมวลรัษฎากร · บัญชี V2)
### 2.1 VAT แยกบรรทัด (มีแล้วใน D.1/D.8 — ใบนี้ยืนยันปลายทางถึงใบกำกับ)
- จด VAT (`rooms.vat.registered`) ⇒ ชนิดภาษีต่อบรรทัดจาก `rooms.vat.taxKinds` (RENT = EXEMPT เสมอ ม.81(1)(ต) · COMMON/ELEC/WATER/SERVICE = VAT7 · LATE_FEE = NONE ค่าเริ่ม · รายการบริการใช้ `taxKind` ของรายการ) · ราคารวม/ไม่รวม VAT จาก `rooms.vat.pricesIncludeVat` · VAT ต่อบรรทัดสูตร `computeTotals` (ปัดต่อบรรทัด)
- ไม่จด ⇒ ทุกบรรทัด `NONE` · ใบแจ้งหนี้ `vatMode NONE` · **ไม่มีใบกำกับเลย**

### 2.2 ใบกำกับภาษีเต็มรูป (ม.86/4) — ออกให้ "ส่วนที่มี VAT" เท่านั้น
- **เมื่อไร**: ตอนส่งบิล (D.8 `sendBillRun`) ทุกบิลที่หอจด VAT และ `vatSatang > 0` ⇒ 1 ใบกำกับต่อใบแจ้งหนี้ (วันที่ = วันที่ใบแจ้งหนี้) — การออกใบกำกับทำให้ความรับผิดเกิด ณ วันนั้น (ม.78/1(2) บริการ · ม.78(1) สินค้า) ⇒ ไม่มีกรณีออกช้ากว่าจุดรับรู้ (มติ 1)
- **ชนิด**: `TAX_INVOICE` (เต็มรูป) เสมอ · **ไม่ออก `TAX_INVOICE_ABB`** (มติ 2)
- **บรรทัด** = บรรทัดของใบแจ้งหนี้ที่ `vatRateBp > 0` เท่านั้น (ลำดับเดิม · description/qty/unitPrice/vatRateBp เดิม) — ค่าห้อง (EXEMPT) · ค่าปรับ (NONE) **ไม่อยู่ในใบกำกับ** · ยอด = `computeTotals(บรรทัดเหล่านั้น, vatMode ของใบแจ้งหนี้)` ⇒ `vatAmount` ของใบกำกับ = `vatAmount` ของใบแจ้งหนี้ = Σ `vatSatang` บรรทัด VAT7 ของบิล · `subTotal`/`grandTotal` = Σ net/gross บรรทัด VAT7 ทุกสตางค์
- **ผู้ขาย** (ม.86/4(2)): สมุดที่ผูกหอต้อง `vatRegistered` + `taxId` 13 หลักผ่าน checksum (`isValidThaiTaxId`) ไม่งั้น `SELLER_TAX_ID_MISSING` · ชื่อ = `orgDisplayName` · สาขา = `branchCode` ("00000" ⇒ "สำนักงานใหญ่" · อื่น ⇒ "สาขาที่ <รหัส>") · ที่อยู่ของสมุด
- **ผู้ซื้อ** (ม.86/4(3) · ฉบับที่ 199): จาก `Party` ของสัญญา ณ ตอนออก — `name` (ตัดช่องว่าง) · `address` = `Party.address` ถ้าไม่ว่าง ไม่งั้น `"ห้อง <เลขห้อง> <ชื่อหน่วย>"` (ที่อยู่ที่เช่าจริง) · `taxId` = `Party.taxId` (เลขล้วน) ถ้าไม่ว่าง ⇒ ต้องผ่าน checksum ไม่งั้น `BUYER_TAX_ID_INVALID` · มี taxId ⇒ `branchCode` = `Party.branchCode` (5 หลัก · ว่าง = "00000") · ไม่มี taxId ⇒ taxId/branch = `null` · `kind` = `Party.kind` · freeze ใน `contactSnapshot` ของใบกำกับ (`name, taxId, branchCode, address, legalType`) — **ไม่ใช่** ของ `AccountContact` (ผู้ติดต่อในสมุดอาจถูกรวม/แก้ทีหลัง)
- **เลขที่** (ม.86/4(4)): ชุดเลข `TAX_INVOICE` ที่ตั้งไว้ของสมุด (`deferDocNo` series `configured` + `finalizeDocNos` เป็นคำสั่งสุดท้ายของ tx เดียวกับการสร้าง) ⇒ **ไม่ซ้ำ · ไม่ข้าม**: ทุกเลขที่จอง (`AccountDocSequence.lastNo`) มีเอกสารจริง 1 ใบ · ล้มกลางทาง = rollback ทั้งใบ ไม่กินเลข · หลายโพรเซสพร้อมกัน (หลายหอใช้สมุดเดียว) = เลขต่อเนื่อง 1..n
- **บัญชี**: ใบแจ้งหนี้หอ ON_ISSUE ⇒ Cr 2205 (VAT รอใบกำกับ) · ใบกำกับ `postTaxInvoice` ⇒ Dr 2205 / Cr 2200 = `vatAmount` (ในธุรกรรมเดียวกับการออก) · `pp30` เดือนของใบกำกับ: แถวของใบกำกับ ฐาน = `subTotal` ของใบกำกับ (ไม่รวมค่าห้อง) · อัตรา 700
- **ความสัมพันธ์**: `sourceDocId` = ใบแจ้งหนี้ · relation `TAX_FOR` (from ใบแจ้งหนี้ → ใบกำกับ · amount = grandTotal ใบกำกับ) · `source DORM` · `refSystemId` = หน่วย · `refType "DormBillTax"` · `refId` = id ใบแจ้งหนี้ (ใบแรก) / `<idใบแจ้งหนี้>#<idempotencyKey>` (ใบแทน) · `vatTiming = taxPointBasis = ON_ISSUE` · `sourcePaymentId null`
- **ใบที่ยังมีผล** (status ∉ VOIDED/CANCELLED) มีได้ **1 ใบต่อใบแจ้งหนี้** ทุกสภาวะ (กดซ้ำ · 10 ทาง · 4 โพรเซส) — ซ้ำ ⇒ ใบเดิม `created: false`

### 2.3 ยกเลิกแล้วออกใหม่ (คำสั่ง ป.86/2542 — แก้รายละเอียดผู้ซื้อ/ใบชำรุด)
- ทางเดียวที่ยกเลิกใบกำกับหอ: ออก **ฉบับใหม่แทน** ในธุรกรรมเดียว — ใบเดิม `VOIDED` (`voidedAt` · `voidReason` = เหตุผล · `replacedById` = ใบใหม่ · **เลขเดิมคงอยู่** ไม่ถูกลบ/ใช้ซ้ำ) · ใบใหม่ เลขใหม่ถัดไปในชุด · บรรทัด/ยอด **เท่าใบเดิมทุกสตางค์** (แก้ยอด = ใบลด/เพิ่มหนี้ §2.5 เท่านั้น) · ผู้ซื้อ = ที่ส่งมา หรืออ่าน Party ใหม่ · `note` ขึ้นต้น `"ยกเลิกและออกใบกำกับภาษีฉบับใหม่แทนฉบับเดิม เลขที่ <เลขเดิม> ลงวันที่ <วันไทยเดิม>"` + เหตุผล · `adjustReason` = เหตุผล
- **วันที่ใบใหม่** = ค่าตั้ง `rooms.vat.reissueDate`: `ORIGINAL` (ค่าเริ่ม) = วันที่ใบเดิม · `REISSUE_DAY` = วันไทยของ `now` (⚠️ J4 ข้อ 6)
- **บัญชี**: กลับรายการ JV ใบกำกับเดิม + ลง JV ใบใหม่ **ลงวันที่เดียวกัน = วันที่ใบใหม่** (ห้ามใช้วันที่เครื่องของ `reverseFor`) ⇒ `pp30` เดือนนั้น VAT รวมไม่เปลี่ยน · แถวใบเดิมสุทธิ 0 (ไม่แสดง) · แถวใบใหม่แสดงเลข/ผู้ซื้อใหม่ · วันที่อยู่ในช่วงล็อกของสมุด (`policy.lockBeforeDate`) ⇒ `PERIOD_LOCKED` ไม่มีอะไรเปลี่ยน
- idempotent ต่อ `idempotencyKey` (ref ใบใหม่) · คีย์เดิมพร้อมกัน 10 ทาง = ใบใหม่ใบเดียว · ใบเป้าหมายถูกแทนไปแล้วด้วยคีย์อื่น ⇒ `ALREADY_REPLACED` · audit `dorm.taxinvoice.reissued` (after: `billId, oldDocId, newDocId, reason` — ไม่มีชื่อ/เลขผู้ซื้อ)

### 2.4 ห้ามใบกำกับ "ต่อการรับเงิน" ของบัญชีกับใบหอ
- `issueServiceTaxInvoice` (บัญชี V2) ออกใบกำกับ 1 บรรทัดยอดเต็มงวดรับเงิน **รวมค่าห้องที่ยกเว้น** ⇒ ผิดสำหรับหอ · กันด้วย `dormUpsertDocument`: ใบแจ้งหนี้หอ `vatTiming/taxPointBasis = ON_ISSUE` เสมอ (แม้สมุดตั้ง ON_PAYMENT) ⇒ `recordExternalPayment` ไม่สร้างใบกำกับใหม่ (ไม่มี `TAX_INVOICE` ที่ `sourcePaymentId` ของการรับเงินหอ)

### 2.5 ใบลด/เพิ่มหนี้ของบิลที่มีใบกำกับ (ม.86/9 · 86/10)
- `adjustSentBill` (D.8) ⇒ ชนิดภาษีต่อบรรทัดตามบรรทัดโค้ดเดียวกันในบิล (มีแล้ว) + บิลมีใบกำกับที่ยังมีผล ⇒ ส่ง `note` = `"อ้างอิงใบกำกับภาษีเลขที่ <เลข> ลงวันที่ <วันไทย>"` ไปที่ `createExternalCreditNote/DebitNote` (`DormExternalNoteInput.note?` ใหม่ · บัญชีเก็บใน `note`) · VAT ของใบลดหนี้ลง Dr 2200 ตามเดิมของบัญชี (pp30 ติดลบในเดือนใบลดหนี้)

### 2.6 ด่านใน `voidDocument` (เฉพาะ `source = DORM`)
- ใบแจ้งหนี้หอที่มีใบกำกับยังมีผล ⇒ ปฏิเสธ (`ok:false` reason ไทย: แก้ยอดด้วยใบลด/เพิ่มหนี้ · ไม่ยกเลิกการขายที่ออกใบกำกับแล้ว) · ใบกำกับของหอ ⇒ ปฏิเสธ (ยกเลิกได้ทางเดียว = ออกฉบับใหม่แทน §2.3) — ไม่มีอะไรเปลี่ยน · ทางแปลงเอกสารเดิม (`convertDocument` → `issueDocument` TAX_INVOICE) ถูกด่าน pipeline-M2 ปฏิเสธอยู่แล้ว (ห้ามทำให้หลุด)

### 2.7 หัก ณ ที่จ่ายผู้เช่านิติบุคคล (#22 · ⚠️ แหล่งยังไม่ยืนยัน = ปิดค่าเริ่ม)
- ค่าเริ่ม `rooms.tax.withholdingCorporateBp` = **0** (สัญญาเก่าที่ snapshot 500 ไว้ = ตามสัญญา) · `BillPreview.withholding` = `{ rateBp, baseSatang, amountSatang }` เมื่อ `Party.kind = COMPANY` และ snapshot สัญญา bp > 0 · ฐาน = Σ gross บรรทัด `RENT` · ยอด = `Math.round(ฐาน × bp / 10000)` · ไม่งั้น `null` — แสดงอย่างเดียว (รับเงินแบบหัก + 50 ทวิ = D.10 ผ่าน `recordPayment` WHT ของบัญชี)

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก)
### 3.1 facade บัญชี (`@/lib/modules/account` · บล็อก SVC D.3)
```ts
export type DormTaxBuyer = { name: string; address: string; taxId?: string | null; branchCode?: string | null; kind?: "PERSON" | "COMPANY" };
export type DormTaxInvoiceResult = { ok: true; docId: string; docNo: string | null; created: boolean; issueDate: string /* YYYY-MM-DD ไทย */;
                                     subTotalSatang: number; vatSatang: number; totalSatang: number };
createExternalTaxInvoice(input: { tenantId: string; unitId: string; sourceDocId: string; buyer: DormTaxBuyer; createdById?: string | null })
  → Promise<DormTaxInvoiceResult | DormFail>
replaceExternalTaxInvoice(input: { tenantId: string; unitId: string; taxInvoiceDocId: string; reason: string; idempotencyKey: string;
                                   buyer?: DormTaxBuyer | null; issueDate?: string /* ไม่ส่ง = วันที่ใบเดิม */; createdById?: string | null })
  → Promise<(DormTaxInvoiceResult & { replacedDocId: string; replacedDocNo: string | null }) | DormFail>
externalTaxInvoicesOf(input: { tenantId: string; unitId: string; sourceDocId: string })
  → Promise<{ docId: string; docNo: string | null; status: string; issueDate: string; subTotalSatang: number; vatSatang: number; totalSatang: number;
              buyer: { name: string; taxId: string | null; branchCode: string | null; address: string | null; legalType: string | null };
              replacedById: string | null; note: string | null; voidReason: string | null;
              lines: { description: string; amountSatang: number; vatRateBp: number }[] }[]>   // เรียงเก่า→ใหม่ · ข้ามหน่วย/ร้าน = []
externalTaxSeller(input: { tenantId: string; unitId: string })
  → Promise<{ ok: true; vatRegistered: boolean; taxIdValid: boolean; name: string; taxId: string | null; branchCode: string; branchLabel: string; address: string | null } | DormFail>
```
- รหัส (ส่งตรงตัว · reason ไทยไม่ว่าง ไม่มีข้อความ Prisma · ห้าม throw): `INVALID_INPUT` · `NOT_LINKED` · `AMBIGUOUS_LINK` · `NOT_FOUND` (ต้นทางไม่ใช่ใบแจ้งหนี้ DORM ของหน่วยนี้ในร้านนี้ / ใบกำกับไม่ใช่ของหน่วยนี้) · `NOT_PAYABLE` (ต้นทางร่าง/ยกเลิก) · `NOT_VAT_REGISTERED` · `SELLER_TAX_ID_MISSING` · `BUYER_TAX_ID_INVALID` · `NO_VAT_LINES` · `REASON_REQUIRED` (< 10 ตัวอักษรจริง) · `ALREADY_REPLACED` · `PERIOD_LOCKED` · `IDEMPOTENCY_CONFLICT` (คีย์เดิมกับใบเป้าหมายอื่น)
- ล็อก: ล็อกระดับร้าน/หน่วยของ D.2 → แถวใบแจ้งหนี้ → แถวใบกำกับ → ตัวนับเลข (ท้ายสุด) · ทุกอย่างของการออก/แทน 1 ครั้ง = 1 ธุรกรรม

### 3.2 อ่าน (`@/lib/modules/dorm`)
```ts
type TaxInvoiceView = {
  billId: string; roomNumber: string; periodKey: string; invoiceDocNo: string | null;
  docId: string; docNo: string | null; status: "ISSUED" | "VOIDED"; issueDate: string /* YYYY-MM-DD */; form: "FULL";
  seller: { name: string; taxId: string; branchLabel: string; address: string | null };
  buyer: { name: string; taxId: string | null; branchLabel: string | null; address: string; kind: "PERSON" | "COMPANY" };
  lines: { code: string /* โค้ดบรรทัดบิล ELEC/WATER/COMMON/SERVICE:* */; description: string; netSatang: number; vatSatang: number; grossSatang: number }[];
  subTotalSatang: number; vatSatang: number; totalSatang: number; pricesIncludeVat: boolean;
  replaces: { docNo: string | null; issueDate: string; reason: string } | null;
  history: { docId: string; docNo: string | null; status: string; issueDate: string }[];   // ทุกใบของบิล เก่า→ใหม่
};
billTaxInvoice(ctx: BillingCtx, input: { unitId: string; billId: string; docId?: string /* ไม่ส่ง = ใบที่ยังมีผล */ }) → Promise<TaxInvoiceView | null>
```
- สิทธิ์ `dorm.view` · ไม่มีใบ/ไม่มีสิทธิ์/ข้ามหน่วย/ข้ามร้าน ⇒ `null`

### 3.3 ออก (ทางกู้ · ปกติ D.8 ส่งให้เอง)
```ts
issueBillTaxInvoice(ctx: BillingCtx, input: { unitId: string; billId: string })
  → Promise<{ ok: true; docId: string; docNo: string | null; created: boolean; vatSatang: number; totalSatang: number } | Fail>
```
- สิทธิ์ `dorm.bill.send` · บิลต้อง SENT/PARTIALLY_PAID/PAID มี `accountDocumentId` (ไม่ใช่ ⇒ `NOT_SENT`) · snapshot บิลไม่จด VAT ⇒ `NOT_VAT_REGISTERED` · `vatSatang = 0` ⇒ `NO_VAT_LINES` · ผู้ซื้อ §2.2 · รหัสของ facade ส่งต่อตรงตัว

### 3.4 ออกใบใหม่แทน
```ts
reissueBillTaxInvoice(ctx: BillingCtx, input: { unitId: string; billId: string; reason: string; idempotencyKey: string;
                      buyer?: { name?: string; address?: string | null; taxId?: string | null; branchCode?: string | null } | null }, deps?: { now?: Date })
  → Promise<{ ok: true; docId: string; docNo: string | null; created: boolean; replacedDocId: string; replacedDocNo: string | null; issueDate: string } | Fail>
```
- สิทธิ์ `dorm.bill.send` · บิลไม่มีใบกำกับที่ยังมีผล ⇒ `NO_TAX_INVOICE` · `idempotencyKey` 1–100 ตัว ไม่งั้น `INVALID_INPUT` · `buyer` ไม่ส่ง ⇒ อ่าน Party ใหม่ (§2.2) · ส่ง ⇒ ทับเฉพาะช่องที่ส่ง (taxId ตรวจ checksum) · วันที่ตาม §2.3 (`deps.now`) · ไม่แก้ `Party` · audit §2.3

### 3.5 แก้ใน `billing.ts` (D.8)
1. **`prepareBillRun` gate**: หอจด VAT (ค่าตั้งปัจจุบัน) + สมุดจด VAT + `taxIdValid=false` ⇒ เพิ่ม `GateItem { kind: null, buildingId: null, code: "SELLER_TAX_ID_MISSING", messageTh }` ใน `gate.blocks` (`gate.ok=false`) · บิลที่จด VAT + `vatSatang>0` + `Party.taxId` ไม่ว่างและไม่ผ่าน checksum ⇒ `HELD` `holdReason` ขึ้นต้น `BUYER_TAX_ID_INVALID` (แก้ Party แล้ว `releaseHeldBill` ⇒ DRAFT)
2. **`sendBillRun` ขั้น 1 (ด่าน · ก่อนออกใบใด ๆ)** ลำดับ: D.8 เดิม → `NOT_LINKED`/`VAT_SETTING_MISMATCH` (ทางเดิม) → หอจด VAT + สมุดจด VAT + ผู้ขายไม่ครบ ⇒ `{ ok:false, code:"SELLER_TAX_ID_MISSING" }` — ไม่มีใบแจ้งหนี้/ใบกำกับ/event/ลิงก์ · รอบคงเดิม
3. **ต่อบิล** (`sendOne`): จด VAT + `vatSatang>0` ⇒ ตรวจผู้ซื้อ **ก่อน** ออกใบแจ้งหนี้ (ผิด ⇒ failed `BUYER_TAX_ID_INVALID` — หรือ `RUN_STALE` ถ้าการคำนวณสดของ D.8 เห็นว่าบิลต้องพัก · ไม่มีใบใด · ไม่กินเลข) → ใบแจ้งหนี้ (ส่ง `customer` = ผู้ซื้อ §2.2 ด้วย) → `createExternalTaxInvoice` → **สำเร็จจึงตั้ง SENT+event** · ใบกำกับล้ม ⇒ failed (รหัสของ facade) บิลไม่ SENT (กดส่งซ้ำ = ใบแจ้งหนี้เดิม + ออกใบกำกับต่อ) ⇒ **ไม่มีบิล SENT ที่มี VAT แต่ไม่มีใบกำกับ**
4. ผล `sendBillRun` เพิ่ม `taxInvoicePending: number` (บิล SENT ของรอบที่ VAT>0 แต่ไม่มีใบกำกับที่ยังมีผล — ปกติ 0 · การเรียกซ้ำพยายามออกให้ก่อนนับ)
5. `adjustSentBill` §2.5 · `BillPreview` เพิ่ม `vatRegistered` (มีแล้ว) + `taxInvoice: { docId: string; docNo: string | null; status: string } | null` + `withholding` §2.7 · `BillRunModel.rows[]` เพิ่ม `taxInvoiceNo: string | null`

## 4. ค่าตั้งใหม่
| คีย์ | ชนิด | ค่าเริ่ม | ชั้น | หมายเหตุ |
|---|---|---|---|---|
| `rooms.vat.reissueDate` | enum `ORIGINAL` \| `REISSUE_DAY` | `ORIGINAL` | UNIT | ป้าย "วันที่ใบกำกับภาษีฉบับใหม่ (เมื่อออกแทนฉบับเดิม)" · `sensitivity: "MONEY"` · `editPermission` เดียวกับหมวด VAT · อยู่ใน `PENDING_LEGAL_REVIEW_KEYS` · helpTh ขึ้นต้น "⚠️ รอที่ปรึกษากฎหมายตรวจ" |
| `rooms.tax.withholdingCorporateBp` | (เดิม) | **0** (เดิม 500) | U_L | แถวแผน: แหล่งยังไม่ยืนยัน = ปิดค่าเริ่ม |
- หน้าค่าตั้งได้จากทะเบียนเอง (`SettingsForm` · กติกาเหล็ก 16) — ไม่วาดหน้าใหม่

## 5. จอ (ไม่มีภาพอนุมัติใหม่ — ภาพ 10 กล่อง VAT ของ D.7 · ภาพ 04 ของ D.8 ⇒ ใบนี้ไม่มีหมวด V)
### 5.1 `BillingRunScreen` (เพิ่มอย่างเดียว)
- ตัวอย่างบิลที่ `vatRegistered && vatSatang > 0`: กล่อง `data-preview-vat` ข้อความมี "VAT 7%" + ยอด VAT รูป `1,234.56` · ไม่มีคำ "ไม่มี VAT" · มีใบกำกับ ⇒ `data-preview-tax-invoice="<docNo>"` ข้อความ "ใบกำกับภาษี <docNo>" + ลิงก์ `<a href=".../dorm/billing/<billId>/tax-invoice">` · `withholding` ⇒ `data-preview-wht` "หัก ณ ที่จ่าย <n>%" + ยอด · ไม่จด VAT ⇒ เหมือน D.8 ("ไม่มี VAT" · ไม่มี 3 กล่องนี้)
### 5.2 ใบกำกับภาษีพิมพ์ — «TaxInvoicePrint.tsx» (default export · props `{ model: TaxInvoiceView }` · `renderToStaticMarkup` ได้)
- ตัวห่อ `data-tax-invoice="<docNo>"` + `data-ti-status="ISSUED|VOIDED"` · หัวเอกสารมีคำว่า **"ใบกำกับภาษี"** เห็นชัด (ไม่มีคำ "อย่างย่อ") · VOIDED ⇒ มีคำ "ยกเลิก"
- `data-ti-seller`: ชื่อ · เลขผู้เสียภาษี 13 หลัก (จัดรูปได้ แต่ตัวเลขครบ) · `branchLabel` · ที่อยู่ · `data-ti-buyer`: ชื่อ · ที่อยู่ · (มี taxId ⇒ เลข 13 หลัก + `branchLabel`) · `data-ti-no` = docNo · `data-ti-date` = วันไทย "26 ต.ค. 2569"
- `data-ti-line="<code>"` ต่อบรรทัด (คำอธิบาย + ยอด gross รูป `1,234.56`) — ไม่มีบรรทัดค่าห้อง/ค่าปรับ · `data-ti-subtotal` `data-ti-vat` `data-ti-total` (รูป `1,234.56` · VAT แยกจากมูลค่า ม.86/4(5)) · `replaces` ⇒ `data-ti-replaces` มี "ยกเลิกและออกใบกำกับภาษีฉบับใหม่แทนฉบับเดิม" + เลขเดิม + เหตุผล
- ไม่มีคำต้องห้าม สคบ. · ไม่มีเบอร์โทร
- «tax-invoice/page.tsx»: `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `dormAccess(...).board` ไม่ผ่าน ⇒ `notFound()` · `billTaxInvoice` (`searchParams.doc` ⇒ `docId`) null ⇒ `notFound()` · import จาก `@/lib/modules/dorm` เท่านั้น

## 6. ข้อสอบ «scripts/qc-svc-d.3.mts» (กลุ่ม)
S โครงสร้าง 11 · PC positive control 6 · M บิลผสม/รวม-ไม่รวม VAT/ไม่จด/ยกเว้นล้วน 7 · T ใบกำกับต่อบิล 11 · H ด่านผู้ขาย/ผู้ซื้อ/ปล่อยพัก 6 · K เลขที่ (ต่อเนื่อง/พร้อมกัน/หลายโพรเซส/ล้มไม่กินเลข/แยกร้าน) 6 · R ออกใหม่แทน 9 · B บัญชี (GL/pp30/ON_PAYMENT/void/convert/ใบลดหนี้) 7 · W หัก ณ ที่จ่าย/ค่าตั้ง/ตัวอย่างบิล 3 · U จอ+ใบพิมพ์ 5 · X ข้ามร้าน/หน่วย/สิทธิ์/เลขทั้งสมุด 6 · Z ล้าง 1 · G regression 7 = **85 ข้อ** — ตัวเลขคาดหวังคิดจากแถว `DormBill` จริง + `computeTotals` ของบัญชี (ไม่ฮาร์ดโค้ดยอด) · สถานะสะสม · ฟังก์ชันขาด = FAIL
- positive control (เขียวตั้งแต่ก่อนทำ · ต้องคงเขียว): PC-1 D.8 เตรียมรอบหอจด VAT ได้บิลผสม (RENT EXEMPT · VAT7 ต่อบรรทัด = computeTotals) · PC-2 ตัวยิง 4 โพรเซส (facade บัญชี) · PC-3 `issueDocument` TAX_INVOICE ทางเดิมไม่ผ่านเมื่อสมุดไม่มีเลขผู้ขาย (ม.86/4) · PC-4 `isValidThaiTaxId` กับเลขในฉาก · PC-5 ฉากหอไม่มีมิเตอร์ด่าน D.7 ผ่าน · PC-6 ทางแปลง `convertDocument`→`issueDocument` ใบกำกับซ้ำต่อต้นทางถูกปฏิเสธ (pipeline-M2)
- G (หลังล้าง): `qc-svc-d.8 --no-regression` · `qc-svc-d.7 --no-regression` · `qc-svc-d.2` · `qc-svc-smoke` · `qc-acc-v2-gl-inclvat` · `qc-acc-v2-guard` · `qc-account-api-write-docs` · typecheck + fitness 2 โหมด (ผู้คุม)

## 7. มติผู้คุม/ผู้เขียนข้อสอบในใบนี้ (ส่ง J4 ผู้ตรวจบัญชี / J3 พร้อมชุด)
1. **ใบกำกับออกตอนส่งบิล** (ไม่ใช่ตอนรับเงิน) สำหรับทุกบรรทัด VAT — ปลอดภัยต่อทั้งสินค้า (น้ำ/ไฟ ม.78) และบริการ (ม.78/1) เพราะการออกใบกำกับก่อนรับเงินทำให้ความรับผิดเกิด ณ วันออก · ผลต่อเจ้าของ: นำส่ง VAT เดือนที่ออกบิลแม้ผู้เช่ายังไม่จ่าย (⚠️ J4 ข้อ 5 — ทางเลือก "ต่อการรับเงิน" สำหรับบริการเป็นใบแก้ทีหลัง)
2. **เต็มรูปเสมอ** — อย่างย่อ (ม.86/6) ใช้ได้เฉพาะค้าปลีกที่ได้รับอนุมัติ และผู้เช่านิติบุคคลใช้เครดิตภาษีซื้อไม่ได้
3. **ใบกำกับเฉพาะส่วน VAT** (ตามแถวแผน) — ค่าห้องยกเว้นอยู่ในใบแจ้งหนี้/ใบเสร็จเท่านั้น
4. **ผู้ซื้อ freeze จาก Party** ตอนออก · ที่อยู่ว่าง = ที่อยู่ห้องที่เช่า · นิติบุคคลไม่มีเลขผู้เสียภาษี = ออกได้ (⚠️ J4 ข้อ 7)
5. **ยกเลิกใบกำกับ = ออกฉบับใหม่แทนเท่านั้น** (ยอดเท่าเดิม) · แก้ยอด = ใบลด/เพิ่มหนี้ · ยกเลิกใบแจ้งหนี้ที่มีใบกำกับไม่ได้
6. **วันที่ฉบับใหม่ = วันที่ฉบับเดิม** (ค่าเริ่ม · ตั้งเป็น "วันออกใหม่" ได้) · JV กลับ+ลงใหม่วันเดียวกับฉบับใหม่ (⚠️ J4 ข้อ 6)
7. หัก ณ ที่จ่ายปิดค่าเริ่ม (0) · แสดงอย่างเดียว · ฐาน = ค่าห้อง (⚠️ J3/J4 ข้อ 22 เดิม)
8. ยอดขายยกเว้น VAT (ค่าห้อง) ยังไม่อยู่ใน `pp30` ของบัญชี V2 (หนี้ — แจ้ง J4 ข้อ 8)

## 8. X · ส่งต่อ · หนี้
- X: X1 (X-1..6 ข้ามร้าน/หน่วย/สิทธิ์ ⇒ NOT_FOUND/null) · X3 (K-3 K-4 K-5 R-4 · 10 ทาง + 4 โพรเซส) · X9 (R-* เหตุผล + audit) · X8 (audit/บันทึกไม่มีเลขผู้ซื้อ) · ไม่เกี่ยว: X4/X5 (ไม่มี event/งานตามเวลาใหม่) · X6 (ไม่มี CSV ใหม่) · X7 (ไม่มี endpoint สาธารณะ — ผู้เช่าเห็นใบกำกับผ่านพอร์ทัล D.9) · X10 (ไม่มีไฟล์อัป)
- ส่งต่อ: **D.9** แนบลิงก์ใบกำกับใน LINE/พอร์ทัล (`billTaxInvoice`) · **D.10** รับเงินแบบหัก ณ ที่จ่าย + ใบเสร็จ (ไม่ออกใบกำกับซ้ำ — §2.4) · **D.12** ใบย้ายออก: ค่าน้ำไฟเศษเดือนที่จด VAT ต้องมีใบกำกับด้วย (ใช้ facade เดียวกัน) · **D.19** รายงานภาษีขาย/ยอดยกเว้น
- หนี้ที่รู้แล้ว: (1) pp30 ไม่มีบรรทัดยอดขายยกเว้น (มติ 8) (2) ใบกำกับต่อการรับเงิน (มติ 1) (3) ไม่แก้ Party ตอนออกใบแทน (ผู้ใช้แก้ข้อมูลผู้เช่าเองที่จอ 02)

## มติผู้คุม (29 ต.ค.)
- builder แก้ account/index.ts (บล็อก D.3) · account/service.ts (dormUpsertDocument + voidDocument เฉพาะ source=DORM) · defs/rooms.ts (def ใหม่ + ค่าเริ่ม WHT) ได้ — ตามแบบ D.2/D.5/D.7/D.13 · เพิ่มเท่านั้น ไม่เปลี่ยนพฤติกรรมของ source อื่น
- ORACLE-EDIT d.8 mkBook(vat=true) ใส่ taxId แล้ว (ใน commit เดียวกับข้อสอบนี้)
- H-5 ยอมรับ BUYER_TAX_ID_INVALID หรือ RUN_STALE ได้
- คำถามกฎหมาย J3/J4 ใหม่ลง ledger/wo-notes/svc-legal-questions.md แล้ว · ระหว่างรอคำตอบใช้มติ §7
