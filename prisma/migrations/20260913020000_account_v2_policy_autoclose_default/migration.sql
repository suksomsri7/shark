-- WO 8.2 (รอบตีกลับ 2) — "ปิดงวดอัตโนมัติ" ต้องเปิดโดยปริยาย
--
-- 🔴 migration ก่อนหน้า (…_autoclose_backfill) แก้เฉพาะ **แถวที่มีอยู่ ณ วันอัปเกรด**
--    แถว AccountSettings ที่สร้างใหม่หลังจากนั้นยังได้ default = false ⇒ ร้านใหม่เสียฟีเจอร์เดิมไปเงียบ ๆ
--    (ก่อน WO 8.2 ตัวกวาดปิดงวดให้ทุกระบบบัญชีโดยไม่มีสวิตช์เลย)
-- ⇒ เปลี่ยน default ของคอลัมน์เป็น true · additive ล้วน ไม่แตะข้อมูลเดิม
--    (ร้านที่ตั้งใจปิดสวิตช์ไว้เองยังเป็น false เหมือนเดิม — คำสั่งนี้ไม่ UPDATE แถวใด)
ALTER TABLE "AccountSettings" ALTER COLUMN "autoClosePeriods" SET DEFAULT true;
