-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ENROLLED', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "UnitType" ADD VALUE 'SCHOOL';

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "trackingNo" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PREPARING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolCourse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceSatang" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "customerId" TEXT,
    "studentName" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "priceSatang" INTEGER NOT NULL DEFAULT 0,
    "posSaleId" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_tenantId_unitId_status_idx" ON "Shipment"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "SchoolCourse_tenantId_unitId_active_idx" ON "SchoolCourse"("tenantId", "unitId", "active");

-- CreateIndex
CREATE INDEX "SchoolClass_tenantId_unitId_idx" ON "SchoolClass"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "SchoolClass_courseId_idx" ON "SchoolClass"("courseId");

-- CreateIndex
CREATE INDEX "SchoolEnrollment_tenantId_unitId_status_idx" ON "SchoolEnrollment"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "SchoolEnrollment_classId_idx" ON "SchoolEnrollment"("classId");

-- CreateIndex
CREATE INDEX "SchoolAttendance_tenantId_idx" ON "SchoolAttendance"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAttendance_enrollmentId_date_key" ON "SchoolAttendance"("enrollmentId", "date");

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "SchoolCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendance" ADD CONSTRAINT "SchoolAttendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "SchoolEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

