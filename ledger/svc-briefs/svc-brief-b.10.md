# ใบสั่ง B.10 — จบงาน → บิลพัก POS ("บิลจากคิว") + ค่าคอมฯ ตามผู้ให้บริการ (ภาพ จอง 07) · ตรวจ **เข้ม 2 รอบ** (เงิน · ข้ามโมดูล POS · กันซ้ำ)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` B.10 · แบบ: `ledger/DESIGN-BOOKING-QUEUE.md` R8 · BQ-2 · BQ-3 · BQ-5 · ภาคผนวก ก #59–#62 · ภาพ `ledger/design-booking/07-done-to-pos.png` (+ `.body.html`) · README จองคิว "P004 คุณธนา ทำสี ฿900 + ทรีตเมนต์ ฿300 + แว็กซ์ ฿290 − มัดจำ ฿200 = **฿1,290** · ค่าคอมฯ ช่างเอก **฿134.50**"
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §7 (event) · §10 ข้อ 2 (ค่าคอมฯ ผู้ให้บริการไม่มีบัญชีผู้ใช้) · SVC-RUN §1.1 ข้อ 3 (**POS แตะได้ 2 จุดเท่านั้น**: บิลพักผูกงานบริการ · ค่าคอมฯ ตามผู้ให้บริการ — เกินนี้ = หยุดใบ ถามเจ้าของ)
> ส่งต่อจากใบก่อน (อ่านก่อนเขียน): **B.0** (`PosHeldCart.serviceJobId` + partial unique HELD · `PosSaleLine.performerEmployeeId` · `PosStaffCommission.employeeId` · `Appointment.heldCartId` · defs `booking.money.*` #59–62) · **B.4** (`completeJob` · CAS · ล็อกแถวนัด · `/root/svc-runs/fix/b4.md`) · **B.5** (`completeJobAction` ปุ่ม "เสร็จ" · `authorizeLineOp` · มือถือ "ของฉัน") · **B.11** (ค่าตั้ง `booking.money.commissionRate` ชั้น UNIT→SERVICE→STAFF · bp) · POS P1.5 (บิลพัก · เรียกคืนผู้ชนะคนเดียว) · P3.5 (สมุดค่าคอมฯ · `reconcileSale` ใต้ล็อกต่อบิล · คีย์ PAID/VOID/REFUND) · P5.1 (`moduleDepositForBill` · `recordDeposit`)
> บทเรียนที่ข้อสอบไล่ (อ่าน): `/root/svc-runs/fix/d8.md` (จองก่อนออกเอกสาร · ref idempotent · ทางกู้) · `b6.md` · `b9.md` (ไม่ผูกตัวตนจากเบอร์ไม่ยืนยัน · หลายโพรเซส) · fitness F5/F6/F2

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ ST-1/ST-3 ไล่ `git status`)

**จองคิว (โดเมนของใบ)**
- ใหม่ «src/lib/modules/booking/finish.ts» — ทุกฟังก์ชัน §3.1
- «src/lib/modules/booking/queue-line.ts» — `completeJob` เปิดบิลพักด้วยทางเดียวกับ `finishJob` (เพิ่มอย่างเดียว · สัญญาเดิมของ B.4 คงทุกไบต์)
- «src/lib/modules/booking/service.ts» — `setAppointmentStatus` ปฏิเสธออกจาก DONE เมื่อมีบิลจากคิว (§2 ข้อ 7)
- «src/lib/modules/booking/index.ts» — export
- «src/lib/modules/booking/today-line.ts» — (ถ้าจำเป็น) ป้าย "ส่งเคาน์เตอร์แล้ว/จ่ายแล้ว" บนแถว DONE (เพิ่มฟิลด์อย่างเดียว)
- «src/lib/actions/booking.ts» — `setStatusAction` สาขา V2 (มีแม่แบบ) ⇒ `ensureServiceBill` แทนบิล CASH · สาขาเดิม (`_fallback`) คงทางเดิมทุกไบต์
- «src/lib/actions/booking-line.ts» — `completeJobAction` ⇒ `finishJob` · action ใหม่ `finishJobAction` `amendServiceBillAction` `cancelServiceBillAction` `markPaidAction` (ทุกตัวผ่าน `authorizeServiceBillOp`)
- «src/app/app/u/[unitSlug]/booking/mine/page.tsx» — แผ่น "เสร็จงาน" (`?finish=<เลขบัตร|appointmentId>&add=<id,id>`)
- ใหม่ «src/components/booking/FinishJobSheet.tsx» — แผ่นจบงานมือถือ (ภาพ 07 ก)
- 3 ทะเบียน event: «src/lib/outbox-consumers.ts» · «src/lib/automation/labels.ts» · «src/lib/webhooks/labels.ts»
- ใหม่ «scripts/svc-qc-done-pos-scene.mts» — ฉากภาพ (§6)

