# ใบสั่ง D.10 — ตรวจสลิป/รับเงินหอ (consumer สลิป → รับชำระ → ใบเสร็จ → LINE · คิวตรวจของหอ · เงินสด/โอนมือ) · ตรวจ: **เข้ม 2 รอบ** (เงิน · ข้อมูลข้ามร้าน · แข่งหลายโพรเซส)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.10 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §6 A7 · §8 แถวบัญชี V2/ชำระเงิน · ภาคผนวก ก หอ #53–#58 · ภาพ `ledger/design-dorm/06-slip-payments.png` (+ `.body.html` · README บรรทัด 16/32/33)
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §3 (`submitSlip` · `decideSlip` · `payment.slip.approved` = consumer ของโดเมน idempotent ต่อ slipId) §4.4 (`notifyCustomer` + `precheck` มติ D.9 W2) §6.2 (`recordExternalPayment` · ใบลด/เพิ่มหนี้) §7 (`dorm.bill.paid` · `dorm.bill.partially_paid`) §8 (`dorm.slip.review` · `dorm.payment.manual`)
> บทเรียนที่ต้องอ่านก่อนเขียน (โค้ดชนะเอกสาร): `/root/svc-runs/fix/b8.md` (**V4 claim ต่อแถวก่อนเรียก submitSlip/บัญชี · ห้ามถือ tx/advisory lock ข้ามการเรียก facade ที่เปิด tx เอง** · **V8 ใช้ยอดจริงจากใบรับ ไม่ใช่ยอดผู้เรียก · ชน/ALREADY ⇒ `slip_after_paid` + logOps เสมอ**) · `/root/svc-runs/fix/d9.md` (§หนี้ A11 IP-1b W4 W7) · `/root/svc-runs/fix/d8.md` (F1 ใบลอย · F13 ลิงก์จ่ายเก่า) · `/root/svc-runs/fix/d11.md` (L1 ค่าปรับที่ยกเว้นแล้วห้ามถูกเก็บ · L9 อ่านยอดสด) · `/root/svc-runs/fix/d3.md` (ใบกำกับ ON_ISSUE · ห้ามออกใบกำกับต่อการรับเงิน) · `ledger/wo-notes/svc-legal-questions.md`
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.10.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `V-*` (ไม่มี `QC_BASE`) · `Q-*` (svcqc ยังไม่มีฉาก D.13) · `S-1` (หลัง merge)
> รัน: `cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.10.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลใน finally) · ข้อสอบเปิดตัวจำลอง LINE เอง (127.0.0.1 + `LINE_API_BASE`) · `APP_URL=https://qc-d10.invalid` ในโพรเซสตัวเอง · บล็อกคำขอออกนอกเครื่อง
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**` ยกเว้นสร้าง «scripts/svc-qc-payments-scene.mts» (ไฟล์ใหม่ไฟล์เดียว)** · temp ขึ้นต้น `svc-d10-` · รายงานต่อข้อ (id → ผล)
> ผู้เขียนข้อสอบแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก `SVC D.10` (`SQC_DORM_PAY_SCENE` · `SQC_VISUAL_SPECS["d.10"]`)

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ `src/` `prisma/` `public/`)

| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/platform/dorm-pay.ts» (ใหม่) | §3.2–§3.8 ทั้งหมด: consumer สลิปอนุมัติ · ตัดสินสลิปของหอ · รับเงินมือ · ใบเสร็จ · ยกเลิกใบเสร็จ · สลิปที่ถูกพัก · คิว/โมเดลจอ 06 · สลิปจากแชทที่ยังไม่แนบ |
| «src/lib/modules/dorm/balance.ts» (ใหม่) + `src/lib/modules/dorm/index.ts` (เพิ่ม export เท่านั้น) | §3.1 นิยามยอดค้างเดียวของบิล (A11) · `billBalances` |
| `src/lib/modules/dorm/latefee.ts` | **จุดเดียว**: `outstandingMany` คืน `ownOutstandingSatang` ของ `billBalances` (⚠️ R4 — ยอดทวง/ค่าปรับของ D.11 รวมใบเพิ่มหนี้) · พฤติกรรมอื่นของ D.11 ห้ามเปลี่ยน (G d.11) |
| `src/lib/modules/dorm/portal.ts` · `src/lib/platform/dorm-portal.ts` | ⚠️ R3: ยอดค้าง/ยอดจ่าย = `billBalances` (`outstandingSatang` = `dueSatang` รวมยอดยกมา) · QR/สลิปคาดหวัง = `dueSatang` · ใบเสร็จพอร์ทัลแสดงเลขใบเสร็จ D.10 · ไม่เปลี่ยนลำดับด่าน §3.1 ของ D.9 (G d.9) |
| `src/lib/platform/dorm-line.ts` | ⚠️ R3: (ก) `sendDormBill` ยอด = `dueSatang` (ข) `onLineImage` กิ่งกำกวม (บิลเปิด ≥ 2) ⇒ เก็บเป็นรายการ "สลิปจากแชทที่ยังไม่แนบ" (§3.8) แล้วตอบข้อความเดิม — ห้ามแตะกิ่งอื่น |
| `src/lib/payment/slip-verify.ts` | ⚠️ R1 **เพิ่มอย่างเดียว**: `canReview` รับ `dorm.slip.review` (module `dorm`) สำหรับสลิป `domain === "DORM"` (นอกจาก `payments.slip.review` เดิม) · ห้ามลบ/แก้บรรทัดเดิม (S-11) |
| `src/lib/modules/account/index.ts` · `src/lib/modules/account/service.ts` | ⚠️ R2 **เพิ่มอย่างเดียว**: ฟังก์ชันแคบของหอ — ออกใบเสร็จ (RECEIPT · source DORM) ผูกรายการรับที่บันทึกแล้ว (GL เป็นกลาง) · ยกเลิกรายการรับของหอ (ใช้ `voidPaymentInTx` + กลับ JV ส่วนเกิน 2110 — ไม่ลบแถว) · อ่านเอกสารที่จ่ายได้ของบิล (ใบแจ้งหนี้ + ใบเพิ่มหนี้) · ห้ามแก้ฟังก์ชันเดิม (S-12) |
| `src/lib/outbox-consumers.ts` | `payment.slip.approved`: **คง** `onDepositSlipApproved` ของ B.8 + เพิ่ม `(await import("@/lib/platform/dorm-pay")).onDormSlipApproved(evt)` เป็นงานหลักคู่ (`bothMain`) · เพิ่ม `dorm.bill.paid` · `dorm.bill.partially_paid` = `withAutomation(async () => {})` |
| `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | ป้ายไทยของ 2 event ใหม่ (กติกา 15) |
| `src/lib/core/settings/defs/rooms.ts` | §2 ค่าตั้งใหม่ (เพิ่มเท่านั้น · กลุ่มเดิม) |
| «src/app/app/u/[unitSlug]/dorm/payments/page.tsx» · «actions.ts» (ใหม่) | จอ 06 "รับเงิน" (server) + server actions |
| «src/components/dorm/DormPayments.tsx» (ใหม่ · default export) | §4 สัญญา DOM |
| `src/components/dorm/dorm-home-shared.ts` | เพิ่มแท็บ/ลิงก์ "บิล/รับเงิน" → `/dorm/payments` (เฉพาะผู้มี `dorm.slip.review` หรือ `dorm.payment.manual`) — เพิ่มอย่างเดียว |
| «scripts/svc-qc-payments-scene.mts» (ใหม่) | §7 ฉากภาพ |

