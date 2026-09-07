-- K2.7 — ไมเกรชันชุด O ของ "บอร์ดงาน": เทมเพลตการ์ด + กำหนดส่งซ้ำ (recurring · cron รายวัน)
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ ALTER TABLE ADD COLUMN (nullable) / CREATE TABLE / CREATE INDEX /
--    ADD CONSTRAINT (FK) — ไม่แตะคอลัมน์เดิมของ KanbanCard สักตัว ไม่มี DROP / ไม่มี ALTER … TYPE /
--    ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม (คอลัมน์ใหม่ทั้งหมดของ KanbanCard เป็น nullable)
-- ตรวจด้วยตาแล้ว: ตรงกับ prisma/schema/kanban.prisma หลังเพิ่ม KanbanCard.recurrenceRule/
--    recurrenceParentId/recurrenceKey + model KanbanCardTemplate ใหม่
-- สร้างจาก `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema
-- --script` (Prisma 7 ตัด --from-url/--to-schema-datamodel ออกแล้ว) เทียบกับ DB จริงบน QC ตรงเป๊ะกับ
-- schema ใหม่

-- AlterTable
ALTER TABLE "KanbanCard" ADD COLUMN     "recurrenceKey" TEXT,
ADD COLUMN     "recurrenceParentId" TEXT,
ADD COLUMN     "recurrenceRule" TEXT;

-- CreateTable
CREATE TABLE "KanbanCardTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "labelIds" JSONB NOT NULL DEFAULT '[]',
    "checklists" JSONB NOT NULL DEFAULT '[]',
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "reminderMinutesBefore" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanCardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanCardTemplate_boardId_sortOrder_idx" ON "KanbanCardTemplate"("boardId", "sortOrder");

-- CreateIndex
CREATE INDEX "KanbanCard_tenantId_systemId_status_recurrenceRule_idx" ON "KanbanCard"("tenantId", "systemId", "status", "recurrenceRule");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanCard_recurrenceParentId_recurrenceKey_key" ON "KanbanCard"("recurrenceParentId", "recurrenceKey");

-- AddForeignKey
ALTER TABLE "KanbanCardTemplate" ADD CONSTRAINT "KanbanCardTemplate_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
