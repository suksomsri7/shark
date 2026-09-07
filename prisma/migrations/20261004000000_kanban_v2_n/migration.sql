-- K2.8 — ไมเกรชันชุด N ของ "บอร์ดงาน": กล่องงานเข้าส่วนตัว (KanbanInboxItem)
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ CREATE TYPE (enum ใหม่) / CREATE TABLE / CREATE INDEX — ไม่แตะ
--    ตารางเดิมสักคอลัมน์ ไม่มี DROP / ไม่มี ALTER … TYPE / ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม
-- ส่วน CreateEnum/CreateTable/CreateIndex (ตัวธรรมดา) มาจาก `prisma migrate diff
-- --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` เทียบกับ DB จริงบน QC
-- ตรงเป๊ะกับ schema ใหม่ (enum KanbanInboxStatus + model KanbanInboxItem ใน prisma/schema/kanban.prisma)
-- ส่วน unique index แบบ partial (`WHERE "sourceKey" IS NOT NULL`) เขียนเพิ่มเองด้วยมือ — Prisma schema
-- ไม่รองรับ WHERE บน @@unique (แบบเดียวกับ `KanbanBoardTemplate_scope_key_key` ใน migration kanban_v2_i)
-- ตรวจ SQL ทั้งไฟล์ด้วยตาแล้ว: มีแต่ CREATE ล้วน ไม่มีคำสั่งทำลายข้อมูล

-- CreateEnum
CREATE TYPE "KanbanInboxStatus" AS ENUM ('OPEN', 'MOVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "KanbanInboxItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceKey" TEXT,
    "fileIds" JSONB NOT NULL DEFAULT '[]',
    "status" "KanbanInboxStatus" NOT NULL DEFAULT 'OPEN',
    "movedCardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanInboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanInboxItem_tenantId_systemId_ownerUserId_status_create_idx" ON "KanbanInboxItem"("tenantId", "systemId", "ownerUserId", "status", "createdAt");

-- CreateIndex (partial unique — idempotency ของรายการที่มาจากภายนอก · sourceKey null ไม่ถูกบังคับ unique
-- เพราะรายการที่จดเองแบบ MANUAL ไม่มี sourceKey เลย — เขียนมือ ไม่ได้มาจาก `migrate diff`)
CREATE UNIQUE INDEX "KanbanInboxItem_tenantId_sourceKey_key" ON "KanbanInboxItem"("tenantId", "sourceKey") WHERE "sourceKey" IS NOT NULL;
