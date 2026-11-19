-- lekaa_fab (15 พ.ย. เจ้าของอนุมัติแบบ fab6) — additive · IF NOT EXISTS (ลงซ้ำได้)
-- AiRoom.pageContext = หน้าที่ผู้ใช้เปิดอยู่ตอนสั่งงาน (ตรวจสิทธิ์แล้ว) · AiRoom.hiddenAt = ผู้เปิดห้องปัดลบ (soft delete)
ALTER TABLE "AiRoom" ADD COLUMN IF NOT EXISTS "pageContext" JSONB;
ALTER TABLE "AiRoom" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
