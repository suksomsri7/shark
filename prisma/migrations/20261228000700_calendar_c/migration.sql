-- calendar_c (มติเจ้าของ: ร้านคุมการส่งนัดลูกค้าเข้า Google ส่วนตัว) — additive · IF NOT EXISTS: ฐาน QC เลขาเคยลงไว้ในชื่อเดิม 20261228000500_calendar_c (เปลี่ยนเลขเพื่อเรียงหลัง calendar_q8)
CREATE TABLE IF NOT EXISTS "CalShopPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "allowBookingExport" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalShopPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CalShopPolicy_tenantId_key" ON "CalShopPolicy"("tenantId");
