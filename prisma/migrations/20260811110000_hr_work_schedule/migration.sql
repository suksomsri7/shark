-- ตารางเวลาทำงานรายพนักงาน — เดิมมีแต่บันทึกเข้า-ออก ไม่มี "ควรเข้ากี่โมง" จึงบอกสาย/ขาดไม่ได้
-- ครึ่งวัน = ตั้งช่วงเวลาสั้นลง ไม่ต้องมีชนิดพิเศษ · ไม่มีแถว = ยังไม่ตั้ง (ไม่ตัดสินว่าสาย)
CREATE TABLE "HrWorkSchedule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "dayOff" BOOLEAN NOT NULL DEFAULT false,
  "startMin" INTEGER NOT NULL DEFAULT 540,
  "endMin" INTEGER NOT NULL DEFAULT 1080,
  "graceMin" INTEGER NOT NULL DEFAULT 15,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrWorkSchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrWorkSchedule_employeeId_weekday_key" ON "HrWorkSchedule"("employeeId", "weekday");
CREATE INDEX "HrWorkSchedule_systemId_employeeId_idx" ON "HrWorkSchedule"("systemId", "employeeId");
ALTER TABLE "HrWorkSchedule" ADD CONSTRAINT "HrWorkSchedule_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
