-- POS P2.7 QR สั่ง / สั่งล่วงหน้าจ่ายก่อน — R1 ของบรีฟ (มติ 8 10 12): เพิ่มอย่างเดียว · เขียนมือ · ไม่แตะ schema ร้านอาหาร
-- ① สถานะชำระของออเดอร์ + PENDING_PAYMENT (รอเงินเข้า) · PREPAID (เงินเข้าแล้ว ยังไม่มีบิล) · adapter + QR (ช่องทาง builtin QR_ORDER)
-- ② PosOrder + payBy (หมดเวลาจ่าย) · paidAt · customerClaimAt (ลูกค้ากด "โอนแล้ว") · paymentIntentId · publicToken (หน้าสถานะ /q/o/<token> · 12 ตัว)
-- ③ PosPaymentIntent + orderId · deviceId/createdByUserId เป็น null ได้ (ใบของออเดอร์สาธารณะไม่มีเครื่อง/ผู้สร้าง — CD5)
-- ④ ตาราง PosOrderLink (ลิงก์สั่งล่วงหน้า 16 ตัว · ACTIVE ได้ 1 ต่อสาขา = partial unique ที่ prisma แสดงไม่ได้) · id หลวม ไม่มี FK
SET lock_timeout = '3s';

ALTER TYPE "PosOrderPaymentState" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "PosOrderPaymentState" ADD VALUE IF NOT EXISTS 'PREPAID';
ALTER TYPE "SalesChannelAdapter" ADD VALUE IF NOT EXISTS 'QR';

ALTER TABLE "PosOrder" ADD COLUMN IF NOT EXISTS "payBy" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "customerClaimAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "paymentIntentId" TEXT, ADD COLUMN IF NOT EXISTS "publicToken" TEXT;

ALTER TABLE "PosPaymentIntent" ADD COLUMN IF NOT EXISTS "orderId" TEXT, ALTER COLUMN "deviceId" DROP NOT NULL, ALTER COLUMN "createdByUserId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "PosOrderLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosOrderLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PosOrder_publicToken_key" ON "PosOrder"("publicToken");
CREATE INDEX IF NOT EXISTS "PosOrder_tenantId_unitId_paymentState_payBy_idx" ON "PosOrder"("tenantId", "unitId", "paymentState", "payBy");
CREATE INDEX IF NOT EXISTS "PosPaymentIntent_orderId_idx" ON "PosPaymentIntent"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "PosOrderLink_token_key" ON "PosOrderLink"("token");
CREATE INDEX IF NOT EXISTS "PosOrderLink_tenantId_unitId_status_idx" ON "PosOrderLink"("tenantId", "unitId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "PosOrderLink_active_unit_key" ON "PosOrderLink"("tenantId", "unitId") WHERE "status" = 'ACTIVE';
