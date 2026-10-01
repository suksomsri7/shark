-- POS P1.1a — แคตตาล็อกเดียว (PosProduct · PosCategory · PosProductOptionGroup · RecipeLine) + คอลัมน์เชื่อม nullable 5 ตัว
-- 🔴 additive ล้วน: ไม่มี DROP/RENAME · คอลัมน์ใหม่บนตารางเดิมเป็น nullable ทั้งหมด (ไม่มี default ⇒ ไม่ rewrite ตาราง)
--    · index ธรรมดา (prisma migrate รัน CONCURRENTLY ใน tx ไม่ได้ — REVIEW §6 แถว 14) · FK มีเฉพาะระหว่างตารางใหม่กันเอง
--    · ไม่แตะ enum InvItemKind (มติ R1) · unique (systemId, invItemId): Postgres ถือ NULL ไม่ซ้ำกัน ⇒ เมนู/สินค้าเว็บล้วน (invItemId null) หลายแถวได้
-- ตั้งชื่อเวลา 20261120… = หลัง migration ล่าสุดของทุกสาขาบน origin (main 20261102 · session/crm 20261103 · wip/crm-c54c-r8 20261104) + เผื่อ
--   ผู้คุมงานเปลี่ยนชื่อโฟลเดอร์ได้ตอน merge (ไม่มีอะไรอ้างชื่อนี้)
-- rollback (ไม่ทำลายของเดิม): ดู ledger/wo-notes/pos-P1.1a.md §A7

-- CreateEnum
CREATE TYPE "PosProductKind" AS ENUM ('PRODUCT', 'SERVICE', 'MENU', 'BUNDLE');

-- AlterTable
ALTER TABLE "ShopProduct" ADD COLUMN     "posProductId" TEXT;

-- AlterTable
ALTER TABLE "ShopOrderLine" ADD COLUMN     "posProductId" TEXT;

-- AlterTable
ALTER TABLE "PosSaleLine" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "posProductId" TEXT;

-- AlterTable
ALTER TABLE "RestaurantOrderItem" ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "PosCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TEXT,
    "availableTo" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT,
    "invItemId" TEXT,
    "parentId" TEXT,
    "kind" "PosProductKind" NOT NULL DEFAULT 'PRODUCT',
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "categoryId" TEXT,
    "basePriceSatang" INTEGER,
    "vatRateBp" INTEGER,
    "barcode" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "trackStock" BOOLEAN NOT NULL DEFAULT false,
    "unavailableUnitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stationId" TEXT,
    "stockQty" INTEGER,
    "dailyStockQty" INTEGER,
    "isOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosProductOptionGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosProductOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "invItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosCategory_tenantId_idx" ON "PosCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PosCategory_systemId_unitId_name_key" ON "PosCategory"("systemId", "unitId", "name");

-- CreateIndex
CREATE INDEX "PosProduct_tenantId_idx" ON "PosProduct"("tenantId");

-- CreateIndex
CREATE INDEX "PosProduct_systemId_unitId_archivedAt_idx" ON "PosProduct"("systemId", "unitId", "archivedAt");

-- CreateIndex
CREATE INDEX "PosProduct_systemId_barcode_idx" ON "PosProduct"("systemId", "barcode");

-- CreateIndex
CREATE INDEX "PosProduct_parentId_idx" ON "PosProduct"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "PosProduct_systemId_invItemId_key" ON "PosProduct"("systemId", "invItemId");

-- CreateIndex
CREATE INDEX "PosProductOptionGroup_tenantId_idx" ON "PosProductOptionGroup"("tenantId");

-- CreateIndex
CREATE INDEX "PosProductOptionGroup_groupId_idx" ON "PosProductOptionGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PosProductOptionGroup_productId_groupId_key" ON "PosProductOptionGroup"("productId", "groupId");

-- CreateIndex
CREATE INDEX "RecipeLine_tenantId_idx" ON "RecipeLine"("tenantId");

-- CreateIndex
CREATE INDEX "RecipeLine_invItemId_idx" ON "RecipeLine"("invItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_productId_invItemId_key" ON "RecipeLine"("productId", "invItemId");

-- CreateIndex
CREATE INDEX "ShopProduct_posProductId_idx" ON "ShopProduct"("posProductId");

-- CreateIndex
CREATE INDEX "ShopOrderLine_posProductId_idx" ON "ShopOrderLine"("posProductId");

-- CreateIndex
CREATE INDEX "PosSaleLine_productId_idx" ON "PosSaleLine"("productId");

-- CreateIndex
CREATE INDEX "MenuItem_posProductId_idx" ON "MenuItem"("posProductId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_productId_idx" ON "RestaurantOrderItem"("productId");

-- AddForeignKey
ALTER TABLE "PosProduct" ADD CONSTRAINT "PosProduct_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PosProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosProduct" ADD CONSTRAINT "PosProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PosCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosProductOptionGroup" ADD CONSTRAINT "PosProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

