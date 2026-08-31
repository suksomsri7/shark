-- WO-CW3 — แหล่งค่าใช้จ่าย AI ของระบบแชทลูกค้า (แยกจาก CHAT ของผู้ช่วยส่วนตัว)
-- แยกไฟล์จาก migration ที่ "ใช้" ค่าเหล่านี้ตามกติกาเดิมของรีโป:
-- PG12+ ห้ามใช้ค่า enum ใหม่ในทรานแซกชันเดียวกับที่เพิ่ม (unsafe use of new value)
ALTER TYPE "AiCreditSource" ADD VALUE 'CHAT_TRANSLATE';
ALTER TYPE "AiCreditSource" ADD VALUE 'CHAT_SUGGEST';
