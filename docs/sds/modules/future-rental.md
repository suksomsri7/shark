# Rental / เช่าสินทรัพย์ (DESIGN — สำหรับ WO-0050)

> ต่อยอดจาก `src/lib/modules/booking/service.ts` (ปฏิทินว่าง/กันจองซ้อน) + เส้นเงิน POS · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** ให้เช่าสินทรัพย์ (ชุด/อุปกรณ์/รถ/ห้อง/เครื่องมือ) — ปฏิทินว่างต่อชิ้น, มัดจำ, คืน+ค่าปรับ/ค่าเสียหาย
- **ผู้ใช้:** ธุรกิจเช่าชุด/กล้อง/จักรยาน/เครื่องมือช่าง/ห้องประชุมรายชั่วโมง (SME ไทย)
- **เหตุผลเชิงธุรกิจ:** อ้าง `docs/sds/01_VISION.md` — โมดูล Layer 3 ที่ ERP ทั่วไปไม่มีสำหรับ SME ไทย · reuse pattern availability ของ Booking (ไม่สร้างของซ้ำ)

## Data model เสนอ
โมดูลใหม่ `rental` — axis = **unit** (ตามแบบ Booking/Hotel ที่ผูก `unitId` ใน `src/lib/core/scope.ts`). เงิน = สตางค์ Int.

- `RentalAsset` (axis: unit) — สินทรัพย์ 1 ชิ้น/1 รุ่น
  - `id` · `tenantId` · `unitId` · `name` · `sku` String? · `category` String?
  - `ratePerDaySatang` Int · `ratePerHourSatang` Int? · `depositSatang` Int (มัดจำมาตรฐาน)
  - `quantity` Int @default(1) (จำนวนชิ้นเหมือนกันในรุ่น · จองพร้อมกันได้ ≤ quantity) · `active` Boolean
  - `@@index([tenantId, unitId, active])`
- `RentalContract` (axis: unit) — สัญญาเช่า 1 ครั้ง
  - `id` · `tenantId` · `unitId` · `assetId` · `customerId` String? (Customer กลาง) · `qty` Int @default(1)
  - `customerName` · `customerPhone` (snapshot แบบ Appointment)
  - `startAt` DateTime · `dueAt` DateTime (กำหนดคืน) · `returnedAt` DateTime?
  - `status` enum `RentalStatus` (`RESERVED | ACTIVE | RETURNED | OVERDUE | CANCELLED`)
  - `rentalSatang` Int (ค่าเช่าคำนวณ) · `depositSatang` Int (มัดจำที่เก็บจริง)
  - `lateFeeSatang` Int @default(0) · `damageFeeSatang` Int @default(0) (ตอนคืน)
  - `saleId` String? (PosSale ตอนรับชำระค่าเช่า+มัดจำ) · `returnSaleId` String? (PosSale ตอนคืน ปรับ)
  - `idempotencyKey` String · `@@unique([tenantId, idempotencyKey])` · `@@index([tenantId, unitId, status])` · `@@index([tenantId, unitId, assetId, startAt])`

**Availability:** ตรวจ overlap เหมือน `createAppointment` (startAt < dueAt AND returnedAt is null / dueAt > start) นับรวม qty ≤ RentalAsset.quantity — กันเช่าเกินจำนวนใน `$transaction`.

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/rental/service.ts)
- `getAvailability(ctx, assetId, fromDate, toDate)` — คืนช่วงว่าง/จำนวนคงเหลือต่อวัน (reuse แนวคิด `src/lib/modules/booking/slots.ts`)
- `createContract(ctx, {...})` — ตรวจ overlap+qty ใน tx → สร้าง RESERVED · findOrCreate Customer ถ้าเชื่อมระบบสมาชิก (เหมือน booking) · **รับชำระ (ค่าเช่า+มัดจำ) → createSale ผ่านโมดูล POS** (sourceModule `RENTAL`)
- `pickup(ctx, contractId)` — RESERVED → ACTIVE (ส่งของ)
- `returnAsset(ctx, contractId, { lateFeeSatang?, damageFeeSatang?, refundDepositSatang })` — คำนวณค่าปรับ, ACTIVE/OVERDUE → RETURNED, **ปรับเงินผ่าน PosSale ใหม่** (ค่าปรับ = ขายเพิ่ม · คืนมัดจำ = จ่ายคืน/refund line) — ห้ามแก้ PosSale เดิม (append-only)
- `markOverdue(ctx)` — cron: dueAt ผ่านแล้วยังไม่คืน → OVERDUE + AppNotification
- **Edge cases:** คืนก่อนกำหนด (ไม่มีค่าปรับ · นโยบายคืนค่าเช่าบางส่วน = config) · คืนช้าข้ามวัน (lateFee ต่อวัน) · ของหาย (damageFee = มูลค่าทดแทน, ยึดมัดจำ) · เช่าซ้อน qty เต็ม → ปฏิเสธ