ห้ามแตะ: `prisma/**` · `src/lib/core/**` นอก `defs/rooms.ts` · `src/lib/platform/notify-customer.ts` · `src/lib/payment/**` นอก slip-verify.ts (R1) · `src/lib/modules/chat/**` · `src/lib/modules/booking/**` · `src/lib/modules/dorm/{billing,calc,lease,meter,utility,law,tax-invoice,home,policy,access,account-bridge,dunning}.ts` · `src/lib/modules/account/**` นอก index.ts/service.ts (R2) · `src/app/(store)/**` · หน้าตั้งค่าหอ (ค่าตั้งใหม่โผล่ในการ์ดกลุ่มเดิมเอง)
> ทำไมชั้น platform: ต้องใช้ หอ + บัญชี + สลิป + notifyCustomer + แชท พร้อมกัน (แบบ dorm-line.ts ของ D.9) · import ผ่าน facade (`@/lib/modules/dorm` · `@/lib/modules/account` · `@/lib/modules/chat`) + `@/lib/payment/slip-verify` · **ไฟล์ platform ห้าม `import { prisma }` ดิบ** (ใช้ facade หรือ `tenantDb`) · **ห้ามเขียนตารางบัญชี (`accountDocumentPayment` · `accountJournal*` · `accountDocument`) จาก dorm-pay/balance โดยตรง** — เงินผ่าน facade บัญชีเท่านั้น (S-7)

## 2. ค่าตั้งใหม่ (ทะเบียน · ป้ายไทย · ชั้น UNIT · `sensitivity: "MONEY"` สำหรับเงิน)
| คีย์ | ชนิด · schema | ค่าเริ่ม | ป้ายไทย (ตัวอย่าง) |
|---|---|---|---|
| `rooms.payment.afterPaidSlip` | enum `REVIEW` \| `CREDIT` | **REVIEW** | สลิปที่อนุมัติหลังบิลจ่ายครบแล้ว (พักให้พนักงานตัดสิน / เก็บเป็นเงินรับล่วงหน้า) |
| `rooms.payment.notifyReceipt` | bool | **true** | ส่งใบเสร็จให้ผู้เช่าทาง LINE อัตโนมัติเมื่อรับเงิน |
| `rooms.payment.chatSlipKeepDays` | days · int 1–90 | **30** | เก็บรูปสลิปจากแชทที่ยังไม่แนบบิล (วัน) |
| `rooms.msg.slipRejected` (แม่แบบ · `tpl`) | ตัวแปร tenantName roomNo unitName amount reason payLink | ข้อความไทยสุภาพ | ข้อความแจ้งสลิปไม่ผ่าน |
| `rooms.msg.payMore` (แม่แบบ · `tpl`) | ตัวแปร tenantName roomNo unitName amount payLink | ข้อความไทยสุภาพ | ข้อความขอให้โอนเพิ่ม |

ค่าที่มีอยู่แล้วที่ใบนี้ใช้ (อ่านต่อคำขอ · ไม่แคช): `rooms.payment.partial` (#58 · `ALLOW_CARRY_FORWARD` \| `DENY`) · `rooms.msg.receipt` · `messaging.*` (ผ่าน notifyCustomer) · `payments.slip.*` (ของ R0.6 — ใบนี้ไม่อ่านเอง ยกเว้นผ่าน decideSlip) · `rooms.notify.portalLinkDays` (ผ่าน `portalUrl`) · **ห้ามฮาร์ดโค้ดตัวเลขนโยบาย** (S-6) · ตัวตรวจคำต้องห้ามของแม่แบบใช้ของเดิม (แม่แบบที่มี "ตัดไฟ" บันทึกไม่ได้)

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ/ฟิลด์ต้องตรง)

### 3.0 นิยามกลาง
- **บิลที่รับเงินได้** = `DormBill` ของร้าน (`tenantId`) + หน่วย DORM ของร้าน · สถานะ `SENT | PARTIALLY_PAID | PAID` · มี `accountDocumentId` · ไม่ใช่ ⇒ ตามรหัส: ไม่พบ/ร้านอื่น/หน่วยอื่น/DRAFT/HELD ⇒ `NOT_FOUND` · `VOID` ⇒ `BILL_VOID` · ไม่มีใบแจ้งหนี้ ⇒ `NO_INVOICE` (มติ 9)
- **ด่านสิทธิ์** (Membership สด · ตอบรับแล้ว · หน่วยของบิล/สลิป): ตัดสินสลิป/คิว/สลิปแชท ⇔ `dorm.slip.review` · รับเงินมือ/ยกเลิกใบเสร็จ ⇔ `dorm.payment.manual` · โมเดลจอ ⇔ คีย์ใดคีย์หนึ่ง · **ไม่ผ่าน = `NOT_FOUND` เหมือนไม่มีของทุกไบต์** (X1 · ไม่มี `PERMISSION_DENIED` ในใบนี้)
- **ผลล้มมาตรฐาน**: `{ ok: false; code; reason: string /* ไทย */ }` · `code === "NOT_FOUND"` ⇒ `reason === DORM_PAY_NF` เสมอ (คงที่ · ส่งออกจาก dorm-pay)
- เงินเป็นสตางค์ (จำนวนเต็ม) · เวลาไทยผ่าน `bkkYmd`/`bkkParts` · ห้าม `.getDay/.getDate/.getMonth/.getHours/.getFullYear()` ดิบ

### 3.1 ยอดค้างนิยามเดียว (A11) — «src/lib/modules/dorm/balance.ts»
```ts
export type DormBillBalance = {
  billId: string; leaseId: string; unitId: string; periodKey: string; status: string;
  invoice: { docId: string; docNo: string | null; openSatang: number } | null;
  debitNotes: { docId: string; docNo: string | null; openSatang: number }[];   // ใบเพิ่มหนี้ที่มีผลของใบแจ้งหนี้นี้ (เรียงลำดับออก)
  ownOutstandingSatang: number;      // invoice.open + Σ debit.open · ไม่มีใบ = max(0, total − paid)
  carriedOutSatang: number;          // ยอดของบิลนี้ที่ "ยกไปบิลหน้า" ที่ยังค้าง = min(DormBill.carriedSatang, ownOutstanding) · 0 เมื่อไม่ยก
  carriedIn: { billId: string; periodKey: string; satang: number }[];   // บิลก่อนหน้าของสัญญาเดียวกันที่ยกมาบิลนี้ (เรียงงวดเก่า→ใหม่)
  dueSatang: number;                 // ownOutstanding + Σ carriedIn.satang (ยอดที่ผู้เช่าต้องจ่ายตอนนี้ผ่านบิลนี้)
};
export async function billBalances(tenantId: string, billIds: string[]): Promise<Map<string, DormBillBalance>>;
```
- open ต่อเอกสาร = `grandTotal − รับชำระที่ไม่ถูกยกเลิก (amount + wht) − ใบลดหนี้ที่มีผลที่อ้างเอกสารนั้น` · ไม่ติดลบ · เอกสาร VOIDED/CANCELLED/DRAFT = 0
- **ยกมา**: บิล X (งวด p) มี `carriedOutSatang > 0` ⇒ ปรากฏใน `carriedIn` ของ "บิลถัดไป" = บิลที่ผู้เช่าเห็น (SENT/PARTIALLY_PAID/PAID) ของสัญญาเดียวกันที่งวดน้อยที่สุดที่ > p · ยังไม่มีบิลถัดไป ⇒ ไม่อยู่ที่ไหน (ยังค้างในบิลเดิม) · บิลถัดไปถูก VOID ⇒ ย้ายไปบิลที่เห็นถัดไป
- ร้านอื่น/ไม่พบ ⇒ ไม่อยู่ใน Map (ไม่ throw) · คิวรีชุดเดียวต่อการเรียก (ไม่ N+1)
- `outstandingMany` (latefee.ts · D.11) = `ownOutstandingSatang` ของฟังก์ชันนี้ · `loadPortal` (D.9): `bill.outstandingSatang` = `dueSatang` และ `pay.amountSatang` = `dueSatang` · `sendDormBill` ยอด = `dueSatang` (R3)

