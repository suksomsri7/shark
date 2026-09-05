-- K1.3 — ไมเกรชันชุด C ของ "บอร์ดงาน": สมาชิกบอร์ด (บทบาท 3 ขั้น) + ติดดาวรายคน
-- 🔴 เพิ่มอย่างเดียว (additive): CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (FK) เท่านั้น
--    ไม่แตะตารางเดิมสักคอลัมน์ ⇒ โค้ดรุ่นก่อนที่ยังวิ่งอยู่ระหว่าง Vercel deploy เสิร์ฟต่อได้ตามปกติ
--    (บทเรียน 1 ก.ย.: เพิ่มคอลัมน์ = พังทั้งตาราง ไม่ใช่แค่ฟีเจอร์ใหม่ — แชท prod ล่ม 2.5 ชม.)
-- ตรวจด้วยตาแล้ว: ไม่มี DROP · ไม่มี ALTER … TYPE · ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม
-- ไม่มี backfill: บอร์ดเดิมไม่ต้องมีแถวสมาชิก — สิทธิ์ของ OWNER/MANAGER/บอร์ด TENANT เป็น "โดยนัย"
--   คิดในโค้ด (`src/lib/modules/kanban/access.ts`) ⇒ ไม่มีใครหลุดสิทธิ์ตอน deploy

-- CreateEnum
CREATE TYPE "KanbanBoardRole" AS ENUM ('VIEWER', 'EDITOR', 'ADMIN');

-- CreateTable
CREATE TABLE "KanbanBoardMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "KanbanBoardRole" NOT NULL DEFAULT 'EDITOR',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanBoardMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanBoardStar" (
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanBoardStar_pkey" PRIMARY KEY ("boardId","userId")
);

-- CreateIndex
CREATE INDEX "KanbanBoardMember_tenantId_userId_idx" ON "KanbanBoardMember"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanBoardMember_boardId_userId_key" ON "KanbanBoardMember"("boardId", "userId");

-- CreateIndex
CREATE INDEX "KanbanBoardStar_tenantId_userId_idx" ON "KanbanBoardStar"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "KanbanBoardMember" ADD CONSTRAINT "KanbanBoardMember_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanBoardStar" ADD CONSTRAINT "KanbanBoardStar_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
