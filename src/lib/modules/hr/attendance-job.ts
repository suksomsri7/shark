// HR H2.5 ▸ งานตามเวลา "hr.attendance" ทุก 5 นาที (มติผู้คุม Q2) — ขี่ตัวกระจายงานรายนาทีเดิม (platform/minute-jobs · แบบ chat/sla-job.ts)
//   ทางเข้า production = `scripts/crm-cron.mts minute` (import ไฟล์นี้ = ลงทะเบียน) · hook รายชั่วโมงใน /api/cron/hourly เป็นตาข่ายสำรอง ·
//   runAttendanceJobs รันซ้ำ/พร้อมกันได้ (ON CONFLICT DO NOTHING · unique ต่อกะต่อชนิด) ◂
import { registerMinuteJob } from "@/lib/platform/minute-jobs";
import { runAttendanceJobs } from "./judge";

export const HR_ATTENDANCE_MINUTE_JOB = "hr.attendance";

/** ลงทะเบียน "hr.attendance" ทุก 5 นาที — เรียกซ้ำได้ (ชื่อ+จังหวะเดิม = แทนที่ตัวเดิม) */
export function registerHrAttendanceMinuteJob(): void {
  registerMinuteJob({
    name: HR_ATTENDANCE_MINUTE_JOB,
    everyMinutes: 5,
    run: async (now, budgetMs, ctrl) => {
      void budgetMs;
      // เผื่อ 2 วิ ให้ช่องที่กำลังทำจบภายในงบ (ที่เหลือรอบหน้าหยิบต่อ)
      await runAttendanceJobs({ now, deadline: new Date(ctrl.deadline - 2_000) });
    },
  });
}

registerHrAttendanceMinuteJob();