## การเชื่อมต่อ
- **เส้นเงิน (บังคับ):** ทุกการรับเงิน (ค่าเช่า/มัดจำ/ค่าปรับ) → `PosSale` (`sourceModule = "RENTAL"`, `sourceId = contractId`) → outbox `pos.sale.paid` → account-bridge → บัญชี. **ห้ามเปิดเส้นบัญชีใหม่** (อ้าง `docs/sds/02_ARCHITECTURE.md` เส้นเงิน)
  - มัดจำ = `PosPayType.DEPOSIT` (มีอยู่ใน `prisma/schema/pos.prisma`) · คืนมัดจำ = payment ติดลบ/refund ในบิลคืน
- **Customer กลาง:** ผูก `customerId` + `MemberActivity` timeline (`RENTAL_BOOKED`, `RENTAL_RETURNED`) เหมือน booking
- **Outbox ใหม่:** `rental.contract.created` · `rental.asset.overdue` (ให้ Automation/แจ้งเตือนเกาะ)
- **Approval (0049):** ค่าเสียหายเกินวงเงิน → submitForApproval ก่อนยึดมัดจำ (optional config)

## AI actions
- **read:** `rental_availability` — ถามสินทรัพย์ว่างช่วงไหน · `rental_overdue` — สัญญาเกินกำหนดคืน
- **action:** `rental_create` → ProposalKind `rental_create` → dispatch เรียก `rentalSvc.createContract` (เดินเส้น proposal เดิม · assertCan `rental.contract.create`)
- ต่อ tool registry ใน `src/lib/ai/tools.ts` + KIND_ACCESS ใน `src/lib/ai/proposals.ts`

## Permissions เสนอ
- `rental.asset.manage` · `rental.contract.create` · `rental.contract.return` · `rental.contract.view`

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้าปฏิทิน/รายการสินทรัพย์** — `DataList` สินทรัพย์ + สถานะว่าง/ถูกเช่า
- **หน้าสร้างสัญญา** — เลือกสินทรัพย์ → ช่วงวันที่ (แถบวันเลื่อนแนวนอนแบบ `public-booking`) → ลูกค้า → สรุปค่าเช่า+มัดจำ → รับชำระ
- **หน้าคืนของ** — แสดงกำหนด, กรอกค่าปรับ/ความเสียหาย (บาท), ยอดคืนมัดจำสุทธิ, ยืนยันผ่าน `ConfirmDialog`
- public link เช่าออนไลน์ (reuse pattern `resolveUnit` แบบ booking) — v2

## ข้อสอบ oracle ที่ต้องมี
1. สร้างสัญญา → เกิด PosSale sourceModule=RENTAL, grandTotal = ค่าเช่า+มัดจำ, มี payment DEPOSIT
2. เช่าซ้อนช่วงเวลา qty เต็ม → ปฏิเสธ (SLOT/QTY เต็ม) ใน tx
3. เช่าซ้อนแต่ qty ยังเหลือ → สำเร็จ
4. คืนตรงเวลา ไม่มีค่าปรับ → คืนมัดจำเต็ม (บิลคืนยอดสุทธิถูก)
5. คืนช้า 2 วัน → lateFee ถูกคิด, บิลคืนหักจากมัดจำ, บัญชีเขียว
6. ยึดมัดจำเพราะของหาย → ยอดถูก, PosSale เดิมไม่ถูกแก้ (append-only)
7. เส้นเงิน: qc:account เขียว (RENTAL เข้าเส้นเดียวกับ POS/BOOKING)
8. tenant/unit อื่นมองไม่เห็นสัญญา
9. idempotencyKey ซ้ำ → ไม่สร้างสัญญาซ้ำ
10. AI rental_create เดินเส้น proposal · assertCan สิทธิ์คนกด
11. markOverdue cron: ตั้ง OVERDUE เฉพาะที่เลย dueAt และยังไม่คืน

## ความเสี่ยง / คำถามเปิด
- 🔑 นโยบายค่าปรับล่าช้า/คืนก่อนกำหนด (คิดต่อวัน/ต่อชั่วโมง? คืนค่าเช่าบางส่วนไหม) = ตัวเลข/นโยบายเจ้าของ (ตั้ง default config)
- มัดจำที่ยังไม่คืน = หนี้สินฝั่งบัญชี (ตอนนี้ account-bridge map DEPOSIT เข้าธนาคารชั่วคราว — ดู `src/lib/modules/pos/account-bridge.ts` หมายเหตุ) → ต้องรอ WO บัญชีมัดจำจริง (0040) เพื่อ map ถูกบัญชี
