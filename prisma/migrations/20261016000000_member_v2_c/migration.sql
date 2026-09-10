-- M2.1 — ระบบสมาชิก v2 ชุด C (`member_v2_c`) · พิมพ์เขียว docs/modules/06-member-v2.md §4.1 §4.2 §4.3 §5.5 §11.4
--
-- 🔴 additive ล้วน — มีแต่ CREATE TYPE / CREATE TABLE / ADD COLUMN (ทุกคอลัมน์ใหม่ nullable หรือมี DEFAULT)
--    ไม่มี DROP COLUMN / DROP TABLE / DROP TYPE / ALTER COLUMN … TYPE ⇒ โค้ดรุ่นก่อนหน้ายังทำงานได้เหมือนเดิม
--    (ร้านที่ยังไม่ตั้งอะไรเลยได้ค่าปริยาย: หมดอายุ 12 เดือน · เตือน 30/7 วัน · ตัดยอดที่จ่ายด้วยบัตรกำนัล/voucher)
--
-- ทำไมต้องมี
--   • `PointLot` — แต้ม v1 เป็นยอดรวมก้อนเดียว ตัด FIFO/หมดอายุไม่ได้เลย (§11.4 บังคับให้ BURN ตัดล็อตที่
--     หมดอายุเร็วสุดก่อน และ REVERSE ต้องคืนเข้าล็อตเดิม) ⇒ ต้องมีแถวต่อ "ครั้งที่ได้แต้ม"
--   • `PointRule` — กฎได้แต้ม 6 ชนิดของร้าน (ฐาน/ระดับ/สินค้า/หมวด/ช่วงเวลา/เหตุการณ์)
--   • `PointTransfer` — ตัวจริงมาที่ M2.2 แต่ตารางเกิดที่ migration เดียวกันตามพิมพ์เขียว §4.3
--   • `PointLedger.data` — BURN ต้องจำว่าตัดล็อตไหนไปเท่าไร ไม่งั้น void บิลแล้วคืนแต้มกลับล็อตเดิมไม่ได้
--
-- ข้อมูลเดิม: `PointLedger.lotId` ของแถวเก่าเป็น NULL ⇒ สร้างล็อตย้อนหลังด้วย
--   `scripts/member-backfill-points-lots.mts` (idempotent · ไม่ตัดย้อนหลัง — §4.6 ข้อ 4)

-- CreateEnum
CREATE TYPE "PointExpiryMode" AS ENUM ('MONTHS', 'END_OF_YEAR', 'NEVER');

-- CreateEnum
CREATE TYPE "PointRuleKind" AS ENUM ('BASE', 'TIER_MULTIPLIER', 'ITEM_BONUS', 'CATEGORY_BONUS', 'TIME_MULTIPLIER', 'EVENT_BONUS');

-- CreateEnum
CREATE TYPE "PointEventBonus" AS ENUM ('SIGNUP', 'BIRTHDAY', 'REVIEW', 'REFERRAL', 'PROFILE_COMPLETE', 'CHECKIN');

-- AlterTable
ALTER TABLE "PointLedger" ADD COLUMN     "data" JSONB,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lotId" TEXT,
ADD COLUMN     "multiplier" DECIMAL(4,2),
ADD COLUMN     "ruleId" TEXT;

-- AlterTable
ALTER TABLE "PointSettings" ADD COLUMN     "adjustApprovalOver" INTEGER,
ADD COLUMN     "burnMaxPct" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "burnMinPoints" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "burnRateSatang" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "dailyCap" INTEGER,
ADD COLUMN     "earnBase" TEXT NOT NULL DEFAULT 'NET',
ADD COLUMN     "excludeGiftCard" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "excludeVoucher" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expiryMode" "PointExpiryMode" NOT NULL DEFAULT 'MONTHS',
ADD COLUMN     "expiryMonths" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "remindDays" INTEGER[] DEFAULT ARRAY[30, 7]::INTEGER[],
ADD COLUMN     "transferEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transferMonthlyCap" INTEGER;

-- CreateTable
CREATE TABLE "PointRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "kind" "PointRuleKind" NOT NULL,
    "config" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "fromCustomerId" TEXT NOT NULL,
    "toCustomerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "feePoints" INTEGER NOT NULL DEFAULT 0,
    "otpVerifiedAt" TIMESTAMP(3),
    "ledgerOutId" TEXT NOT NULL,
    "ledgerInId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointRule_systemId_active_idx" ON "PointRule"("systemId", "active");

-- CreateIndex
CREATE INDEX "PointLot_customerId_expiresAt_idx" ON "PointLot"("customerId", "expiresAt");

-- CreateIndex
CREATE INDEX "PointLot_systemId_expiresAt_idx" ON "PointLot"("systemId", "expiresAt");

-- CreateIndex
CREATE INDEX "PointTransfer_fromCustomerId_createdAt_idx" ON "PointTransfer"("fromCustomerId", "createdAt");