### 3.2 ลำดับกระจายเงิน (ทุกทางที่ลงเงิน: consumer · ตัดสินมือ · เงินสด/โอนมือ · พักแล้วเก็บเป็นเครดิต)
1. `carriedIn` ของบิลเป้าหมาย (งวดเก่า → ใหม่ · ในแต่ละบิล: ใบแจ้งหนี้ก่อน แล้วใบเพิ่มหนี้ตามลำดับออก)
2. ใบแจ้งหนี้ของบิลเป้าหมาย → ใบเพิ่มหนี้ของบิลเป้าหมาย (ตามลำดับออก)
3. เหลือ ⇒ **เงินรับล่วงหน้า 2110** (ส่วนเกินของ `recordExternalPayment` · รายการเดียวต่อการรับ) — ไม่ใช่รายได้
- เรียก `recordExternalPayment` **ทีละเอกสารตามลำดับ** (ห้าม `Promise.all`) · คีย์ต่อเอกสารกำหนดได้จาก (การรับ, เอกสาร) ⇒ ลองใหม่หลังตายกลางทาง = ผลเดิม (X4) · ยอดต่อเอกสารคิดจากยอดค้าง **ณ ใต้ claim** (§3.3) แล้วบันทึกแผนไว้ก่อนลง (ลองใหม่ใช้แผนเดิม ไม่คิดใหม่)
- หลังลง: `DormBill` ทุกใบที่ถูกแตะ — `paidSatang` = รับรวม (ใบแจ้งหนี้ + ใบเพิ่มหนี้) · `status` = `PAID` เมื่อ `ownOutstanding = 0` / `PARTIALLY_PAID` เมื่อจ่ายแล้ว > 0 / คงเดิม · `paidAt` = เวลารับ (เมื่อ PAID) · event ต่อ (บิล, ใบเสร็จ): `dorm.bill.paid` (key `dorm.bill.paid:<billId>:<receiptId>`) หรือ `dorm.bill.partially_paid` (key `dorm.bill.partially_paid:<billId>:<receiptId>`) · payload `{ unitId, billId, leaseId, periodKey, amountSatang /* ที่ลงบิลนี้ */, receiptId }` เท่านั้น (ไม่มีชื่อ/เบอร์)

### 3.3 ด่านต่อบิล (W7 · แข่งเงินสด) — กติกาเดียวทุกทาง
- ทุกทางที่ลงเงินกับบิล (consumer · ตัดสินมือ · เงินสด/โอนมือ · เก็บเครดิตของสลิปที่พัก) **ถือ claim ต่อบิลเป้าหมาย** (CAS บนแถว `DormBill` — เช่น marker ใน `policySnapshot` หรือเทียบเท่า · ไม่มี migration · หมดอายุเองกันค้าง · ปล่อยเมื่อเสร็จ/ล้ม) ก่อนอ่านยอดและก่อนเรียก `decideSlip`/บัญชี · ⛔ **ห้ามถือ tx/advisory lock ข้ามการเรียก facade ที่เปิด tx เอง** (บทเรียน B.8 V4)
- ได้ claim ไม่ได้ ⇒ ทางมือ `BUSY` (ไม่เปลี่ยนอะไร) · consumer ⇒ throw (คิว outbox ลองใหม่)
- ใต้ claim อ่านยอดสด: `dueSatang = 0` ⇒ ทางมือ `ALREADY_PAID` (สลิปคงสถานะเดิม · ไม่มีเงิน) · consumer ⇒ "สลิปหลังจ่ายครบ" (§3.4)
- ผล: สองสลิปบนบิลเดียวพร้อมกัน ⇒ **ลงบิลได้ใบเดียว** · อนุมัติแข่งเงินสด ⇒ **ลงบิลได้ทางเดียว** (อีกทาง `ALREADY_PAID`/`BUSY`/พัก) · ไม่มีวันนับซ้ำ · 2110 ไม่โตจากการแข่ง

### 3.4 consumer — «dorm-pay.ts»
```ts
export async function onDormSlipApproved(evt: { id?: string; tenantId: string; unitId?: string | null; type?: string; payload: unknown }): Promise<void>;
```
1. อ่านสลิปจากฐานใหม่ (`evt.tenantId` เท่านั้น · ห้ามเชื่อยอดใน payload) · ไม่ใช่ `domain DORM` + `refType DORM_BILL` + สถานะ `APPROVED|AUTO_APPROVED` ⇒ return (ไม่ทำอะไร)
2. **สลิปนี้มีใบเสร็จแล้ว (รวมใบที่ถูกยกเลิก) หรือถูกพัก/ตัดสินพักแล้ว ⇒ return** (หนึ่งสลิป = ใบเสร็จที่มีผลได้ครั้งเดียวตลอดกาล · X4)
3. ยอด = `checks.decided.amountSatang` → `amountSatang` → `expectedSatang` (ตัวแรกที่เป็นจำนวนเต็ม > 0 · V8)
4. บิล `refId` ต้องเป็นของร้าน+หน่วยของสลิป · `VOID` ⇒ **พัก** (`BILL_VOID`) · ไม่มีใบ ⇒ พัก (`NO_INVOICE`) · ไม่พบ ⇒ logOps + return
5. claim (§3.3) → `dueSatang = 0` ⇒ `rooms.payment.afterPaidSlip`: `REVIEW` ⇒ **พัก** (`AFTER_PAID` · ไม่มีรายการบัญชี) · `CREDIT` ⇒ ลงทั้งก้อนเป็น 2110 (ผ่านใบแจ้งหนี้ของบิลด้วยยอดเต็ม ⇒ applied 0 + ส่วนเกิน) + ใบเสร็จ (`creditSatang` = ยอด)
6. อื่น ⇒ กระจาย §3.2 → ใบเสร็จ §3.6 → อัปเดตบิล + event → ส่ง LINE ใบเสร็จ (§3.6 · ล้มไม่ทำให้ event ล้ม)
- **พัก** = จดสถานะพักต่อสลิป (AuditLog `dorm.slip.held` `{ slipId, billId, reason }` ครั้งเดียวต่อสลิป หรือเทียบเท่า) + logOps WARN · แสดงในคิว (§3.7 `status: "HELD"`) จนพนักงาน `resolveHeldSlip`
- ข้อผิดพลาดชั่วคราว (claim ไม่ได้ · บัญชี BUSY) ⇒ throw (ลองใหม่) · ซ้ำ/พร้อมกัน/หลายโพรเซส = ผลครั้งเดียว (X4)

