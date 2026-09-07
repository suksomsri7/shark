-- K2.11 — ไมเกรชันชุด P ของ "บอร์ดงาน": ติดตาม (KanbanWatcher) + หลักฐานอีเมลสรุป (KanbanDigestSent)
--          + `AppNotification.emailedAt`
-- 🔴 เพิ่มอย่างเดียว (additive): CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD COLUMN แบบ nullable
--    ไม่มี DROP · ไม่มี ALTER … TYPE · ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม
--    ⇒ แถวเดิมของ AppNotification ทุกแถวได้ค่า NULL = พฤติกรรมเดิมเป๊ะ (ไม่ต้อง backfill)
-- ที่มา: `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script`
--        เทียบกับ DB จริงบน QC (ep-plain-art) — ตรวจ SQL ทั้งไฟล์ด้วยตาแล้ว ไม่มีคำสั่งทำลายข้อมูล
-- 🔴 KanbanWatcher เป็นตาราง polymorphic (targetType + targetId) จึงไม่มี FOREIGN KEY โดยตั้งใจ

-- CreateEnum
CREATE TYPE "KanbanWatchTargetType" AS ENUM ('CARD', 'COLUMN', 'BOARD');

-- AlterTable
ALTER TABLE "AppNotification" ADD COLUMN     "emailedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KanbanWatcher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "targetType" "KanbanWatchTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanDigestSent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanDigestSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanWatcher_tenantId_systemId_userId_idx" ON "KanbanWatcher"("tenantId", "systemId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanWatcher_targetType_targetId_userId_key" ON "KanbanWatcher"("targetType", "targetId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanDigestSent_tenantId_userId_periodKey_key" ON "KanbanDigestSent"("tenantId", "userId", "periodKey");