**POS — 2 จุดที่เจ้าของอนุญาต (ไม่มีไฟล์ POS อื่น)**
- จุด 1 บิลพักผูกงานบริการ: ใหม่ «src/lib/modules/pos/service-bill.ts» · «src/lib/modules/pos/index.ts» (export `serviceBills`) · «src/lib/modules/pos/held-cart.ts» (บิลจากคิว: ไม่หมดอายุ · `recallHeldCart`/`listHeldCarts` แบบเดิมไม่แตะแถวที่มี `serviceJobId` — แบบเดียวกับ `tableSessionId`) · «src/lib/modules/pos/service.ts» (`createSale` รับ `lines[].performerEmployeeId` เขียนลง `PosSaleLine` · เพิ่มล้วน · ไม่อยู่ใน samePayload) · «src/lib/modules/pos/register-ui.tsx» + «src/lib/modules/pos/register-actions.ts» (แผง "บิลจากคิว" + ปุ่มรับเงิน) · `messages/*/pos.json` (ถ้อยคำแผง)
- จุด 2 ค่าคอมฯ ตามผู้ให้บริการ: «src/lib/modules/pos/staff-commission.ts» เท่านั้น
- 🔴 POS ห้าม import โมดูล booking (เส้นเดิม booking→pos เท่านั้น) · อัตราค่าคอมฯ ส่งมาจาก booking เป็นตัวเลขต่อบรรทัด (snapshot) · ไม่มี migration (คอลัมน์ครบตั้งแต่ B.0)

## 2. มติ (ข้อสอบผูกทุกข้อ)

