-- POS P2.6 S fix1 (รีวิว H1 · มติ addendum 14 ต.ค.): จำนวนที่รอบครัวหักตัวนับเมนูได้จริง (ตัวนับหักแบบไม่ติดลบ) — คืนตอน void/ยกเลิกเท่านี้
-- เพิ่มอย่างเดียว · null = รอบก่อนคอลัมน์นี้ / รอบประตูเดิม (คืนตามทางเดิม)
SET lock_timeout = '3s';
ALTER TABLE "RestaurantOrderItem" ADD COLUMN IF NOT EXISTS "stockTaken" INTEGER;
RESET lock_timeout;
