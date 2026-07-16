-- CreateEnum
CREATE TYPE "DnaBlueprintStatus" AS ENUM ('PROPOSED', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "DnaProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DnaProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DnaBlueprint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "planHash" TEXT NOT NULL,
    "status" "DnaBlueprintStatus" NOT NULL DEFAULT 'PROPOSED',
    "appliedAt" TIMESTAMP(3),
    "stepResults" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DnaBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DnaProfile_tenantId_key" ON "DnaProfile"("tenantId");

-- CreateIndex
CREATE INDEX "DnaBlueprint_tenantId_status_idx" ON "DnaBlueprint"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "DnaBlueprint" ADD CONSTRAINT "DnaBlueprint_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DnaProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
