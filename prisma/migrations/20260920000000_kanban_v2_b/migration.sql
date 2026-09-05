-- K1.2 — ไมเกรชันชุด B ของ "บอร์ดงาน": ป้ายกำกับจริง + ผู้รับผิดชอบหลายคน
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (FK)
--    ไม่แตะตารางเดิมสักคอลัมน์ ⇒ โค้ดเก่าที่ยังวิ่งระหว่าง Vercel deploy เสิร์ฟต่อได้ตามปกติ
--    (บทเรียน: เพิ่มคอลัมน์ = พังทั้งตาราง ไม่ใช่แค่ฟีเจอร์ใหม่ — แชท prod ล่ม 2.5 ชม. 1 ก.ย.)
-- ตรวจด้วยตาแล้ว: ไม่มี DROP / ไม่มี ALTER … TYPE / ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม
-- ข้อมูลเดิม (`KanbanCard.labels` Json · `KanbanCard.assigneeUserId`) ย้ายเข้าตารางใหม่โดย
--   `scripts/backfill-kanban-v2-b.mts` (รันหลัง deploy · idempotent) — ทั้งสองที่ถูกเขียนคู่กันตลอด P1

-- CreateTable
CREATE TABLE "KanbanLabel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" "KanbanLabelColor" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanCardLabel" (
    "cardId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "KanbanCardLabel_pkey" PRIMARY KEY ("cardId","labelId")
);

-- CreateTable
CREATE TABLE "KanbanCardAssignee" (
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanCardAssignee_pkey" PRIMARY KEY ("cardId","userId")
);

-- CreateIndex
CREATE INDEX "KanbanLabel_tenantId_systemId_boardId_idx" ON "KanbanLabel"("tenantId", "systemId", "boardId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanLabel_boardId_name_key" ON "KanbanLabel"("boardId", "name");

-- CreateIndex
CREATE INDEX "KanbanCardLabel_labelId_idx" ON "KanbanCardLabel"("labelId");

-- CreateIndex
CREATE INDEX "KanbanCardAssignee_tenantId_userId_idx" ON "KanbanCardAssignee"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "KanbanLabel" ADD CONSTRAINT "KanbanLabel_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCardLabel" ADD CONSTRAINT "KanbanCardLabel_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KanbanCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCardLabel" ADD CONSTRAINT "KanbanCardLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "KanbanLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCardAssignee" ADD CONSTRAINT "KanbanCardAssignee_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KanbanCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

