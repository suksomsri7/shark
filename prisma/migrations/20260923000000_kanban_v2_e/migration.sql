-- K1.7 — ไมเกรชันชุด E ของ "บอร์ดงาน": เช็คลิสต์ (หลายชุด/การ์ด · มอบหมาย+กำหนดส่งรายรายการ)
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (FK)
--    ไม่แตะตารางเดิมสักคอลัมน์ — ตารางใหม่ทั้งคู่ ไม่มีข้อมูลเก่าให้ backfill
-- ตรวจด้วยตาแล้ว: ไม่มี DROP / ไม่มี ALTER … TYPE / ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม

-- CreateTable
CREATE TABLE "KanbanChecklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanChecklist_cardId_idx" ON "KanbanChecklist"("cardId");

-- CreateIndex
CREATE INDEX "KanbanChecklistItem_checklistId_idx" ON "KanbanChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "KanbanChecklistItem_tenantId_assigneeUserId_done_idx" ON "KanbanChecklistItem"("tenantId", "assigneeUserId", "done");

-- AddForeignKey
ALTER TABLE "KanbanChecklist" ADD CONSTRAINT "KanbanChecklist_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KanbanCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanChecklistItem" ADD CONSTRAINT "KanbanChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "KanbanChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
