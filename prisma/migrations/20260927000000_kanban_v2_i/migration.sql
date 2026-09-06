-- K1.12 — ไมเกรชันชุด I ของ "บอร์ดงาน": เทมเพลตบอร์ด (KanbanBoardTemplate)
-- 🔴 เพิ่มอย่างเดียว (additive): CREATE TYPE / CREATE TABLE / CREATE INDEX เท่านั้น
--    ไม่แตะตารางเดิมสักคอลัมน์ · ไม่มี DROP · ไม่มี ALTER … TYPE
--    (KanbanBoard.templateOfId มีอยู่แล้วตั้งแต่ migration kanban_v2_a — ไม่ต้องเพิ่มซ้ำ)

-- CreateEnum
CREATE TYPE "KanbanTemplateScope" AS ENUM ('PLATFORM', 'TENANT');

-- CreateTable
CREATE TABLE "KanbanBoardTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "scope" "KanbanTemplateScope" NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanBoardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanBoardTemplate_tenantId_idx" ON "KanbanBoardTemplate"("tenantId");

-- CreateIndex (partial unique — §K1.12: คีย์แพลตฟอร์มห้ามซ้ำ · เทมเพลตของร้าน key=null ไม่ชนกันเอง)
-- 🔴 ตั้งใจเขียนเป็น partial index ชัดเจน (WHERE "key" IS NOT NULL) แทนที่จะพึ่งพฤติกรรม
--    "NULL ไม่ชนกัน" ของ unique constraint ปกติเฉย ๆ — งอกความหมายตรงตามสัญญา §K1.12 คำต่อคำ
CREATE UNIQUE INDEX "KanbanBoardTemplate_scope_key_key" ON "KanbanBoardTemplate"("scope", "key") WHERE "key" IS NOT NULL;
