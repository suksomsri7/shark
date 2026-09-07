-- K2.6 — ไมเกรชันชุด M ของ "บอร์ดงาน": ฟิลด์กำหนดเอง 5 ชนิด (≤20/บอร์ด)
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (FK)
--    ไม่แตะตารางเดิมสักคอลัมน์ — ตารางใหม่ล้วน ไม่มีข้อมูลเก่าให้ backfill
-- ตรวจด้วยตาแล้ว: ไม่มี DROP / ไม่มี ALTER … TYPE / ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม
-- สร้างจาก `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script`
-- (Prisma 7 ตัด --from-url/--to-schema-datamodel ออกแล้ว) เทียบกับ DB จริงบน QC ตรงเป๊ะกับ schema ใหม่

-- CreateEnum
CREATE TYPE "KanbanCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'SELECT');

-- CreateTable
CREATE TABLE "KanbanCustomField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "KanbanCustomFieldType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "showOnCard" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanCustomFieldValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,4),
    "valueDate" TIMESTAMP(3),
    "valueBool" BOOLEAN,
    "valueOption" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanCustomField_boardId_sortOrder_idx" ON "KanbanCustomField"("boardId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanCustomField_boardId_name_key" ON "KanbanCustomField"("boardId", "name");

-- CreateIndex
CREATE INDEX "KanbanCustomFieldValue_fieldId_idx" ON "KanbanCustomFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanCustomFieldValue_cardId_fieldId_key" ON "KanbanCustomFieldValue"("cardId", "fieldId");

-- AddForeignKey
ALTER TABLE "KanbanCustomField" ADD CONSTRAINT "KanbanCustomField_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCustomFieldValue" ADD CONSTRAINT "KanbanCustomFieldValue_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KanbanCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCustomFieldValue" ADD CONSTRAINT "KanbanCustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "KanbanCustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
