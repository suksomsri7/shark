-- K1.8 — ไมเกรชันชุด F ของ "บอร์ดงาน": ความเห็นในการ์ด (+ @mention)
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (FK)
--    ไม่แตะตารางเดิมสักคอลัมน์ — ตารางใหม่ล้วน ไม่มีข้อมูลเก่าให้ backfill
-- ตรวจด้วยตาแล้ว: ไม่มี DROP / ไม่มี ALTER … TYPE / ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม

-- CreateTable
CREATE TABLE "KanbanComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanComment_cardId_createdAt_idx" ON "KanbanComment"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "KanbanComment_tenantId_idx" ON "KanbanComment"("tenantId");

-- AddForeignKey
ALTER TABLE "KanbanComment" ADD CONSTRAINT "KanbanComment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KanbanCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
