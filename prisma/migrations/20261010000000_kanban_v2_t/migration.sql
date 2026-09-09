-- K3.7 — การ์ดสะท้อน (mirror): เพิ่มอย่างเดียว (additive) — คอลัมน์ nullable ใหม่ + ดัชนี ไม่มี FK
-- 🔴 ตั้งใจไม่ทำ FK: ต้นฉบับถูกเก็บ (ARCHIVED) หรือ (ในทางทฤษฎี) หายไปวันหน้า ตัวสะท้อนต้องยังอยู่เสมอ (D22)
--    ตรวจด้วยตาแล้ว (สัญญา §K3.7): ไม่มีคำสั่งลบคอลัมน์/ตาราง และไม่มีการเปลี่ยนชนิดคอลัมน์เดิม

-- AlterTable
ALTER TABLE "KanbanCard" ADD COLUMN "mirrorOfId" TEXT;

-- CreateIndex
CREATE INDEX "KanbanCard_mirrorOfId_idx" ON "KanbanCard"("mirrorOfId");
