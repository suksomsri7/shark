# trips-T0.4 — ที่นั่ง · การถือ (hold) · คิวรอ (waitlist) (✅ 12 พ.ย. 2569 · merge 8008b2280)

- ของที่ได้: `src/lib/modules/trips/{capacity-core,capacity,capacity-service,waitlist,capacity-actions}.ts` · `src/lib/platform/sellables.ts` · `capacity.ts` = ฟังก์ชันใน tx เท่านั้น (ไม่เปิดการเชื่อมต่อเอง) · `capacity-service.ts` = โหลด policies นอก tx + ตัวห่อ
- รอบ: สร้าง 110/110 → ผู้ตรวจ FIX FIRST (5 MAJOR) + นักล่า FIX FIRST (BLOCKER: 4 ฟังก์ชัน `*InTx` ใช้การเชื่อมต่อเส้นที่สอง ⇒ pool ค้าง) → r2 14 ข้อ + รวม T0.5 → ผู้ตรวจ r2 MERGE พร้อม MINOR N1–N6 → r3 แก้ N1 N2 N4 N5 N6 + รวม main
- **ด่านผู้คุม @0ccdc048f (เลน l1)**: seed ×2 · t0.4 109/110 (S-14 = ผู้คุมแก้ไฟล์ข้อสอบเอง) · t0.5 130/130 · t0.3 116/116 · t0.2 84/84 · p0.1 56/56 · SVC r0.3 94/94 · smoke 6/6 · probe storm/races/waitlist/scale rc 0 · fitness 53/53 ×2 · typecheck 3 error ในไฟล์ข้อสอบ → **@281452fa1 (ORACLE-EDIT 2 จุด)**: t0.4 109/110 · t0.1 96/96 · typecheck 0
- ORACLE-EDIT: t0.4 DL-4 WL-9 WL-10 (ctx พนักงาน) · S-14 · EV-3 · CAP-5 (โหลด policies ก่อน) · `fnTx` ส่งอาร์กิวเมนต์ที่ 4 ต่อ (เดิมทิ้ง ⇒ CAP-5 ผ่านโดยไม่ได้ส่ง policies จริง) · t0.1 S-12 รอบ 3 (ไฟล์ที่ตรงกับ main 6b991f34d ไม่นับ)
- รายงาน: `trips-T0.4-review.md` `-review-r2.md` `-hunt.md`

## มติผู้คุม
1. `used = sold + held` (ไม่รวม reserved) ในสูตรสถานะ · จอ/หน้าร้านตัดสิน "เต็ม" จากที่ว่าง (capacity − sold − held − reserved) ไม่ใช่สถานะ
2. PUBLIC/AGENT เห็นและถือได้เฉพาะสินค้า ACTIVE + ตัวเลือกเปิด (อื่น ๆ ⇒ NOT_FOUND) · idempotency key ผูก tenant+unit · เพดานการถือนับทั้งร้าน · sweeper กวาดได้แม้ค่าตั้งร้านเสีย
3. ฟังก์ชัน `*InTx` ห้ามเปิดการเชื่อมต่อเส้นที่สอง — policies โหลดก่อนเปิด tx แล้วส่งเข้าไป · HMAC ของ capKey: production ไม่มี `SESSION_SECRET` ⇒ ล้ม (fail-closed)

## ข้อบังคับสำหรับใบสั่ง T0.6 (ผู้ตรวจ r2 §d — ฉบับเต็มใน `-review-r2.md`)
- นอก tx: `quoteTrips` `buildTripBookingSnapshot` `capacityRowsOf` `loadCapacityPolicies`
- ตะกร้าหลายสินค้า: หลังชั้น 0 เรียก `assertProductSellableInTx` ทุกสินค้าเรียง id ก่อนแตะรอบ
- ยืนยัน: rekey (advisory) → convert ทีละ hold เรียง id รอบ → การจอง → โค้ดส่วนลด → outbox · PUBLIC ส่ง `capKey` ให้ `convertHoldInTx`
- hold หมดอายุตอนยืนยัน ⇒ rollback ทั้งก้อน · ถือใหม่ใน tx ใหม่: `reserveInTx(HOLD)` → `insertHoldInTx` → `convertHoldInTx`
- `insertHoldInTx` ต้องตามหลัง `reserveInTx(HOLD)` ที่สำเร็จของรอบ/จำนวนเดียวกันใน tx เดียวกันเท่านั้น
- ยกเลิก (T0.7): คืนที่นั่ง (`returnSoldInTx`/`releaseHoldInTx`) **ก่อน** `releasePromoInTx`

## หนี้
- N3: `capacityRowsOf` เปิดการเชื่อมต่อเอง — ไม่มีตัวกันถ้าเรียกใน tx (กันด้วยข้อสอบ T0.6)
- probe scale รายงาน rekey 0/12 (VALIDATION) เพราะ probe ไม่ส่ง policies — ตามมติ 3 · ปรับ probe ก่อนด่านเต็ม M1
- r3 ไม่มีผู้ตรวจรอบสาม (แก้ MINOR 5 ข้อ · ผู้คุมอ่าน diff + ด่านเต็ม)
- ทางขอเข้าคิวรอแบบสาธารณะ (token) ยังไม่มี → T1/W1
