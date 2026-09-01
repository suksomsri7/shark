-- WO-CV2 P1/P2/P4 — ปักหมุดห้อง (ระดับร้าน) · ปิดเสียงรายคน · ความยาวคลิปเสียง
-- additive ล้วน: ADD COLUMN แบบ NULL ได้ + CREATE TABLE ใหม่ · ไม่มี DROP / NOT NULL / backfill
-- ⇒ แถวเดิมทุกแถวได้ NULL = "ไม่ได้ปักหมุด / ไม่เคยตั้งค่า" ซึ่งคือพฤติกรรมเดิมเป๊ะ
-- 🔴 ค่า enum ใหม่ (ChatMessageType.AUDIO) อยู่คนละไฟล์ (20260901030000) โดยเจตนา —
--    ห้ามใช้ค่า enum ในทรานแซกชันเดียวกับที่เพิ่มค่านั้น (เหตุผลเต็มอยู่ในไฟล์นั้น)
-- 🔴 ตาราง ChatConversationPref ต้องถูกลงทะเบียนใน src/lib/core/scope.ts ด้วย (ทำแล้ว: sys())
--    ไม่งั้น query โยนตอน runtime และ fitness F1.1 แดง

-- AlterTable
ALTER TABLE "ChatAttachment" ADD COLUMN     "durationMs" INTEGER;

-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedByUserId" TEXT;

-- CreateTable
CREATE TABLE "ChatConversationPref" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversationPref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversationPref_systemId_userId_idx" ON "ChatConversationPref"("systemId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversationPref_conversationId_userId_key" ON "ChatConversationPref"("conversationId", "userId");

-- AddForeignKey
ALTER TABLE "ChatConversationPref" ADD CONSTRAINT "ChatConversationPref_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
