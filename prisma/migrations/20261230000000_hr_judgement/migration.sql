-- HR H2.5 ▸ ผลตัดสินการลงเวลารายวันจากตารางกะ (brief hr-brief-H2.5 §3) — enum HrAttendanceAlertKind · ตาราง HrAttendanceDay (snapshot) + HrAttendanceAlert
--   ค่า LEAVE ของ HrAttendanceJudgement อยู่ในไฟล์ 20261230000001 (การเพิ่มค่า enum ใช้ในธุรกรรมเดียวกับผู้ใช้ค่าไม่ได้)
--   ลำดับ prod: migrate ก่อน แล้วจึง deploy โค้ด (โค้ดเดิมไม่อ่านสองตารางนี้) · ไม่มี backfill (รอบ cron แรกปิดวัน D−7…D เอง) ◂

-- CreateEnum
CREATE TYPE "HrAttendanceAlertKind" AS ENUM ('NOT_IN', 'ABSENT');

-- CreateTable
CREATE TABLE "HrAttendanceDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slotKey" TEXT NOT NULL,
    "rosterEntryId" TEXT,
    "unitId" TEXT,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "crossesMidnight" BOOLEAN,
    "graceMin" INTEGER,
    "status" "HrAttendanceJudgement" NOT NULL,
    "lateMin" INTEGER NOT NULL DEFAULT 0,
    "earlyOutMin" INTEGER NOT NULL DEFAULT 0,
    "workedMin" INTEGER NOT NULL DEFAULT 0,
    "breakMin" INTEGER NOT NULL DEFAULT 0,
    "otMin" INTEGER NOT NULL DEFAULT 0,
    "missingOut" BOOLEAN NOT NULL DEFAULT false,
    "leaveId" TEXT,
    "leaveHalf" "HrHalfDay",
    "leaveFraction" DECIMAL(2,1),
    "holidayId" TEXT,
    "inAttendanceId" TEXT,
    "outAttendanceId" TEXT,
    "engineVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "judgedAt" TIMESTAMP(3) NOT NULL,
    "recomputedAt" TIMESTAMP(3),
    "recomputedById" TEXT,
    "recomputeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrAttendanceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAttendanceAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "rosterEntryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "HrAttendanceAlertKind" NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "HrAttendanceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrAttendanceDay_systemId_date_idx" ON "HrAttendanceDay"("systemId", "date");

-- CreateIndex
CREATE INDEX "HrAttendanceDay_tenantId_idx" ON "HrAttendanceDay"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrAttendanceDay_employeeId_date_slotKey_key" ON "HrAttendanceDay"("employeeId", "date", "slotKey");

-- CreateIndex
CREATE INDEX "HrAttendanceAlert_systemId_firedAt_idx" ON "HrAttendanceAlert"("systemId", "firedAt");

-- CreateIndex
CREATE INDEX "HrAttendanceAlert_tenantId_idx" ON "HrAttendanceAlert"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrAttendanceAlert_employeeId_rosterEntryId_kind_key" ON "HrAttendanceAlert"("employeeId", "rosterEntryId", "kind");

-- AddForeignKey
ALTER TABLE "HrAttendanceDay" ADD CONSTRAINT "HrAttendanceDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrAttendanceAlert" ADD CONSTRAINT "HrAttendanceAlert_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