### 3.5 ตัดสินสลิปของหอ — «dorm-pay.ts»
```ts
export const DORM_PAY_NF: string;   // ข้อความกลาง เช่น "ไม่พบรายการนี้"
export type DormPayCtx = { tenantId: string; actorUserId: string };
export type DormPayFail = { ok: false; code: "NOT_FOUND" | "VALIDATION" | "ALREADY_DECIDED" | "ALREADY_PAID" | "BILL_VOID" | "NO_INVOICE" | "PARTIAL_DENIED"
  | "DUPLICATE" | "BUSY" | "IDEMPOTENCY_CONFLICT" | "ALREADY_VOID" | "CONTENT_GONE" | "FAILED"; reason: string };
export type DormReviewAction = "APPROVE" | "PARTIAL_CARRY" | "ASK_MORE" | "REJECT";
export async function reviewDormSlip(ctx: DormPayCtx, i: { slipId: string; action: DormReviewAction; reason: string; transRef?: string | null; amountSatang?: number | null })
  : Promise<{ ok: true; slipId: string; status: "APPROVED" | "REJECTED"; receipt: DormReceiptView | null } | DormPayFail>;
export async function resolveHeldSlip(ctx: DormPayCtx, i: { slipId: string; action: "CREDIT" | "REFUND_DUE"; reason: string })
  : Promise<{ ok: true; slipId: string; receipt: DormReceiptView | null } | DormPayFail>;
```
ลำดับ `reviewDormSlip`: ด่านสิทธิ์ `dorm.slip.review` ที่หน่วยของสลิป (ไม่ผ่าน/ร้านอื่น/ขยะ ⇒ `NOT_FOUND`) → `reason` 1–500 ตัว (ไม่มี ⇒ `VALIDATION`) → สลิปต้อง `PENDING|NEEDS_REVIEW` (อื่น ⇒ `ALREADY_DECIDED`) → บิล §3.0 (`BILL_VOID` · `NO_INVOICE`) → claim §3.3 (`BUSY`) → ใต้ claim: `REJECT` ไม่ต้องดูยอด · อื่น: `dueSatang = 0` ⇒ `ALREADY_PAID` → ตามการกระทำ:
- `APPROVE`: ยอด = `amountSatang ?? slip.amountSatang` · ต้อง ≥ `dueSatang` (ต่ำกว่า ⇒ `VALIDATION` "ยอดต่ำกว่าที่ต้องชำระ เลือกรับบางส่วน") · เกิน ⇒ ส่วนเกิน 2110 · ⇒ `decideSlip(APPROVE, amount)` (ชื่อไม่ตรง = พนักงานยืนยันได้ · ซ้ำเลขอ้างอิง ⇒ `DUPLICATE`)
- `PARTIAL_CARRY` / `ASK_MORE`: `rooms.payment.partial = DENY` ⇒ `PARTIAL_DENIED` · ยอด = `slip.amountSatang` (ต้อง 1..dueSatang−1 · อื่น ⇒ `VALIDATION`) ⇒ `decideSlip(APPROVE_PARTIAL)` · `PARTIAL_CARRY` ⇒ หลังลงเงิน `DormBill.carriedSatang` = ยอดค้างที่เหลือของบิลเป้าหมาย (ยกไปบิลหน้า §3.1) + ใบเสร็จระบุ "ยกยอด ฿x ไปบิลหน้า" · `ASK_MORE` ⇒ `carriedSatang` คงเดิม + ส่ง LINE `rooms.msg.payMore` (`amount` = ยอดที่ยังค้าง · `payLink` = `portalUrl` ของบิล · dedupe `rooms:paymore:<slipId>`)
- `REJECT`: `decideSlip(REJECT)` · **ไม่มีรายการบัญชีใด ๆ** · LINE `rooms.msg.slipRejected` (`reason` = เหตุผลที่พนักงานพิมพ์ · dedupe `rooms:slipreject:<slipId>`)
- หลัง `decideSlip` สำเร็จ ⇒ เรียกงานลงเงินของ consumer **ในคำขอเดียวกัน** (ผลเหมือน §3.4 ข้อ 6 · consumer มาทีหลัง = ไม่ทำอะไร) แล้วคืน `receipt`
- ตัดสินซ้ำ/พร้อมกันบนสลิปเดียว ⇒ สำเร็จ 1 (ที่เหลือ `ALREADY_DECIDED` หรือ `BUSY`) · ใบเสร็จ 1
- `resolveHeldSlip` (สลิปที่ถูกพักเท่านั้น · อื่น ⇒ `NOT_FOUND`): `CREDIT` ⇒ claim + ลงทั้งก้อนเป็น 2110 + ใบเสร็จ (บิล VOID/ไม่มีใบ ⇒ `BILL_VOID`/`NO_INVOICE` — ต้องคืนเงินทางอื่น) · `REFUND_DUE` ⇒ จดเหตุผล (audit) ออกจากคิว ไม่มีรายการบัญชี (การโอนคืนจริง = หนี้ D.12/J4) · ครั้งเดียวต่อสลิป

### 3.6 รับเงินมือ · ใบเสร็จ · ยกเลิกใบเสร็จ — «dorm-pay.ts»
```ts
export type DormReceiptView = {
  receiptId: string;  docNo: string;  billId: string;  slipId: string | null;
  channel: "PROMPTPAY" | "TRANSFER" | "CASH";  paidAt: string /* ISO */;  amountSatang: number;
  allocations: { billId: string; docId: string; kind: "INVOICE" | "DEBIT_NOTE"; amountSatang: number }[];
  creditSatang: number;  carriedSatang: number;  status: "ISSUED" | "VOIDED";
};
export async function recordDormPayment(ctx: DormPayCtx, i: { unitId: string; billId: string; amountSatang: number; channel: "CASH" | "TRANSFER"; idempotencyKey: string;
  paidAt?: string | null; financeAccountId?: string | null; note?: string | null }): Promise<{ ok: true; duplicate: boolean; receipt: DormReceiptView } | DormPayFail>;
export async function voidDormReceipt(ctx: DormPayCtx, i: { receiptId: string; reason: string }): Promise<{ ok: true; receipt: DormReceiptView } | DormPayFail>;
export async function dormBillReceipts(ctx: DormPayCtx, i: { unitId: string; billId: string }): Promise<DormReceiptView[] | null>;
```
- `recordDormPayment`: ด่าน `dorm.payment.manual` → ตรวจ (`amountSatang` จำนวนเต็ม 1..2,147,483,647 · คีย์ `/^[A-Za-z0-9_:-]{8,128}$/` · channel) ⇒ `VALIDATION` → บิล §3.0 → **คีย์เดิม + ข้อมูลเดิม ⇒ ผลเดิม `duplicate: true`** (แม้บิลจ่ายครบแล้ว) · คีย์เดิมข้อมูลอื่น ⇒ `IDEMPOTENCY_CONFLICT` → claim → `dueSatang = 0` ⇒ `ALREADY_PAID` → ยอด < due และ `rooms.payment.partial = DENY` ⇒ `PARTIAL_DENIED` → กระจาย §3.2 (เกิน ⇒ 2110) → ใบเสร็จ → บิล/event → LINE · คีย์เดียวพร้อมกันหลายโพรเซส = ใบเสร็จ 1
- **ใบเสร็จ** = เอกสารบัญชี `RECEIPT` (`source DORM` · `refType "DormReceipt"` · `refId` = `slip:<slipId>` หรือ `manual:<idempotencyKey>` หรือเทียบเท่าที่ไม่ซ้ำ) **1 ใบต่อการรับ 1 ครั้ง** · `docNo` จากเลขรันของสมุด (ไม่ว่าง · ไม่ซ้ำในร้าน · **ใบที่ยกเลิกยังถือเลขเดิม · ไม่มีวันออกเลขซ้ำ**) · ผูกรายการรับที่ลงแล้ว — **GL เป็นกลาง** (ไม่มีรายได้/เงินสดเพิ่มจากการออกใบเสร็จ) · ไม่ออกใบกำกับภาษีต่อการรับ (D.3 ON_ISSUE)
- `voidDormReceipt`: ด่าน `dorm.payment.manual` · `reason` ≥ 5 ตัว (`VALIDATION`) · ยกเลิกแล้ว ⇒ `ALREADY_VOID` · **กลับรายการเท่านั้น** (ยกเลิกรายการรับผ่าน `voidPaymentInTx` เดิม + กลับ JV ส่วนเกิน 2110 · รายการเดิมยังอยู่ · ไม่ลบแถวบัญชี) · ใบเสร็จ `status VOIDED` (เลขเดิม) · บิลกลับสถานะตามยอดจริง · ใบเสร็จของสลิปที่ถูกยกเลิก ⇒ สลิปนั้น **ไม่ถูกลงซ้ำอีก** (consumer replay = ไม่ทำอะไร)
- **LINE ใบเสร็จ**: `rooms.payment.notifyReceipt = true` ⇒ `notifyCustomer({tenantId}, { unitId, domain: "rooms", messageKey: "receipt", partyId: lease.partyId, vars: { tenantName, roomNo, unitName, amount: "฿x,xxx.xx" (= amountSatang ของใบเสร็จ), paidDate, receiptLink: portalUrl(…, { billId }) }, dedupeKey: "rooms:receipt:<receiptId>", precheck: ใบเสร็จยังไม่ถูกยกเลิก })` · ส่งซ้ำ = ข้อความเดียว · OA ของหน่วยเท่านั้น (notifyCustomer)

