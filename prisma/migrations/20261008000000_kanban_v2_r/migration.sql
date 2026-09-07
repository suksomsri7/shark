-- K3.1 — ไมเกรชันชุด R ของ "บอร์ดงาน": เชื่อมข้อมูล SHARK (KanbanCardLink) + กุญแจกันการ์ดซ้ำจากภายนอก
-- 🔴 เพิ่มอย่างเดียว (additive): CREATE TYPE / CREATE TABLE / ADD COLUMN nullable / ADD VALUE ของ enum
--    ไม่มี DROP · ไม่มี ALTER … TYPE ของคอลัมน์เดิม · ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม
--    ⇒ แถวเดิมของ KanbanCard ทุกแถวได้ "sourceKey" = NULL (การ์ดที่คนสร้างเอง ไม่มีกุญแจกันซ้ำ)
-- มาจาก `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script`
-- เทียบกับ DB จริงบน QC (ep-plain-art) — ตรวจ SQL ทั้งไฟล์ด้วยตาแล้ว ไม่มีคำสั่งทำลายข้อมูล
-- ⚠️ ยกเว้นบรรทัดสุดท้าย (partial unique index ของ sourceKey) ที่เขียนมือ: Prisma schema ไม่รองรับ
--    `WHERE` บน @@unique ⇒ ประกาศที่นี่ที่เดียว แบบเดียวกับ KanbanInboxItem (K2.8 · kanban_v2_n)
--    และ KanbanBoardTemplate (K1.12 · kanban_v2_i)

-- CreateEnum
CREATE TYPE "KanbanLinkType" AS ENUM ('PARTY', 'CRM_CONTACT', 'CHAT_CONVERSATION', 'ACCOUNT_DOC', 'APPROVAL_REQUEST', 'HR_LEAVE', 'HR_EMPLOYEE', 'APPOINTMENT', 'HOTEL_RESERVATION', 'RENTAL_BOOKING', 'SCHOOL_CLASS', 'INV_ITEM', 'QUEUE_TICKET', 'TICKET_EVENT', 'FORM_SUBMISSION', 'KB_ARTICLE', 'POS_SALE', 'SHOP_ORDER', 'RESTAURANT_ORDER', 'URL');

-- AlterEnum
-- เพิ่ม 2 ค่าให้ KanbanActivityType (PostgreSQL 12+ เพิ่มค่าใน transaction ได้ · ค่าใหม่ถูกใช้จริง
-- ครั้งแรกที่ runtime คนละ transaction กับไมเกรชันนี้ จึงไม่ติดข้อจำกัด "ใช้ค่าใหม่ใน tx เดียวกันไม่ได้")
ALTER TYPE "KanbanActivityType" ADD VALUE IF NOT EXISTS 'LINK_ADDED';
ALTER TYPE "KanbanActivityType" ADD VALUE IF NOT EXISTS 'LINK_REMOVED';

-- AlterTable
ALTER TABLE "KanbanCard" ADD COLUMN     "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "KanbanCardLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "linkType" "KanbanLinkType" NOT NULL,
    "linkId" TEXT NOT NULL,
    "role" TEXT,
    "label" TEXT,
    "createdById" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanCardLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanCardLink_tenantId_systemId_linkType_linkId_idx" ON "KanbanCardLink"("tenantId", "systemId", "linkType", "linkId");

-- CreateIndex
CREATE INDEX "KanbanCardLink_cardId_removedAt_idx" ON "KanbanCardLink"("cardId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanCardLink_cardId_linkType_linkId_key" ON "KanbanCardLink"("cardId", "linkType", "linkId");

-- AddForeignKey
ALTER TABLE "KanbanCardLink" ADD CONSTRAINT "KanbanCardLink_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KanbanCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (เขียนมือ — partial unique: การ์ดที่ไม่ได้มาจากภายนอกมี sourceKey = NULL ซ้ำกันได้)
CREATE UNIQUE INDEX "KanbanCard_tenantId_sourceKey_key" ON "KanbanCard"("tenantId", "sourceKey") WHERE "sourceKey" IS NOT NULL;
