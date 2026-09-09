-- K3.5 — ไมเกรชันชุด S ของ "บอร์ดงาน": ความเห็นที่ผู้ช่วย AI เขียน + ชนิดกิจกรรม AI_SUGGESTED
-- 🔴 เพิ่มอย่างเดียว (additive): ADD VALUE ของ enum + ADD COLUMN ที่มี DEFAULT
--    ไม่มี DROP · ไม่มี ALTER … TYPE ของคอลัมน์เดิม ⇒ แถวเดิมของ KanbanComment ได้ aiGenerated = false
-- มาจาก `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script`
-- เทียบกับ DB จริงบน QC (ep-plain-art) — ตรวจ SQL ทั้งไฟล์ด้วยตาแล้ว ไม่มีคำสั่งทำลายข้อมูล

-- AlterEnum
-- PostgreSQL 12+ เพิ่มค่าใน transaction ได้ · ค่าใหม่ถูกใช้จริงครั้งแรกที่ runtime คนละ transaction
-- กับไมเกรชันนี้ จึงไม่ติดข้อจำกัด "ใช้ค่าใหม่ใน tx เดียวกันไม่ได้" (แบบเดียวกับ kanban_v2_r)
ALTER TYPE "KanbanActivityType" ADD VALUE IF NOT EXISTS 'AI_SUGGESTED';

-- AlterTable
ALTER TABLE "KanbanComment" ADD COLUMN IF NOT EXISTS "aiGenerated" BOOLEAN NOT NULL DEFAULT false;
