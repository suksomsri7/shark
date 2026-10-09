-- POS P2.2 — ราคาตามช่องทาง/สาขา (PosProductChannelPrice) + กติการาคา happy hour/โปร (PosPriceRule) + สำเนาชั้นราคาบน PosSaleLine · เพิ่มล้วน
-- ที่มา: prisma migrate diff --from-schema <schema ก่อน P2.2 (origin/session/pos d2c41103)> --to-schema prisma/schema --script (ไม่ได้ diff จากฐาน)
--   แก้มือ: CREATE TABLE / CREATE INDEX / ADD COLUMN ใส่ IF NOT EXISTS · เรียง CREATE TYPE ก่อน ADD COLUMN ที่ใช้ชนิดนั้น
--   เขียนมือ (prisma มองไม่เห็น — 🔴 ห้ามลบ): CHECK "PosProductChannelPrice_row_check" ใน CREATE TABLE +
--     unique "PosProductChannelPrice_product_code_unit_key" (productId, channelCode, unitId) NULLS NOT DISTINCT (Neon PG ≥ 15 · NULL เท่ากัน = แถวเดียวต่อ (สินค้า, ช่องทาง, สาขา))
--   ⚠️ ไฟล์นี้ "ไม่ใช่" รันซ้ำได้ทั้งไฟล์: CREATE TYPE ×3 ไม่มีตัวกัน (แบบ P2.1) — ล้มหลังสร้างชนิดแล้ว = ต้องเก็บกวาดมือก่อนรันใหม่
-- 🔴 ไม่มี DROP/RENAME/UPDATE · ไม่มี FK (id หลวม) · คอลัมน์ใหม่ของ PosSaleLine nullable ⇒ metadata-only (ไม่ rewrite ตาราง) · ไม่มี backfill
SET lock_timeout = '3s';

-- CreateEnum
CREATE TYPE "PosPriceSource" AS ENUM ('BASE', 'BRANCH', 'CHANNEL', 'RULE', 'OPEN', 'CUSTOM', 'WEIGHED');

-- CreateEnum
CREATE TYPE "PosPriceRuleKind" AS ENUM ('HAPPY_HOUR', 'PROMO');

-- CreateEnum
CREATE TYPE "PosPriceRuleAdjust" AS ENUM ('PRICE', 'PERCENT_OFF', 'AMOUNT_OFF');

-- CreateTable (+ CHECK เขียนมือ: code ∨ unit · notSold ⇒ ราคา null · ¬notSold ⇒ มีราคา)
CREATE TABLE IF NOT EXISTS "PosProductChannelPrice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelCode" TEXT,
    "unitId" TEXT,
    "priceSatang" INTEGER,
    "notSold" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosProductChannelPrice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PosProductChannelPrice_row_check" CHECK (("channelCode" IS NOT NULL OR "unitId" IS NOT NULL) AND (NOT "notSold" OR "priceSatang" IS NULL) AND ("notSold" OR "priceSatang" IS NOT NULL))
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PosPriceRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PosPriceRuleKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channelCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adjust" "PosPriceRuleAdjust" NOT NULL,
    "valueSatang" INTEGER,
    "valueBp" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosPriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (เขียนมือ — 🔴 ห้ามลบ · prisma มองไม่เห็น NULLS NOT DISTINCT)
CREATE UNIQUE INDEX IF NOT EXISTS "PosProductChannelPrice_product_code_unit_key" ON "PosProductChannelPrice" ("productId", "channelCode", "unitId") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosProductChannelPrice_tenantId_systemId_productId_idx" ON "PosProductChannelPrice"("tenantId", "systemId", "productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosPriceRule_tenantId_systemId_archivedAt_idx" ON "PosPriceRule"("tenantId", "systemId", "archivedAt");

-- AlterTable: สำเนาชั้นราคาของบรรทัด (บิลเดิม/ผู้เรียกเดิม/ใบ REFUND = null)
ALTER TABLE "PosSaleLine" ADD COLUMN IF NOT EXISTS "listPriceSatang" INTEGER,
ADD COLUMN IF NOT EXISTS "priceRuleId" TEXT,
ADD COLUMN IF NOT EXISTS "priceSource" "PosPriceSource";

RESET lock_timeout;
