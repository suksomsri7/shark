-- CreateTable
CREATE TABLE "TenantDashboard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "widgetsJson" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInstall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "blueprintId" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantInstall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantDashboard_tenantId_key" ON "TenantDashboard"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInstall_tenantId_itemKey_key" ON "TenantInstall"("tenantId", "itemKey");

