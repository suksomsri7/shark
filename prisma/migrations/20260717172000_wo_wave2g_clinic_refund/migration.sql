-- WO Wave2-G: Clinic refund — void visit/คืนเงินหลังเก็บเงิน (BILLED→REFUNDED) + void POS bill + คืนยาเข้าคลัง
-- AlterEnum: เพิ่มสถานะ REFUNDED (ห้ามลบ visit — การเงินแก้ด้วย reversal/void)
ALTER TYPE "VisitStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- AlterTable: เวลาที่คืนเงิน
ALTER TABLE "ClinicVisit" ADD COLUMN "refundedAt" TIMESTAMP(3);
