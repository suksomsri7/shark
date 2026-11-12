-- HR H2.6 ▸ คำขอแก้เวลา — ประวัติแบบยกเลิก (void) ไม่ลบ/ไม่เขียนทับแถวเดิม · runbook: migrate ก่อน แล้วจึง deploy โค้ด ·
--   ย้อนกลับ = คอลัมน์ว่างไม่มีผล (โค้ดเดิมไม่อ่าน) ◂
-- CreateEnum
CREATE TYPE "HrCorrectionAction" AS ENUM ('ADD', 'CHANGE', 'VOID');

-- AlterTable
ALTER TABLE "HrAttendance" ADD COLUMN     "correctionId" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedByCorrectionId" TEXT;

-- AlterTable
ALTER TABLE "HrTimeCorrection" ADD COLUMN     "action" "HrCorrectionAction" NOT NULL DEFAULT 'ADD',
ADD COLUMN     "day" DATE;

-- Partial unique (SQL ดิบ): ใบรอ 1 ใบต่อแถวที่ขอแก้ · ใบ "เพิ่ม" ที่รอ 1 ใบต่อ (พนักงาน, วันของรอบ, ชนิด)
CREATE UNIQUE INDEX "HrTimeCorrection_pending_target_key" ON "HrTimeCorrection" ("attendanceId") WHERE "status" = 'PENDING' AND "attendanceId" IS NOT NULL;
CREATE UNIQUE INDEX "HrTimeCorrection_pending_add_key" ON "HrTimeCorrection" ("employeeId", "day", "kind") WHERE "status" = 'PENDING' AND "action" = 'ADD';
