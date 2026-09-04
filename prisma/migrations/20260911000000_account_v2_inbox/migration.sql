-- WO 7.2 — กล่องขาเข้า + AI อ่านบิล (DESIGN-SPEC-V2 §12 · เฟรม g15/g20)
-- additive ล้วน: 6 ADD COLUMN nullable บน AccountAttachment + 2 index + 1 ค่า enum ใหม่ (AiCreditSource)
-- ไม่มี DROP/ALTER ชนิดคอลัมน์เดิม ⇒ แถวเดิม/โค้ดเดิมทำงานเหมือนเดิมทุกประการ
-- AlterEnum
ALTER TYPE "AiCreditSource" ADD VALUE 'ACCOUNT_INBOX';

-- AlterTable
ALTER TABLE "AccountAttachment" ADD COLUMN     "aiCostSatang" INTEGER,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiReadAt" TIMESTAMP(3),
ADD COLUMN     "expenseDocId" TEXT,
ADD COLUMN     "senderLabel" TEXT,
ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE INDEX "AccountAttachment_systemId_aiStatus_idx" ON "AccountAttachment"("systemId", "aiStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AccountAttachment_systemId_sourceRef_key" ON "AccountAttachment"("systemId", "sourceRef");

