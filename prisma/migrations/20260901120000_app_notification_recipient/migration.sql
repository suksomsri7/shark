-- G11 (ปิดหนี้ PDPA 31 ส.ค. 2026) — AppNotification ต้องมี "ผู้รับ"
-- additive ล้วน: ADD COLUMN แบบ NULL ได้ + CREATE INDEX · ไม่มี DROP / NOT NULL / backfill
-- ⇒ แถวเดิมทุกแถวได้ NULL = "ประกาศทั้งร้าน" ซึ่งคือพฤติกรรมเดิมเป๊ะ
--   (จุดที่สร้างแจ้งเตือนระดับร้านอีก 10 กว่าจุด — automation/inventory/forms/shop/ai — ไม่ต้องแก้)
-- 🔴 ห้ามทำให้เป็น NOT NULL ในอนาคตโดยไม่ย้ายทุกจุดสร้างก่อน: ประกาศระดับร้านยังเป็นของที่ต้องมี

-- AlterTable
ALTER TABLE "AppNotification" ADD COLUMN     "recipientUserId" TEXT;

-- CreateIndex
CREATE INDEX "AppNotification_tenantId_recipientUserId_readAt_createdAt_idx" ON "AppNotification"("tenantId", "recipientUserId", "readAt", "createdAt");