1. **เสร็จ = งานจบ (DONE) + บิลพักเปิดในธุรกรรมเดียวกัน**: ช่องของช่างว่างทันที (ตัววางคิว/บัตรเดินตาม B.4 เดิม · `booking.completed` + `queue.ticket.done` เหมือนเดิม) · เงินค้างอยู่ที่ "บิลจากคิว" จนแคชเชียร์รับเงิน · จ่ายแล้ว ⇒ event ใหม่ `booking.paid` **ครั้งเดียวต่อนัด** (ไม่มีสถานะนัดใหม่ — enum ห้ามเพิ่ม)
   - ต่างจากแถวแผน "paid ⇒ DONE" โดยตั้งใจ: ไม่มีสถานะ "รอจ่าย" ใน enum (ห้าม migration) และงาน IN_SERVICE ค้างระหว่างรอจ่าย = ช่างถูกถือช่อง ⇒ ตัววางคิวผิด (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
2. **เปิดบิลพักเมื่อ**: สาขาผูก POS (`AppSystemUnit` POS) **และ** สาขาเลือกแม่แบบจองคิวแล้ว (ผลค่าตั้งไม่ใช่ `_fallback`) · สาขาเดิม (`_fallback`) = พฤติกรรมรุ่นแรกทุกไบต์ (FALLBACK_LEGACY ของ B.0): `setStatusAction` DONE เปิดบิล CASH `booking-sale-<id>` แบบเดิม ⇒ ชุด `qc-pos-p5.1` MA2/MA12e + `qc-hf-o23` ST6 คงเขียวโดยไม่ต้อง ORACLE-EDIT · สาขาไม่มี POS ⇒ ไม่มีบิล · ปุ่ม "รับเงินแล้ว" (`markPaidWithoutPos`)
3. **ราคา**: บรรทัดงานจากนัด = `Appointment.priceSatang` (snapshot · −1 = ราคาบริการ) · บริการที่ทำเพิ่ม = ราคาเฉพาะคน (`BookingStaffService.priceSatang`) ไม่มีใช้ `BookingService.priceSatang` · สินค้า = ราคา POS ณ ตอนเปิดบิล (`resolvePrices` ของ facade) · **ราคาจาก client ไม่ถูกเชื่อ** (ส่งได้แค่ id + จำนวน + ผู้ทำ) · บรรทัดบิลจากคิว **ล็อกราคา** (ไม่ re-quote ราคาแคตตาล็อกตอนจ่าย — ต่างจากบิลพักปกติ H3)
4. **มัดจำ**: ใบรับ `Appointment.depositSaleId` (เมื่อ `depositPaidAt`) ⇒ คำนวณ **ตอนจ่าย** ด้วย `moduleDepositForBill` (คงเหลือจริง ณ วินาทีนั้น) · server เติมแถว `DEPOSIT{refSaleId}` เอง — client ส่ง DEPOSIT มา = VALIDATION · มัดจำถูกคืนระหว่างรอ ⇒ ยอดต้องจ่าย = เต็ม · ใบรับของร้าน/สาขาอื่น = ไม่หัก (เงียบ · ไม่หลุดข้อมูล)
5. **ค่าคอมฯ (จุด 2)**: บิล `sourceModule BOOKING` ลงสมุด **เฉพาะผู้ให้บริการต่อบรรทัด** — ไม่ลงให้ผู้กดขาย (แม้เปิด `pos.staffCommission`) · อัตรา = `booking.money.commissionRate` ที่ booking resolve ต่อบรรทัด (บริการ: refs SERVICE=บริการ + STAFF=ผู้ทำ → `serviceBp` · สินค้า: refs STAFF=ผู้ทำ → `productBp`) และ `commissionTo` — **snapshot ตอนเปิด/แก้บิล** (แก้ค่าตั้งหลังเปิดบิลไม่ย้อน) · OFF ⇒ `commissionBp: null` ทุกบรรทัด ⇒ ไม่มีแถว · จำนวน = `staffCommissionAmount(ฐาน lineNets, {bp, fixedSatang:0}, qty)` (ปัดครึ่งขึ้น · ฐานรวม VAT · มัดจำเป็นวิธีจ่าย **ไม่ลดฐาน**) · แถว: `userId` = `HrEmployee.linkedUserId` ของผู้ทำ · `employeeId` = ผู้ทำ · ผู้ทำไม่มีพนักงาน/ไม่ผูกผู้ใช้ ⇒ ไม่ลง (CC §10 ข้อ 2 ค่าปลอดภัย) · void/คืนเงิน ⇒ REVERSE ทางเดิมของ P3.5 (คีย์ VOID/REFUND) · `commissionToPayroll` = หนี้ (ตัวส่ง P3.5 ส่งทุกแถว OPEN — ถามผู้คุม)
6. **กันซ้ำ**: บิลจากคิว ≤ 1 แถวที่ยังมีผล (HELD หรือถูกจ่าย) ต่อนัด — ใต้ advisory lock คีย์ `bq-bill-<appointmentId>` + partial unique HELD · บิลขายคีย์ตายตัว `bq-sale-<appointmentId>` (คีย์ของ client ใช้กับการลองซ้ำของ client เท่านั้น: คีย์เดิม = `duplicated:true` บิลเดิม · คีย์ใหม่หลังจ่ายแล้ว = `SERVICE_BILL_PAID`) · จ่าย = CAS แถวบิลพัก HELD→RECALLED **ในธุรกรรมของบิลขาย** (แพ้ = ไม่มีบิล · ไม่ตัดมัดจำ)
7. **แก้/ยกเลิกหลังมีบิลพัก**: `amendServiceBill` แทนชุดของที่ทำเพิ่มทั้งชุด (บรรทัดจากนัดคงไว้ · CAS version) — เฉพาะ HELD · จ่ายแล้ว `BILL_PAID` · `cancelServiceBill` (ต้องมีเหตุผล 1–200 ตัว · `booking.job.runAny`) ⇒ DISCARDED + AuditLog (`targetType PosHeldCart` · ผู้ทำ · เหตุผล) + `Appointment.heldCartId = null` (สถานะนัดคง DONE) · เปิดใหม่ได้ด้วย `ensureServiceBill` (บรรทัดจากนัดอย่างเดียว) · `setAppointmentStatus` ออกจาก DONE ขณะมีบิล HELD/จ่ายแล้ว ⇒ `ok:false` ข้อความไทย (ไม่ทิ้งบิลเงียบ) · `cancelByShop` ของ DONE = BAD_STATE เดิม
8. **สิทธิ์สด**: `authorizeServiceBillOp` อ่าน `Membership` จากฐานทุกครั้ง (acceptedAt ≠ null · unitAccess · permissions) — finish/amend = `authorizeLineOp` "done" (งานของตัวเองด้วย `booking.job.run` · ใครก็ได้ด้วย `booking.job.runAny` · OWNER/MANAGER ของสาขา) · cancel = `booking.job.runAny` · markPaid = `booking.queue.operate` หรือ `pos.sale.create` · ฝั่ง POS = ด่านหน้าขายเดิม (`registerScopeCheck` · `pos.sale.create` · เครื่องถูกเพิกถอน · กะตามค่าตั้ง)
9. **ขอบเขต (X1)**: ทุกคิวรีผูก tenantId + unitId · ของร้าน/สาขาอื่น = NOT_FOUND ข้อความเดียว · ระบบ POS เดียวผูกหลายสาขา ⇒ บิลจากคิวของสาขา A ไม่ขึ้นที่สาขา B
10. **PII (X8)**: payload event ไม่มีชื่อ/เบอร์ · ป้ายบิลพัก (`label`) = เลขบัตร + ชื่อเล่นที่แสดงบนจอได้ (ไม่ใช่เบอร์)

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบมีสำเนาชนิด)

