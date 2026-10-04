-- POS P1.6 (จอชำระเงิน · ฝั่งเซิร์ฟเวอร์) — เพิ่มล้วน: enum CARD + คอลัมน์ใหม่ 7 ตัวบนตารางเดิม (ต่อจาก 20261120000001_pos_v2_a_links)
-- ที่มา: `prisma migrate diff --from-config-datasource (QC4) --to-schema prisma/schema --script` แล้วตัด 3 บรรทัด DROP INDEX
--   (CrmContact_previousEmails_idx · CrmContact_systemId_createdAt_id_idx · CustomRecord_objectId_createdAt_id_idx)
--   = drift ของ crm_perf_indexes ที่ QC4 สืบทอดมา ไม่ใช่ของใบนี้ — ห้ามลบ
-- 🔴 ADD VALUE / ADD COLUMN เท่านั้น ไม่มี DROP/RENAME · คอลัมน์ nullable หรือ default ค่าคงที่ ⇒ metadata-only (PG11+ ไม่ rewrite ตาราง)
-- lock_timeout ระดับ session (prisma รันทีละคำสั่ง — บทเรียน P1.1a round 2) · IF NOT EXISTS ⇒ รันซ้ำได้หลังล้มกลางไฟล์
SET lock_timeout = '3s';

-- AlterEnum (ห้ามใช้ค่าใหม่ใน tx เดียวกัน — ไฟล์นี้ไม่ใช้)
ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'CARD';

-- AlterTable: เงินรับ/ทอน (แถว CASH) + เลขอ้างอิงบัตร/EDC
ALTER TABLE "PosPayment" ADD COLUMN IF NOT EXISTS "changeSatang" INTEGER,
ADD COLUMN IF NOT EXISTS "reference" TEXT,
ADD COLUMN IF NOT EXISTS "tenderedSatang" INTEGER;

-- AlterTable: หมายเหตุบิล · ค่าบริการ · ทิป
ALTER TABLE "PosSale" ADD COLUMN IF NOT EXISTS "note" TEXT,
ADD COLUMN IF NOT EXISTS "serviceChargeSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "tipSatang" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: หมายเหตุบรรทัด
ALTER TABLE "PosSaleLine" ADD COLUMN IF NOT EXISTS "note" TEXT;

RESET lock_timeout;
