-- WO Wave2-A: Shop refund — คืนเงิน/ยกเลิกหลังชำระ (PAID→REFUNDED) + คืนสต็อก
-- AlterEnum: เพิ่มสถานะ REFUNDED (ห้ามลบ order — การเงินแก้ด้วย reversal)
ALTER TYPE "ShopOrderStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- AlterTable: เวลาที่คืนเงิน
ALTER TABLE "ShopOrder" ADD COLUMN "refundedAt" TIMESTAMP(3);