### 3.1 «booking/finish.ts» (`LineCtx = { tenantId; unitId; actorUserId? }` ของ B.4)
```ts
export type ExtraLine =
  | { kind: "SERVICE"; serviceId: string; staffId?: string }          // staffId = ผู้ทำ (BookingStaff ของสาขา) · ไม่ส่ง = ช่างของงาน
  | { kind: "PRODUCT"; productId: string; qty: number; staffId?: string }; // PosProduct ของระบบ POS ของสาขา · qty 1–99
// ≤ 20 บรรทัด · id ต่างสาขา/ปิดใช้/เก็บถาวร = BAD_INPUT (ไม่บอกว่ามี)
export type BillLine = {
  kind: "SERVICE" | "PRODUCT"; source: "BOOKED" | "EXTRA"; name: string; qty: number; unitPriceSatang: number; amountSatang: number;
  serviceId: string | null; productId: string | null; performerStaffId: string; performerEmployeeId: string | null; commissionBp: number | null;
};
export type ServiceBillPreview = {
  appointmentId: string; ticketNumber: string | null; customerLabel: string; staffName: string;
  lines: BillLine[]; subtotalSatang: number; depositSatang: number; dueSatang: number;
  pos: boolean; heldCartId: string | null; billStatus: "NONE" | "HELD" | "PAID" | "CANCELLED";
  rebook: { dateStr: string; startMin: number; staffId: string } | null; // booking.service.rebookAfterDays (null = ปิด) · ช่างเดิม เวลาเดิม ช่องแรกที่ว่าง
};
export type FinishFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "BAD_INPUT" | "FORBIDDEN" | "BILL_PAID" | "BILL_IN_USE" | "USE_POS";
export type FinishResult =
  | { ok: true; appointmentId: string; heldCartId: string | null; already: boolean; needsPayment: "POS" | "NO_POS" | "NONE"; legacy?: boolean }
  | { ok: false; code: FinishFail; reason: string };

previewServiceBill(ctx, appointmentId, input?: { extras?: ExtraLine[] }): Promise<ServiceBillPreview | null>   // อ่านอย่างเดียว · ข้ามขอบเขต = null
finishJob(ctx, appointmentId, input?: { extras?: ExtraLine[]; now?: Date }): Promise<FinishResult>
//   IN_SERVICE ⇒ (เตรียม/ตรวจของก่อน tx) → tx: ล็อกแถวนัด → CAS DONE doneAt → serviceBills.openServiceBill(…, tx) → heldCartId → event B.4 เดิม
//   DONE + มีบิล ⇒ {ok, already:true, heldCartId เดิม} (extras ไม่ถูกใช้ — แก้ด้วย amend) · DONE ไม่มีบิล ⇒ ทาง ensureServiceBill
ensureServiceBill(ctx, appointmentId): Promise<FinishResult>   // นัด DONE ไม่มีบิล ⇒ เปิด (บรรทัดจากนัด) · _fallback ⇒ {ok, heldCartId:null, legacy:true} ไม่เปิด
amendServiceBill(ctx, appointmentId, input: { extras: ExtraLine[] }): Promise<FinishResult>
cancelServiceBill(ctx, appointmentId, input: { reason: string }): Promise<FinishResult>
markPaidWithoutPos(ctx, appointmentId, opts?: { now?: Date }): Promise<FinishResult>   // สาขามี POS = USE_POS · นัดไม่ DONE = BAD_STATE · ซ้ำ = already:true
authorizeServiceBillOp(ctx, userId: string, op: "finish" | "amend" | "cancel" | "markPaid", appointmentId: string): Promise<{ ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND"; reason: string }>
onPosSalePaid(evt: { id: string; tenantId: string; payload: unknown }): Promise<void> // ตัวรับ pos.sale.paid (sourceModule BOOKING · sourceId = appointmentId) ⇒ booking.paid ครั้งเดียว
```
`completeJob` (B.4) = `finishJob` โดยไม่มีของเพิ่ม (คืน `JobResult` เดิม).

