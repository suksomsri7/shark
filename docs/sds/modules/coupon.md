# Coupon & Voucher (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
โค้ดส่วนลด: ร้านสร้างโค้ด → validate ตอนใส่โค้ด (read-only) → redeem atomic ตอนปิดบิล → release คืนสิทธิ์เมื่อ void. ผู้ใช้: staff (สร้าง/toggle) + POS (validate/redeem/release ตอนขาย). **Layer 4: Loyalty** (feature no.8) — scope ตาม systemId.
โค้ด: `src/lib/modules/coupon/service.ts` · `src/lib/modules/coupon/actions.ts` · schema `prisma/schema/coupon.prisma`.

## Data model (prisma/schema/coupon.prisma)
- **Coupon** — `code`(uppercase, unique `[systemId,code]`) `type`(PERCENT/FIXED) `percent?`(1-100) `valueSatang?` `minSpendSatang?` `maxDiscountSatang?`(cap PERCENT) `usageLimit?`(รวม) `perMemberLimit?`(ต่อคน — ต้องมี customerId) `usedCount` `applicableUnitIds[]`(ว่าง=ทุกหน่วย) `startAt/endAt` `active`.
- **CouponRedemption** — `couponId` `customerId?` `refType/refId`(ต้นทาง เช่น PosSale) `saleId?` `discountSatang`(snapshot) `status`(RESERVED/REDEEMED/RELEASED). index `[tenantId,systemId,couponId,status]`, `[tenantId,systemId,customerId,status]`, `[tenantId,saleId]`.

## Service API (src/lib/modules/coupon/service.ts)
- `couponReasonText(reason)` — แปลเหตุผล validate เป็นไทย (รวม "RACE_LOST").
- `computeDiscount(coupon, amountSatang)` — คำนวณส่วนลด (PERCENT + cap / FIXED), pure.
- `listCoupons/getCoupon(tenantId, systemId, ...)`.
- `createCoupon(...)` · `toggleCoupon(...)` — เปิด/ปิด.
- `validate(input): ValidateResult` — ตรวจโค้ด (มีอยู่/active/ช่วงเวลา/ยอดขั้นต่ำ/limit/หน่วย) — read-only, คืนเหตุผลถ้าไม่ผ่าน.
- `redeem(input, tx?): RedeemResult` — atomic: จองสิทธิ์ (RESERVED→REDEEMED), usedCount+1 (กัน race → RACE_LOST). รับ tx ให้ POS ห่อใน tx เดียวกับ createSale.
- `release(input, tx?)` — คืนสิทธิ์ (→RELEASED, usedCount-1) เมื่อบิลถูก void.
- `listRedemptions(...)`.

## การเชื่อมต่อ
- **POS (contract 2.3)**: CreateSaleInput รับ `couponSystemId?`+`couponCode?` → createSale เรียก validate→redeem ใน tx เดียว; voidSale เรียก release. เชื่อมด้วย saleId + refType/refId (ไม่ import ตรง — POS เรียก coupon service ที่ composition/service call).
- **Member**: customerId (perMemberLimit).
- ไม่มี outbox event.

## Permissions (assertCan ใน actions.ts)
`coupon.coupon.create` · `coupon.coupon.toggle`. (validate/redeem/release เรียกจาก POS ในฐานะ service — สิทธิ์ตรวจที่ pos.sale).

## UI
- section ในหน้าระบบ COUPON: `/app/sys/[id]` (type=COUPON, CouponContent) — สร้างคูปอง/toggle/ทดสอบ validate + รายการ redemption. ฟอร์มใน `coupon/forms.tsx`.

## การทดสอบ
- `scripts/qc-pos-coupon.mts` (Fable oracle, contract 2.3) — POS×Coupon: ใช้คูปองลด 50 บาทตอนจ่ายได้จริง · โค้ดปลอมถูกปัด · void แล้วสิทธิ์คืน (ชุด CPN-*). freeze: CreateSaleInput +couponSystemId/couponCode. fail-before: POS ยังไม่รู้จัก couponCode → CPN-* แดง.
- `scripts/qc-systems.mts` — coupon ในชุด 7 ระบบ.

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- P1 self-contained; wiring กับ POS จริงตาม contract 2.3 (ทำแล้วผ่าน qc-pos-coupon).
- AI ออกคูปอง → WO-0045 (AI actions ×10) ผ่านเส้น proposal.
