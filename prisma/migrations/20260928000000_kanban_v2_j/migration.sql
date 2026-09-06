-- K1.13 — ไมเกรชันชุด J ของ "บอร์ดงาน": undo token (มือถือ ปัดขวา=เสร็จ / ปัดซ้าย=เก็บ + "เลิกทำ")
-- 🔴 เพิ่มอย่างเดียว (additive): CREATE TABLE / CREATE INDEX เท่านั้น — ไม่แตะตารางเดิมสักคอลัมน์

-- CreateTable
CREATE TABLE "KanbanUndoToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "KanbanUndoToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KanbanUndoToken_tenantId_systemId_expiresAt_idx" ON "KanbanUndoToken"("tenantId", "systemId", "expiresAt");

-- CreateIndex
CREATE INDEX "KanbanUndoToken_userId_expiresAt_idx" ON "KanbanUndoToken"("userId", "expiresAt");
