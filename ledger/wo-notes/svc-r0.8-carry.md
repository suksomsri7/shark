# ส่งต่อใบ R0.8 (และใบที่ใช้ RoomOccupancy/ค่าลับ) — จากผู้ตรวจ R0.1 · 27 ต.ค. 2569
- **กันอ้างห้องร้านอื่น (บังคับ)**: `occupancy.ts` อ่านห้องผ่าน `tenantDb({tenantId,unitId}).hotelRoom.findFirstOrThrow({where:{id}})` ใน tx เดียวกันก่อน insert · ห้าม nested `room:{connect}` · ข้อสอบ "roomId ของร้านอื่น ⇒ ปฏิเสธ" · unitId ของ occupancy/building ต้องตรงหน่วยของห้อง (ตรวจในโค้ด)
- ชนกัน = Postgres `23P01` (ไม่ใช่ P2002) ⇒ แปลงเป็น `ROOM_TAKEN` · CHECK end>start = `23514` (svc_r0b)
- `endDate` แบบ exclusive (`[)`) · สัญญาถึง 31 ม.ค. เก็บ 1 ก.พ. · แปลงวันที่ตามเวลาไทยก่อน
- สคริปต์ล้าง QC ทุกตัว (เช่น `scripts/qc-systems.mts:153`) ต้องลบ `roomOccupancy` ก่อน `hotelRoom` (FK RESTRICT)
- `HotelRoom.hkStatus` ใหม่ ซ้อน `HotelRoom.status` เดิม (CLEANING/OOO) ⇒ R0.8/R0.9 เคาะแหล่งความจริง + แมป
- ดัชนีที่อาจต้องเพิ่ม: RoomOccupancy (refType,refId) · (tenantId,unitId,startDate) · HotelRoom.buildingId · ChatLinkCode.expiresAt · IntegrationCallLog.at
- R0.5: `getIntegration` เช็ก `unitIds=[] OR unitId ∈ unitIds` · `lastError`/`code` ห้ามข้อความดิบที่อาจสะท้อนคีย์
- R0.6: `verifierResult`/`payerName` = PII ⇒ เก็บเฉพาะที่กรองแล้ว + นโยบายระยะเก็บ (PDPA J5) · สลิปซ้ำต่างสาขา ⇒ จับ P2002 แปลง DUPLICATE
- R0.7: `dedupeKey` ประกอบจาก id เท่านั้น · ChatLinkCode รหัส ≥8–10 ตัวผสม + HMAC มีกุญแจ · retry เมื่อ P2002
- R0.3/R0.4: SettingChange เป็นแกน tenant ⇒ พนักงานจำกัดสาขาต้องกรอง unitId เอง
- **ก่อน deploy prod**: role ใน DIRECT_URL ของ prod = owner (neon_superuser) และ `pg_available_extensions` มี btree_gist · migration ADD VALUE DORM ต้องลงก่อน client ที่เขียน DORM
- ตอนรวม session/hr: replay migrations บนฐานว่าง 1 รอบ (ลำดับชื่อ HR 202612xx อยู่ระหว่าง POS) · scope.ts อาจชนแบบข้อความ
- areaSqm = DECIMAL(65,30) ตาม CC (ไม่บังคับเปลี่ยน)

## หนี้ดัชนีจาก R0.8 → ให้ D.0 ใส่ใน migration `svc_d` (R0.8 ห้าม migration · builder R0.8 · 27 ต.ค. 2569)
- `RoomOccupancy(tenantId, refType, refId)` — hotel หา occupancy ของการจอง (checkIn/checkOut/cancel/backfill/nightLoad) · หอจะหา occupancy ของสัญญา
- `RoomOccupancy(tenantId, unitId, startDate)` — roomBoard/availability ต่อหน่วย (ตอนนี้พึ่ง GiST ของ EXCLUDE บน roomId + กรอง roomId IN)
- `RoomOccupancy("holdExpiresAt") WHERE active AND kind IN ('HOLD','CHANNEL_HOLD')` (partial) — `expireHolds` รายนาทีข้ามร้าน (ตอนนี้ seq scan)
- `HotelRoom(buildingId)` — deleteBuilding/updateBuilding นับห้องในอาคาร

