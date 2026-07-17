-- WO Wave2-F: Rental refund — คืนเงินหลังคืนของ/คิดเงิน (RETURNED→REFUNDED) + void POS bill
-- AlterEnum: เพิ่มสถานะ REFUNDED (ห้ามลบ booking — การเงินแก้ด้วย reversal/void)
ALTER TYPE "RentalStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- AlterTable: เวลาที่คืนเงิน
ALTER TABLE "RentalBooking" ADD COLUMN "refundedAt" TIMESTAMP(3);
