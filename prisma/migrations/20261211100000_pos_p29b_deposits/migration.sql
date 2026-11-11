-- POS P2.9b มัดจำเป็นวิธีชำระของ POS (มติ 2 CD2-A · §3 ของบรีฟ) — เพิ่มอย่างเดียว · ตาราง POS ใหม่ 2 ตาราง · ไม่แตะตารางอื่น
-- ไม่มี FK เลย (id หลวม · ไม่ไป PosSale / PosPayment / Customer และไม่มีระหว่างสองตารางนี้) ⇒ ทุกคำสั่ง IF NOT EXISTS ได้
-- CHECK: ยอดใช้ + ยอดคืน ไม่เกินยอดมัดจำ (คงเหลือ ≥ 0) · ไม่มีการเปลี่ยนตาราง PosSale/PosPayment (CD2-A — อ้างใบรับด้วย payMethods[].refSaleId เดิม)
SET lock_timeout = '3s';

DO $$ BEGIN CREATE TYPE "PosDepositStatus" AS ENUM ('OPEN', 'USED', 'REFUNDED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PosDepositTxnType" AS ENUM ('RECEIVE', 'APPLY', 'RESTORE', 'REFUND'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "PosDeposit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "phoneMasked" TEXT,
    "phoneLast4" TEXT,
    "amountSatang" INTEGER NOT NULL,
    "vatSatang" INTEGER NOT NULL DEFAULT 0,
    "usedSatang" INTEGER NOT NULL DEFAULT 0,
    "refundedSatang" INTEGER NOT NULL DEFAULT 0,
    "status" "PosDepositStatus" NOT NULL DEFAULT 'OPEN',
    "receiptSaleId" TEXT NOT NULL,
    "receiptNo" TEXT,
    "note" TEXT,
    "reference" TEXT,
    "expiresAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosDeposit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PosDeposit_balance_check" CHECK ("amountSatang" > 0 AND "vatSatang" >= 0 AND "usedSatang" >= 0 AND "refundedSatang" >= 0 AND "usedSatang" + "refundedSatang" <= "amountSatang")
);

CREATE TABLE IF NOT EXISTS "PosDepositTxn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "type" "PosDepositTxnType" NOT NULL,
    "satang" INTEGER NOT NULL,
    "vatSatang" INTEGER NOT NULL DEFAULT 0,
    "saleId" TEXT,
    "paymentId" TEXT,
    "refTxnId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PosDepositTxn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PosDeposit_receiptSaleId_key" ON "PosDeposit"("receiptSaleId");
CREATE UNIQUE INDEX IF NOT EXISTS "PosDeposit_tenantId_idempotencyKey_key" ON "PosDeposit"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "PosDeposit_tenantId_unitId_status_createdAt_idx" ON "PosDeposit"("tenantId", "unitId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PosDeposit_tenantId_customerId_idx" ON "PosDeposit"("tenantId", "customerId");
CREATE UNIQUE INDEX IF NOT EXISTS "PosDepositTxn_idempotencyKey_key" ON "PosDepositTxn"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "PosDepositTxn_depositId_idx" ON "PosDepositTxn"("depositId");
CREATE INDEX IF NOT EXISTS "PosDepositTxn_saleId_idx" ON "PosDepositTxn"("saleId");
