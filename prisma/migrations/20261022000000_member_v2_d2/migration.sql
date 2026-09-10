-- M2.4 (member_v2_d2) — รางวัล v2: Reward +cols · RewardRedemption +cols
-- additive ล้วน (CREATE TYPE + ADD COLUMN ที่มี DEFAULT ปลอดภัยกับแถวเดิม) — ไม่แตะ/ลบคอลัมน์เดิมของ v1
-- ledger/MEMBER-RUN.md §2 M2.4 · §4 มติ Fable 10 ก.ย. 2569 (ใบนี้ต้องมี migration) · พิมพ์เขียว §4.1 §4.2
--
-- idempotencyKey: nullable + unique(tenantId, idempotencyKey) — กันแลกซ้ำจากปุ่มกดรัว/รีเฟรชแล้วกดซ้ำ
-- (แถว v1 เดิมไม่มีค่านี้ → NULL หลายแถวชนกันไม่ได้ เพราะ Postgres unique index อนุญาต NULL ซ้ำได้)

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('ITEM', 'SERVICE', 'VOUCHER', 'DISCOUNT');

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "imageFileId" TEXT,
ADD COLUMN     "kind" "RewardKind" NOT NULL DEFAULT 'ITEM',
ADD COLUMN     "perMemberMonthly" INTEGER,
ADD COLUMN     "pickupDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "showToCustomer" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stampCardId" TEXT,
ADD COLUMN     "stampsCost" INTEGER,
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "tierDefIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unitIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "RewardRedemption" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "fulfilledById" TEXT,
ADD COLUMN     "fulfilledUnitId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "qrCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RewardRedemption_qrCode_key" ON "RewardRedemption"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "RewardRedemption_tenantId_idempotencyKey_key" ON "RewardRedemption"("tenantId", "idempotencyKey");
