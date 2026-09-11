-- member_v2_h3 — แนะนำเพื่อน (M3.5 · ระบบสมาชิก v2)
-- additive ทั้งใบ: สร้าง enum 2 · ตาราง 2 · index · FK ไป Customer · ไม่มี DROP/RENAME/DELETE/UPDATE
-- 🔴 ข้อตัดสินผู้คุมงาน (11 ก.ย.): หัวข้อสอบ/ใบงานเขียนว่าตารางนี้ "มีตั้งแต่ M1.1" แต่ M1.1 ไม่ได้สร้าง
--    (ตรวจแล้ว: ไม่มีใน prisma/schema · migrations · QC DB) ⇒ ให้ M3.5 สร้างเองในใบนี้
-- เขียนมือ (ห้าม migrate dev — worktree มีสคีมาของใบอื่นแก้ค้างอยู่)

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONVERTED', 'REWARDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReferralRewardKind" AS ENUM ('POINTS', 'VOUCHER');

-- CreateTable
CREATE TABLE "ReferralProgram" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "referrerRewardKind" "ReferralRewardKind" NOT NULL DEFAULT 'POINTS',
    "referrerRewardValue" JSONB NOT NULL,
    "refereeRewardKind" "ReferralRewardKind" NOT NULL DEFAULT 'VOUCHER',
    "refereeRewardValue" JSONB NOT NULL,
    "convertOn" TEXT NOT NULL DEFAULT 'FIRST_PURCHASE',
    "minFirstPurchaseSatang" INTEGER,
    "monthlyCap" INTEGER,
    "fraudPhoneDevice" BOOLEAN NOT NULL DEFAULT true,
    "shareText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "referrerCustomerId" TEXT NOT NULL,
    "refereeCustomerId" TEXT,
    "refereeContact" JSONB,
    "code" TEXT NOT NULL,
    "linkId" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "convertedAt" TIMESTAMP(3),
    "conversionRef" JSONB,
    "rewardedAt" TIMESTAMP(3),
    "referrerRewardRef" JSONB,
    "refereeRewardRef" JSONB,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProgram_systemId_key" ON "ReferralProgram"("systemId");

-- CreateIndex
CREATE INDEX "ReferralProgram_tenantId_idx" ON "ReferralProgram"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_tenantId_refereeCustomerId_key" ON "Referral"("tenantId", "refereeCustomerId");

-- CreateIndex
CREATE INDEX "Referral_referrerCustomerId_idx" ON "Referral"("referrerCustomerId");

-- CreateIndex
CREATE INDEX "Referral_tenantId_status_createdAt_idx" ON "Referral"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_systemId_idx" ON "Referral"("systemId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerCustomerId_fkey" FOREIGN KEY ("referrerCustomerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeCustomerId_fkey" FOREIGN KEY ("refereeCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
