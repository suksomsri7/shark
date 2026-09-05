-- K1.1 — ไมเกรชันชุด A ของ "บอร์ดงาน" (Kanban → เทียบชั้น Trello)
-- 🔴 เพิ่มอย่างเดียว (additive): ทุกคอลัมน์ใหม่เป็น nullable หรือมีค่า default
--    เหตุผล (ledger/DESIGN-KANBAN-TRELLO.md §7): Vercel build รัน `prisma migrate deploy`
--    ⇒ ช่วงหนึ่งโค้ดเก่ายังวิ่งอยู่บน schema ใหม่ (เคยทำแชท prod ล่ม 2.5 ชม. เมื่อ 1 ก.ย.)
--    ไฟล์นี้จึงมีแค่ CREATE TYPE / ADD COLUMN / CREATE INDEX เท่านั้น
-- ตรวจด้วยตาแล้ว (สัญญา §K1.1): ไม่มีคำสั่งลบคอลัมน์/ตาราง และไม่มีการเปลี่ยนชนิดคอลัมน์เดิม
-- หมายเหตุ: @@unique([boardId, cardNo]) จะเพิ่มใน migration B (K1.4) หลัง backfill เติม cardNo ครบแล้ว

-- CreateEnum
CREATE TYPE "KanbanBoardVisibility" AS ENUM ('PRIVATE', 'TENANT');

-- CreateEnum
CREATE TYPE "KanbanLabelColor" AS ENUM ('SLATE', 'BLUE', 'GREEN', 'AMBER', 'RED', 'PURPLE');

-- CreateEnum
CREATE TYPE "KanbanCardSourceType" AS ENUM ('MANUAL', 'TEMPLATE', 'CHAT', 'FORM', 'EMAIL', 'AUTOMATION', 'AI');

-- AlterTable
ALTER TABLE "KanbanBoard" ADD COLUMN     "cardNoSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "color" "KanbanLabelColor" NOT NULL DEFAULT 'SLATE',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "templateOfId" TEXT,
ADD COLUMN     "unitId" TEXT,
ADD COLUMN     "visibility" "KanbanBoardVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "KanbanCard" ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "cardNo" INTEGER,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "coverFileId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "reminderMinutesBefore" INTEGER,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" "KanbanCardSourceType" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "startAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "KanbanColumn" ADD COLUMN     "color" "KanbanLabelColor",
ADD COLUMN     "isDoneColumn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "wipLimit" INTEGER;

-- CreateIndex
CREATE INDEX "KanbanBoard_tenantId_systemId_unitId_idx" ON "KanbanBoard"("tenantId", "systemId", "unitId");

-- CreateIndex
CREATE INDEX "KanbanCard_tenantId_systemId_status_dueAt_idx" ON "KanbanCard"("tenantId", "systemId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "KanbanCard_boardId_cardNo_idx" ON "KanbanCard"("boardId", "cardNo");

