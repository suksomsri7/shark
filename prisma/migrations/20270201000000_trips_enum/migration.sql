-- TRIPS T0.1 · migration trips_enum — ค่า enum ใหม่เท่านั้น (ต้อง commit ก่อนคำสั่งใดใช้ค่า · CC §B.0 ข้อ 2)
-- สร้างจาก: prisma migrate diff --from-schema <schema f1c567c94> --to-schema prisma/schema --script (ย้ายเฉพาะ ADD VALUE มาไฟล์นี้)
-- additive ล้วน: ADD VALUE ต่อท้าย 4 ค่า · ไม่มีคำสั่งอื่น

ALTER TYPE "UnitType" ADD VALUE 'TRIPS';
ALTER TYPE "AccountDocSource" ADD VALUE 'TRIPS';
ALTER TYPE "AccountDocSource" ADD VALUE 'AGENCY';
ALTER TYPE "AccountDocSource" ADD VALUE 'SUPPLIER';
