-- 1) ราคานัด: snapshot ณ วันจอง — ร้านขึ้นราคาทีหลังต้องไม่กระทบนัดที่จองไว้แล้ว
--    default -1 = นัดเก่าก่อนมีฟิลด์นี้ → อ่านราคาจากบริการตามพฤติกรรมเดิม (ไม่ backfill เดา)
ALTER TABLE "Appointment" ADD COLUMN "priceSatang" INTEGER NOT NULL DEFAULT -1;

-- 2) วันหยุด/เวลาพิเศษรายวัน — เดิมกำหนดได้แค่รายสัปดาห์ (BookingHours ต่อ weekday)
--    ร้านปิดปีใหม่ ปิดสงกรานต์ หรือวันไหนเปิดสั้นกว่าปกติ ทำไม่ได้เลย
CREATE TABLE "BookingClosure" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "date" TEXT NOT NULL,            -- "YYYY-MM-DD" เวลาไทย (เก็บเป็นข้อความ เลี่ยงปัญหาโซนเวลา)
  "closed" BOOLEAN NOT NULL DEFAULT true,
  "openMin" INTEGER,               -- ระบุเมื่อ closed=false = เปิดเวลาพิเศษเฉพาะวันนั้น
  "closeMin" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingClosure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BookingClosure_unitId_date_key" ON "BookingClosure"("unitId", "date");
CREATE INDEX "BookingClosure_tenantId_unitId_idx" ON "BookingClosure"("tenantId", "unitId");
