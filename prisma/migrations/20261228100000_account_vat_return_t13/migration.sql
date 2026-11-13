-- ACC T1.3 ภ.พ.30 ครบช่อง — เพิ่มอย่างเดียว (ไม่แก้/ลบคอลัมน์เดิม · แถวเดิมใช้ได้ทันที)

-- ภาพตัวเลขที่ยื่น (แบบต้นฉบับ)
ALTER TABLE "AccountVatFiling" ADD COLUMN "lines" JSONB;
ALTER TABLE "AccountVatFiling" ADD COLUMN "creditBroughtForwardSatang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AccountVatFiling" ADD COLUMN "excessChoice" TEXT;
ALTER TABLE "AccountVatFiling" ADD COLUMN "netSatang" INTEGER;

-- แบบยื่นเพิ่มเติม
CREATE TABLE "AccountVatAdditionalFiling" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filedById" TEXT,
    "lines" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "excessChoice" TEXT,
    "netSatang" INTEGER NOT NULL,
    "diffNetSatang" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountVatAdditionalFiling_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountVatAdditionalFiling_systemId_periodKey_seq_key" ON "AccountVatAdditionalFiling"("systemId", "periodKey", "seq");
CREATE INDEX "AccountVatAdditionalFiling_tenantId_systemId_idx" ON "AccountVatAdditionalFiling"("tenantId", "systemId");

-- เครดิตยกมาที่ร้านแก้เอง (ประวัติ)
CREATE TABLE "AccountVatCreditCarry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "amountSatang" INTEGER,
    "reason" TEXT NOT NULL,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountVatCreditCarry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountVatCreditCarry_systemId_periodKey_idx" ON "AccountVatCreditCarry"("systemId", "periodKey");
CREATE INDEX "AccountVatCreditCarry_tenantId_systemId_idx" ON "AccountVatCreditCarry"("tenantId", "systemId");
