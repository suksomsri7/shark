-- POS P2.6 S fix2 (รีวิว R2 G1 · ล่า N2 · มติ fix2-1 14 ต.ค.): เวลาที่ตั้ง/เปลี่ยนสถานีครัวของสินค้า (PosProduct.stationId) — heal ตัดสินจากเวลานี้ ไม่ใช่ updatedAt
-- เพิ่มอย่างเดียว · null = ไม่เคยเปลี่ยนหลังสร้าง (heal ใช้ createdAt แทน)
SET lock_timeout = '3s';
ALTER TABLE "PosProduct" ADD COLUMN IF NOT EXISTS "stationSetAt" TIMESTAMP(3);
RESET lock_timeout;
