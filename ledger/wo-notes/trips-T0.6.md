# trips-T0.6 — การจอง: ถือผ่านตะกร้า · ยืนยัน · ผังสถานะ · เลขจอง · อนุมัติ/ยกเลิกก่อนจ่าย · แก้/เลื่อนวัน (รับเมื่อด่าน @fa97fe88e เขียว — ดู TRIPS-RUN §4)

- ของที่ได้: `src/lib/modules/trips/{state,booking-core,numbering,booking,booking-actions}.ts` · `src/lib/platform/basket.ts` (ด่านชนิด + ส่งต่อ TRIP เท่านั้น) · `approval.requestBindings` · แก้ `capacity.ts` (hold ที่ผูกการจอง) · `pricing.ts` (`resolvedMinor`) · `snapshot.ts` (promo/providers) · ตัวรับ `trips.booking.expired` คืนสิทธิ์โค้ด · seed: การจองตรง 3 ใบของราชา ส. 14 พ.ย. (ขาย 6 ที่ · เลขจริงจาก SellCounter)
- รอบ: สร้าง 126/126 → ผู้ตรวจ FIX FIRST (6 MAJOR · 16 MINOR) + นักล่า FIX FIRST (4 MAJOR ทำซ้ำได้) → r1 มติ R1–R14 → ผู้ตรวจ r2 FIX FIRST (1 MAJOR: แปลง hold ของการจอง) + นักล่า r2 **MERGE** (5 MINOR) → r2 มติ S1–S9 → ผู้ตรวจ r3 **MERGE** + F1–F4 → r3
- **ด่านผู้คุม @d2883e13b (เลน l1 · รวม T1.1)**: seed ×2 · t0.6 125/126 (S-14 = ของปลอมจากฐานข้อสอบ) · t0.5 130/130 · t0.1 96/96 · p0.1 56/56 · SVC r0.3 94/94 · smoke 6/6 · fitness 53/53 ×2 · typecheck 0 · probe deadlock/edges/r2 findings [] · deadlock ทั้งฐาน 0 → ด่านสั้น @fa97fe88e หลัง F1–F4 (ผลใน TRIPS-RUN §4)
- ตัวเลขนักล่า: r1 ~3,900 คำสั่ง · r2 ~3,350 คำสั่ง · deadlock เลขจอง 141 ครั้ง/40 ราย → 0 · 80 รายพร้อมกัน p95 6.9 วิ ไม่ค้าง
- ORACLE-EDIT: t0.6 S-14 (capacity.ts ออก · ไม่นับไฟล์ที่ตรงกับ session/trips) · S-15 (pricing.ts −1) · CF-23 (ผูก qty + กรณีลบ 5 แบบ + ใช้ซ้ำ ⇒ APPROVAL_USED) · PR-7 · t0.4 S-12 (FORBIDDEN) · t0.3 R-2 (ราชา 14 พ.ย. ขาย 6) · t0.1 S-8 (เส้น party/approval) · t1.1 S-14 รอบ 2 · probe edges/r2 (อาร์กิวเมนต์ qty · กุญแจล็อกสองอาร์กิวเมนต์)
- รายงาน: `trips-T0.6-review.md` `-review-r2.md` `-review-r3.md` `-hunt.md` `-hunt-r2.md` · มติทั้งหมด: ใบสั่ง §16 + §17

## ข้อบังคับสำหรับใบถัดไป
- **T0.7 (เงิน)**: ยกเลิก = คืนที่นั่งก่อนคืนสิทธิ์โค้ด · การจองที่ขายแล้ว/PART_PAID/PAID ยังยกเลิก/แก้ไม่ได้ (`NOT_SUPPORTED`) · `pay.tender` · cancel `choice`/`moveToSlotId` · sweeper ใส่ `grossSatang` ใน event expired (ต้องเป็น payable) · ผู้ทำ SYSTEM (ตัวรับสลิป) ยัง FORBIDDEN บน hold/confirm/bookNow · AGENT ยกเลิก: `auditBooking` ไม่เขียนแถวให้ AGENT ⇒ idempotency ของ AGENT ไม่ทำงาน · ลำดับล็อก rekey (hold ก่อนรอบ) กับ sweeper — ไม่เกิดใน 600 ครั้ง แต่ต้องทบทวนเมื่อเพิ่มเส้นทางเงิน
- **K1.1 (ตะกร้าตั๋ว)**: `finalizeTripsInTx` ต้องได้ `prepared` จาก `prepareTripConfirm` ในโปรเซสเดียวกัน · ล็อกสินค้าก่อนรอบ · ห้ามกระจาย body ของลูกค้าเข้า req
- **T1.3 (จองฝั่งร้าน)**: จอขอคำอนุมัติราคาใช้ `entityId` จากรายละเอียด REQUIRES_APPROVAL (อย่าคำนวณเอง) · REQUIRES_APPROVAL จาก `quoteTrips` ตรง ๆ ยังไม่มี entityId · `note` · จอต้องส่ง actor/ช่องทาง/ตัวเลือกเหมือนตอนเสนอราคา · server action 6 ตัวของ T0.6 ยังไม่เคยถูกเรียกผ่าน Next จริง
- **T1.2**: ข้อสอบ CV ที่ตรึงขายแล้ว 0 ต้องแก้เมื่อรวม (ราชา ส. 14 พ.ย. = 6)

## หนี้
- ส่งคำขอถือที่นั่งซ้ำหลังชำระ ⇒ `BASKET_TOKEN_USED`/`IDEMPOTENCY_CONFLICT` (ไม่มีคอลัมน์เก็บกุญแจเดิม) · AuditLog ไม่มีดัชนี (tenantId, targetId) — การค้น idempotency ไล่แถวของร้านตั้งแต่สร้างการจอง − 24 ชม. (ต้อง migration) · ยอดคำอนุมัติของสกุลต่างประเทศเทียบในหน่วยสกุลนั้น
- `safely` แปลงข้อผิดพลาดโปรแกรมเป็น `BUSY UNEXPECTED` (retry ได้ · outbox ตัดที่ 5 ครั้ง) — ตัวนับ `tripsUnexpectedCount()` ยังไม่มีข้อสอบอ่าน · รูปแบบ log F3 ยังไม่เคยเห็นกับข้อผิดพลาด Prisma จริง
- T0.4 `holdCapKeyHash` ยังมีทางถอยไม่มีกุญแจนอก production · การเลื่อนวันไม่รับโค้ดส่วนลดใหม่ · ผู้ให้สิทธิ์แต้ม/คูปองยังไม่ต่อ (`PROVIDERS_NOT_WIRED`) · hold สาธารณะยังไม่มีตัวจำกัดอัตรา (X8)
- ทดสอบไม่ได้ในใบนี้: server action ผ่าน Next · ตัวประมวลผล outbox ส่ง event expired เอง · สถานะจ่ายบางส่วนจากเงินจริง · Party ล้มจริง · กรณีตัวอักษร S6/F2 ผ่าน probe (ผู้สร้างทดสอบด้วยสคริปต์แยก)
- คำนำหน้าเลขจองต่อชนิดสินค้า (LB-) → L1.x · ตะกร้า TRIP+TICKET → K1.1 · ลูกค้ายกเลิกเอง (OTP) → W1.3 · waitlist ดำน้ำลึก ส. 14 → T1.3
