-- K2.5 — ไมเกรชันชุด L ของ "บอร์ดงาน": มุมมองที่บันทึกไว้ (ส่วนตัว/ทั้งทีม)
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (FK)
--    ไม่แตะตารางเดิมสักคอลัมน์ — ตารางใหม่ล้วน ไม่มีข้อมูลเก่าให้ backfill
-- ตรวจด้วยตาแล้ว: ไม่มี DROP / ไม่มี ALTER … TYPE / ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม
-- `boardId` เป็น NULL ได้ตั้งแต่วันนี้ (K3.8 มุมมองข้ามบอร์ดจะใช้ค่า null — ไม่ต้อง migration เพิ่มทีหลัง)

-- CreateEnum
CREATE TYPE "KanbanViewScope" AS ENUM ('PRIVATE', 'BOARD');

-- CreateTable
CREATE TABLE "KanbanBoardView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "boardId" TEXT,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "scope" "KanbanViewScope" NOT NULL DEFAULT 'PRIVATE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanBoardView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanBoardView_boardId_scope_idx" ON "KanbanBoardView"("boardId", "scope");

-- CreateIndex
CREATE INDEX "KanbanBoardView_tenantId_systemId_ownerUserId_idx" ON "KanbanBoardView"("tenantId", "systemId", "ownerUserId");

-- AddForeignKey
ALTER TABLE "KanbanBoardView" ADD CONSTRAINT "KanbanBoardView_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
