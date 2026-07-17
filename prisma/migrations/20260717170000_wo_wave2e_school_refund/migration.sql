-- WO Wave2-E: School refund — คืนเงินค่าเรียนหลังชำระ (PAID→REFUNDED) + void POS bill + คืนที่นั่ง
-- AlterEnum: เพิ่มสถานะ REFUNDED (ห้ามลบ enrollment — การเงินแก้ด้วย reversal/void)
ALTER TYPE "EnrollmentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- AlterTable: เวลาที่คืนเงิน
ALTER TABLE "SchoolEnrollment" ADD COLUMN "refundedAt" TIMESTAMP(3);
