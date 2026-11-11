-- POS P1.10 — ทะเบียนเครื่องขาย (มติ R1 · ledger/pos-briefs/pos-brief-P1.10.md) · additive ล้วน: enum ใหม่ 1 + ตารางใหม่ 1 + ดัชนี 2
-- ทั้งไฟล์ (ใต้หัวนี้) = ผลของ `prisma migrate diff --from-schema <prisma/schema ที่ 2d1d69c2 (ก่อน P1.10)> --to-schema prisma/schema --script`
--   ทุกบรรทัด (ไม่ใช้ DB เป็นต้นทาง — QC4 มีของใบอื่นที่ยังไม่ merge อยู่ร่วม)
-- ไม่มี FK (id หลวมแบบ PosShift) · ไม่แตะตารางเดิมใด ๆ · ไม่มี DROP/ALTER/SET (ข้อสอบ ST2: CREATE TYPE/TABLE/INDEX เท่านั้น)
-- ตารางใหม่ว่าง ⇒ CREATE INDEX ไม่ล็อกนาน

-- CreateEnum
CREATE TYPE "PosDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "PosDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "status" "PosDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "registeredByUserId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "posRegNo" TEXT,
    "printerConfig" JSONB,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosDevice_tenantId_unitId_status_idx" ON "PosDevice"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PosDevice_unitId_deviceCode_key" ON "PosDevice"("unitId", "deviceCode");

