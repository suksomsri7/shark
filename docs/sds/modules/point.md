# Point / แต้ม (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
ระบบสะสมแต้ม — ledger append-only + balance cache. Point เป็นผู้คำนวณแต้มเสมอ (contract 2.2 — ผู้เรียกส่ง amountSatang, Point แปลงเป็นแต้ม). ผู้ใช้: POS (earn ตอนขาย), Reward (burn ตอนแลก). **Layer 4: Loyalty** (feature no.9) — scope=tenant (แต้มใช้ข้ามทุกกิจการ) แต่ ledger scope ตาม systemId.
โค้ด: `src/lib/modules/point/service.ts` · schema `prisma/schema/point.prisma`.

## Data model (prisma/schema/point.prisma)
- **PointSettings** (1/tenant) — `satangPerPoint`(default 2500 = 25 บาท/แต้ม) `active`. unique `tenantId`.
- **PointLedger** (append-only) — `systemId`(scope) `customerId` `unitId?` `delta`(+earn/-burn) `type`(EARN/BURN/ADJUST/REVERSE/EXPIRE) `reason?` `refType/refId` `idempotencyKey`. unique `[tenantId, idempotencyKey]` (กันยิงซ้ำ). index `[systemId,customerId,createdAt]`.
- **PointBalance** (cache) — `balance` อัปเดตใน tx เดียวกับ ledger. unique `[systemId,customerId]`.

## Service API (src/lib/modules/point/service.ts)
- `earn(...)` — คำนวณแต้มจาก amountSatang (÷ satangPerPoint), เขียน ledger type EARN + อัปเดต balance ใน tx เดียว (idempotencyKey กันซ้ำ).
- `burn(...)` — หักแต้ม (type BURN), ตรวจ balance พอ.
- `reverse(...)` — กลับรายการ (type REVERSE) เมื่อ void.
- `getBalance(systemId, customerId)` — ยอดคงเหลือ (จาก cache).
- `getCustomerPoints(...)` — รายการ + ยอด.

## การเชื่อมต่อ
- **ขาเข้า จาก POS**: createSale คำนวณ pointEarned (PosSale.pointEarned) แล้วเรียก point.earn (idempotencyKey ผูก saleId) — void → reverse.
- **Reward**: reward.redeem เรียก point.burn (แลกของ).
- **Member**: อ้าง Customer.id (scope ผ่าน memberSystemId / systemId ระบบแต้ม).
- ไม่มี outbox event (เขียนตรงใน tx ของ POS).

## Permissions
ไม่มี assertCan เฉพาะ (earn/burn เรียกจากภายในโมดูลอื่นในฐานะ service; สิทธิ์ตรวจที่ต้นทาง POS/Reward).

## UI
- แสดงเป็น section ในหน้าระบบ POINT: `/app/sys/[id]` (type=POINT) — "รายการแต้มล่าสุด" + อัตราสะสม (ทุก 25 บาท = 1 แต้ม).

## การทดสอบ
- `scripts/qc-systems.mts` — point ในชุด 7 ระบบ (earn/balance ผ่าน service จริง). idempotency ทดสอบผ่านเส้น POS (qc-pos-account replay ไม่เบิ้ล).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- balance = ยอดรวม (ยังไม่ทำ lot-based FIFO + วันหมดอายุ — type EXPIRE จองไว้แต่ยังไม่มี cron หมดอายุ).
- แจ้งแต้มลูกค้าผ่าน LINE → WO-0067.
