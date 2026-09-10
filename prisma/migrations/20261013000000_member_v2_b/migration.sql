-- M1.4 — ระบบสมาชิก v2 ชุด B (`member_v2_b`) · พิมพ์เขียว docs/modules/06-member-v2.md §4.1 §11.2
--
-- 🔴 additive ล้วน — ตรวจด้วยตาแล้วทั้งไฟล์: ไม่มี DROP / ALTER COLUMN ... TYPE / SET NOT NULL
--    คอลัมน์ใหม่ 2 ตัวเป็น nullable ⇒ แถวเดิมทุกแถวของทุกร้านทำงานเหมือนเดิมเป๊ะ
--
-- สิ่งที่เพิ่ม (หนี้ที่ยกมาจาก M1.2 — ดู ledger/wo-notes/member-M1.2.md ท้ายไฟล์)
--   • Customer.phone2 / Customer.facebook — ที่เก็บจริงของ "ฟิลด์ระบบ" 2 ตัวที่ตัวออกแบบฟิลด์
--     แสดงมาตั้งแต่ M1.1 แต่ยังบันทึกค่าไม่ได้ (fields.ts โยนข้อความไทยบอกตรง ๆ ว่ายังไม่มีที่เก็บ)
--   • MemberLookupTarget.USER — ปลายทางใหม่ของฟิลด์ชนิด "เชื่อมรายการ"
--     `Customer.ownerUserId` เก็บ **User.id** (บัญชีผู้ใช้ที่มี Membership ในร้าน) ไม่ใช่ HrEmployee.id
--     ⇒ ฟิลด์ระบบ "ผู้ดูแล" ต้องตรวจกับ Membership · สคริปต์ member-backfill-fields.mts ย้าย
--       options.target ของแถวเดิมจาก EMPLOYEE → USER ให้เอง (idempotent)
--
-- 🔴 `ALTER TYPE ... ADD VALUE` ข้างล่างต้องไม่ถูก "ใช้งาน" ใน migration เดียวกัน
--    (Postgres ห้ามใช้ค่า enum ที่เพิ่งเพิ่มภายใน transaction เดียวกัน) — ไฟล์นี้ไม่มีการใช้

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "phone2" TEXT;

-- AlterEnum
ALTER TYPE "MemberLookupTarget" ADD VALUE 'USER';