### 3.7 คิว/โมเดลจอ 06 — «dorm-pay.ts»
```ts
export type DormSlipFlag = "PAYER_NAME" | "SHORT" | "OVER" | "DUPLICATE" | "AFTER_PAID" | "BILL_VOID" | "NO_INVOICE" | "OTHER";
export type DormReviewRow = {
  slipId: string; billId: string; roomNumber: string; tenantShort: string /* ชื่อแรกคำเดียว */; periodKey: string;
  dueSatang: number; slipSatang: number | null; diffSatang: number /* slip − due (ไม่มียอดสลิป = 0) */; transferredAt: string | null; bankCode: string | null;
  status: "PENDING" | "NEEDS_REVIEW" | "HELD"; flags: DormSlipFlag[]; actions: (DormReviewAction | "CREDIT" | "REFUND_DUE")[];
};
export type DormPaymentsModel = {
  unitId: string; unitName: string; periodKey: string; periodLabel: string /* "พ.ย. 2569" */;
  can: { review: boolean; manual: boolean };
  kpi: { receivedSatang: number; receivedBills: number; autoApproved: number; reviewCount: number; reviewSatang: number; reviewRooms: string[];
         unpaidSatang: number; unpaidBills: number; overdueSatang: number; overdueRooms: string[] };
  review: DormReviewRow[];
  chat: { itemId: string; roomNumbers: string[]; receivedAt: string }[];
  recent: { billId: string; roomNumber: string; tenantShort: string; via: "SLIP" | "CASH" | "TRANSFER" | "OTHER"; at: string; amountSatang: number; docNo: string | null }[];
  links: { statementMatch: string | null };
};
export async function dormPaymentsModel(ctx: DormPayCtx, i: { unitId: string; periodKey?: string | null }): Promise<DormPaymentsModel | null>;
```
- ไม่มีสิทธิ์ทั้งสองคีย์/หน่วยร้านอื่น/ไม่ใช่ DORM ⇒ `null` · `can` ตามคีย์จริง · `periodKey` ไม่ระบุ = งวดล่าสุดที่มีบิลที่เห็น
- `review` = สลิป DORM_BILL ของ **หน่วยนี้เท่านั้น** สถานะ `PENDING|NEEDS_REVIEW` + สลิปที่ถูกพัก (`HELD`) ใหม่ → เก่า · `dueSatang` = `billBalances` สด · flags: reason `PAYER_NAME_MISMATCH` ⇒ `PAYER_NAME` · ยอดสลิป < due ⇒ `SHORT` · > due ⇒ `OVER` · reason `DUPLICATE_*`/`VERIFIER_DUPLICATE` ⇒ `DUPLICATE` · พัก ⇒ เหตุผลพัก (`AFTER_PAID` · `BILL_VOID` · `NO_INVOICE` — ธงสามตัวนี้ใช้กับแถว HELD เท่านั้น · แถวรอตรวจของบิลไม่มีใบแจ้งหนี้ไม่ติดธง แต่ทำรายการแล้วได้ `NO_INVOICE`) · `actions`: HELD ⇒ `["CREDIT","REFUND_DUE"]` · อื่น ⇒ `REJECT` เสมอ + `APPROVE` เมื่อ due > 0 และ (ไม่มียอดสลิป หรือยอด ≥ due) + `PARTIAL_CARRY`/`ASK_MORE` เมื่อ `SHORT` และ partial = ALLOW
- `kpi` (บิลที่เห็นของงวด P · ยอดจาก `billBalances`): received = Σ (รับแล้วของบิลงวด P) · receivedBills = จำนวนบิลงวด P ที่ PAID · autoApproved = บิลงวด P ที่จ่ายด้วยใบเสร็จจากสลิป `AUTO_APPROVED` · reviewCount/Satang/Rooms = จากแถว review ที่ไม่ใช่ HELD (Σ `dueSatang` ต่อบิลไม่ซ้ำ · ห้องเรียงเลข) · unpaid = บิลงวด P ที่ `dueSatang > 0` และไม่มีสลิปรอตรวจ · overdue = บิลงวด < P ของสัญญาที่ยัง live ที่ `ownOutstanding − carriedOut > 0` (Σ · ห้อง)
- `recent` = บิลงวด P ที่ PAID ล่าสุด ≤ 10 (ใบเสร็จ D.10 ⇒ `docNo` · ไม่มีใบเสร็จ ⇒ `null`) · `links.statementMatch` = `/app/sys/<สมุดของหน่วย>/account/finance/reconcile` (ไม่มีสมุด ⇒ null)
- **ไม่มีในผลคืน**: เบอร์ · ชื่อเต็ม · path/URL ไฟล์สลิป (ดูรูปผ่าน `slipFileUrl` เดิม) · ข้อมูลหน่วย/ร้านอื่น

### 3.8 สลิปจากแชทที่ยังไม่แนบ (W4) — «dorm-pay.ts» + จุดเดียวใน dorm-line.ts
```ts
export async function stashChatSlip(ctx: { tenantId: string; connectionId: string; partyId: string; leaseIds: string[] }, i: { messageId: string; data: Uint8Array; contentType: string },
  opts?: { now?: Date; deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void> } }): Promise<{ itemId: string } | null>;
export async function attachChatSlip(ctx: DormPayCtx, i: { itemId: string; billId: string }, opts?: { deps?: { put?: …; del?: … } })
  : Promise<{ ok: true; slipId: string; status: string } | DormPayFail>;
export async function dismissChatSlip(ctx: DormPayCtx, i: { itemId: string; reason: string }, opts?: { deps?: { del?: … } }): Promise<{ ok: true } | DormPayFail>;
```
- `onLineImage` กิ่งกำกวม (บิลเปิด ≥ 2 ของผู้ส่งที่รู้จัก) ⇒ ดึงรูป (`fetchLineMessageContent`) → `stashChatSlip` (ไฟล์ส่วนตัว · ผูก connection + messageId + Party + สัญญา · messageId เดิม = รายการเดิม) แล้วตอบข้อความเดิม · ผู้ส่งไม่รู้จัก/ไม่มีบิลเปิด ⇒ ไม่ดึงรูป ไม่เก็บ (เดิม)
- รายการโผล่ใน `model.chat` ของหน่วยของสัญญา (ห้องตามสัญญา) · `attachChatSlip`: ด่าน `dorm.slip.review` · บิลต้องเป็นบิลที่รับเงินได้ของ **สัญญาที่ผูกกับรายการ** (อื่น ⇒ `NOT_FOUND`) · `dueSatang = 0` ⇒ `ALREADY_PAID` → ดึงรูปจาก LINE อีกครั้ง (ล้ม ⇒ `CONTENT_GONE`) → `submitSlip({ unitId, domain: "DORM", refType: "DORM_BILL", refId: billId, partyId, file, expectedSatang: dueSatang, idempotencyKey: "dorm-chat:" + messageId })` → รายการออกจากคิว · แนบซ้ำ ⇒ `NOT_FOUND`
- `dismissChatSlip`: ด่านเดียวกัน · `reason` บังคับ · ลบไฟล์ส่วนตัว + ออกจากคิว · รายการเก่ากว่า `rooms.payment.chatSlipKeepDays` ไม่โผล่และถูกลบไฟล์โดยงานตามเวลา (minute-job ไม่บังคับในใบนี้ — ลบตอนอ่านโมเดลได้)

