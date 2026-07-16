-- CreateTable
CREATE TABLE "ReportDef" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDef_tenantId_idx" ON "ReportDef"("tenantId");
