-- SVC R0.1 fix · migration svc_r0b — additive ล้วน (ผลผู้ตรวจ R0.1)
-- RoomOccupancy ต้องมีช่วงวันจริง: endDate ไม่รวมวันจบ ⇒ endDate > startDate (ช่วงว่าง/กลับด้านทำให้ daterange ว่างหรือ error และหลบ EXCLUDE ได้)
-- หมายเหตุ constraint/index SQL มือของ svc_r0 + svc_r0b (RoomOccupancy_no_overlap · RoomOccupancy_dates_check ·
--   PaymentSlip_tenantId_imageHash_active_key · PaymentSlip_tenantId_transRef_active_key):
--   Prisma 7.8 ไม่สร้าง DROP ให้ของพวกนี้ (ตรวจ 27 ต.ค.) — ใบถัดไปให้รัน migrate diff ตรวจซ้ำ
-- คอมเมนต์ใน svc_r0/migration.sql แก้ไม่ได้ (checksum ลงฐานแล้ว) — ข้อความนี้แทนบรรทัด 6 ของไฟล์นั้น

ALTER TABLE "RoomOccupancy" ADD CONSTRAINT "RoomOccupancy_dates_check" CHECK ("endDate" > "startDate");
