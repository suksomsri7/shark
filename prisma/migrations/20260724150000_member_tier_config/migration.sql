-- เกณฑ์ระดับสมาชิกต่อกิจการ (additive)
CREATE TABLE "MemberTierConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tier" "MemberTier" NOT NULL,
    "label" TEXT NOT NULL,
    "minSpendSatang" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberTierConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberTierConfig_tenantId_tier_key" ON "MemberTierConfig"("tenantId", "tier");
