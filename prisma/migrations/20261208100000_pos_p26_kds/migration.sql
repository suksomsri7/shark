-- POS P2.6 S — KDS ใหม่ + ใบครัว + 86 → ทุกช่องทาง (เพิ่มอย่างเดียว · เขียนมือ · ledger/pos-briefs/pos-brief-P2.6.md §3 + §9 มติ 14)
-- RestaurantOrder + ลิงก์ของรอบครัวกับแหล่งขาย (หนึ่งบิล/ออเดอร์ = หนึ่งรอบ · partial unique) · RestaurantSetting.autoAcceptMaxOpen ·
-- enum PosAvailabilitySource + ตาราง PosAvailabilityMark (ใคร/เมื่อไร/จากไหนของ 86 · ไม่มี FK)
SET lock_timeout = '3s';
ALTER TABLE "RestaurantOrder" ADD COLUMN IF NOT EXISTS "posSaleId" TEXT, ADD COLUMN IF NOT EXISTS "posOrderId" TEXT, ADD COLUMN IF NOT EXISTS "channelCode" TEXT, ADD COLUMN IF NOT EXISTS "channelName" TEXT, ADD COLUMN IF NOT EXISTS "externalRef" TEXT, ADD COLUMN IF NOT EXISTS "targetMinutes" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantOrder_posSaleId_key" ON "RestaurantOrder"("posSaleId") WHERE "posSaleId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantOrder_posOrderId_key" ON "RestaurantOrder"("posOrderId") WHERE "posOrderId" IS NOT NULL;
ALTER TABLE "RestaurantSetting" ADD COLUMN IF NOT EXISTS "autoAcceptMaxOpen" INTEGER;
DO $$ BEGIN CREATE TYPE "PosAvailabilitySource" AS ENUM ('KDS', 'STOCK', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS "PosAvailabilityMark" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "systemId" TEXT NOT NULL, "unitId" TEXT NOT NULL, "productId" TEXT NOT NULL, "source" "PosAvailabilitySource" NOT NULL, "note" TEXT, "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "markedByUserId" TEXT, CONSTRAINT "PosAvailabilityMark_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "PosAvailabilityMark_unitId_productId_key" ON "PosAvailabilityMark"("unitId", "productId");
CREATE INDEX IF NOT EXISTS "PosAvailabilityMark_tenantId_unitId_idx" ON "PosAvailabilityMark"("tenantId", "unitId");
RESET lock_timeout;
