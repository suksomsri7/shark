-- K3.9 — อีเมลเข้าบอร์ด: เพิ่มอย่างเดียว (additive) — คอลัมน์ nullable ใหม่ + ดัชนี 2 ตัว ไม่มี FK
-- ตรวจด้วยตาแล้ว (สัญญา §K3.9): ไม่มีคำสั่งลบคอลัมน์/ตาราง และไม่มีการเปลี่ยนชนิดคอลัมน์เดิม
--
-- 🔴 unique เป็น **partial index** (`WHERE "emailKey" IS NOT NULL`) เขียนมือที่นี่ — Prisma schema
--    ไม่รองรับ WHERE บน @@unique (แบบเดียวกับ `KanbanCard_tenantId_sourceKey_key` ของ K3.1)
--    บอร์ดที่ยังไม่เปิดที่อยู่อีเมล = NULL ⇒ NULL ซ้ำกันได้ตามมาตรฐาน Postgres ไม่ติดด่านนี้
-- 🔴 ดัชนีธรรมดาบน emailKey ล้วนต้องมีด้วย: อีเมลขาเข้ารู้แค่กุญแจ ยังไม่รู้ร้าน
--    ⇒ ค้นด้วย (tenantId, emailKey) ไม่ได้ ต้องมีดัชนีที่นำด้วย emailKey เอง

-- AlterTable
ALTER TABLE "KanbanBoard" ADD COLUMN "emailKey" TEXT;

-- CreateIndex
CREATE INDEX "KanbanBoard_emailKey_idx" ON "KanbanBoard"("emailKey");

-- CreateIndex (partial unique — เขียนมือ ไม่ได้มาจาก schema)
CREATE UNIQUE INDEX "KanbanBoard_tenantId_emailKey_key" ON "KanbanBoard"("tenantId", "emailKey") WHERE "emailKey" IS NOT NULL;
