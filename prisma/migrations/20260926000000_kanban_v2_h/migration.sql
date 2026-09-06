-- K1.10 — ไมเกรชันชุด H ของ "บอร์ดงาน": ประวัติกิจกรรม (KanbanActivity append-only)
-- 🔴 เพิ่มอย่างเดียว (additive): CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (FK) เท่านั้น
--    ไม่แตะตารางเดิมสักคอลัมน์ · ไม่มี DROP · ไม่มี ALTER … TYPE · ไม่มีข้อมูลเก่าให้ backfill
--    (ประวัติเริ่มนับจากวันที่ deploy — ของก่อนหน้านั้นอยู่ใน AuditLog กลางเท่าที่เคยเขียนไว้)

-- CreateEnum
CREATE TYPE "KanbanActivityType" AS ENUM ('BOARD_CREATED', 'BOARD_UPDATED', 'BOARD_ARCHIVED', 'MEMBER_ADDED', 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED', 'COLUMN_CREATED', 'COLUMN_UPDATED', 'COLUMN_MOVED', 'COLUMN_ARCHIVED', 'CARD_CREATED', 'CARD_UPDATED', 'CARD_MOVED', 'CARD_ASSIGNED', 'CARD_UNASSIGNED', 'CARD_DUE_SET', 'CARD_LABELED', 'CARD_UNLABELED', 'CARD_ARCHIVED', 'CARD_RESTORED', 'CARD_COMPLETED', 'CHECKLIST_ITEM_DONE', 'COMMENT_ADDED', 'ATTACHMENT_ADDED');

-- CreateTable
CREATE TABLE "KanbanActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "cardId" TEXT,
    "actorUserId" TEXT,
    "type" "KanbanActivityType" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanActivity_cardId_createdAt_idx" ON "KanbanActivity"("cardId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "KanbanActivity_boardId_createdAt_idx" ON "KanbanActivity"("boardId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "KanbanActivity_tenantId_idx" ON "KanbanActivity"("tenantId");

-- AddForeignKey
ALTER TABLE "KanbanActivity" ADD CONSTRAINT "KanbanActivity_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanActivity" ADD CONSTRAINT "KanbanActivity_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KanbanCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
