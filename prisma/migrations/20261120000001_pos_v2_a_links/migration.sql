-- POS P1.1a round 4 (E2) — คอลัมน์เชื่อม nullable 5 ตัวบนตารางเดิม (ต่อจาก 20261120000000_pos_v2_a)
-- 🔴 ไฟล์นี้ห้ามมีบล็อก plpgsql นิรนามหรือ dollar-quote: prisma 7.8 แยกไฟล์ที่ไม่มีสิ่งนี้ทีละคำสั่ง คนละ transaction (วัดบน QC4 round 4 ·
--    xid ของคอลัมน์ทั้ง 5 ต่างกัน) ⇒ ACCESS EXCLUSIVE ของแต่ละตารางถือแค่คำสั่งเดียว ไม่ใช่ทั้งไฟล์
-- metadata-only: nullable ไม่มี default ⇒ ไม่ rewrite ตาราง · ไม่สร้าง index (M1 — P6.1 ใช้ CREATE INDEX CONCURRENTLY นอก prisma migrate)
-- lock_timeout 3s ระดับ session (SET LOCAL ไม่มีผลเมื่อรันทีละคำสั่ง — วัดแล้ว round 2/3): รอล็อกเกิน 3s = P3018 → ดู runbook P6.1
-- รันซ้ำได้ (ADD COLUMN IF NOT EXISTS) ⇒ ล้มกลางไฟล์แล้วกู้ = ลบแถว _prisma_migrations ที่ล้ม (หรือ migrate resolve --rolled-back) แล้ว deploy ใหม่
SET lock_timeout = '3s';

-- AlterTable (M2: ตารางเดิม · metadata-only)
ALTER TABLE "ShopProduct" ADD COLUMN IF NOT EXISTS "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only)
ALTER TABLE "ShopOrderLine" ADD COLUMN IF NOT EXISTS "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only)
ALTER TABLE "PosSaleLine" ADD COLUMN IF NOT EXISTS "productId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only)
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only)
ALTER TABLE "RestaurantOrderItem" ADD COLUMN IF NOT EXISTS "productId" TEXT;

RESET lock_timeout;