### 3.2 POS facade `import { serviceBills } from "@/lib/modules/pos"` (ตัวจริงใน «pos/service-bill.ts» · ไม่ throw — คืน `{ok:false, code, message}`)
```ts
type ServiceBillLineInput = { kind: "SERVICE" | "PRODUCT"; name: string; qty: number; unitPriceSatang: number; productId: string | null; serviceId: string | null; performerEmployeeId: string | null; commissionBp: number | null };
serviceBills.openServiceBill(input: { tenantId; unitId; appointmentId; memberId?: string | null; label: string; lines: ServiceBillLineInput[]; depositReceiptSaleId?: string | null; actorUserId: string | null }, tx?)
  → { ok: true; heldCartId: string; created: boolean } | { ok: false; code: "NO_POS" | "VALIDATION" | "BILL_PAID"; message: string }
serviceBills.replaceServiceBillLines(input: { tenantId; unitId; appointmentId; lines: ServiceBillLineInput[] }, tx?) → { ok: true; heldCartId; version: number } | { ok: false; code: "NOT_FOUND" | "BILL_PAID" | "VALIDATION"; message }
serviceBills.discardServiceBill(input: { tenantId; unitId; appointmentId; actorUserId: string | null; reason: string }, tx?) → { ok: true; heldCartId } | { ok: false; code: "NOT_FOUND" | "BILL_PAID"; message }
serviceBills.serviceBillStatus(tenantId, unitId, appointmentId) → { heldCartId: string; status: "HELD" | "PAID" | "DISCARDED"; saleId: string | null } | null
// หน้าขาย (RegisterCtx, RegisterActor) — ด่านเดียวกับหน้าขาย
serviceBills.listServiceBills(ctx, actor) → { ok: true; items: { heldCartId; appointmentId; label; subtotalSatang; depositSatang; dueSatang; createdAt: Date }[] } | RegisterRefusal
serviceBills.serviceBillView(ctx, actor, { heldCartId }) → { ok: true; heldCartId; appointmentId; version; lines: { kind; name; qty; unitPriceSatang; amountSatang; performerEmployeeId: string | null }[]; subtotalSatang; depositSatang; dueSatang; deposit: { receiptSaleId: string; satang: number } | null } | RegisterRefusal
serviceBills.payServiceBill(ctx, actor, { heldCartId; payMethods: { type: PosPayType; amountSatang: number; reference?: string; cashTenderedSatang?: number }[]; idempotencyKey: string })
  → { ok: true; saleId; receiptNo: string | null; grandTotalSatang: number; duplicated: boolean } | { ok: false; code: "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "PAYMENT_MISMATCH" | "SERVICE_BILL_PAID" | "SHIFT_REQUIRED" | "BUSY" | string; message }
```
- บิลขาย: `createSale` จุดเดิม · `sourceModule "BOOKING"` · `sourceId = appointmentId` · `idempotencyKey bq-sale-<appointmentId>` · `soldByUserId = actor.userId` · `memberId` = ของนัด · บรรทัดตามแถวบิลพัก (`serviceId` · `productId` · `performerEmployeeId`) · แถวจ่าย = client + `DEPOSIT{refSaleId}` ที่ server เติม · Σ ≠ grand ⇒ PAYMENT_MISMATCH (ไม่มีบิล · บิลพักยัง HELD · มัดจำไม่ถูกแตะ)
- ค่าคอมฯ ต่อบรรทัด (`commissionBp`) เก็บในแถวบิลพัก (`cartJson.service`) แล้ว `staff-commission.ts` อ่านตอนลงสมุดด้วยการจับคู่ที่ **ไม่พึ่งลำดับ id ของบรรทัด** (builder เลือก · ข้อสอบตรวจยอด)

