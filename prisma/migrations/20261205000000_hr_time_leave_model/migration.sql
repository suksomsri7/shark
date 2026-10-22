-- HR H1.2 ▸ โมเดลเวลาและการลา (additive ล้วน · ไม่มีการลบ/เปลี่ยนชนิด/เปลี่ยนชื่อคอลัมน์ · ไม่แตะ HrWorkSchedule)
--   8 enum ใหม่ · 8 ตารางใหม่ (HrShift · HrRosterEntry · HrShiftSwapRequest · HrTimeCorrection · HrOtRequest · HrLeavePolicy ·
--   HrLeaveBalanceTxn · HrHoliday) · HrAttendance +7 คอลัมน์ · HrLeave +5 คอลัมน์ — ทุกคอลัมน์ใหม่ว่างได้ ไม่มีค่าปริยาย (แถวเดิม = null)
--   unique ที่มีนิพจน์/เงื่อนไข 7 ตัวท้ายไฟล์ = SQL ดิบ (Prisma ประกาศ COALESCE/WHERE ไม่ได้ · ไม่ใช้ NULLS NOT DISTINCT)
--   ค่าใหม่ของ HrAttendanceJudgement (ABSENT/EARLY_OUT) อยู่ใน migration ถัดไป 20261205000001_hr_judgement_enums (แยกไฟล์ตาม COMMON §A.7)
--   ทั้งไฟล์รันในธุรกรรมเดียวของ migrate deploy · ไม่มี backfill (R3)
-- pre-check (ก่อน deploy — อ่านอย่างเดียว):
--   SELECT migration_name FROM "_prisma_migrations" WHERE migration_name IN ('20261201000000_hr_pin_hash',
--     '20261202000000_hr_payroll_run_live_unique','20261203000000_hr_link_unique_requester','20261204000000_hr_org_axis')
--     AND finished_at IS NOT NULL;                                                      -- ต้องได้ 4 แถว
--   SELECT typname FROM pg_type WHERE typname IN ('HrRosterSource','HrClockSource','HrRequestStatus','HrSwapStatus',
--     'HrOtTiming','HrLeaveTxnKind','HrHolidayKind','HrHalfDay');                        -- ต้องได้ 0 แถว
--   SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('HrShift',
--     'HrRosterEntry','HrShiftSwapRequest','HrTimeCorrection','HrOtRequest','HrLeavePolicy','HrLeaveBalanceTxn','HrHoliday'); -- 0 แถว
--   SELECT count(*) FROM "HrAttendance";   -- > 200000 ⇒ แยก HrAttendance_rosterEntryId_idx ไป migration CONCURRENTLY (runbook §6)
-- ตรวจหลัง deploy: จำนวนแถว HrAttendance / HrLeave เท่าเดิม · 8 ตารางใหม่ว่าง

-- CreateEnum
CREATE TYPE "HrRosterSource" AS ENUM ('TEMPLATE', 'MANUAL', 'AI');

-- CreateEnum
CREATE TYPE "HrClockSource" AS ENUM ('KIOSK', 'MANAGER', 'MOBILE', 'CORRECTION', 'POS', 'IMPORT');