## 4. สัญญา DOM — «src/components/dorm/DormPayments.tsx» (`'use client'` บรรทัดแรก · default export · props `{ model: DormPaymentsModel; unitSlug: string; selected: string | null /* slipId ที่เปิดแผง */; actions: { review; resolve; cash; voidReceipt; attachChat; dismissChat } }` (แต่ละตัว `(prev: unknown, fd: FormData) => Promise<unknown>`) · `import type` เท่านั้นจาก lib · ห้าม import `@/lib/modules/**` `@/lib/platform/**` `@/lib/core/db` `@prisma/client` `next/*` · `renderToStaticMarkup` ได้)
- ราก `data-dorm-payments` `data-period="<periodKey>"` · หัว "รับเงิน รอบ <เดือนย่อ>" · ปุ่ม `[data-pay-cash]` "บันทึกรับเงินสด" (เมื่อ `can.manual`) · `a[data-pay-statement]` (href = `links.statementMatch` · เมื่อไม่ null)
- การ์ด `[data-pay-kpi="received|review|unpaid|overdue"]` แต่ละใบมียอดรูป `฿133,912.80` (ข้อความ `฿` + `toLocaleString en-US 2 ตำแหน่ง`) · review แสดง `reviewCount`
- แท็บ `[data-pay-tab="review|paid|unpaid|overdue"]` · แถว `[data-pay-review-row="<slipId>"][data-room="<roomNumber>"]` มียอดบิล `4,800.00` + ยอดสลิป + ธง `[data-pay-flag="<flag>"]` ต่อธง (ป้ายไทย: ชื่อผู้โอนไม่ใช่ผู้เช่า · ยอดขาด ฿x · ยอดเกิน ฿x · สลิปซ้ำ · เข้าหลังจ่ายครบ · บิลถูกยกเลิก · ไม่มีใบแจ้งหนี้)
- แผง `[data-pay-panel="<slipId>"]` (เมื่อ `selected` ตรงแถว): ตัวเลือก `input[type=radio][name=action][value=<action>]` เฉพาะใน `row.actions` · `input[name=reason]` · `input[type=hidden][name=slipId]` · ปุ่ม `[data-pay-confirm]` "ยืนยัน · ส่งใบเสร็จ" · ป้าย PARTIAL_CARRY มี "ยกยอด" · ASK_MORE มี "ขอให้โอนเพิ่ม" · REJECT มี "ไม่รับสลิปนี้"
- รายการรับล่าสุด `[data-pay-recent]` แถว `[data-pay-receipt="<docNo | ''>"]` (ห้อง + ยอด) · สลิปแชท `[data-pay-chat="<itemId>"]`
- **HTML ไม่มี**: เบอร์ · ชื่อเต็ม (นามสกุล) · URL ไฟล์ · คำต้องห้าม สคบ. · ตัวเลข/ข้อความภาษาอังกฤษล้วนที่ผู้ใช้เห็น (ป้ายไทยทั้งหมด)

## 5. หน้า — `/app/u/[unitSlug]/dorm/payments` (server)
- `requireUnit` → หน่วย DORM → `dormPaymentsModel(ctx, { unitId, periodKey: searchParams.period ?? null })` → `null` ⇒ `notFound()` · `selected` = `searchParams.slip` หรือแถวแรกของห้อง `searchParams.room` · `export const dynamic = "force-dynamic"`
- actions.ts: `"use server"` · export async function เท่านั้น: `reviewSlipAction` `resolveHeldAction` `recordCashAction` `voidReceiptAction` `attachChatAction` `dismissChatAction` (ชื่อเลือกได้แต่ต้องเรียกฟังก์ชัน §3) · ctx จาก session (`requireUnit`) · **ไม่รับ tenantId/ยอดคาดหวัง/ยอดค้าง จากฟอร์ม** (ยอดเงินสดที่พนักงานพิมพ์ = `amountSatang` ได้) · ไม่ส่ง `deps` · revalidate หน้า

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **ใบเสร็จ = เอกสาร RECEIPT ของบัญชี V2** 1 ใบต่อการรับ 1 ครั้ง (สลิป/เงินสด) · เลขจากสมุด (ภาพใช้ "RC-…" = รูปแบบเลขของสมุด · R9) · ยกเลิก = เลขเดิมติดใบที่ยกเลิก
2. **ลำดับกระจาย** ยกมาก่อน → ใบแจ้งหนี้ → ใบเพิ่มหนี้ → 2110 (§3.2)
3. **ยอดค้างนิยามเดียว** (A11) รวมใบเพิ่มหนี้ — D.11 ทวงยอดรวมใบเพิ่มหนี้ด้วย (R4)
4. **ยกยอด = ไม่ย้ายลูกหนี้** (ค้างยังอยู่ในใบแจ้งหนี้เดิม · มติ D.8 ข้อ 3) · `carriedSatang` = ป้าย "ไปจ่ายพร้อมบิลหน้า" · บิลหน้า `dueSatang` รวมยอดยกมา · ไม่สร้างบรรทัด/ใบใหม่ (R5)
5. **สลิปหลังจ่ายครบ = พักก่อน** (REVIEW) ค่าตั้งเปลี่ยนเป็น CREDIT ได้ · ตัดสินมือบนบิลจ่ายครบ = `ALREADY_PAID` (IP-1b)
6. **หนึ่งบิลลงเงินได้ทีละทาง** (claim ต่อบิล · W7 · เงินสดแข่งอนุมัติ)
7. **บิล VOID / ไม่มีใบแจ้งหนี้ ไม่รับเงิน** (พัก/ปฏิเสธด้วยรหัสชัด) — เงินต้องผ่านบัญชีเสมอ
8. **ไม่มีสิทธิ์ = NOT_FOUND** เหมือนของไม่มีทุกไบต์ (ทุกฟังก์ชัน)
9. **ขอโอนเพิ่ม = รับยอดที่โอนมาแล้ว** + ข้อความ QR ยอดที่ขาด (ภาพ 06 "ขอให้โอนเพิ่ม ฿62.32") · ต่างจากยกยอดตรงที่ไม่ตั้ง carried
10. **ปฏิเสธไม่มีรายการบัญชี** · แจ้งเหตุผลทาง LINE
11. **สลิปแชทกำกวมเก็บไว้ให้พนักงานแนบเอง** (W4 · เฉพาะกิ่งกำกวม · R8)
12. **ยอดหลักทุกที่ = `dueSatang`** (พอร์ทัล QR · Flex · ข้อความ · ยอดคาดหวังสลิป) — คิดใหม่สดทุกครั้ง

## 7. ฉากภาพ «scripts/svc-qc-payments-scene.mts» (builder · ค่าจาก `SQC_DORM_PAY_SCENE` เท่านั้น)
- ต้องมีฉาก D.13 ก่อน (roomboard → lease → dorm-home: สลิปรอตรวจ 104 · 206 · 309) · ไม่สร้างบิล/สัญญาใหม่ · ไม่แตะค่าตั้งระดับร้าน (เช่น `payments.receiver`) · ไม่ทับค่าตั้งหน่วยที่มีอยู่
- ปรับเฉพาะสลิปของฉาก D.13 ทั้ง 3 ใบ (ระบุด้วย `checks.idempotencyKey` ของ D.13): ช่อง `amountSatang` · `payerName` (รูปย่อ) · `bankCode` · `transferredAt` · `reviewReason` ตาม `SQC_DORM_PAY_SCENE.slips` + ใส่ `checks.d10 = mark` · **ไม่แตะ** refId/status/fileId/expectedSatang (ฉาก D.13 รันซ้ำแล้วไม่ชน)
- idempotent: `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` (รันซ้ำ = 0/0/0) · `--clear` คืนค่าช่องที่ปรับ (amountSatang = expectedSatang · ช่องอื่น null) + ลบ `checks.d10` · ฉาก D.13 ไม่พร้อม ⇒ exit 3 + เหตุผล
- ภาพ: `--user owner` ที่ `/app/u/<dorm>/dorm/payments?room=206` (แผงห้อง 206 ยอดขาด ฿62.32) · PARITY เทียบ 06 (รายการ "ผ่านอัตโนมัติล่าสุด" บน svcqc ไม่มีเลขใบเสร็จเพราะบิลฉากไม่มีใบแจ้งหนี้ — ยอมรับ)

