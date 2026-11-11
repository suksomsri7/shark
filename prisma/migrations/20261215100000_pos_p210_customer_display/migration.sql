-- POS P2.10 จอลูกค้า (จอที่ 2) — มติ 9 ของบรีฟ: เพิ่มอย่างเดียว · ตาราง POS ใหม่ 1 ตาราง + enum 1 ตัว · ไม่แตะตารางอื่น
-- id หลวม ไม่มี FK (deviceId = PosDevice.id · แบบ PosDevice/PosShift) ⇒ ทุกคำสั่ง IF NOT EXISTS ได้
-- partial unique 2 ตัว (prisma แสดง WHERE ไม่ได้): จอ ACTIVE ได้ 1 จอต่อเครื่อง · รหัสจับคู่ที่รออยู่ไม่ซ้ำกันทั้งตาราง
-- ภาพบิลล่าสุดอยู่บนแถวเดียวกัน (state + stateSeq) ⇒ 1 แถวต่อหน้าขาย ไม่โต ไม่ต้องมีงานกวาด
SET lock_timeout = '3s';

DO $$ BEGIN CREATE TYPE "PosCustomerDisplayStatus" AS ENUM ('ACTIVE', 'REVOKED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "PosCustomerDisplay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "PosCustomerDisplayStatus" NOT NULL DEFAULT 'ACTIVE',
    "tokenHash" TEXT,
    "pairCodeHash" TEXT,
    "pairCodeExpiresAt" TIMESTAMP(3),
    "pairFailCount" INTEGER NOT NULL DEFAULT 0,
    "showPoints" BOOLEAN NOT NULL DEFAULT true,
    "idleText" TEXT,
    "locale" TEXT,
    "state" JSONB,
    "stateSeq" INTEGER NOT NULL DEFAULT 0,
    "stateAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosCustomerDisplay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PosCustomerDisplay_tokenHash_key" ON "PosCustomerDisplay"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "PosCustomerDisplay_active_device_key" ON "PosCustomerDisplay"("deviceId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS "PosCustomerDisplay_pairCodeHash_key" ON "PosCustomerDisplay"("pairCodeHash") WHERE "pairCodeHash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PosCustomerDisplay_tenantId_unitId_status_idx" ON "PosCustomerDisplay"("tenantId", "unitId", "status");
