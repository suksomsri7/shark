-- ระบบ "การจัดการ" — Page + Widget + สมาชิก PIN (P1 · additive ล้วน)
CREATE TYPE "PageWidgetShape" AS ENUM ('RECT', 'SQUARE', 'CIRCLE');

CREATE TABLE "Page" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "domain" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");
CREATE UNIQUE INDEX "Page_domain_key" ON "Page"("domain");
CREATE INDEX "Page_tenantId_unitId_idx" ON "Page"("tenantId", "unitId");

CREATE TABLE "PageWidget" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "widgetKey" TEXT NOT NULL,
  "title" TEXT,
  "imageUrl" TEXT,
  "shape" "PageWidgetShape" NOT NULL DEFAULT 'SQUARE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageWidget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PageWidget_pageId_widgetKey_key" ON "PageWidget"("pageId", "widgetKey");
CREATE INDEX "PageWidget_tenantId_idx" ON "PageWidget"("tenantId");
ALTER TABLE "PageWidget" ADD CONSTRAINT "PageWidget_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PageMember" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "pinHash" TEXT,
  "allowedWidgetKeys" JSONB NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PageMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PageMember_pageId_membershipId_key" ON "PageMember"("pageId", "membershipId");
CREATE INDEX "PageMember_tenantId_idx" ON "PageMember"("tenantId");
ALTER TABLE "PageMember" ADD CONSTRAINT "PageMember_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
