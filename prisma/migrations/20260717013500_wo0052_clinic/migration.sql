-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('OPEN', 'BILLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "UnitType" ADD VALUE 'CLINIC';

-- CreateTable
CREATE TABLE "PatientRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "birthYear" INTEGER,
    "allergies" TEXT,
    "note" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicVisit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symptom" TEXT NOT NULL,
    "diagnosis" TEXT,
    "feeSatang" INTEGER NOT NULL DEFAULT 0,
    "status" "VisitStatus" NOT NULL DEFAULT 'OPEN',
    "dispenseJson" JSONB NOT NULL DEFAULT '[]',
    "posSaleId" TEXT,
    "billedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientRecord_tenantId_unitId_idx" ON "PatientRecord"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "PatientRecord_unitId_phone_idx" ON "PatientRecord"("unitId", "phone");

-- CreateIndex
CREATE INDEX "ClinicVisit_tenantId_unitId_status_idx" ON "ClinicVisit"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "ClinicVisit_patientId_visitDate_idx" ON "ClinicVisit"("patientId", "visitDate");

-- AddForeignKey
ALTER TABLE "ClinicVisit" ADD CONSTRAINT "ClinicVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

