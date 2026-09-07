-- K2.12 — ไมเกรชันชุด P2 ของ "บอร์ดงาน": ปิดหนี้ P2 — ชิป "โดยกฎอัตโนมัติ" ในความเห็นที่กฎเขียน
-- 🔴 เพิ่มอย่างเดียว (additive): ADD COLUMN nullable ตัวเดียว ไม่มี DROP · ไม่มี ALTER … TYPE
--    ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม ⇒ แถวเดิมของ KanbanComment ทุกแถวได้ค่า NULL = คนเขียนเอง
-- มาจาก `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script`
-- เทียบกับ DB จริงบน QC (ep-plain-art) — ตรวจ SQL ทั้งไฟล์ด้วยตาแล้ว ไม่มีคำสั่งทำลายข้อมูล

-- AlterTable
ALTER TABLE "KanbanComment" ADD COLUMN     "automationRuleId" TEXT;
