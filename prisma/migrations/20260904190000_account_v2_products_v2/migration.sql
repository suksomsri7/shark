-- WO 4.3 (บัญชี V2 เฟส 4) — สินค้า/บริการ V2 + หน่วย + รายการจัดชุด + ใบเบิก/ส่งคืน/ปรับต้นทุน
-- additive ล้วน: เพิ่ม enum value · เพิ่มคอลัมน์ nullable/มี default · เพิ่มตารางใหม่ 2 ตาราง · ไม่มี DROP/RENAME

-- AlterEnum
ALTER TYPE "AccountDocType" ADD VALUE IF NOT EXISTS 'COST_ADJUSTMENT';

-- AlterEnum
ALTER TYPE "AccountProductType" ADD VALUE IF NOT EXISTS 'BUNDLE';

-- AlterTable
ALTER TABLE "AccountDocument" ADD COLUMN     "adjustAccountCode" TEXT;

-- AlterTable
ALTER TABLE "AccountDocumentLine" ADD COLUMN     "unitCost" INTEGER;

-- AlterTable
ALTER TABLE "AccountProduct" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "bookingDepositSatang" INTEGER,
ADD COLUMN     "bookingDurationMin" INTEGER,
ADD COLUMN     "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "cogsAccountCode" TEXT,
ADD COLUMN     "costMethod" TEXT NOT NULL DEFAULT 'AVG',
ADD COLUMN     "defaultWhtRateBp" INTEGER,
ADD COLUMN     "defaultWhtType" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "imageUrls" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "inventoryAccountCode" TEXT,
ADD COLUMN     "posCategory" TEXT,
ADD COLUMN     "posEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "posPrice" INTEGER,
ADD COLUMN     "purchaseVatRateBp" INTEGER;

-- AlterTable
ALTER TABLE "AccountUnit" ADD COLUMN     "code" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- CreateTable
CREATE TABLE "AccountProductBundleItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "bundleProductId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "qty" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unitId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountProductBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountProductOpeningLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "lotDate" TIMESTAMP(3) NOT NULL,
    "qty" DECIMAL(12,4) NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "warehouseId" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountProductOpeningLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountProductBundleItem_systemId_bundleProductId_idx" ON "AccountProductBundleItem"("systemId", "bundleProductId");

-- CreateIndex
CREATE INDEX "AccountProductBundleItem_systemId_componentProductId_idx" ON "AccountProductBundleItem"("systemId", "componentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountProductBundleItem_bundleProductId_componentProductId_key" ON "AccountProductBundleItem"("bundleProductId", "componentProductId");

-- CreateIndex
CREATE INDEX "AccountProductOpeningLot_systemId_productId_idx" ON "AccountProductOpeningLot"("systemId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountProductOpeningLot_productId_seq_key" ON "AccountProductOpeningLot"("productId", "seq");

-- CreateIndex
CREATE INDEX "AccountProduct_systemId_code_idx" ON "AccountProduct"("systemId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AccountUnit_systemId_code_key" ON "AccountUnit"("systemId", "code");


-- 🔴 partial unique index (prisma migrate diff มองไม่เห็น — ห้ามลบออกจากไฟล์นี้)
--    เลขที่สินค้าห้ามซ้ำ "เฉพาะแถวที่ยังใช้งาน" — สินค้าที่ปิดใช้งานแล้วปล่อยให้เลขซ้ำได้
--    (เหตุผลเดียวกันเป๊ะกับ AccountContact_systemId_code_active_key ของ WO 3.3)
CREATE UNIQUE INDEX IF NOT EXISTS "AccountProduct_systemId_code_active_key"
  ON "AccountProduct"("systemId","code")
  WHERE "code" IS NOT NULL AND "archivedAt" IS NULL;
