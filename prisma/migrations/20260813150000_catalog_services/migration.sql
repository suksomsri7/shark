-- แคตตาล็อกกลาง: สินค้า + บริการ ที่เดียว (เจ้าของสั่งข้อ 12-15) + หมวดหมู่/SKU/รูป (ข้อ 16-17)
-- additive ล้วน · ของเดิมทั้งหมด kind=PRODUCT → พฤติกรรมเท่าเดิมทุกอย่าง
CREATE TYPE "InvItemKind" AS ENUM ('PRODUCT', 'SERVICE');
CREATE TYPE "InvBarcodeType" AS ENUM ('NONE', 'EAN13', 'CODE128', 'QR');

ALTER TABLE "InvItem"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "kind" "InvItemKind" NOT NULL DEFAULT 'PRODUCT',
  ADD COLUMN "priceSatang" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "durationMin" INTEGER,
  ADD COLUMN "bufferMin" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "depositSatang" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bookable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "InvCategory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "InvItemKind" NOT NULL DEFAULT 'PRODUCT',
  "skuPrefix" TEXT,
  "barcodeType" "InvBarcodeType" NOT NULL DEFAULT 'NONE',
  "defaultUnitLabel" TEXT,
  "defaultPriceSatang" INTEGER,
  "defaultDurationMin" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvCategory_systemId_name_key" ON "InvCategory"("systemId", "name");
CREATE INDEX "InvCategory_tenantId_idx" ON "InvCategory"("tenantId");

CREATE TABLE "InvSettings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "skuAuto" BOOLEAN NOT NULL DEFAULT true,
  "skuPrefix" TEXT NOT NULL DEFAULT 'SKU',
  "skuPadding" INTEGER NOT NULL DEFAULT 4,
  "barcodeType" "InvBarcodeType" NOT NULL DEFAULT 'NONE',
  "nextSeq" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvSettings_systemId_key" ON "InvSettings"("systemId");
CREATE INDEX "InvSettings_tenantId_idx" ON "InvSettings"("tenantId");

CREATE TABLE "InvItemImage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvItemImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvItemImage_systemId_itemId_idx" ON "InvItemImage"("systemId", "itemId");
CREATE INDEX "InvItemImage_tenantId_idx" ON "InvItemImage"("tenantId");
ALTER TABLE "InvItemImage" ADD CONSTRAINT "InvItemImage_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InvItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- projection ฝั่งจองคิว: ชี้กลับไปต้นฉบับในแคตตาล็อก
ALTER TABLE "BookingService" ADD COLUMN "itemId" TEXT;
CREATE INDEX "BookingService_unitId_itemId_idx" ON "BookingService"("unitId", "itemId");
