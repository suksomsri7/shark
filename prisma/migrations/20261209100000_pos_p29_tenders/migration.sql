-- POS P2.9 — บัตรของขวัญ/เครดิตร้านเป็นวิธีชำระ (brief §3 · มติผู้คุมงาน 1 5 6) · เพิ่มล้วน · เขียนมือ
--   PosPayType + GIFT_CARD, STORE_CREDIT · PosPayment.giftCardId/giftCardTxnId (id หลวม ไม่มี FK — metadata ของแถวชำระ) ·
--   GiftCardKind (GIFT | STORE_CREDIT) + GiftCard.kind (ปริยาย GIFT = บัตรเดิมทุกใบ) · เครดิตร้าน 1 ใบต่อ (ระบบสมาชิก, ลูกค้า)
-- 🔴 ไม่มี DROP/RENAME/UPDATE/DELETE · คอลัมน์ใหม่ nullable หรือ default ค่าคงที่ ⇒ metadata-only (ไม่ rewrite ตาราง)
-- 🔴 มัดจำ (PosDeposit · PosPayment.depositId) = P2.9b (มติ 6) — ไม่อยู่ในไฟล์นี้
-- 🔴 ค่า enum ใหม่ของ PosPayType ไม่ถูกใช้ในไฟล์นี้ (ADD VALUE ใช้ใน tx เดียวกันไม่ได้) · GiftCardKind สร้างใหม่ทั้งชนิด ⇒ ใช้ใน DEFAULT/index ได้
--    ทุกคำสั่งรันซ้ำได้ (IF NOT EXISTS / DO-block ตรวจ pg_type)
SET lock_timeout = '3s';

-- AlterEnum
ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'GIFT_CARD';
ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'STORE_CREDIT';

-- AlterTable (แถวชำระ ↔ บัตร/รายการบัตร)
ALTER TABLE "PosPayment" ADD COLUMN IF NOT EXISTS "giftCardId" TEXT, ADD COLUMN IF NOT EXISTS "giftCardTxnId" TEXT;

-- CreateEnum (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'GiftCardKind' AND n.nspname = current_schema()) THEN
    CREATE TYPE "GiftCardKind" AS ENUM ('GIFT', 'STORE_CREDIT');
  END IF;
END
$$;

-- AlterTable (บัตรเดิมทุกใบ = GIFT)
ALTER TABLE "GiftCard" ADD COLUMN IF NOT EXISTS "kind" "GiftCardKind" NOT NULL DEFAULT 'GIFT';

-- CreateIndex (เครดิตร้าน 1 ใบต่อสมาชิกต่อระบบสมาชิก · partial — Prisma schema ประกาศไม่ได้ ⇒ อยู่ที่นี่ที่เดียว)
CREATE UNIQUE INDEX IF NOT EXISTS "GiftCard_storeCredit_owner_key" ON "GiftCard"("systemId", "ownerCustomerId") WHERE "kind" = 'STORE_CREDIT';
