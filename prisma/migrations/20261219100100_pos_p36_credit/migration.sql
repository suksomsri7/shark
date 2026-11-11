-- POS P3.6 S ▸ §3 R4 R5 ลูกค้าองค์กรบนบิล + บัญชีเครดิต (PosCreditAccount) — เขียนมือ · เพิ่มล้วน
-- PosSale: คอลัมน์ nullable ไม่มี DEFAULT ไม่มี index (P6.1 CONCURRENTLY) ⇒ ล็อกสั้น (metadata-only) · บิลเดิม = null = พฤติกรรมเดิม
SET lock_timeout = '5s';

ALTER TABLE "PosSale" ADD COLUMN "customerPartyId" TEXT, ADD COLUMN "crmDealId" TEXT, ADD COLUMN "creditTerms" JSONB;

CREATE TABLE "PosCreditAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "limitSatang" INTEGER NOT NULL,
    "termDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosCreditAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosCreditAccount_systemId_partyId_key" ON "PosCreditAccount"("systemId", "partyId");

CREATE INDEX "PosCreditAccount_tenantId_idx" ON "PosCreditAccount"("tenantId");