## 8. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.10.mts»
S โครงสร้าง/ไฟล์/ค่าตั้ง/สัญญาโค้ด · PC ตัวควบคุม (เขียวก่อนมีงาน) · B ยอดนิยามเดียว (A11 · ใบเพิ่ม/ลดหนี้ · ยกมา · ข้ามร้าน) · C consumer (ยอดตรง · X4 ซ้ำ/พร้อมกัน/หลายโพรเซส · เกิน 2110 · ใบเพิ่มหนี้ · ใบลดหนี้ยกเว้นค่าปรับ · หลังจ่ายครบ · VOID · ไม่ใช่ของหอ/ร้านอื่น) · R ตัดสินมือ (สิทธิ์ · ชื่อไม่ตรง · ยกยอด · ขอโอนเพิ่ม · DENY · ปฏิเสธ · ซ้ำ · อนุมัติซ้ำ/พร้อมกัน · สองสลิปบิลเดียว · พักแล้วเก็บเครดิต) · M เงินสด/โอนมือ (สิทธิ์ · คีย์ · บางส่วน · เกิน · ตรวจอินพุต · แข่งอนุมัติ) · N เลขใบเสร็จ/ยกเลิกแบบกลับรายการ · K โมเดลจอ (KPI · แยกหน่วย/ร้าน · ลิงก์ statement) · W สลิปแชท (W4) · E event/LINE/PII · U DOM · Q ฉาก svcqc · V ภาพ · Z ล้าง · G regression
- regression (G · รันหลังล้างข้อมูล): `qc-svc-d.8 --no-regression` · `qc-svc-d.11 --no-regression` · `qc-svc-d.9 --no-regression` · `qc-svc-d.3 --no-regression` · `qc-svc-r0.5` · `qc-svc-r0.6` · `qc-svc-b.8 --no-regression` (S-1/S-2 ของ b.8 = ข้อ "ไฟล์ของใบ B.8" ไม่นับ) · `qc-svc-smoke` — ไม่มี FAIL
- typecheck + fitness 2 โหมด (ผู้คุม) · ภาพ V-1 (ผู้คุม: QC server + ฉาก D.13 + ฉาก D.10 + `visual-svc d.10`) · ตรวจเข้ม 2 รอบ

### 8.1 สถานการณ์แข่งหลายโพรเซสที่ผู้ตรวจ B ต้องยิง (probe แยก · ข้อสอบมีชุดย่อ C-2 R-10 R-11 R-12 M-4)
1. **consumer ซ้ำ**: event `payment.slip.approved` เดียวกัน × 4 โพรเซส × 4 ทาง + outbox ลองใหม่ระหว่างทาง (ฆ่าโพรเซสหลัง `recordExternalPayment` ใบแรกก่อนออกใบเสร็จ) ⇒ ใบเสร็จ 1 · รับชำระรวม = ยอดสลิป · 2110 ไม่เกินส่วนเกินจริง · ไม่มี P2002/throw หลุดในทางปกติ
2. **อนุมัติซ้ำ/พร้อมกัน**: `reviewDormSlip` สลิปเดียว 8 ทาง × 3 โพรเซส (APPROVE ปน PARTIAL_CARRY ปน REJECT) ⇒ ผู้ชนะ 1 · สถานะสลิปตรงผู้ชนะ · ถ้า REJECT ชนะ ⇒ ไม่มีรายการบัญชี
3. **สองสลิปบิลเดียว**: สลิป NEEDS_REVIEW 2 ใบ (เลขอ้างอิงต่าง) ยอดเต็ม อนุมัติพร้อมกันจาก 2 โพรเซส + สลิป AUTO_APPROVED ใบที่ 3 เข้าระหว่างทาง ⇒ ลงบิล 1 · ที่เหลือ `ALREADY_PAID`/`BUSY`/พัก · 2110 = 0 (ค่า REVIEW)
4. **อนุมัติแข่งเงินสด**: อนุมัติสลิปเต็ม + `recordDormPayment` เต็ม (คีย์ต่าง) + consumer ของสลิป AUTO ใบอื่น พร้อมกันบนบิลเดียว ⇒ รับชำระของบิล = ยอดบิลพอดี · ใบเสร็จที่มีผลกับบิล = 1 · ไม่มี 2110 จากการแข่ง
5. **ยกเว้นค่าปรับแข่งรับเงิน** (D.11): `applyWaiver`/ใบลดหนี้ระหว่าง consumer กำลังกระจาย ⇒ ไม่มีสถานะที่ผู้เช่าจ่ายค่าปรับที่ยกเว้นแล้ว (ถ้าจ่ายเกินเพราะลำดับ ⇒ ส่วนเกินอยู่ 2110 ไม่ใช่รายได้)
6. **VOID แข่งรับเงิน**: ยกเลิกบิล/ใบแจ้งหนี้ระหว่างอนุมัติ ⇒ ไม่มีรับชำระบนใบที่ถูกยกเลิก (ทางมือ `BILL_VOID` · consumer พัก)
7. **ยกเลิกใบเสร็จแข่ง**: `voidDormReceipt` 4 ทาง + consumer replay ⇒ ยกเลิกครั้งเดียว · กลับรายการครั้งเดียว · ไม่มีใบเสร็จใหม่ของสลิปนั้น · เลขใบเสร็จไม่ซ้ำ
8. **ข้ามร้าน**: ร้าน B เรียกทุกฟังก์ชันด้วย id ของร้าน A (slipId · billId · receiptId · itemId · unitId) ⇒ `NOT_FOUND` เนื้อเดียวกันทุกไบต์ · ไม่มีแถวใดของ A เปลี่ยน · event ที่ `tenantId` ไม่ตรงสลิป ⇒ ไม่ทำอะไร

## 9. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- **ใช้เครดิต 2110 หักบิลถัดไปอัตโนมัติ** (ต้องมีใบสำคัญ Dr 2110/Cr 1100 + ความยินยอม) ⇒ D.12/J4 · ใบนี้แค่บันทึกเป็นเงินรับล่วงหน้า
- **โอนคืนสลิปที่พัก (REFUND_DUE)** จริง ⇒ D.12 (คืนเงิน) · ใบนี้แค่จดเหตุผล
- D.11: ทวง/ค่าปรับของบิลที่ยกยอด (คงพฤติกรรม D.11 — ยังทวงบิลต้นทางตามยอดของตัวเอง) ⇒ คำถาม R5/J3
- บิลนำเข้า/ยกมาไม่มีใบแจ้งหนี้ ⇒ รับเงินไม่ได้ (`NO_INVOICE`) จนกว่า D.4/D.15 สร้างใบยอดยกมา
- จับคู่ statement อัตโนมัติ (ใบนี้ให้ลิงก์ไปจอกระทบยอดเดิม) · ถอด QR จากรูปฝั่งเซิร์ฟเวอร์ (W3 เดิม) · รูปแชทที่ไม่กำกวมแต่ไม่มีตัวตรวจ (ยังไหลเป็นแชทปกติ · R8)
- สลิปเดียวใช้ซ้ำข้าม POS (X-POS.1 เดิม)

