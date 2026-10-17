-- POS P3.5 S ▸ R7 §3 สมุดค่าคอมฯ พนักงานขาย (PosStaffCommission) — เขียนมือ · ตารางใหม่ + enum ใหม่ + ดัชนีของตารางใหม่เท่านั้น
-- ไม่แตะตาราง POS/HR เดิม (ไม่มี FK · ไม่มีคอลัมน์ใหม่บน PosSale/HR) ⇒ ไม่มีล็อกบนตารางเดิม (ข้อสอบ ST3 รับเฉพาะ CREATE — ไม่ใส่ SET lock_timeout)

CREATE TYPE "PosStaffCommissionKind" AS ENUM ('ACCRUE', 'REVERSE');

CREATE TYPE "PosStaffCommissionStatus" AS ENUM ('OPEN', 'SENT');

CREATE TABLE "PosStaffCommission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PosStaffCommissionKind" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "baseSatang" INTEGER NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "fixedSatang" INTEGER NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "PosStaffCommissionStatus" NOT NULL DEFAULT 'OPEN',
    "hrSystemId" TEXT,
    "hrPayAdjustmentId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosStaffCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosStaffCommission_sourceKey_key" ON "PosStaffCommission"("sourceKey");

CREATE INDEX "PosStaffCommission_tenantId_userId_status_periodKey_idx" ON "PosStaffCommission"("tenantId", "userId", "status", "periodKey");

CREATE INDEX "PosStaffCommission_saleId_idx" ON "PosStaffCommission"("saleId");
