-- POS P1.1a — แคตตาล็อกเดียว (PosProduct · PosCategory · PosProductOptionGroup · RecipeLine) + คอลัมน์เชื่อม nullable 5 ตัว · round 3
-- 🔴 additive ล้วน: ไม่มี DROP/RENAME/SET NOT NULL · FK เฉพาะระหว่างตารางใหม่ · ไม่แตะ enum InvItemKind (R1)
-- D4: ทุกคำสั่งรันซ้ำได้ (IF NOT EXISTS · DO $$ … EXCEPTION WHEN duplicate_object …) ⇒ รันมือซ้ำหลังล้มกลางทาง = ไม่ error ไม่เปลี่ยนอะไร
--     prisma 7.8 กับไฟล์ที่มี DO $$ … $$: ส่งทั้งไฟล์เป็นสคริปต์เดียว = transaction เดียว (วัดบน QC4: txid เดียวกันทุกคำสั่ง ·
--     ล้มกลางไฟล์ = ไม่เหลืออะไร · P3018 แล้วรอบถัดไป P3009) — ไฟล์ที่ไม่มี DO ถูกแยกทีละคำสั่งคนละ transaction (วัดแล้วเช่นกัน)
--     lock_timeout: SET ระดับ session (มีผลทั้งสองแบบ) ต้นไฟล์ · RESET ท้ายไฟล์
--     ลำดับ: enum → ตารางใหม่ → index/partial unique/FK ของตารางใหม่ (ว่างเปล่า ฟรี) → ADD COLUMN ตารางเดิม 5 ตัวท้ายสุด
-- M1: ไม่มี index บนคอลัมน์เชื่อมของตารางเดิม — เพิ่มใน P6.1 ด้วย CREATE INDEX CONCURRENTLY นอก prisma migrate
-- M3: คอลัมน์ trackStock ของ PosProduct เป็นค่าจริง/เท็จที่ว่างได้ ไม่มีค่าตั้งต้น (ว่าง = AUTO · C2) · M4: index (systemId, archivedAt, name, id) · M5: partial unique หมวดทุกสาขา
-- unique (systemId, invItemId): Postgres ถือ NULL ไม่เท่ากัน ⇒ แถว invItemId null (เมนู/เว็บล้วน) หลายแถวได้ = ตรงเจตนา R1
-- ชื่อเวลา 20261120… = หลัง migration ล่าสุดบน origin ทุกสาขา (สูงสุด 20261104 wip/crm-c54c-r8) + เผื่อ · ผู้คุมงานเปลี่ยนชื่อได้ตอน merge
-- rollback ฉบับเต็ม + วิธีกู้ P3009 (ซ้อมจริงบน QC4): ledger/wo-notes/pos-P1.1a.md §Round 3

SET lock_timeout = '3s';

-- CreateEnum
DO $$ BEGIN CREATE TYPE "PosProductKind" AS ENUM ('PRODUCT', 'SERVICE', 'MENU', 'BUNDLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PosCategory" (
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
CREATE TABLE IF NOT EXISTS "PosProduct" (
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
CREATE TABLE IF NOT EXISTS "PosProductOptionGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "PosProductOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecipeLine" (
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
CREATE INDEX IF NOT EXISTS "PosCategory_tenantId_idx" ON "PosCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PosCategory_systemId_unitId_name_key" ON "PosCategory"("systemId", "unitId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosProduct_tenantId_idx" ON "PosProduct"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosProduct_systemId_archivedAt_name_id_idx" ON "PosProduct"("systemId", "archivedAt", "name", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosProduct_systemId_barcode_idx" ON "PosProduct"("systemId", "barcode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosProduct_parentId_idx" ON "PosProduct"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PosProduct_systemId_invItemId_key" ON "PosProduct"("systemId", "invItemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosProductOptionGroup_tenantId_idx" ON "PosProductOptionGroup"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PosProductOptionGroup_groupId_idx" ON "PosProductOptionGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PosProductOptionGroup_productId_groupId_key" ON "PosProductOptionGroup"("productId", "groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecipeLine_tenantId_idx" ON "RecipeLine"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecipeLine_invItemId_idx" ON "RecipeLine"("invItemId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RecipeLine_productId_invItemId_key" ON "RecipeLine"("productId", "invItemId");

-- CreateIndex (M5 · raw partial unique — Prisma schema มองไม่เห็น ดูคอมเมนต์ใน pos.prisma · ห้ามลบ)
CREATE UNIQUE INDEX IF NOT EXISTS "PosCategory_systemId_name_all_branches_key" ON "PosCategory"("systemId", "name") WHERE "unitId" IS NULL;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "PosProduct" ADD CONSTRAINT "PosProduct_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PosProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "PosProduct" ADD CONSTRAINT "PosProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PosCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "PosProductOptionGroup" ADD CONSTRAINT "PosProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "ShopProduct" ADD COLUMN IF NOT EXISTS "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "ShopOrderLine" ADD COLUMN IF NOT EXISTS "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "PosSaleLine" ADD COLUMN IF NOT EXISTS "productId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "posProductId" TEXT;

-- AlterTable (M2: ตารางเดิม · metadata-only — nullable ไม่มี default · ไม่สร้าง index ตามหลัง)
ALTER TABLE "RestaurantOrderItem" ADD COLUMN IF NOT EXISTS "productId" TEXT;

RESET lock_timeout;
