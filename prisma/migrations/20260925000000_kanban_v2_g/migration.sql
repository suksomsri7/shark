-- K1.9 — ไมเกรชันชุด G ของ "บอร์ดงาน": ไฟล์แนบ + ปกการ์ด
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (FK)
--    ไม่แตะตารางเดิมสักคอลัมน์ — ตารางใหม่ล้วน ไม่มีข้อมูลเก่าให้ backfill
--    (`KanbanCard.coverFileId` มีอยู่แล้วตั้งแต่ migration kanban_v2_a — ไม่ต้องเพิ่มคอลัมน์การ์ดใน WO นี้)
-- ตรวจด้วยตาแล้ว: ไม่มี DROP / ไม่มี ALTER … TYPE / ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม

-- CreateTable
CREATE TABLE "KanbanAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KanbanAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanAttachment_cardId_idx" ON "KanbanAttachment"("cardId");

-- CreateIndex
CREATE INDEX "KanbanAttachment_tenantId_idx" ON "KanbanAttachment"("tenantId");

-- AddForeignKey
ALTER TABLE "KanbanAttachment" ADD CONSTRAINT "KanbanAttachment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KanbanCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
