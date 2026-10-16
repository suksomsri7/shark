-- POS P3.4 ออฟไลน์ + /sync/sales (C-13 v2) — R1 ของบรีฟ (มติ 2 · CD-2): เพิ่มอย่างเดียว · เขียนมือ · ไม่มี enum ใหม่ (สถานะเป็น TEXT)
-- ① PosSale + offlineRef (เลขชั่วคราว OFF-C1-0007) · syncedAt (เวลาเซิร์ฟเวอร์ตอนซิงก์) — บิลเดิม = null
-- ② PosDevice + offlineCode (C<n> ต่อสาขา · ตั้งตอนออก snapshot ครั้งแรก) · offlineSeq (high-water ของเลข OFF ที่ซิงก์แล้ว)
-- ③ ตาราง PosOfflineSale (ทุกรายการที่ส่งมาซิงก์ · unique (tenantId, idempotencyKey)) · PosOfflineSnapshot (ราคาที่เครื่องได้ไป · tenantId/unitId CD-2)
-- ④ partial unique ที่ prisma แสดงไม่ได้: (unitId, offlineRef) ของบิล · (unitId, offlineCode) ของเครื่อง
-- หมายเหตุ: ไม่มี SET lock_timeout ในไฟล์นี้ — ข้อสอบ qc-pos-p3.4 ST1 รับเฉพาะ ALTER TABLE … ADD COLUMN / CREATE TABLE / CREATE INDEX
--   (ADD COLUMN แบบ null/DEFAULT ค่าคงที่ = แก้ metadata ทันทีบน PG ≥ 11 · ดัชนี PosSale ใหม่ทุกแถวเป็น null)

ALTER TABLE "PosSale" ADD COLUMN "offlineRef" TEXT, ADD COLUMN "syncedAt" TIMESTAMP(3);

ALTER TABLE "PosDevice" ADD COLUMN "offlineCode" TEXT, ADD COLUMN "offlineSeq" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PosOfflineSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "offlineRef" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "drift" JSONB,
    "saleId" TEXT,
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosOfflineSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosOfflineSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "priceMap" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PosOfflineSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosOfflineSale_tenantId_idempotencyKey_key" ON "PosOfflineSale"("tenantId", "idempotencyKey");
CREATE INDEX "PosOfflineSale_tenantId_unitId_status_soldAt_idx" ON "PosOfflineSale"("tenantId", "unitId", "status", "soldAt");
CREATE INDEX "PosOfflineSale_tenantId_unitId_offlineRef_idx" ON "PosOfflineSale"("tenantId", "unitId", "offlineRef");
CREATE UNIQUE INDEX "PosOfflineSnapshot_unitId_deviceId_hash_key" ON "PosOfflineSnapshot"("unitId", "deviceId", "hash");
CREATE INDEX "PosOfflineSnapshot_tenantId_unitId_deviceId_issuedAt_idx" ON "PosOfflineSnapshot"("tenantId", "unitId", "deviceId", "issuedAt");
CREATE UNIQUE INDEX "PosSale_unit_offlineRef_key" ON "PosSale"("unitId", "offlineRef") WHERE "offlineRef" IS NOT NULL;
CREATE UNIQUE INDEX "PosDevice_unit_offlineCode_key" ON "PosDevice"("unitId", "offlineCode") WHERE "offlineCode" IS NOT NULL;