### 3.3 event ใหม่ `booking.paid` (3 ทะเบียน · คีย์ `booking.paid#<appointmentId>`)
payload: `{ appointmentId, unitId, staffId, kind, channel, saleId: string | null, amountSatang, via: "POS" | "NO_POS" }` — ไม่มีชื่อ/เบอร์

## 4. จอ (ภาพ จอง 07 · 1 ภาพต่อส่วน)
- **ก มือถือช่าง (390)** `/app/u/<slug>/booking/mine?finish=<เลขบัตร>&add=<serviceId|productId,…>&at=` → `FinishJobSheet` (default export · props `{ view: ServiceBillPreview; unitSlug: string; actions: { finish: (fd: FormData) => Promise<void>; amend: (fd: FormData) => Promise<void> }; at?: string }`) · DOM: `data-testid="finish-sheet"` · บรรทัด `finish-line` (`data-kind` `data-source` `data-amount`=สตางค์) · `finish-deposit` · `finish-due` (ข้อความ "฿1,290") · ปุ่ม `finish-add` · `finish-send` (≥ 44px · ข้อความมียอดต้องจ่าย) · การ์ดชวนนัด `finish-rebook` เมื่อ `rebook` ไม่ null · ไม่มีเบอร์เต็ม
- **ข เครื่องคิดเงิน** `/app/sys/<posSystemId>/pos/register?serviceBill=<เลขบัตร>` → แผง "บิลจากคิว N" (`data-testid="pos-service-bills"` · แถว `pos-service-bill` · บิลที่เลือกแสดงผู้ให้บริการต่อบรรทัด + หักมัดจำ + ต้องจ่าย) — ไม่แตะส่วนอื่นของหน้าขาย

