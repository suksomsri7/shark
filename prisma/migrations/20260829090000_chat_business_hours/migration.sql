-- WO-C16 · เวลาทำการของแชท (ตั้งค่าได้จากฝั่ง SHARK แทนการฝังตายในโค้ดของร้าน)
-- additive ล้วน: ADD COLUMN แบบ NULL ได้ 1 คอลัมน์ · ไม่มี DROP / ALTER TYPE / NOT NULL / backfill
-- ⇒ แถวเดิมทุกแถวได้ NULL = "ยังไม่ได้ตั้งเวลาทำการ" ซึ่งคือพฤติกรรมเดิมเป๊ะ (API คืน businessHours: null)

ALTER TABLE "ChatSetting" ADD COLUMN "businessHours" JSONB;