## มติผู้คุมหลังตรวจ R0.8 (27 ต.ค. 2569) — ส่งต่อใบหลัง
- **ก่อนเปิด DORM / R0.9**: รัน `scripts/svc-backfill-room-occupancy.mts --all --apply` ทุกร้าน (prod หลัง deploy · ผู้คุมสั่ง) และต้องได้ conflicts=0 — มี conflict = ให้ร้านย้ายห้อง/ติดต่อแขกก่อน
- **D.0**: partial unique `RoomOccupancy(refType, refId) WHERE active AND kind = 'STAY'` (การจองโรงแรมถือห้องจริงได้ 1 แถว active)
- **R0.9**: ต้องมี API `occupancyRange` (อ่านช่วงการครองห้องของหน่วย/ห้องในช่วงวัน) ให้ปฏิทิน/หอ
- **เฟส H**: ต่อเวลาเช็คเอาท์ (resizeOccupancy ของการจอง) · re-pack การจองที่ยังไม่เช็คอิน (R0.8 ใช้ best-fit ตอนจองเท่านั้น)
- **D.5**: สัญญาหอที่ไม่มีวันจบ ⇒ ต้องตกลงรูปแบบ endDate (RoomOccupancy บังคับ endDate > startDate)
- seed-svc-qc.mts แก้คอมเมนต์ (ใส่ "roomOccupancy" ในเครื่องหมายคำพูด) = ผู้คุมรับแล้ว
- (ผู้คุม 27 ต.ค.) ปล่อยห้องหลังเช็กเอาต์ล้ม ⇒ occupancy ค้าง active: ต้องมีงานเก็บกวาด (minute-job ปล่อย STAY ของการจองที่ CHECKED_OUT/CANCELLED) — ใส่ใน R0.9
- (ผู้ตรวจยืนยันซ้ำ) setRoomTypeRent(MONTHLY) ยังไม่คืน affected — เติมใน R0.9 · งานเก็บกวาด: ปิด occupancy refType=HotelReservation ที่การจองไม่ใช่ BOOKED/CHECKED_IN (minute-job) — R0.9
- (R0.6 ส่งต่อ) R0.4: ซ่อน/ลบ def `payments.slip.onVerifierDown` (ซ้ำกับ TenantIntegration.onFailure) · ขยาย schema def `payments.receiver` ให้รับรูป `{promptpayId,…}` ด้วย · D.0: ดัชนี PaymentSlip(tenantId, (checks->>'idempotencyKey')) · J5: ระยะเก็บ PII/ไฟล์สลิป · งานเก็บกวาดวัตถุ storage ค้างจาก replay ที่แพ้

## ภาพเทียบแบบ R0.4 (28 ต.ค. · ผู้คุม) — ส่งต่อ B.11 / D.7 / D.13
R0.4 ผ่านแบบ "โครง" (หัว · แม่แบบ+ปรับ N ข้อ · ดูเฉพาะที่ปรับ · ประวัติ · กลุ่ม · ป้ายรอที่ปรึกษากฎหมาย · 390 ไม่ล้น) · ภาพจริงยังห่างจากแบบ ต้องปิดในใบหน้าห่อ:
- B.11 (จอง 08): แถวการ์ดแม่แบบ 3 ใบ (ตัดผม/นวด/คลินิก + "ใช้อยู่") · แถบปรับจากแม่แบบ+ปุ่ม ดูเฉพาะที่ปรับ/คืนค่าแม่แบบ · เมนูซ้ายหมวด (แม่แบบ · ข้อความ · ทีวี/ตู้/บัตร · สิทธิ์ · ศูนย์เชื่อมต่อ) · การ์ดกลุ่มมีเลข 1–6 จัด 2 คอลัมน์ · แถวกะทัดรัด (ป้าย+คำอธิบายซ้าย · ค่าเป็นปุ่มเม็ดเล็กขวา) แทนช่องกว้างเต็มแถว · ลำดับกลุ่มเริ่ม "เวลาและการจอง" ไม่ใช่บัญชีรับเงิน · แท็บบนจอใช้ชุดเดียวกับแบบ (คิววันนี้ · ปฏิทินนัด · ช่าง/ทรัพยากร · บริการ · รายงาน · ตั้งค่า)
- B.11 (จอง 11): หน้าบริการตอนนี้เป็นรายการ+ปุ่มเปิด/ปิดรับจอง · แบบ = ตาราง (นาที/เก็บห้อง · ราคา · มัดจำ · ต้องใช้ · คนทำได้ · ออนไลน์ · walk-in) + แผงขวาตั้งค่าบริการ + ใครทำได้ราคา/เวลาเฉพาะคน + กล่องค่าร้าน
- D.13 (หอ 17): 6 การ์ดสรุปกริด 3 คอลัมน์ (รอบบิล · ค่าปรับ · บริการอื่น · เตือน/ทวง+แม่แบบ · ประกัน/สัญญา · สิทธิ์ตาราง) + เมนูซ้าย 5 หมวด · ตอนนี้เป็นฟอร์มยาวคอลัมน์เดียว
- D.7 (หอ 10): หน้ากฎหมาย/VAT ยังไม่มี — ตอนนี้รวมอยู่ในฟอร์มยาว
- ภาพเต็มหน้ามีแถบ บันทึก/ยกเลิก ลอยกลางภาพ = แถบ sticky ของ viewport (ไม่ใช่บั๊ก)
R0.5 (จอง 10 = หอ 11): ตรงโครง (กลุ่ม รับเงิน/ส่งข้อความ/ช่องทางขาย · การ์ดสถานะ · ป้ายเร็ว ๆ นี้) · ต่าง: แผงรายละเอียดขวาแสดงเมื่อเลือกการ์ด · มีแท็บกรองเพิ่ม · ป้ายเตือน "ยังไม่ตั้งกุญแจ" บน QC ถูกต้อง (ไม่มี INTEGRATIONS_CREDENTIALS_KEY)
R0.2: หน้าเดิม 3 หน้าเปิดได้ (ไม่ใช่จอใหม่ — ไม่ต้อง parity)
