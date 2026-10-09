-- POS P2.1 — ช่องทางขาย (SalesChannel) ต่อสาขา + สำเนาช่องทาง/ค่าคอมฯ บน PosSale + ชนิดจ่าย PLATFORM · เพิ่มล้วน
-- ที่มา: prisma migrate diff --from-schema <schema ก่อน P2.1 (session/pos e4672cfa)> --to-schema prisma/schema --script (ไม่ได้ diff จากฐาน)
--   แก้มือ: เรียง CREATE TYPE ก่อน ADD COLUMN ที่ใช้ชนิดนั้น · ADD VALUE / ADD COLUMN / CREATE TABLE / CREATE INDEX ใส่ IF NOT EXISTS
--   ⚠️ ไฟล์นี้ "ไม่ใช่" รันซ้ำได้ทั้งไฟล์: CREATE TYPE ×3 ไม่มีตัวกัน (บรีฟอนุญาต CREATE TYPE ธรรมดา) — ล้มหลังสร้างชนิดแล้ว = ต้องเก็บกวาดมือก่อนรันใหม่
--      (แก้แค่คอมเมนต์นี้ใน fix round 1 · SQL เดิมทุกไบต์ — deploy บน QC4 แล้ว)
-- 🔴 ไม่มี DROP/RENAME/UPDATE · คอลัมน์ใหม่ nullable หรือ default ค่าคงที่ ⇒ metadata-only (PG11+ ไม่ rewrite ตาราง PosSale)
--    index ของ PosSale(channelId …) เลื่อนไป P6.1 (CREATE INDEX CONCURRENTLY นอก prisma migrate — แบบ P1.9/P1.17)
SET lock_timeout = '3s';

-- AlterEnum (ห้ามใช้ค่าใหม่ใน tx เดียวกัน — ไฟล์นี้ไม่ใช้ · แบบ P1.6 CARD)
ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'PLATFORM';

-- CreateEnum
CREATE TYPE "SalesChannelKind" AS ENUM ('BUILTIN', 'EXTERNAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SalesChannelAdapter" AS ENUM ('NONE', 'MANUAL', 'WEB', 'CHAT', 'API');

-- CreateEnum
CREATE TYPE "SalesChannelPayout" AS ENUM ('PLATFORM', 'DIRECT');

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "SalesChannelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "adapter" "SalesChannelAdapter" NOT NULL DEFAULT 'NONE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "payout" "SalesChannelPayout" NOT NULL DEFAULT 'DIRECT',
    "commissionBp" INTEGER NOT NULL DEFAULT 0,
    "commissionFixedSatang" INTEGER NOT NULL DEFAULT 0,
    "commissionVatBp" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "autoAccept" BOOLEAN NOT NULL DEFAULT false,
    "prepMinutes" INTEGER,
    "pausedUntil" TIMESTAMP(3),
    "adapterConfig" JSONB,

    CONSTRAINT "SalesChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SalesChannel_unitId_code_key" ON "SalesChannel"("unitId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesChannel_tenantId_systemId_unitId_idx" ON "SalesChannel"("tenantId", "systemId", "unitId");

-- AlterTable: สำเนาช่องทาง + ค่าคอมฯ ของบิล (บิลเดิม = null/0)
ALTER TABLE "PosSale" ADD COLUMN IF NOT EXISTS "channelId" TEXT,
ADD COLUMN IF NOT EXISTS "channelCode" TEXT,
ADD COLUMN IF NOT EXISTS "channelRef" TEXT,
ADD COLUMN IF NOT EXISTS "channelPayout" "SalesChannelPayout",
ADD COLUMN IF NOT EXISTS "channelCommissionSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "channelCommissionVatSatang" INTEGER NOT NULL DEFAULT 0;

RESET lock_timeout;
