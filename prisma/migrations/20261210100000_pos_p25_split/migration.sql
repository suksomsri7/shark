-- POS P2.5 แยกบิลของโต๊ะ (มติ CD2 · §3 ของบรีฟ) — เพิ่มอย่างเดียว · ตาราง POS ใหม่ 3 ตาราง · ไม่แตะตารางอื่น
-- ไม่มี FK เลย (id หลวม · ไม่ไป TableSession / RestaurantOrderItem / PosSale และไม่มีระหว่างสามตารางนี้) ⇒ ทุกคำสั่ง IF NOT EXISTS ได้
-- partial unique 2 ตัว (prisma ประกาศไม่ได้): แผน OPEN 1 แถวต่อ session · ใบหนึ่งผูกบิลได้ใบเดียว
SET lock_timeout = '3s';

DO $$ BEGIN CREATE TYPE "PosTableSplitMode" AS ENUM ('ITEM', 'EQUAL', 'SEAT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PosTableSplitStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PosTableSplitPartStatus" AS ENUM ('OPEN', 'PAID'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "PosTableSplit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "mode" "PosTableSplitMode" NOT NULL,
    "status" "PosTableSplitStatus" NOT NULL DEFAULT 'OPEN',
    "partCount" INTEGER NOT NULL,
    "itemsHash" TEXT NOT NULL,
    "billDiscount" JSONB,
    "serviceChargeBp" INTEGER NOT NULL,
    "baseSatang" INTEGER NOT NULL,
    "discountSatang" INTEGER NOT NULL,
    "serviceChargeSatang" INTEGER NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "PosTableSplit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PosTableSplitPart" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "splitId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "label" TEXT,
    "memberId" TEXT,
    "baseSatang" INTEGER NOT NULL,
    "discountSatang" INTEGER NOT NULL,
    "serviceChargeSatang" INTEGER NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "status" "PosTableSplitPartStatus" NOT NULL DEFAULT 'OPEN',
    "saleId" TEXT,
    "paidAt" TIMESTAMP(3),
    CONSTRAINT "PosTableSplitPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PosTableSplitLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "splitId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" INTEGER,
    "shareNum" INTEGER,
    "shareDen" INTEGER,
    "amountSatang" INTEGER NOT NULL,
    "stockOwner" BOOLEAN NOT NULL,
    CONSTRAINT "PosTableSplitLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PosTableSplit_tenantId_unitId_idx" ON "PosTableSplit"("tenantId", "unitId");
CREATE INDEX IF NOT EXISTS "PosTableSplit_sessionId_idx" ON "PosTableSplit"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "PosTableSplit_session_open_key" ON "PosTableSplit"("sessionId") WHERE "status" = 'OPEN';
CREATE INDEX IF NOT EXISTS "PosTableSplitPart_tenantId_idx" ON "PosTableSplitPart"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "PosTableSplitPart_splitId_no_key" ON "PosTableSplitPart"("splitId", "no");
CREATE UNIQUE INDEX IF NOT EXISTS "PosTableSplitPart_saleId_key" ON "PosTableSplitPart"("saleId") WHERE "saleId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PosTableSplitLine_splitId_idx" ON "PosTableSplitLine"("splitId");
CREATE INDEX IF NOT EXISTS "PosTableSplitLine_itemId_idx" ON "PosTableSplitLine"("itemId");

RESET lock_timeout;