## 5. นอกขอบเขต / หนี้ (เขียนชื่อไว้ · ไม่ทำในใบนี้)
ส่วนลด/คูปอง/แต้มแลกบนบิลจากคิวที่เคาน์เตอร์ (ใบนี้: วิธีจ่าย + สมาชิกสะสมแต้มตามกติกา POS เดิม) · `commissionToPayroll=false` · เปิดบิลใหม่หลัง void บิล BOOKING · แต้ม "+12" ของภาพ (กติกาแต้ม POS เดิมคิดจาก grandTotal รวมส่วนที่จ่ายด้วยมัดจำ — ถามผู้คุม/บัญชี) · คอร์ส (บิล ฿0)

## 6. ฉากภาพ «scripts/svc-qc-done-pos-scene.mts» (builder · แบบ `svc-qc-device-scene.mts`)
- วัน X = `SQC_DONE_POS_SCENE_DAY` (วันฉาก B.6 + 7) · ฉาก `SQC_TODAY_LINE_SCENE` ทั้งวัน + P004 รับมัดจำ ฿200 (PROMPTPAY) ก่อนเช็กอิน + A008 เสร็จ 14:41 + P004 เสร็จ 15:01 พร้อม ทรีตเมนต์บำรุงสี ฿300 + แว็กซ์จัดแต่งทรง ฿290 (ผู้ทำ ช่างเอก) · บิลจากคิวอื่นของวันถูกจ่ายแล้ว (เหลือ P004 ฿1,290 + A008 ฿180) · P005 กำลังทำ
- วัน Y = X + 7: ฉากเดียวกันถึง 15:01 แต่ P004 **ยังไม่กดเสร็จ** (ภาพ ก)
- ค่าคอมฯ ร้าน svcqc = `SQC_BOOKING_SETTINGS_SCENE.barber.unitDiffs` (บริการ 10% · สินค้า 5%) · ช่างเอกผูก HR (`hrLink` ของฉาก B.5) · id ในฉากตายตัว (ข้อสอบ V-1 อ่านจาก `SQC_VISUAL_SPECS["b.10"]`)

## 7. เกณฑ์รับ
`scripts/qc-svc-b.10.mts` ผ่านทุกข้อ (SKIP เฉพาะ V-2 รอ QC server / G เมื่อ `--no-regression`) · regression G (หลังล้างข้อมูล) · typecheck + fitness 2 โหมด + `fitness-pos` · ผู้ตรวจ 2 รอบ (A อ่านโค้ด · B ยิงหลายโพรเซส: เสร็จซ้อน · จ่ายซ้อน · แก้∥จ่าย · consumer ซ้อน · ข้ามร้าน) · PARITY ภาพ ก/ข

## มติผู้คุม (30 ต.ค.)
- Q1: ยอมรับ DONE ตอนกดเสร็จ + บิลพักในธุรกรรมเดียว + event booking.paid ครั้งเดียวต่อนัดเมื่อจ่าย (ไม่มี migration · ช่องช่างว่างทันที)
- Q2: POS 7 ไฟล์ใน 2 จุด (บิลพักผูกงาน · ค่าคอมฯ) = ยอมรับ · แก้แบบเพิ่ม · ทางขาย POS เดิม (_fallback · CASH booking-sale-<id>) ต้องได้ผลเดิมทุกไบต์
- Q3: ส่วนลด/คูปอง/แต้มบนบิลจากคิว = หนี้ (พิจารณาตอน B.12 UAT ร้านตัดผม)
- Q4: commissionToPayroll=false = หนี้
- Q5: คง G ของ POS ทุกชุด (เงิน) ในการรันรับใบ
- คำถามบัญชีลง ledger/wo-notes/svc-legal-questions.md แล้ว · ระหว่างรอ: ข้อสอบไม่ตรวจเลขแต้ม
