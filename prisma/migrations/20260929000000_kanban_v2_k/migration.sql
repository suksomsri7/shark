-- K1.14 — ไมเกรชันชุด K ของ "บอร์ดงาน": ที่เก็บ "การตั้งค่าส่วนตัวของผู้ใช้"
-- วันนี้ใช้เก็บค่าเดียว: `kanbanShortcuts` (เปิด/ปิดปุ่มลัดคีย์บอร์ด — แบบ §5.6 บังคับว่าต้องปิดได้)
--
-- 🔴 เพิ่มอย่างเดียว (additive): 1 คอลัมน์ nullable-safe (NOT NULL + DEFAULT) บนตารางเดิม
--    PostgreSQL 11+ เพิ่มคอลัมน์ที่มี DEFAULT คงที่โดย **ไม่ rewrite ตาราง** ⇒ ไม่ล็อกยาวบน prod
-- 🔴 IF NOT EXISTS: ไมเกรชันนี้ต้องรันซ้ำได้ (QC รันมือ · prod รันตอน Vercel build)
-- 🔴 `User` เป็นตารางระดับแพลตฟอร์ม (axis "global" ใน src/lib/core/scope.ts) — ตั้งใจ:
--    การตั้งค่า "การเข้าถึงได้" เป็นของ **คน** ไม่ใช่ของร้าน (คนเดียวเปิด 3 ร้าน ต้องตั้งครั้งเดียว)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "prefs" JSONB NOT NULL DEFAULT '{}';
