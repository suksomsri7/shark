-- WO 5.2 (บัญชี V2 เฟส 5) — ภาพรวมการเงิน + ปฏิทินเงินเข้า-ออก + สำรองรับ/จ่าย (หน้าแยก)
-- additive ล้วน: เพิ่มคอลัมน์ nullable บน AccountDocumentPayment ที่มีอยู่แล้ว (§10.3 "เบิกชดเชย")
-- ไม่มีตารางใหม่ (ตามกติกา WO: เพิ่มคอลัมน์พอ ไม่ต้องสร้างตารางกลาง) · ไม่มี DROP/RENAME

-- AlterTable
ALTER TABLE "AccountDocumentPayment" ADD COLUMN     "reimbursedAt" TIMESTAMP(3),
ADD COLUMN     "reimbursedTransferId" TEXT;

-- CreateIndex
CREATE INDEX "AccountDocumentPayment_systemId_financeAccountId_reimbursed_idx" ON "AccountDocumentPayment"("systemId", "financeAccountId", "reimbursedAt");
