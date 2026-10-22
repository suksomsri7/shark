-- HR H1.2 ▸ ค่าใหม่ของผลตัดสินการเข้างาน: ขาดงาน / ออกก่อนเวลา — แยกจาก 20261205000000 เพราะค่า enum ใหม่ใช้ในธุรกรรมที่เพิ่มมันไม่ได้
--   IF NOT EXISTS = รันซ้ำได้ · H1.2 ยังไม่มีแถวไหนใช้ (ผู้ตัดสิน = H2.5) · ลบค่า enum ภายหลังไม่ได้ (ยอมรับแล้ว)
ALTER TYPE "HrAttendanceJudgement" ADD VALUE IF NOT EXISTS 'ABSENT';
ALTER TYPE "HrAttendanceJudgement" ADD VALUE IF NOT EXISTS 'EARLY_OUT';
