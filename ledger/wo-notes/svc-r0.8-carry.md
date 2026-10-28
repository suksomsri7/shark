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
