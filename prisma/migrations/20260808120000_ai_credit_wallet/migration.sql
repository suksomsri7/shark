-- กระเป๋าเครดิตผู้ช่วย AI (prepaid) + ledger รายการเดินบัญชี
-- additive ล้วน: สร้าง type/table/index ใหม่ ไม่แตะของเดิม → ปลอดภัยบน prod
-- (โควตาต่อรอบเดิม AiUsage/AiUsageWindow ยังอยู่ ไม่ลบ — เลิกใช้เป็นตัวตัดสินเท่านั้น)

CREATE TYPE "AiCreditKind" AS ENUM ('GRANT', 'TOPUP', 'USAGE', 'REFUND', 'ADJUST');

CREATE TYPE "AiCreditSource" AS ENUM (
  'CHAT', 'SCHEDULED', 'WEEKLY_REPORT', 'DNA_INTERVIEW', 'AUTO_TITLE',
  'SUPPORT_DRAFT', 'TOPUP', 'GRANT', 'ADJUST'
);

CREATE TABLE "AiCreditWallet" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "balanceMicro" INTEGER NOT NULL DEFAULT 0,
  "grantedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiCreditWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCreditWallet_tenantId_key" ON "AiCreditWallet"("tenantId");

CREATE TABLE "AiCreditTxn" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "AiCreditKind" NOT NULL,
  "source" "AiCreditSource" NOT NULL,
  "amountMicro" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "model" TEXT,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "conversationId" TEXT,
  "userId" TEXT,
  "ref" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditTxn_pkey" PRIMARY KEY ("id")
);

-- กัน webhook เติมเงินยิงซ้ำแล้วเติมสองรอบ (ref เดียวกันในกิจการเดียวกัน = ครั้งเดียว)
CREATE UNIQUE INDEX "AiCreditTxn_tenantId_ref_key" ON "AiCreditTxn"("tenantId", "ref");
CREATE INDEX "AiCreditTxn_tenantId_createdAt_idx" ON "AiCreditTxn"("tenantId", "createdAt");
