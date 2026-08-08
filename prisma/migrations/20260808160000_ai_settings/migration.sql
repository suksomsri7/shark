-- ตั้งค่าผู้ช่วย AI ระดับกิจการ — เริ่มด้วยสวิตช์รายงานธุรกิจรายสัปดาห์
-- ค่าเริ่มต้น false = ปิด · ร้านที่ไม่เคยตั้งค่าจะไม่ถูกหักเครดิตจากงานที่ตัวเองไม่ได้สั่ง
-- additive ล้วน ปลอดภัยบน prod
CREATE TABLE "AiSettings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "weeklyReportEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiSettings_tenantId_key" ON "AiSettings"("tenantId");
