-- ผลตัดสินการเข้างาน (สาย/ตรงเวลา/วันหยุด/ยังไม่ตั้งตาราง) — additive ล้วน
-- snapshot ณ ตอนกดเข้างาน: ตารางแก้ทีหลังต้องไม่ย้อนไปเปลี่ยนคำตัดสินของวันที่ผ่านไปแล้ว
-- แถวเก่าทั้งหมด judgement = NULL → หน้าจอแสดง "ไม่มีข้อมูลตาราง" ไม่ใช่ "สาย"
CREATE TYPE "HrAttendanceJudgement" AS ENUM ('ON_TIME', 'LATE', 'DAY_OFF', 'NO_SCHEDULE');

ALTER TABLE "HrAttendance" ADD COLUMN "judgement" "HrAttendanceJudgement";
ALTER TABLE "HrAttendance" ADD COLUMN "dueMin" INTEGER;
ALTER TABLE "HrAttendance" ADD COLUMN "lateMin" INTEGER;

-- ตารางที่ตั้งไว้แล้วก่อนวันนี้: ถือว่าเริ่มมีผลตั้งแต่ตอนนี้ (ไม่ย้อนไปนับขาดงานของวันก่อน)
ALTER TABLE "HrWorkSchedule" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
