-- WO-CV2 P3 — เพิ่มค่า AUDIO ใน enum ChatMessageType (ข้อความเสียง)
--
-- 🔴 ทำไมแยก migration ออกมาจากการเพิ่มตาราง/คอลัมน์ (บทเรียน 31 ส.ค. 2026)
--    ไม่ใช่เพราะ Postgres รัน ALTER TYPE ในทรานแซกชันไม่ได้ (Neon เป็น PG 18 ทำได้แล้ว)
--    แต่เพราะ **ห้าม _ใช้_ ค่าใหม่ของ enum ในทรานแซกชันเดียวกับที่เพิ่มค่านั้น**
--    ⇒ วันไหนที่ migration ต้อง backfill ข้อมูลด้วยค่าใหม่ (เช่น UPDATE ... SET type='AUDIO')
--      มันจะพังกลางคันบน prod โดยที่เครื่อง dev ไม่เคยฟ้อง เพราะ dev ไม่มีข้อมูลให้ backfill
--    แยกไฟล์ = ค่าใหม่ commit จบก่อนเสมอ ปลอดภัยทุกกรณี
ALTER TYPE "ChatMessageType" ADD VALUE 'AUDIO';
