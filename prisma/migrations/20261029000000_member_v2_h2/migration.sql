-- member_v2_h2 — การแจ้งเตือนสมาชิก (M3.6 · ระบบสมาชิก v2)
-- additive ทั้งใบ: สร้างตารางใหม่ 1 ตาราง (MemberNotification) — ไม่มี DROP/RENAME/ALTER ของตารางเดิม

-- CreateTable
CREATE TABLE "MemberNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "reason" TEXT,
    "refId" TEXT,
    "digestOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberNotification_systemId_status_scheduledAt_idx" ON "MemberNotification"("systemId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MemberNotification_customerId_createdAt_idx" ON "MemberNotification"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberNotification_systemId_createdAt_idx" ON "MemberNotification"("systemId", "createdAt");
