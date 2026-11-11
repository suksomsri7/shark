-- SVC B.0 · migration svc_b — จองคิว V2 (Appointment + BookingStaffService + SvcResource + QueueTicket.etaAt) + POS 3 คอลัมน์
-- สร้างจาก: prisma migrate diff --from-schema <schema 8ff682d5> --to-schema prisma/schema --script (ไม่ใช้ migrate dev) + SQL มือท้ายไฟล์
-- additive ล้วน: ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/แก้ข้อมูล · ADD COLUMN NOT NULL มี DEFAULT ทุกตัว (แถวเดิมได้ BOOKED/SPECIFIC/0)
-- POS: แตะเฉพาะ PosHeldCart.serviceJobId · PosSaleLine.performerEmployeeId · PosStaffCommission.employeeId (+ partial unique บิลพัก + ดัชนีค่าคอมฯ)
--      🔴 ไม่มีดัชนีบน PosSaleLine (ตารางใหญ่ — ถ้าใบหลังต้องการ = CREATE INDEX CONCURRENTLY นอก migrate แบบ P6.1)

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'QUEUED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'IN_SERVICE';
ALTER TYPE "AppointmentStatus" ADD VALUE 'LATE';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "assignMode" TEXT NOT NULL DEFAULT 'SPECIFIC',
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "doneAt" TIMESTAMP(3),
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "heldCartId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'BOOKED',
ADD COLUMN     "lateAt" TIMESTAMP(3),
ADD COLUMN     "manageTokenHash" TEXT,
ADD COLUMN     "plannedStaffId" TEXT,
ADD COLUMN     "plannedStartAt" TIMESTAMP(3),
ADD COLUMN     "policySnapshot" JSONB,
ADD COLUMN     "queueTicketId" TEXT,
ADD COLUMN     "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rescheduledFromId" TEXT,
ADD COLUMN     "resourceId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PosSaleLine" ADD COLUMN     "performerEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "PosHeldCart" ADD COLUMN     "serviceJobId" TEXT;

-- AlterTable
ALTER TABLE "PosStaffCommission" ADD COLUMN     "employeeId" TEXT;

-- AlterTable
ALTER TABLE "QueueTicket" ADD COLUMN     "etaAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BookingStaffService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "durationMin" INTEGER,
    "priceSatang" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingStaffService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SvcResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "cleanupMin" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SvcResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingStaffService_tenantId_unitId_idx" ON "BookingStaffService"("tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingStaffService_staffId_serviceId_key" ON "BookingStaffService"("staffId", "serviceId");

-- CreateIndex
CREATE INDEX "SvcResource_tenantId_unitId_idx" ON "SvcResource"("tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "SvcResource_unitId_name_key" ON "SvcResource"("unitId", "name");

-- CreateIndex
CREATE INDEX "Appointment_groupId_idx" ON "Appointment"("groupId");

-- CreateIndex
CREATE INDEX "Appointment_queueTicketId_idx" ON "Appointment"("queueTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_manageTokenHash_key" ON "Appointment"("manageTokenHash");

-- CreateIndex
CREATE INDEX "PosStaffCommission_tenantId_employeeId_periodKey_idx" ON "PosStaffCommission"("tenantId", "employeeId", "periodKey");

-- AddForeignKey
ALTER TABLE "BookingStaffService" ADD CONSTRAINT "BookingStaffService_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "BookingStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingStaffService" ADD CONSTRAINT "BookingStaffService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BookingService"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════ SQL มือ (prisma ประกาศ CHECK / partial unique ไม่ได้) ═══════════════

-- CHECK: Appointment (ใบสั่ง §2.1)
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_kind_check" CHECK ("kind" IN ('BOOKED', 'WALKIN'));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignMode_check" CHECK ("assignMode" IN ('SPECIFIC', 'ANY'));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_rescheduleCount_check" CHECK ("rescheduleCount" >= 0);

-- CHECK: BookingStaffService (ใบสั่ง §2.2)
ALTER TABLE "BookingStaffService" ADD CONSTRAINT "BookingStaffService_durationMin_check" CHECK ("durationMin" IS NULL OR "durationMin" > 0);
ALTER TABLE "BookingStaffService" ADD CONSTRAINT "BookingStaffService_priceSatang_check" CHECK ("priceSatang" IS NULL OR "priceSatang" >= 0);

-- CHECK: SvcResource (ใบสั่ง §2.3)
ALTER TABLE "SvcResource" ADD CONSTRAINT "SvcResource_capacity_check" CHECK ("capacity" >= 1);
ALTER TABLE "SvcResource" ADD CONSTRAINT "SvcResource_cleanupMin_check" CHECK ("cleanupMin" >= 0);

-- partial unique: 1 งานบริการ = บิลพัก HELD ได้ใบเดียว (แบบ PosHeldCart_tableSessionId_held_key · ใบสั่ง §2.4)
CREATE UNIQUE INDEX "PosHeldCart_serviceJobId_held_key" ON "PosHeldCart"("serviceJobId") WHERE "status" = 'HELD' AND "serviceJobId" IS NOT NULL;
