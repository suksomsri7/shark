// jobs.ts — ลงทะเบียนงานรายนาทีของปฏิทินเลขา (สัญญา §5.6 · §6) — import ไฟล์นี้ = ลงทะเบียน
//   ผู้ import: `scripts/crm-cron.mts` (crontab VPS ทุกนาที) + `src/app/api/cron/outbox/route.ts` (hook สำรอง)
//   ตัวงานโหลดตอนรันเท่านั้น (ไฟล์นี้เบา — ไม่ลากกราฟโมดูลตอนลงทะเบียน)
//   `calendar.google` (ทุก 15 นาที · CAL1.8) ลงทะเบียนท้ายไฟล์
import { registerMinuteJob } from "@/lib/platform/minute-jobs";

// CAL1.4 ▸ เตือนถึงเวลา/เลื่อน/ย้ำ · งบของตัวเอง 5 วิ (ไม่กินงบรวมของรอบ) ◂
registerMinuteJob({
  name: "calendar.fire",
  everyMinutes: 1,
  ownBudgetMs: 5_000,
  run: async (now, _budgetMs, ctrl) => {
    const { runCalendarFire } = await import("./fire");
    return runCalendarFire(now, { deadline: ctrl.deadline, signal: ctrl.signal });
  },
});

// CAL1.5 ▸ สรุปเช้า/เย็น (ไม่เรียกโมเดล) · งบของตัวเอง 6 วิ ◂
registerMinuteJob({
  name: "calendar.brief",
  everyMinutes: 1,
  ownBudgetMs: 6_000,
  run: async (now, _budgetMs, ctrl) => {
    const { runCalendarBrief } = await import("./brief");
    return runCalendarBrief(now, { deadline: ctrl.deadline });
  },
});

// CAL1.8 ▸ ซิงก์ Google Calendar สองทาง ทุก 15 นาที (ลิงก์ที่ถึงรอบ ≤ 20 · lease ต่อลิงก์) · งบของตัวเอง 8 วิ ◂
registerMinuteJob({
  name: "calendar.google",
  everyMinutes: 15,
  ownBudgetMs: 8_000,
  run: async (now, _budgetMs, ctrl) => {
    const { runGoogleSync } = await import("./google");
    return runGoogleSync(now, { deadline: ctrl.deadline });
  },
});
