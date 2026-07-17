-- WO Wave2-D: Hotel refund — คืนเงินหลังเช็คเอาท์ (CHECKED_OUT→REFUNDED) + void POS bill
-- AlterEnum: เพิ่มสถานะ REFUNDED (ห้ามลบ reservation — การเงินแก้ด้วย reversal/void)
ALTER TYPE "HotelReservationStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- AlterTable: เวลาที่คืนเงิน
ALTER TABLE "HotelReservation" ADD COLUMN "refundedAt" TIMESTAMP(3);
