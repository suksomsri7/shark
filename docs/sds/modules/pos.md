# POS / จุดตัดเงินกลาง (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
**จุดตัดเงินกลางของทั้งระบบ** — ทุกโมดูลที่มีเงินชำระผ่าน `createSale` เดียวกัน → outbox → บัญชี. คือหัวใจ "เส้นเงิน" (02 §เส้นเงิน). ผู้ใช้: ทุกระบบธุรกิจ (Hotel/Restaurant/Ticket/Booking/Coupon) + POS เดี่ยว. **Layer 3** (feature no.14) — scope=unit; PosSale ผูก systemId (ระบบ POS).
โค้ด: `src/lib/modules/pos/service.ts` · `src/lib/modules/pos/account-bridge.ts` · schema `prisma/schema/pos.prisma`.

## Data model (prisma/schema/pos.prisma)
- **PosSale** — `systemId` `memberId?` `sourceModule`(POS|BOOKING|HOTEL|RESTAURANT|TICKET) `sourceId?` `idempotencyKey` `receiptNo?` `status`(PAID/VOIDED/REFUNDED) `subtotalSatang` `discountSatang` `vatSatang` `grandTotalSatang` `pointEarned` `paidAt`. unique `[tenantId, idempotencyKey]` (idempotency) และ `[unitId, receiptNo]`.
- **PosSaleLine** — `name` `qty` `unitPriceSatang` `discountSatang` `lineTotalSatang`.
- **PosPayment** — `type`(CASH/TRANSFER/PROMPTPAY/DEPOSIT/ROOM_CHARGE) `amountSatang` `refSaleId?`.
- **PosReceiptCounter** — เลขใบเสร็จรันต่อ unit/เดือน. unique `[unitId,period]`.

## Service API (src/lib/modules/pos/service.ts)
- `createSale(input: CreateSaleInput, client=prisma): SaleResult` — **แกนกลาง**: สร้าง PosSale+lines+payments ใน tx; รัน receiptNo; คำนวณ point earn (เรียก point.earn); ใช้คูปอง (coupon validate/redeem ถ้ามี couponSystemId/couponCode); **emitOutbox `pos.sale.paid`** ใน tx เดียวกัน (service.ts:159). idempotencyKey กันสร้างซ้ำ.
- `voidSale(tenantId, unitId, saleId)` — PAID→VOIDED: release คูปอง, reverse แต้ม, **emitOutbox `pos.sale.voided`** (service.ts:225).
- `listSales(tenantId, unitId, sinceDateStr)` · `daySummary(...)` — {count, totalSatang}.

### account-bridge.ts (consumer-side facade)
- `bridgePosSalePaid(sale, payments)` — เรียกจาก outbox consumer: หา AccountSystemLink (POS↔Account) → post บัญชี (postExternalSale) ถ้ามี link (standalone = ไม่มี entry).
- `bridgePosSaleVoided(sale)` — reverse บัญชี.

## การเชื่อมต่อ
- **Outbox (ช่องทาง #1)**: `pos.sale.paid`/`pos.sale.voided` — map ใน `src/lib/outbox-consumers.ts` → account-bridge + ห่อด้วย Automation engine (best-effort).
- **ตารางเชื่อม (ช่องทาง #3)**: `AccountSystemLink` (linkedKind=POS) ตัดสินว่า POS ตัวไหน post เข้าบัญชีชุดไหน.
- **Point/Coupon/Member**: เรียก service ใน 1 tx (earn/redeem/recordSpend).
- **ขาเข้า**: Hotel.checkOut / Ticket.markPaid / Restaurant.checkout / Booking (ชำระ) — ทุกตัวเรียก createSale (sourceModule ระบุที่มา). **โมดูลเงินใหม่ต้องเข้าเส้นนี้ ห้ามเปิดเส้นใหม่** (02).

## Permissions (assertCan)
`pos.sale.paid` / `pos.sale.voided` ปรากฏเป็น string ในบริบท outbox/void; สิทธิ์ void สินค้าใช้ permission `pos.sale.void` (+ `_maxDiscountBp` ใน Membership.permissions ตาม core.prisma). การขายผ่านโมดูลต้นทางตรวจสิทธิ์ที่ต้นทาง.

## UI
- ไม่มีหน้า POS เดี่ยวแยก (ขายผ่านโมดูลธุรกิจ). แสดงผลการขายเป็น section ในหน้าระบบ POS: `/app/sys/[id]` (type=POS, PosContent) — รวมยอด + 50 บิลล่าสุด + สถานะ void.

## การทดสอบ
- `scripts/qc-pos-account.mts` (QC M1, Fable oracle) — POS→Account: ขายสด/โอน/void/replay; ราคารวม VAT → ฐาน=round(gross/1.07), Dr CASH(1000)/BANK(1010) / Cr INCOME(4000) / Cr VAT_OUTPUT(2200); void=reversal ครบ; replay ไม่เบิ้ล (idempotency PosSale#id#event); POS ที่ไม่มี AccountSystemLink → ห้ามมี entry (ชุด ACC-*).
- เส้นเงินรวมทั้งหมดครอบด้วย `scripts/qc-account-cpa.mts` (107 ข้อ, regression ถาวร).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- MVP: PAID_NOW เท่านั้น (ยังไม่มี PENDING_PAYMENT intent), ROOM_CHARGE provider ยังบาง.
- WO-0040 (หนี้เส้นเงิน): DEPOSIT/ROOM_CHARGE map บัญชีถูก + ลด query ต่อ flow · WO-0045: AI เปิดบิล POS ผ่าน proposal.
