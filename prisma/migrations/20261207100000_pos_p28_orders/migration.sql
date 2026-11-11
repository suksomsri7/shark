-- POS P2.8 — ออเดอร์ทุกช่องทาง: PosOrder + PosOrderLine + PosOrderEvent (POS เป็นเจ้าของ · มติผู้คุมงาน 1 14) · เพิ่มล้วน
-- ที่มา: prisma migrate diff --from-schema <schema ก่อน P2.8 (session/pos 160299e4)> --to-schema prisma/schema --script (ไม่ได้ diff จากฐาน)
--   แก้มือ: CREATE TYPE ห่อ DO … EXCEPTION WHEN duplicate_object · CREATE TABLE / CREATE INDEX ใส่ IF NOT EXISTS (รันซ้ำได้ทั้งไฟล์)
-- 🔴 ไม่มี FK (id หลวม) · ไม่มี DROP/RENAME/UPDATE/DELETE/INSERT/ALTER · ไม่แตะ ShopOrder/SalesChannel/PosSale ·
--    unique 2 ตัว (X1: (tenantId, channelId, externalRef) — NULL ไม่ชนกัน · (tenantId, idempotencyKey)) + index ธรรมดา 1 ตัว (มติ 14 · ข้อ 22)
SET lock_timeout = '3s';

-- CreateEnum
DO $$ BEGIN CREATE TYPE "PosOrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'HANDED', 'REJECTED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "PosOrderPaymentState" AS ENUM ('UNPAID', 'PAY_ON_PICKUP', 'PLATFORM_PAID', 'PAID', 'REFUNDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "PosOrderFulfilment" AS ENUM ('PICKUP', 'DELIVERY', 'DINE_IN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PosOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "adapter" "SalesChannelAdapter" NOT NULL,
    "externalRef" TEXT,
    "code" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PosOrderStatus" NOT NULL,
    "paymentState" "PosOrderPaymentState" NOT NULL,
    "fulfilment" "PosOrderFulfilment" NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "memberId" TEXT,
    "partyId" TEXT,
    "address" TEXT,
    "note" TEXT,
    "chatConversationId" TEXT,
    "shopOrderId" TEXT,
    "totalSatang" INTEGER NOT NULL,
    "prepMinutes" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "handedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "saleId" TEXT,
    "acceptedByUserId" TEXT,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PosOrderLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceSatang" INTEGER NOT NULL,
    "listPriceSatang" INTEGER,
    "priceSource" "PosPriceSource",
    "priceRuleId" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "lineTotalSatang" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PosOrderEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "PosOrderStatus",
    "toStatus" "PosOrderStatus" NOT NULL,
    "actorUserId" TEXT,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosOrder_tenantId_unitId_status_receivedAt_idx" ON "PosOrder"("tenantId", "unitId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PosOrder_tenantId_channelId_externalRef_key" ON "PosOrder"("tenantId", "channelId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PosOrder_tenantId_idempotencyKey_key" ON "PosOrder"("tenantId", "idempotencyKey");

RESET lock_timeout;
