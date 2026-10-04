-- POS P1.17 — รายงานพื้นฐาน: ผู้ขายของบิล (R6 · Q17.1) · additive ล้วน: คอลัมน์ nullable 1 คอลัมน์
-- ทั้งไฟล์ (ใต้ SET) = ผลของ `prisma migrate diff --from-schema <schema ก่อนแก้> --to-schema prisma/schema --script` ทุกบรรทัด (ไม่ต้องใช้ DB)
-- ไม่มี FK (User.id หลวมแบบ shiftId) · ไม่มี index (รายงานกรองบิลด้วย (tenantId, unitId, createdAt) ก่อน) · ไม่มี DROP/RENAME/SET NOT NULL
-- ADD COLUMN ที่ nullable ไม่มีค่าปริยาย = แก้แค่ catalog (ไม่ rewrite ตาราง) · lock_timeout กันรอล็อกนาน
SET lock_timeout = '3s';

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "soldByUserId" TEXT;
