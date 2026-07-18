-- WO Clinic public appointment — จองนัดคลินิกออนไลน์ (public/no-auth · ไม่เก็บเงินล่วงหน้า)
-- additive ปลอดภัย: ตารางใหม่ ClinicAppointment (คำขอนัด) — ไม่แตะตารางเดิม
-- คลินิกจ่ายหลังตรวจผ่าน visit/billVisit อยู่แล้ว → นัดไม่มี posSaleId (ไม่กระทบเส้นเงิน/บัญชี)
-- PDPA: symptom = ข้อมูลสุขภาพ → NULLable (เก็บเท่าที่ผู้ป่วยให้)
-- publicToken NULLable + unique (แถวใหม่ Prisma ปั๊ม cuid) — ลิงก์สถานะนัด

-- CreateEnum
CREATE TYPE "ClinicApptStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "ClinicAppointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientPhone" TEXT NOT NULL,
    "preferredAt" TIMESTAMP(3) NOT NULL,
    "symptom" TEXT,
    "status" "ClinicApptStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "publicToken" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAppointment_publicToken_key" ON "ClinicAppointment"("publicToken");

-- CreateIndex
CREATE INDEX "ClinicAppointment_tenantId_unitId_status_idx" ON "ClinicAppointment"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "ClinicAppointment_unitId_preferredAt_idx" ON "ClinicAppointment"("unitId", "preferredAt");