-- CreateEnum
CREATE TYPE "HrRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HrSwapStatus" AS ENUM ('AWAITING_PEER', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HrOtTiming" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "HrLeaveTxnKind" AS ENUM ('GRANT', 'USE', 'CARRY', 'EXPIRE', 'ADJUST');

-- CreateEnum
CREATE TYPE "HrHolidayKind" AS ENUM ('PUBLIC', 'SHOP');

-- CreateEnum
CREATE TYPE "HrHalfDay" AS ENUM ('AM', 'PM');


-- AlterTable
ALTER TABLE "HrAttendance" ADD COLUMN     "accuracyM" INTEGER,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "lat" DECIMAL(9,6),
ADD COLUMN     "lng" DECIMAL(9,6),
ADD COLUMN     "photoKey" TEXT,
ADD COLUMN     "rosterEntryId" TEXT,
ADD COLUMN     "source" "HrClockSource";

-- AlterTable
ALTER TABLE "HrLeave" ADD COLUMN     "attachmentKey" TEXT,
ADD COLUMN     "days" DECIMAL(4,1),
ADD COLUMN     "halfDay" "HrHalfDay",
ADD COLUMN     "hours" DECIMAL(4,1),
ADD COLUMN     "policyId" TEXT;

-- CreateTable
CREATE TABLE "HrShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "breakMin" INTEGER NOT NULL DEFAULT 0,
    "graceMin" INTEGER NOT NULL DEFAULT 15,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "colour" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrRosterEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" TEXT NOT NULL,
    "unitId" TEXT,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "breakMin" INTEGER NOT NULL,
    "crossesMidnight" BOOLEAN NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "source" "HrRosterSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrRosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrShiftSwapRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "requesterEmployeeId" TEXT NOT NULL,
    "fromEntryId" TEXT NOT NULL,
    "targetEmployeeId" TEXT,
    "toEntryId" TEXT,
    "status" "HrSwapStatus" NOT NULL DEFAULT 'AWAITING_PEER',
    "reason" TEXT,
    "requestedByUserId" TEXT,
    "peerDecidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrShiftSwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrTimeCorrection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "rosterEntryId" TEXT,
    "kind" "HrAttendanceKind" NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL,
    "originalAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "HrRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resultAttendanceId" TEXT,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrTimeCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrOtRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "rosterEntryId" TEXT,
    "date" DATE NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "timing" "HrOtTiming" NOT NULL,
    "reason" TEXT,
    "status" "HrRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "multiplierBp" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrOtRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeavePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT,
    "category" "HrLeaveType" NOT NULL,
    "name" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "quotaDays" DECIMAL(4,1),
    "minServiceDays" INTEGER NOT NULL DEFAULT 0,
    "firstYearProrata" BOOLEAN NOT NULL DEFAULT false,
    "carryMaxDays" DECIMAL(4,1) NOT NULL DEFAULT 0,
    "carryExpiresMonthDay" TEXT,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "allowHours" BOOLEAN NOT NULL DEFAULT false,
    "attachmentAfterDays" INTEGER,
    "yearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrLeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeaveBalanceTxn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "kind" "HrLeaveTxnKind" NOT NULL,
    "days" DECIMAL(4,1) NOT NULL,
    "leaveYear" INTEGER NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "leaveId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrLeaveBalanceTxn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrHoliday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "HrHolidayKind" NOT NULL,
    "presetYear" INTEGER,
    "shopOpen" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrShift_tenantId_idx" ON "HrShift"("tenantId");

-- CreateIndex
CREATE INDEX "HrShift_systemId_unitId_active_idx" ON "HrShift"("systemId", "unitId", "active");

-- CreateIndex
CREATE INDEX "HrRosterEntry_tenantId_idx" ON "HrRosterEntry"("tenantId");

-- CreateIndex
CREATE INDEX "HrRosterEntry_systemId_date_idx" ON "HrRosterEntry"("systemId", "date");

-- CreateIndex
CREATE INDEX "HrRosterEntry_systemId_unitId_date_idx" ON "HrRosterEntry"("systemId", "unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HrRosterEntry_employeeId_date_shiftId_key" ON "HrRosterEntry"("employeeId", "date", "shiftId");

-- CreateIndex
CREATE INDEX "HrShiftSwapRequest_tenantId_idx" ON "HrShiftSwapRequest"("tenantId");

-- CreateIndex
CREATE INDEX "HrShiftSwapRequest_systemId_status_idx" ON "HrShiftSwapRequest"("systemId", "status");

-- CreateIndex
CREATE INDEX "HrTimeCorrection_tenantId_idx" ON "HrTimeCorrection"("tenantId");

-- CreateIndex
CREATE INDEX "HrTimeCorrection_systemId_status_idx" ON "HrTimeCorrection"("systemId", "status");

-- CreateIndex
CREATE INDEX "HrOtRequest_tenantId_idx" ON "HrOtRequest"("tenantId");

-- CreateIndex
CREATE INDEX "HrOtRequest_systemId_status_idx" ON "HrOtRequest"("systemId", "status");

-- CreateIndex
CREATE INDEX "HrOtRequest_systemId_employeeId_date_idx" ON "HrOtRequest"("systemId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "HrLeavePolicy_tenantId_idx" ON "HrLeavePolicy"("tenantId");

-- CreateIndex
CREATE INDEX "HrLeavePolicy_systemId_category_idx" ON "HrLeavePolicy"("systemId", "category");

-- CreateIndex
CREATE INDEX "HrLeaveBalanceTxn_tenantId_idx" ON "HrLeaveBalanceTxn"("tenantId");

-- CreateIndex
CREATE INDEX "HrLeaveBalanceTxn_systemId_employeeId_policyId_leaveYear_idx" ON "HrLeaveBalanceTxn"("systemId", "employeeId", "policyId", "leaveYear");

-- CreateIndex
CREATE UNIQUE INDEX "HrLeaveBalanceTxn_systemId_sourceKey_key" ON "HrLeaveBalanceTxn"("systemId", "sourceKey");

-- CreateIndex
CREATE INDEX "HrHoliday_tenantId_idx" ON "HrHoliday"("tenantId");

-- CreateIndex
CREATE INDEX "HrHoliday_systemId_date_idx" ON "HrHoliday"("systemId", "date");

-- CreateIndex
CREATE INDEX "HrAttendance_rosterEntryId_idx" ON "HrAttendance"("rosterEntryId");

-- AddForeignKey
ALTER TABLE "HrAttendance" ADD CONSTRAINT "HrAttendance_rosterEntryId_fkey" FOREIGN KEY ("rosterEntryId") REFERENCES "HrRosterEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeave" ADD CONSTRAINT "HrLeave_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "HrLeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRosterEntry" ADD CONSTRAINT "HrRosterEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRosterEntry" ADD CONSTRAINT "HrRosterEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "HrShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrShiftSwapRequest" ADD CONSTRAINT "HrShiftSwapRequest_fromEntryId_fkey" FOREIGN KEY ("fromEntryId") REFERENCES "HrRosterEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrTimeCorrection" ADD CONSTRAINT "HrTimeCorrection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrTimeCorrection" ADD CONSTRAINT "HrTimeCorrection_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "HrAttendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrOtRequest" ADD CONSTRAINT "HrOtRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveBalanceTxn" ADD CONSTRAINT "HrLeaveBalanceTxn_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveBalanceTxn" ADD CONSTRAINT "HrLeaveBalanceTxn_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "HrLeavePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveBalanceTxn" ADD CONSTRAINT "HrLeaveBalanceTxn_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "HrLeave"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- HR H1.2 ▸ unique ที่มีนิพจน์/เงื่อนไข (SQL ดิบ) ◂
-- ชื่อกะที่ยังใช้อยู่ ไม่ซ้ำต่อระบบ + สาขา (ไม่สนตัวพิมพ์ · ทั้งร้าน = '')
CREATE UNIQUE INDEX "HrShift_systemId_unit_name_active_key" ON "HrShift" ("systemId", COALESCE("unitId", ''), lower("name")) WHERE "active";

-- คำขอแลกกะที่ยังเปิด 1 ใบต่อแถวตาราง
CREATE UNIQUE INDEX "HrShiftSwapRequest_fromEntryId_open_key" ON "HrShiftSwapRequest" ("fromEntryId") WHERE "status" IN ('AWAITING_PEER', 'PENDING');

-- คำขอแก้เวลาที่รอ 1 ใบต่อแถวลงเวลา
CREATE UNIQUE INDEX "HrTimeCorrection_attendanceId_pending_key" ON "HrTimeCorrection" ("attendanceId") WHERE "status" = 'PENDING' AND "attendanceId" IS NOT NULL;

-- คำขอแก้เวลาที่รอ 1 ใบต่อ (พนักงาน, แถวตาราง, เข้า/ออก) — กรณีลืมกด
CREATE UNIQUE INDEX "HrTimeCorrection_employee_entry_kind_pending_key" ON "HrTimeCorrection" ("employeeId", "rosterEntryId", "kind") WHERE "status" = 'PENDING' AND "rosterEntryId" IS NOT NULL;

-- OT ที่ยังมีผล ไม่ซ้ำเวลาเริ่มของพนักงานคนเดียวกัน
CREATE UNIQUE INDEX "HrOtRequest_employeeId_startAt_live_key" ON "HrOtRequest" ("employeeId", "startAt") WHERE "status" IN ('PENDING', 'APPROVED');

-- ชื่อประเภทการลาที่ยังใช้อยู่ ไม่ซ้ำต่อระบบ + สาขา
CREATE UNIQUE INDEX "HrLeavePolicy_systemId_unit_name_active_key" ON "HrLeavePolicy" ("systemId", COALESCE("unitId", ''), lower("name")) WHERE "active";

-- วันหยุด 1 แถวต่อวันต่อระบบต่อสาขา (ทั้งร้าน = '')
CREATE UNIQUE INDEX "HrHoliday_systemId_date_unit_key" ON "HrHoliday" ("systemId", "date", COALESCE("unitId", ''));
