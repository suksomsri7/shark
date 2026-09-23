-- ai_credit_crm_assist — CRM v2 ใบ C2.0 (ส่วนเพิ่มของผู้คุมงาน 19 ก.ย. 2569 · ข้อสอบ C2.4 ต้องใช้)
-- ช่องเครดิต AI ของงาน CRM (ถอดเสียงสาย · อ่านนามบัตร · สรุปแชท · ร่างอีเมล · คะแนน) แยกจาก MEMBER_ASSIST
--   ให้เจ้าของเห็นว่า "ค่า AI ของงาน CRM" เท่าไร
-- แยกโฟลเดอร์จาก crm_v2_b เพราะ QC2 apply crm_v2_b ไปแล้ว (แก้ไฟล์เดิม = checksum ไม่ตรง)
-- 🔴 ชื่อโฟลเดอร์ห้ามมี "_crm_v2_" — ข้อสอบ qc-crm-c2.0 S1.1 (R-C.1) นับทุกโฟลเดอร์ที่มี _crm_v2_ แต่ไม่ลงท้าย a/b/c เป็นความผิด
-- additive ล้วน: ADD VALUE ค่าใหม่ 1 ค่า · ไม่มีคอลัมน์ไหนใช้ค่านี้เป็น default/cast/เงื่อนไข (Postgres ห้ามใช้ใน tx เดียวกัน)

-- AlterEnum
ALTER TYPE "AiCreditSource" ADD VALUE 'CRM_ASSIST';