## 10. คำถามผู้คุม (ค่าปลอดภัยใช้ไปก่อน)
- **R1 แตะ R0.6** `slip-verify.ts` `canReview` รับ `dorm.slip.review` สำหรับสลิป DORM (เพิ่มอย่างเดียว) — ทางเลือก: บังคับให้พนักงานหอถือ `payments.slip.review` ด้วย (เพิ่มขั้นตั้งสิทธิ์ · ขัดแผน "ผู้ไม่มี dorm.slip.review ทำไม่ได้" ไม่ได้แต่ซ้ำซ้อน)
- **R2 แตะ facade บัญชี** (เพิ่มอย่างเดียว): ออกใบเสร็จ RECEIPT ผูกรายการรับ · ยกเลิกรายการรับของหอ + กลับ JV 2110 · อ่านใบเพิ่มหนี้ของบิล — ไม่มีทางอื่นเพราะ facade เดิมไม่มีใบเสร็จต่อการรับ
- **R3 แตะไฟล์ D.9** (dorm-portal.ts · portal.ts · dorm-line.ts จุดเดียวต่อไฟล์) — ยอดยกมา + เก็บสลิปแชท
- **R4 แตะ D.11** `outstandingMany` ⇒ ยอดทวงรวมใบเพิ่มหนี้ (เปลี่ยนพฤติกรรม: ข้อความทวงของบิลที่มีใบเพิ่มหนี้สูงขึ้น) — ทางเลือก: คง D.11 แล้วยอมให้นิยามต่างสองที่ (ขัด A11)
- **R5 ยกยอด**: ไม่ย้ายลูกหนี้ · D.11 ยังทวงบิลต้นทาง · ค่าปรับบิลต้นทางยังคิดตามสัญญา — ทางเลือก: หยุดทวง/ค่าปรับของยอดที่ยกจนถึงวันครบกำหนดบิลหน้า (เป็นมิตรกว่า · ต้องแก้ D.11)
- **R6 สลิปหลังจ่ายครบ** ค่าเริ่ม REVIEW (ไม่ลงบัญชีจนคนตัดสิน · กระทบยอดธนาคารจะมีรายการค้างจนตัดสิน) — ทางเลือก CREDIT
- **R7 บิลไม่มีใบแจ้งหนี้** ⇒ ปฏิเสธ `NO_INVOICE` — ทางเลือก: รับแบบ audit-only (เงินนอกบัญชี · ไม่แนะนำ)
- **R8 สลิปแชท** เก็บเฉพาะกิ่งกำกวม — ทางเลือก: เก็บทุกรูปของผู้เช่าที่มีบิลเปิดเมื่อหน่วยไม่มีตัวตรวจ (ครอบคลุมกว่า · เก็บรูปที่ไม่ใช่สลิปด้วย · PDPA J5)
- **R9 เลขใบเสร็จ** ใช้เลขรันของสมุด (prefix ตามค่าตั้งสมุด · ค่าเริ่มสมุด "RE") — ภาพ 06 "RC-6911-0204" ถือเป็นตัวอย่างรูปแบบ
- **R10 สลิป AUTO_APPROVED ที่ขาดภายใน tolerance** ⇒ ลงตามยอดจริง บิลเหลือค้างเศษ (PARTIALLY_PAID) — ทางเลือก: ตัดเศษเป็นส่วนลด (ต้องมีใบลดหนี้ · ไม่ทำในใบนี้)
- **R11 ระดับตรวจ**: เข้ม 2 รอบตามแผน (ยืนยัน) · ผู้ตรวจ B ยิง §8.1 ครบ

## 11. X ที่เกี่ยว
X1 (R-1 M-1 K-2 W-3 C-4 B-4 N-3 · NOT_FOUND เนื้อเดียว) · X3 (R-10 R-11 R-12 M-4) · X4 (C-2 R-10 N-4 · consumer/ตัดสินซ้ำ = ครั้งเดียว) · X8 (E-1 E-2 K-4 U-1 payload/ผลคืน/HTML ไม่มี PII) · X9 (N-3 ยกเลิกใบเสร็จต้องมีเหตุผล+สิทธิ์ · audit) · X10 (K-4 ไม่มี URL ไฟล์ในโมเดล · สลิปแชทเป็นไฟล์ส่วนตัว) · ไม่เกี่ยว: X5 (ไม่มีงานตามเวลาบังคับ — ถ้า builder ทำงานลบรูปแชทหมดอายุ ต้อง idempotent) · X6 (ไม่มีนำเข้า) · X7 (ไม่มี endpoint สาธารณะใหม่ — พอร์ทัลเดิมของ D.9)

## 12. คำถามกฎหมาย/บัญชี (เพิ่มใน `ledger/wo-notes/svc-legal-questions.md` ตอนรับใบ)
- J4: ใบเสร็จของการรับบางส่วน — ชื่อเอกสาร "ใบเสร็จรับเงิน" ระบุ "ชำระบางส่วน" พอไหม หรือต้องเป็น "ใบรับเงินชั่วคราว"
- J4: เงินรับเกิน/สลิปซ้ำที่เก็บเป็นเงินรับล่วงหน้า (2110) — ระยะเวลาคืน/หักบิลถัดไปต้องได้ความยินยอมผู้เช่าไหม · รายงานภาษีไม่ถือเป็นรายได้จนหัก
- J4: ยกยอด (ไม่ย้ายลูกหนี้) — ยอดค้างที่โชว์ในบิลหน้าเป็น "ยอดยกมา" แต่ใบแจ้งหนี้หน้าไม่รวม · เอกสารบิลที่ผู้เช่าเห็นต้องแสดงอย่างไรให้ไม่เข้าใจผิด
- J3: ค่าปรับของยอดที่หอยินยอมให้ยกไป (R5) — เก็บได้ไหมตามประกาศ สคบ. 2568
- J5: เก็บรูปสลิปที่ผู้เช่าส่งในแชท (ไม่แนบบิล) 30 วัน · แจ้งในนโยบายความเป็นส่วนตัวไหม
- J5: เหตุผลปฏิเสธสลิปที่พนักงานพิมพ์ส่งถึงผู้เช่าตรง — ต้องมีแม่แบบ/ตัวกรองคำไหม (ใบนี้ใช้แม่แบบ + ตัวตรวจคำต้องห้ามของแม่แบบเท่านั้น ไม่กรองข้อความที่พนักงานพิมพ์)

## มติผู้คุม (30 ต.ค.)
- **R1 อนุมัติ** `canReview` (slip-verify.ts · R0.6) รับ `dorm.slip.review` สำหรับสลิป DORM_BILL แบบเพิ่มอย่างเดียว
- **R2 อนุมัติ** ฟังก์ชันแคบใน account facade/service (ใบเสร็จ RECEIPT · ยกเลิกรายการรับ · กลับ JV 2110) แบบเพิ่มอย่างเดียว · กลับรายการเท่านั้น ห้ามลบแถว · ผู้ตรวจ A อ่านเส้นเงินทุกบรรทัด
- **R3 อนุมัติ** แตะไฟล์ D.9 จุดเดียวต่อไฟล์ (dorm-portal.ts / portal.ts / dorm-line.ts) ให้ใช้ `dueSatang` ของ `billBalances`
- **R4 อนุมัติ** `outstandingMany` ของ D.11 นับใบเพิ่มหนี้ (นิยามยอดค้างเดียวทั้งระบบ) · ORACLE-EDIT d.11 ที่จำเป็น builder เสนอพร้อมเหตุผล
- **R5 รับ** บิลยกยอดยังทวง/คิดค่าปรับบิลต้นทางตามเดิม
- **R6 รับ** สลิปหลังจ่ายครบ ค่าเริ่ม REVIEW (ไม่ลง 2110 อัตโนมัติ)
- **R7 รับ** บิลไม่มีใบแจ้งหนี้ ⇒ `NO_INVOICE`
- **R8 รับ** เก็บรูปสลิปแชทเฉพาะกรณีกำกวม · ไฟล์ส่วนตัว · ลบตาม `chatSlipKeepDays` (30) · ลงคำถาม PDPA
- **R9 รับ** เลขใบเสร็จใช้ prefix ของสมุด (RC ในภาพ = ตัวอย่าง) · ไม่ใช้เลขซ้ำแม้ยกเลิก
- **R10 รับ** ขาดในช่วงยอมรับ ⇒ บิลค้างเศษไว้ (ไม่ตัดหนี้สูญอัตโนมัติ) · จอแสดงเศษชัด
- **R11** ระดับตรวจ = เข้ม · ผู้ตรวจ 2 คน
- d.13 ต้องคงเขียวหลังเพิ่มแท็บ "บิล/รับเงิน" ใน `dorm-home-shared.ts` — builder ตรวจเองก่อน
