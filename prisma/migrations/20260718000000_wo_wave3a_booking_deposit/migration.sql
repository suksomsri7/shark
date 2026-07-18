-- WO Wave3-A: Booking deposit — มัดจำกัน no-show (ร้านรับมัดจำเอง + ลงบัญชี DEPOSIT Dr 2110)
-- additive ปลอดภัย (mirror pattern REFUNDED) — ห้ามลบ record · การเงินแก้ด้วย reversal/void
-- BookingService.depositSatang = มัดจำต่อบริการ (0 = ไม่ต้องมัดจำ)
-- Appointment: snapshot มัดจำ + เวลาที่รับ + บิล POS ของมัดจำ

-- AlterTable
ALTER TABLE "BookingService" ADD COLUMN     "depositSatang" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "depositSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositPaidAt" TIMESTAMP(3),
ADD COLUMN     "depositSaleId" TEXT;
