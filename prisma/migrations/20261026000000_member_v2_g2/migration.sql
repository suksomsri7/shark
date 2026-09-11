-- member_v2_g2 — แคมเปญ v2 (M3.2 · ระบบสมาชิก v2)
-- additive ทั้งใบ: เพิ่มค่า enum + เพิ่มคอลัมน์ + สร้าง 2 ตารางใหม่ · ไม่มี DROP/RENAME
--
-- 🔴 ก่อน deploy prod: ตารางแคมเปญ v1 อาจมีผู้รับซ้ำ (campaignId, customerId) อยู่แล้ว
--    (v1 `sendCampaign` ใช้ createMany โดยไม่มี unique) ⇒ บล็อก "เก็บกวาดก่อนผูก unique" ข้างล่าง
--    จะลบแถวซ้ำที่ **เกิดทีหลัง** ทิ้ง เก็บใบแรกไว้ใบเดียว · นับก่อนเสมอด้วยคำสั่งใน wo-notes §6

-- AlterEnum
ALTER TYPE "MktChannel" ADD VALUE IF NOT EXISTS 'PUSH';

-- AlterTable
ALTER TABLE "MktCampaign" ADD COLUMN     "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "content" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "memberSystemId" TEXT,
ADD COLUMN     "scheduledBy" TEXT;

-- AlterTable
ALTER TABLE "MktRecipient" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "saleId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "voucherId" TEXT;

-- CreateTable
CREATE TABLE "CampaignVariantStat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0,
    "saleSatang" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "costSatang" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignVariantStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPushDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ios',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignVariantStat_tenantId_idx" ON "CampaignVariantStat"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignVariantStat_campaignId_variant_key" ON "CampaignVariantStat"("campaignId", "variant");

-- CreateIndex
CREATE INDEX "MemberPushDevice_customerId_idx" ON "MemberPushDevice"("customerId");

-- CreateIndex
CREATE INDEX "MemberPushDevice_tenantId_idx" ON "MemberPushDevice"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPushDevice_token_key" ON "MemberPushDevice"("token");

-- CreateIndex
CREATE INDEX "MktRecipient_tenantId_status_sentAt_idx" ON "MktRecipient"("tenantId", "status", "sentAt");

-- เก็บกวาดก่อนผูก unique: ผู้รับซ้ำ (campaignId, customerId) ของแคมเปญ v1 — เก็บแถวแรกสุดไว้ใบเดียว
DELETE FROM "MktRecipient" r
USING "MktRecipient" keep
WHERE r."customerId" IS NOT NULL
  AND keep."customerId" = r."customerId"
  AND keep."campaignId" = r."campaignId"
  AND (keep."createdAt", keep."id") < (r."createdAt", r."id");

-- CreateIndex
CREATE UNIQUE INDEX "MktRecipient_campaignId_customerId_key" ON "MktRecipient"("campaignId", "customerId");

-- AddForeignKey
ALTER TABLE "CampaignVariantStat" ADD CONSTRAINT "CampaignVariantStat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MktCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPushDevice" ADD CONSTRAINT "MemberPushDevice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

