-- WO 5.1 (บัญชี V2 เฟส 5) — ช่องทางการเงิน V2: รหัสช่องทาง + ประเภทบัญชีธนาคาร + ใช้รับ/จ่าย +
-- ยอดยกมาหลายรายการ (AccountFinanceOpening) + โอนระหว่างช่องทางแบบกันซ้ำ (AccountFinanceTransfer)
-- additive ล้วน: เพิ่มคอลัมน์ nullable/มี default · เพิ่มตารางใหม่ 2 ตาราง · ไม่มี DROP/RENAME

-- AlterTable
ALTER TABLE "AccountFinance" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "bankBranch" TEXT,
ADD COLUMN     "bankSubtype" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "holderUserId" TEXT,
ADD COLUMN     "limitSatang" INTEGER,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "useForPay" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "useForReceive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AccountFinanceOpening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "financeId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "entryId" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountFinanceOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountFinanceTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "entryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountFinanceTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountFinanceOpening_systemId_financeId_idx" ON "AccountFinanceOpening"("systemId", "financeId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountFinanceOpening_financeId_seq_key" ON "AccountFinanceOpening"("financeId", "seq");

-- CreateIndex
CREATE INDEX "AccountFinanceTransfer_systemId_fromId_idx" ON "AccountFinanceTransfer"("systemId", "fromId");

-- CreateIndex
CREATE INDEX "AccountFinanceTransfer_systemId_toId_idx" ON "AccountFinanceTransfer"("systemId", "toId");

-- 🔴 partial unique index (prisma migrate diff มองไม่เห็น — ห้ามลบออกจากไฟล์นี้)
--    รหัสช่องทางการเงินห้ามซ้ำ "เฉพาะแถวที่ยังใช้งาน" — ช่องทางที่ปิดใช้งานแล้วปล่อยให้รหัสซ้ำได้
--    (เหตุผลเดียวกับ AccountContact_systemId_code_active_key / AccountProduct_systemId_code_active_key)
CREATE UNIQUE INDEX IF NOT EXISTS "AccountFinance_systemId_code_active_key"
  ON "AccountFinance"("systemId","code")
  WHERE "code" IS NOT NULL AND "archivedAt" IS NULL;
