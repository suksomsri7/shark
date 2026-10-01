-- POS P1.1a — แคตตาล็อกเดียว (PosProduct · PosCategory · PosProductOptionGroup · RecipeLine) + คอลัมน์เชื่อม nullable 5 ตัว · round 2 (เขียนใหม่ทั้งไฟล์)
-- 🔴 additive ล้วน: ไม่มี DROP/RENAME/SET NOT NULL · FK เฉพาะระหว่างตารางใหม่ · ไม่แตะ enum InvItemKind (R1)
-- M2: `prisma migrate deploy` รันไฟล์นี้ "ทีละคำสั่ง คนละ transaction" (วัดจริงบน QC4: txid ต่างกันทุกคำสั่ง)
--     ⇒ `SET LOCAL` ไม่มีผล — ใช้ `SET lock_timeout` ระดับ session (มีผลกับทุกคำสั่งถัดไปในการเชื่อมต่อของ migrate · วัดแล้ว = 3s)
--     ลำดับ: enum → ตารางใหม่ → index/partial unique/FK ของตารางใหม่ (ว่างเปล่า ฟรี) → ADD COLUMN ตารางเดิม 5 ตัวท้ายสุด
-- M1: ไม่มี index บนคอลัมน์เชื่อมของตารางเดิม — เพิ่มใน P6.1 ด้วย CREATE INDEX CONCURRENTLY นอก prisma migrate
-- M3: "trackStock" BOOLEAN nullable ไม่มี default (null = AUTO · C2) · M4: index (systemId, archivedAt, name, id) · M5: partial unique หมวดทุกสาขา
-- unique (systemId, invItemId): Postgres ถือ NULL ไม่เท่ากัน ⇒ แถว invItemId null (เมนู/เว็บล้วน) หลายแถวได้ = ตรงเจตนา R1
-- ชื่อเวลา 20261120… = หลัง migration ล่าสุดบน origin ทุกสาขา (สูงสุด 20261104 wip/crm-c54c-r8) + เผื่อ · ผู้คุมงานเปลี่ยนชื่อได้ตอน merge
-- rollback ฉบับเต็ม (ซ้อมจริงบน QC4 แล้ว): ledger/wo-notes/pos-P1.1a.md §Round 2 · M6

SET lock_timeout = '3s';

-- CreateEnum
CREATE TYPE "PosProductKind" AS ENUM ('PRODUCT', 'SERVICE', 'MENU', 'BUNDLE');

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
    "trackStock" BOOLEAN,
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
CREATE INDEX "PosProduct_systemId_archivedAt_name_id_idx" ON "PosProduct"("systemId", "archivedAt", "name", "id");

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

-- CreateIndex (M5 · raw partial unique — Prisma schema มองไม่เห็น ดูคอมเมนต์ใน pos.prisma · ห้ามลบ)
CREATE UNIQUE INDEX "PosCategory_systemId_name_all_branches_key" ON "PosCategory"("systemId", "name") WHERE "unitId" IS NULL;

-- AddForeignKey
ALTER TABLE "PosProduct" ADD CONSTRAINT "PosProduct_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PosProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosProduct" ADD CONSTRAINT "PosProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PosCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosProductOptionGroup" ADD CONSTRAINT "PosProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "ShopProduct" ADD COLUMN     "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "ShopOrderLine" ADD COLUMN     "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "PosSaleLine" ADD COLUMN     "productId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "MenuItem" ADD COLUMN     "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "RestaurantOrderItem" ADD COLUMN     "productId" TEXT;
