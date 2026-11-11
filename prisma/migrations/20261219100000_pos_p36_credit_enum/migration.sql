-- POS P3.6 S ▸ §3 มติ 9 วิธีชำระใหม่ ON_ACCOUNT (วางบิล/เครดิตเทอม → ใบแจ้งหนี้ AR) — เขียนมือ · โฟลเดอร์ของตัวเอง
-- ADD VALUE ใช้ในธุรกรรมเดียวกันกับคำสั่งที่อ้างค่าใหม่ไม่ได้ ⇒ แยกไฟล์ก่อนตาราง (timestamp ก่อน) · ไม่ใช่ STORE_CREDIT (เครดิตร้านของสมาชิก)
SET lock_timeout = '5s';

ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'ON_ACCOUNT';
